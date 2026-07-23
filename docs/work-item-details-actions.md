> Reference for the mobile team. Extracted from the Angular web app (`src/app/pages/work-item-details/` and `src/app/shared/components/memo-details/`), current as of 2026-07-08 (`develop` branch).
>
> All endpoints below are relative to the memo service controller root: `{BASE_URL}/MemoController` (resolved at runtime from `environment.json` → `ENVIRONMENTS_URLS[BASE_ENVIRONMENT]`). Endpoints on other controllers are called out explicitly. Almost every GET carries a cache-buster query param `r={timestamp}` — omitted from the tables for brevity.

---

## 1. The three view modes

The same card renders three different routes. The view mode decides which API loads the data and which buttons can ever appear.

| View mode | Route | Loader endpoint | Actions? |
|---|---|---|---|
| **workItem** | `/work-item/...` (inbox, sent, archive, committee lists) | `GET /getWorkItemById?workItemId=` | Full header + footer actions |
| **memoRoute** | `/memo/:id/:direction/:deptCode` (Department/Directorate/Committee In & Out folders) | `GET /getMemoDetails?memoId={docId}&userLogin=&inOrOut={IN\|OUT}&deptCode=` | Read-only. `enableActions=false` → **no footer buttons**. Header shows only Track/History, AI Summary, Back (+ Classify for IN direction) |
| **relatedMemo** | `/memo-related/:id` or opened inside the shared card dialog | KOTC: `GET /getMemoDetailsOne?memoId=&userLogin=&inOrOut=` · KNPC: `GET /getMemoDetails?memoId=` (feature `RELATED_MEMO_VIEW_VIA_GET_MEMO_DETAILS`) | Read-only. Header shows only History, AI Summary, Back |

Secondary data loaded with a work item:

| Data | Endpoint | Notes |
|---|---|---|
| Comments | `GET /commentsNew?memoId=&deptCode=&witmType=&witemGroupingId=` | Feeds the header Comments dialog badge |
| Tracking | `GET /track?memoGroupId={witemGroupingId}` | Feeds the Track dialog |
| History | `GET /history?memoId=&inOrOut=&userLogin=` | Feeds the History dialog |
| Annotations count | `AnnotationController` — `getAnnotations(memoDocId)` | Badge on the header Annotations button |
| Give-Input uploads & comments | `GET /getGroupComntsAndAtchmnts?groupId=&addedBy=&memoId=&deptCode=` | Inputs tab (separate container from `memo.memoAttachments`) |
| Related memos (KNPC) | `GET /getRelatedMemos?currentMemoId=&currentUser=&currentUserDept=&witmId=` | "Related Memos" tab (feature `WORK_ITEM_RELATED_MEMOS_TAB`) |
| Related documents (KOTC) | `GET /getRelatedMemosCheck?currentMemoId=&currentUser=&currentUserDept=` | "Related Documents" card |
| Referenced-memos count (KNPC) | `GET /getMemoReferences?sourceMemoId={memoId}` | Enables/disables the "Referenced Memos" card |
| Confidential default | `GET /getConfidentialIncoming?deptCode=` | Seeds the confidential checkbox for NEWTO/NEWCC |
| Incoming classification | `GET /getMemoClassification?memoRefValue=&deptCodeValue=` | memoRoute IN direction only |
| AI summary | `AIController` — `GET /Memo/{memoId}/Group/{groupId}/lang/{en\|ar}` | AI Summary popover |

### History vs Track (header shows exactly one)

- **Normal (non-committee):** History when `(NEWTO|NEWCC) && status (NEW|INPROGRESS)` OR type is `FRWN | FRWNFOR | FAN`. Otherwise Track.
- **Committee:** History when `(NEWTO|NEWCC) && !complete` OR type is `FRWN | FRWNFOR` (FAN does **not** force History here). Otherwise Track.
- **memoRoute / relatedMemo:** always History.

---

## 2. Vocabulary (wire codes)

### Work item types (`witemType`)

| Code | Meaning |
|---|---|
| `FYI` | For Your Information |
| `ACTION` | Action Required |
| `RVW` | Review |
| `RWN` | Rewrite / Reply-with-note cycle member |
| `IRWN` | Initial Rewrite (note initiator) |
| `FRWN` | Final Rewrite (note received back) |
| `FRWNFOR` | Final Rewrite Forward |
| `FAN` | For Attention Needed (form approval note) |
| `COORD` | Coordinate |
| `NEWCC` | New CC recipient |
| `NEWTO` | New TO recipient |
| `BCC` | BCC recipient |
| `DISTRIBUTE` | Letter distribution |
| `COMPOSE` / `SELFCOMPOSE` | Composer's own sent item |
| `APPRV` | Approver (also wire code `APPRVSIGN`, treated the same for Approve buttons) |
| `FINALAPPRV` | Final approver |
| `FINALCOMPOSE` | Final compose |

### Work item statuses (`witemStatus`)

`NEW`, `INPROGRESS`, `COMPLETE`, `APPROVE`, `FORWARDED`, `ARCHIVE`, `REJECT`, `REWORK`, `DRAFT`, `DISCARD`, `CLOSED`. All comparisons are case-insensitive (upper-cased before compare).

### Page context (`pageName`, from the route)

`inbox`, `sent`, `archive`, `outbox`, `draft`, `groupin`, `groupout`. Committee lists set `config.isCommittee = true` from route data — this flag (not `memo.committee`) is the authoritative committee switch.

### Memo fields that gate buttons

- `memo.type` — `MEMO`, `LETTER`, `MWF` (memo-with-form), `RPT` (reporting).
- `memo.electronic` — electronic vs hard-copy.
- `memo.signed` — fully signed.
- `memo.direction` — `Incoming`/`Outgoing` on the wire, normalized to internal `IN`/`OUT`.
- `isComplete` — derived from `witemStatus` (complete-like statuses).

### Session flags

| Flag | Source | Effect |
|---|---|---|
| `isActing` / `delegateLogin` | `sessionStorage.delegateUser` — user is acting on behalf of someone | `delegateLogin` (the real user's login) is attached to most mutating payloads |
| `isSecretaryDelegate` | acting user whose real `ecmJobTitle === 'SEC'` | Blocks Approve buttons, signature button, and MWF Approve-Form-and-Return |
| `hasApproveOption` | `= !isSecretaryDelegate` | Gates "Approve Form and Return" |
| `isRemoteSign` | `empDetails.remoteSign` | Gates the Signature button in the document viewer |
| `isInitial` | `empDetails.initialAccess` | Gates the Initial button in the document viewer |

---

## 3. Header actions

Rendered top-right of the card, in this order. Each has a visibility rule; **Back is always last and always present** (hidden only when the card is inside the shared dialog).

| Button | Visible when | What it does |
|---|---|---|
| **Reassign** | `witemStatus ∈ {new, inprogress, rework, distribute}` AND type **not** in `{DISTRIBUTE, NEWTO, NEWCC, RWN, IRWN, FRWN, FRWNFOR, BCC, FAN, FINALAPPRV}` AND memo sender (`memo.siteMember.empLogin`) ≠ current user AND work item + memo + siteMember all loaded | Opens reassign dialog. Employee list: `GET /getAllDeptEmployeesReassign?deptCode=&witemId=`. Confirm: `GET /reassignWorkitem?workItemId=&newAssignee=&currentUser=&comments=` → toast → navigate back |
| **Reply Cycle** | type is `RWN` or `IRWN` (never `FRWN`/`FRWNFOR`), or `witemSentType === RWN && page === sent` | `GET /getAllReplyUsers?memoId=&workitemGroupingId=` → shows members dialog (read-only) |
| **Comments** | a memo object is loaded (`workItem.memo`) | Opens comments dialog with data pre-loaded from `GET /commentsNew` (badge = count) |
| **Send Reminder** | See "canSendReminder" below | Opens recipient-picker dialog. Confirm: `POST /sendreminderemail` with `{ memo, userList: MemoRecipient[], actionUser }` (`actionUser` = real user login when acting, else `''`) |
| **Track** | Track mode (see History-vs-Track above) | Opens tracking dialog (data from `GET /track`) |
| **History** | History mode | Opens history dialog (data from `GET /history`) |
| **AI Summary** | memo or memoId present | Popover; `AIController: GET /Memo/{memoId}/Group/{groupId}/lang/{code}` |
| **Annotations** | memo/memoId present AND annotation count > 0 | Opens the PDF viewer on the memo document (annotation tools per KNPC matrix; badge = count) |
| **Discard** | type = `IRWN` AND page ≠ `sent` | Confirm dialog → `GET /discardWorkItemRWN?witmId=` → back |
| **Back** | always (except in-dialog) | Navigates back to the source list |

**`canSendReminder` (header):** all of —
1. a work item is loaded (`witemId` present);
2. the memo is "from me": `memo.siteMember.empLogin` equals `empDetails.roleLogin` (committee: `userLogin`) — OR the hard-copy override below;
3. `isComplete` is true;
4. "forwarded": for electronic memos `memo.signed === true`; for hard-copy an outgoing `COMPOSE`/`SELFCOMPOSE` with status `COMPLETE` counts (and also satisfies rule 2);
5. type is **not** `FRWN | RWN | IRWN | FAN`.

In memoRoute/relatedMemo modes: Reassign, Reply Cycle, Comments, Send Reminder, Discard, Annotations are all forced off (memoRoute keeps Track/History; relatedMemo keeps History only).

---

## 4. Footer action buttons — visibility matrix

Computed by `ActionButtonsComponent.availableActions()`. The footer only renders at all when `config.enableActions` is true (workItem mode; never on memoRoute/relatedMemo).

**Rule 0 — Archived view wins:** if `status === ARCHIVE && page === archive`, show only **Return** + **Send to Outlook** and stop.

| Work item type | Extra condition | Buttons (in order) |
|---|---|---|
| `FYI`, `ACTION` | `!isComplete` | Archive · Give Input · Forward (`forward`) · Send to Outlook |
| `RVW` | `!isComplete` | Looks Fine (`review`) · Give Input |
| `RWN` | status `NEW\|INPROGRESS` && `!isComplete` | Archive · Send Note (`approveNote`) · Send Back (`rejectNote`) |
| `RWN` | status `NEW\|INPROGRESS` | + Send to Outlook |
| `IRWN` | status `NEW\|INPROGRESS` && `!isComplete` | Send Note (`approveNote`) |
| `IRWN` | status `NEW\|INPROGRESS` | + Send to Outlook |
| `FRWN` | status ≠ `ARCHIVE` | [`NEW\|INPROGRESS` → Archive] · [status ≠ `REJECT` → Forward (`forwardReplyNote`)] · [`NEW\|INPROGRESS` && `!isComplete` → Send Back (`rejectNote`)] · Send to Outlook |
| `FRWNFOR` | status ≠ `ARCHIVE` | [`NEW\|INPROGRESS` → Archive] · Forward (`forwardReplyNote`) · Send to Outlook |
| `FAN` | status ≠ `ARCHIVE` | [`NEW\|INPROGRESS` → Archive] · Forward (`forwardFormApprovalNote`) · Send to Outlook |
| `COORD`, `NEWCC` | `!isComplete` | Archive · Reply with Memo · Reply with Note · Forward (`forward`) · Send to Outlook |
| `NEWTO` | `!isComplete` | [memo.type = `MWF` && status `NEW\|INPROGRESS` && `hasApproveOption` → **Approve Form and Return**] · Archive · Reply with Memo · Reply with Note · Forward (`forward`) · Send to Outlook |
| `NEWTO` | status = `APPROVE` | Forward (`forwardFormApprovalNote`) · Send to Outlook |
| `FYI`, `ACTION`, `COORD`, `NEWTO`, `NEWCC` | `isComplete` && status ∉ {`APPROVE`, `ARCHIVE`} | [status = `FORWARDED` && `witemSentType ∈ {COORD, ACTION, FYI}` && page = `sent` → Recall Memo (`recallMemoForward`)] · Forward (`forwardSentItems`) · Send to Outlook |
| `APPRV` (or wire `APPRVSIGN`) | `!isComplete` && page = `inbox` && `!isSecretaryDelegate` | Send Back (`rejectWorkItem`) · Approve (`approveWorkItem`) |
| `DISTRIBUTE` | always | [`canKtok` → Send To K2K] · [`canKtog` → Send By K2G] · [committee → Forward Committee (`forwardToCommittee`) **else** Forward (`forwardDistribute`)] · [`!isComplete` → Complete (`completeWorkItem`)] · Send to Outlook |
| `BCC` | page ≠ `archive` | [page = `inbox` → Archive] · Forward (`forwardBcc`) · Send to Outlook |

> ⚠️ In the current card, `canKtok`/`canKtog` are never bound (default `false`), so **Send To K2K / Send By K2G never appear**, and even if they did, the action strings `sendToK2K`/`sendToK2G` fall into the coordinator's *unhandled* branch.

### Sent-page additions (page = `sent` only)

Appended after the matrix above:

1. **Recall before approve** (`recallMemoBeforeApprove`): `memo.electronic` && (( `APPRV` && status = `APPROVE`) or type `COMPOSE`/`SELFCOMPOSE`) && `!memo.signed`.
2. **`FINALAPPRV` + status `COMPLETE`:**
   - Recall Memo (`recallMemo`) if memo.type ∈ {`MEMO`,`MWF`,`RPT`} and direction = `OUT`.
   - Send Reminder if memo.type ∈ {`MEMO`,`LETTER`,`MWF`,`RPT`} and outgoing (see caveat §9).
   - Forward (`forwardBcc`) + Send to Outlook once past approval: electronic → must be signed; hard copy → always.
3. **`COMPOSE`/`SELFCOMPOSE` + status `COMPLETE`:**
   - Recall Memo (`recallMemo`): outgoing `MEMO`/`MWF`/`RPT`; if electronic additionally requires `memo.signed` **and** memo sender login = current user; hard copy — no extra condition.
   - Send Reminder — same rule as above.
   - Forward (`forwardBcc`) + Send to Outlook — same "past approval" rule as above.
4. **`APPRV`/`RVW` + status `COMPLETE`:**
   - Send Reminder — same rule.
   - Forward (`forwardBcc`) + Send to Outlook only when `electronic && signed`.

---

## 5. Action behaviors and endpoints

Every mutating call attaches `delegateLogin` (real user) when the session is acting on behalf of someone.

### Archive (`archive`)
Confirm dialog → `GET /archiveWorkitems?witms={witemId}&delegateLoginId=` → toast → back to the list.

### Return from archive (`returnArchived`)
Confirm dialog →
- **KOTC:** `GET /returnFromArchive?witms={witemId}&delegateLoginId=`
- **KNPC:** no dedicated endpoint — `PUT /updateMemoWorkitem` with the whole work item, `witemStatus: 'Inprogress'` (memo.memoDate ISO-formatted, recipients' `siteMember.members` stripped).

Then navigate to `/inbox` (or `/committee/inbox` when committee) — *not* back to the archive list.

### Give Input (`giveInput`) — FYI / ACTION / RVW
Opens the memo PDF in the viewer with a comment + attachments pane. On submit:
1. `GET /getWorkitemStatusSuccuessOrnot?wflWitmId=` — must return `["SUCCESS", ...]`, else abort with error.
2. If a comment was entered: `PUT /addMemoGroupInputComment` with `{ groupCommentsId: '111', addedAt, comment, addedBy: empDetails, witemId, groupId: witemGroupingId, memoId }`.
3. `PUT /updateReviewWorkitem` with the work item, `witemStatus: 'complete'`, `delegateLogin`.
4. Close viewer, toast, navigate back.

(Give-Input file uploads inside the viewer pane go through the group-attachments container; the Inputs tab re-reads `GET /getGroupComntsAndAtchmnts`.)

### Looks Fine (`review`) — RVW
Opens a comment dialog (comment optional). On confirm:
1. `PUT /updateReviewWorkitem` — work item with `witemStatus: 'complete'`.
2. `POST /insertWorkItemHistoryReview` — `{ workItemId, action: 'Review', actionBy, actionComment, actionDate, deptCode, memoId, actionTo: witemSender ?? rootSender }`.

### Reply with Memo (`replyWithMemo`) — COORD / NEWCC / NEWTO
No API call from the card. Navigates to `/new-compose` with router state `{ workItemResponse: <work item>, isReply: true }`. The compose page takes over.

### Reply with Note (`replyWithNote`) — COORD / NEWCC / NEWTO
Dialog collects a note (required) + files. On send, sequentially:
1. For each file: `POST /uploadAttachement` (yes, misspelt) — committee items use `POST /uploadMemoAttachementReplyNoteCommittee`. Multipart: `Attach` (file) + `AttachmentInfo` (JSON: `attachmentType: 'REPLYNOTE'`, memoId, departCode, witmGroupingId, witemId, …).
2. `GET /getWorkitemStatusSuccuessOrnot?wflWitmId=` — must be SUCCESS.
3. `POST /createReplyUsers` — `{ currentUserLogin, workitem: { ...workItem, replyNote } }` (sent with a static `Customcode` header).
4. `POST /createReplyNoteWorkItems` (committee: `POST /createReplyNoteWorkItemsCommittee`) — `{ currentUserLogin, workitem: { ...workItem, memo: <updated memo from step 3>, replyNote } }`.
5. Toast → back.

### Send Note (`approveNote`) — RWN / IRWN
- **KNPC** (live path, via footer decorator): `POST /approveNote` — `{ currentUserLogin, workitem: { ...workItem, replyNote: <edited note text> } }` → toast → back.
- **KOTC:** the coordinator sets a "show approve comment dialog" flag that **no template currently renders** — the flow is effectively a stub in the new card (see §9).

### Send Back on a note (`rejectNote`) — RWN / FRWN
Comment dialog → strategy by committee flag:
- `POST /rejectNote` (default) or `POST /rejectNoteCommittee`.
- Payload: `{ currentUserLogin, workitem: { ...workItem, actionComment: <comment>, instructions: <comment> } }` (comment duplicated on both fields intentionally).
→ toast → back.

### Send Back a workflow item (`rejectWorkItem`) — APPRV
Comment dialog → strategy resolution (**order matters**):

| memo.type = `MWF` | committee | Endpoint |
|---|---|---|
| yes | — | `PUT /rejectWorkItemMWF` |
| no | yes | `PUT /rejectWorkItemCommittee` |
| no | no | `PUT /rejectWorkItem` |

Payload: `{ memoWorkitemId: witemId, actionComments, rejectedBy: currentUserLogin, isActing, delegateLogin }` → toast → back.

### Approve (`approveWorkItem`) — APPRV
Same unrendered-dialog stub as KOTC Send Note (§9). The real approval/signing experience for APPRV items happens through the **document viewer Signature button** (see §8), whose apply-events are also not yet wired in this card. Treat the web implementation as *in progress* here and confirm intended behavior with the backend/legacy app before porting.

### Approve Form and Return (`approveFormAndReturn`) — NEWTO on an MWF memo
Fully implemented via the MWF signing orchestrator:
1. Locate the `ORIGINALFORM` attachment on the memo (error if missing).
2. User picks a signing method (DSP Smart Card via local agent `wss://127.0.0.1:8523`, or Remote Sign) and the original form document is signed.
3. `POST /approveNoteMWF` — `{ currentUserLogin, memoWorkitem, delegateUserLogin, isActing }` returns the work item to the sender.
4. `POST /emailApproveNoteMWF` — fire-and-forget email notification (failure is non-fatal).
→ toast → back.

### Complete (`completeWorkItem`) — DISTRIBUTE (letters)
1. On open: `GET /getDistributeReasons` fills the "Action" dropdown.
2. On confirm: `PUT /updateMemoWorkitem` with the work item, `witemStatus: 'complete'`, `actionComment: "<action> - <comment>"` (just `"<action>"` when no comment), `delegateLogin`.
→ toast → back.

### Send to Outlook (`sendToOutlook`) — nearly all types
Dialog lists the memo PDF + all attachments (docIds). On send:
`GET /sentOutlookAttachment?versionSeriesIds={comma-separated docIds}&currentUserLogin=&memoId=` → toast (dialog stays on the item).

### Send Reminder (`sendReminder` footer / header button)
Both open the same recipient dialog → `POST /sendreminderemail` `{ memo, userList, actionUser }`.

### Recall (`recallMemoForward` / `recallMemoBeforeApprove` / `recallMemo`)
Comment dialog → two-step per type (email fires **only** when recall succeeds):

| Action | Recall endpoint | Then notification |
|---|---|---|
| `recallMemoForward` (recall a forwarded FYI/ACTION/COORD from Sent) | `POST /recallMemoForwardSign` | `POST /sendMailForRecallForwardSign` |
| `recallMemoBeforeApprove` (recall unsigned electronic memo) | `POST /recallMemoBeforeSign` | `POST /sendMailForRecallBeforeSign` |
| `recallMemo` (recall a fully signed/sent memo) | `POST /recallMemo` | `POST /sendMailForRecall` |

Payload: `{ currentUserLogin, workitem: <work item>, comments }`. The response DTO carries `resultValue: boolean` — `false` means the backend refused (e.g. a reply already exists): show error, stay on the item. `true`: toast + navigate to `/inbox`.

---

## 6. Forward — one dialog, six flavors

All Forward buttons open the same dialog in different modes:

| Action string | Dialog mode | Participant selection |
|---|---|---|
| `forward`, `forwardToCommittee` | `full` | Per-person Action / Info / Coordinate checkboxes + optional deadline |
| `forwardReplyNote` | `replyNote` | simple multi-select |
| `forwardBcc` | `bcc` | simple multi-select |
| `forwardFormApprovalNote` | `form` | simple multi-select |
| `forwardSentItems` | `sent` | simple multi-select |
| `forwardDistribute` | `simple` | simple multi-select |

**Participant list source:** committee → `GET /getCommitteEmployeeExceptCurrentUser?memoId=&committeeId=&employeeLogin=`; otherwise → `GET /getSubOrdinates?employeeLogin=`.

**Deadline bounds:** min = today; max = the work item's own `deadLine` (when present).

**Execution pipeline on Send:**

1. **Status pre-check** `GET /getWorkitemStatusSuccuessOrnot?wflWitmId=` — must be SUCCESS. **Skipped entirely** for `forwardBcc` and `forwardSentItems` (inherently post-launch) and for *any* forward launched from the Sent page. A non-SUCCESS result raises "Item already processed", closes the dialog and refreshes the list.
2. **`PUT /updateMemo`** with the work item — **KOTC only** (KNPC backends update the memo inside the forward endpoint itself). Response `errorCode` must be `'10'`, else abort.
3. **The forward POST** — endpoint per mode and committee flag:

| Action | Non-committee | Committee |
|---|---|---|
| `forward` / `forwardToCommittee` | `POST /addWorkItem` | `POST /addWorkItemCommittee` |
| `forwardDistribute` | `POST /createWorkItemsForLetterDistribution` | `POST /createWorkItemsForLetterDistributionCommitte` *(sic — no trailing "e" on "Committe")* |
| `forwardReplyNote` | `POST /createWorkitemForReplyNoteDistribution` | `POST /createWorkitemForReplyNoteDistributionCommittee` |
| `forwardBcc` | `POST /createWorkitemForBCCDistribution` | `POST /createWorkitemForBCCDistributionCommittee` |
| `forwardFormApprovalNote` | `POST /createWorkitemFormApproval` | `POST /createWorkitemFormApprovalCommittee` |
| `forwardSentItems` | `POST /createWorkitemForSentForwardInfo` | `POST /createWorkitemForSentForwardInfoCommittee` |

**Payload (all modes):**
```json
{
  "currentUserLogin": "...",
  "instructions": "<instructions or comment>",
  "memo": { "...": "memo with memoPartcpnts replaced" },
  "witemGroupingId": "...",
  "newFlag": false,
  "previousWorkitemId": "<witemId>",
  "isActing": false,
  "delegateLogin": "",
  "workitemConfidential": false   // standard forward / forwardToCommittee only
}
```

**`memo.memoPartcpnts` mapping rules:**
- Full mode: `coordinate → COORD`, else `action → ACTION`, else `info → FYI`; unchecked people are dropped.
- Simple modes: `selected → DISTRIBUTE`.
- **Auto-COORD rule** (full mode, unless the current work item type is `ACTION`): if exactly one participant is `ACTION` and nobody is `COORD`, that participant is converted to `COORD`.
- Deadline sent as `deadLine: "YYYY-MM-DD"`; never sent for `FYI` participants; omitted when unset.
- Each participant entry: `{ participantId, participantLogin, participantTitle, participantName, actionType, deptCode, memoId, deadLine? }`.

On success: toast → dialog closes → navigate back.

---

## 7. Other card interactions

### Confidential checkbox
- **Editable** for `NEWTO`/`NEWCC` while not complete. Default seeded from `GET /getConfidentialIncoming?deptCode=` (department policy seeds *checked*, never locks). Toggling calls `GET /changeConfidential?deptCode=&memoId=&cofidentialornot={true|false}`; the UI only commits after server success (no optimistic flip).
- **Read-only** on the Sent page for `FINALAPPRV`/`COMPOSE`/`SELFCOMPOSE` with status `COMPLETE` — mirrors `memo.confidential`.

### Classify (memoRoute, IN direction only)
Shown once the incoming context (memoRef + receiving deptCode) resolves. Reuses the compose Classify dialog with host-owned persistence:
- Create: `POST /createincomingmemoclassification`
- Update (a record already exists): `POST /updatememoclassification`
- Payload: `{ function, subFunction, activity, transaction, memoRef, docId, deptCode }`.
The receiving department's classification (from `GET /getMemoClassification`) is authoritative for the chips and for prefilled-vs-empty dialog; the sender's own classification is hidden when the recipient hasn't classified yet.

### Document cards
- **Memo Document** → opens the PDF viewer (multiple viewers may be open in parallel).
- **Original Memo** (reply items) → opens the original memo in the shared card dialog (relatedMemo mode).
- **Referenced Memos** (KNPC) → read-only list dialog fed by `GET /getMemoReferences`; card hidden when count = 0.
- **Related Documents** (KOTC) → modal listing `GET /getRelatedMemosCheck` results; clicking one opens it in the card dialog.

### Attachments tabs
Tabs: Attachments / Enclosures / References / Original Form / Reply Notes / Inputs (+ Related Memos tab on KNPC). Upload is enabled only for `RWN`/`IRWN` on the inbox page (the card's own upload handler is currently a placeholder toast; deletion asks for confirm and currently only logs — see §9).

---

## 8. Document viewer — Signature / Initial / Give Input

When the memo PDF opens from a work item, extra buttons appear inside the viewer:

| Button | Condition |
|---|---|
| **Signature** | `isRemoteSign` && `!isSecretaryDelegate` && type ∈ {`APPRV`, `FINALAPPRV`} |
| **Initial** | `isInitial` && type ∈ {`RVW`, `APPRV`} |
| **Give Input pane** | opened via the Give Input action only |

> ⚠️ In the current new card the viewer's `applySignature` / `applyInitial` outputs are **not bound** — the coordinator has placeholder handlers that only toast "in progress". The actual DSP signing pipeline (local agent at `wss://127.0.0.1:8523`, profiles from `environment.json → SIGNING_PROFILES`) is implemented in the compose flow and in MWF Approve-Form-and-Return, but not yet for plain APPRV/FINALAPPRV signing from this card. Verify the intended APPRV signing flow against the legacy app before implementing on mobile.

---

## 9. Company differences (KNPC vs KOTC) and known caveats

### Company switches (runtime `COMPANY` config, not build flags)

| Behavior | KNPC | KOTC |
|---|---|---|
| Send Note (`approveNote`) | `POST /approveNote` (footer decorator) | comment-dialog flow (currently unrendered stub) |
| Forward pipeline | skips `PUT /updateMemo` (backend does it) | `PUT /updateMemo` before the forward POST |
| Return from archive | `PUT /updateMemoWorkitem` (`witemStatus: 'Inprogress'`) | `GET /returnFromArchive` |
| Related memos UI | "Related Memos" tab + "Referenced Memos" card (`GET /getRelatedMemos`, `GET /getMemoReferences`) | "Related Documents" card (`GET /getRelatedMemosCheck`) |
| relatedMemo data source | `GET /getMemoDetails?memoId=` | `GET /getMemoDetailsOne` |

### Caveats spotted in the web code (do not blindly replicate)

1. **Approve dialog not rendered** — `approveWorkItem` and KOTC `approveNote` set `showActionCommentDialog`, but no template binds it, so nothing happens visually. KNPC Send Note works (decorator); the KOTC/Approve paths are incomplete in the new card.
2. **Footer Send Reminder direction mismatch** — the footer check compares `memoDirection` against `'OUTGOING'`, but the card passes the internal `'OUT'` value, so the *footer* Send Reminder button currently never renders. The **header** Send Reminder (§3) uses its own correct rule and is the live entry point. (The analogous recall check was already fixed to compare `'OUT'`.)
3. **Send To K2K / Send By K2G** — inputs never bound and actions unhandled; effectively dead in this card.
4. **Attachment upload/delete from the tabs** — placeholder implementations (info toast / log only).
5. **`APPRVSIGN`** is a wire code that isn't in the type enum but is explicitly matched for the Approve buttons — treat it as `APPRV`.
6. Several endpoint names carry legacy misspellings that are load-bearing: `/uploadAttachement`, `/sentOutlookAttachment`, `/getWorkitemStatusSuccuessOrnot`, `/createWorkItemsForLetterDistributionCommitte`, `cofidentialornot`, `/getGroupComntsAndAtchmnts`. Use them verbatim.

---

## 10. Quick action → endpoint index

| Action | Method + endpoint(s) |
|---|---|
| Archive | `GET /archiveWorkitems` |
| Return from archive | KOTC `GET /returnFromArchive` · KNPC `PUT /updateMemoWorkitem` |
| Give Input submit | `GET /getWorkitemStatusSuccuessOrnot` → `PUT /addMemoGroupInputComment` → `PUT /updateReviewWorkitem` |
| Looks Fine (review) | `PUT /updateReviewWorkitem` → `POST /insertWorkItemHistoryReview` |
| Reply with Memo | *(navigation to compose only)* |
| Reply with Note | `POST /uploadAttachement`[…] → `GET /getWorkitemStatusSuccuessOrnot` → `POST /createReplyUsers` → `POST /createReplyNoteWorkItems[Committee]` |
| Send Note (KNPC) | `POST /approveNote` |
| Send Back (note) | `POST /rejectNote[Committee]` |
| Send Back (workflow) | `PUT /rejectWorkItem` / `PUT /rejectWorkItemMWF` / `PUT /rejectWorkItemCommittee` |
| Approve Form & Return (MWF) | *(DSP sign)* → `POST /approveNoteMWF` → `POST /emailApproveNoteMWF` |
| Complete (letter) | `GET /getDistributeReasons` → `PUT /updateMemoWorkitem` |
| Forward (any flavor) | `GET /getWorkitemStatusSuccuessOrnot`* → `PUT /updateMemo`* → `POST /addWorkItem` (etc. — see §6) |
| Recall | `POST /recallMemoForwardSign` / `recallMemoBeforeSign` / `recallMemo` → `POST /sendMailForRecall*` |
| Send Reminder | `POST /sendreminderemail` |
| Send to Outlook | `GET /sentOutlookAttachment` |
| Reassign | `GET /getAllDeptEmployeesReassign` → `GET /reassignWorkitem` |
| Reply Cycle | `GET /getAllReplyUsers` |
| Discard (IRWN) | `GET /discardWorkItemRWN` |
| Confidential toggle | `GET /getConfidentialIncoming` · `GET /changeConfidential` |
| Classify incoming | `GET /getMemoClassification` → `POST /createincomingmemoclassification` or `POST /updatememoclassification` |

\* conditionally skipped — see §6.
