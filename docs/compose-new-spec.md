> **Audience:** the mobile team implementing the Compose New (new memo / letter / memo-with-form / reporting) feature against the existing EasyMemo backend.
> **Source of truth:** reverse-engineered from the production Angular web client (`src/app/pages/compose/`), July 2026. Everything here reflects what the web app actually sends/receives today, including backend quirks the server **requires** (misspelled routes, literal `"undefined"` params, numeric wire formats).
> **Golden rule:** several backend routes are misspelled (`launchHarcopy`, `uploadAttachement`, `removeRecepient`, `getMemoSuperVisorsCommitte`, `updateDocPropeties`, `inserInitialUserAudit`, `trueOrFlase`, `updateMemoDalyDoc`, `getAllEmployeesWithCrossDepartmnet`, `electrnoic`, `committeId`, `delegatLogin`, …). **Never "fix" a spelling** — the misspelling *is* the route/param name.

---

## Table of contents

1. [Conventions & cross-cutting rules](#/compose-new-spec#1-conventions-cross-cutting-rules)
2. [Runtime switches that change behavior](#/compose-new-spec#2-runtime-switches-that-change-behavior)
3. [Core domain model](#/compose-new-spec#3-core-domain-model)
4. [Entry points into Compose](#/compose-new-spec#4-entry-points-into-compose)
5. [Step 1 — Media & Document Type selection](#/compose-new-spec#5-step-1-media-document-type-selection)
6. [Templates (KNPC only)](#/compose-new-spec#6-templates-knpc-only)
7. [Creating the work item](#/compose-new-spec#7-creating-the-work-item)
8. [Step 2 — the Compose form](#/compose-new-spec#8-step-2-the-compose-form)
9. [Lookup / dropdown data sources](#/compose-new-spec#9-lookup-dropdown-data-sources)
10. [Recipients (From / To / CC / BCC)](#/compose-new-spec#10-recipients-from-to-cc-bcc)
11. [Attachments](#/compose-new-spec#11-attachments)
12. [Body editing & document generation](#/compose-new-spec#12-body-editing-document-generation)
13. [Classification (KNPC)](#/compose-new-spec#13-classification-knpc)
14. [Action visibility rules (which buttons appear when)](#/compose-new-spec#14-action-visibility-rules)
15. [Action execution flows (endpoint sequences)](#/compose-new-spec#15-action-execution-flows)
16. [Send For Approval — full detail](#/compose-new-spec#16-send-for-approval-full-detail)
17. [Send For Review — full detail](#/compose-new-spec#17-send-for-review-full-detail)
18. [Signing flows (Sign & Send / Smart Card / Remote)](#/compose-new-spec#18-signing-flows)
19. [Hard-copy flow](#/compose-new-spec#19-hard-copy-flow)
20. [Memo With Form (MWF) specifics](#/compose-new-spec#20-memo-with-form-mwf-specifics)
21. [Reporting memo (RPT, KNPC) specifics](#/compose-new-spec#21-reporting-memo-rpt-knpc-specifics)
22. [Committee compose specifics](#/compose-new-spec#22-committee-compose-specifics)
23. [Reply-With-Memo specifics (KNPC)](#/compose-new-spec#23-reply-with-memo-specifics-knpc)
24. [KNPC wire-format rules (critical)](#/compose-new-spec#24-knpc-wire-format-rules-critical)
25. [Error handling contracts](#/compose-new-spec#25-error-handling-contracts)
26. [Endpoint quick-reference index](#/compose-new-spec#26-endpoint-quick-reference-index)
27. [Implementation pitfalls checklist](#/compose-new-spec#27-implementation-pitfalls-checklist)

---

## 1. Conventions & cross-cutting rules

### 1.1 Base URLs

All compose endpoints live under the **MemoController** unless stated otherwise:

```
{BASE}/MemoController/<route>          ← memo APIs (99% of this doc)
{BASE}/UserController/<route>          ← function/activity/transaction lookups
{BASE}/OfficeOnline/Memo/{memoId}/...  ← Word-Online body (note: rooted at BASE, no controller)
```

`{BASE}` comes from deployment config (`environment.json` → `ENVIRONMENTS_URLS[BASE_ENVIRONMENT]`). Mobile should treat it as a configurable server root.

### 1.2 Cache buster

Every **GET** carries `r=<epoch milliseconds>` (`Date.now()`). The server may cache aggressively without it. Always append it.

### 1.3 Identity slots (delegation) — read this twice

The app supports **delegation** (a delegate acts on behalf of a delegator). Three identities exist:

| Term | Meaning |
|---|---|
| **physical user** | The actually-logged-in account (`user.userLogin`). |
| **delegator** | The person being represented (`delegateUser.userLogin`), when acting. |
| **effective user** | delegator if acting, otherwise the physical user. |

The legacy backend expects **specific identities in specific slots** and they are *not* consistent across endpoints:

| Payload slot (typical) | Value |
|---|---|
| `approvedBy` / `rejectedBy` / `currentUserLogin` on approve/reject/review/reassign/hard-copy-launch | **effective** user |
| `delegateLogin` on the same calls | **physical** user (sent even when not delegating) |
| `isActing` / `acting` | `true` iff a delegator is selected |
| `currentUserLogin` on KNPC `launchElectronicMemo` | **effective** user |
| `currentUser` on `applySignatureAndDateMEMO` (KOTC chain), signing agent identity | **physical** user |
| `delegateLogin` **query param** on `getMemoSuperVisors`, `prepareMemo`, `deleteAttachment`(KNPC), `applySignatureAndDateRemote` when *not* delegating | the **literal string `"undefined"`** — not omitted, not the user's login |

> ⚠️ `&delegateLogin=undefined` is a real, required wire value (legacy JS string concatenation). The backend matches on it.

Also: a **secretary delegate** (delegation flagged as secretary) may only *prepare* content — Save is their only send-ish action; all signing/sending actions are hidden for them (see §14).

### 1.4 HTTP 200 ≠ success

Several mutating endpoints answer **HTTP 200 with a result envelope even on logical failure**:

```jsonc
// CommonResultDto — returned by prepareMemo, applySignatureAndDateMEMO/Remote,
// launchElectronicMemo, launchHarcopy, and the KOTC send chain
{
  "memo": { ... },          // present on success (where applicable)
  "errorCode": "10",        // '10' and '1900' are SUCCESS codes; anything else = failure
  "errMessage": "…",        // failure reason; 'DocSizeMoreEr' = document exceeds 200 MB
  "docId": "…"              // remote sign: success ONLY if non-empty
}
```

Client rule (replicate exactly):
- `errorCode === '10' || errorCode === '1900'` → success (ignore any incidental `errMessage`).
- Otherwise, non-empty `errMessage`/`errorMessage` → business failure; show it, **stay on the page**.
- `applySignatureAndDateRemote`: success **iff `docId` is non-empty**; `errMessage === 'DocSizeMoreEr'` → "max 200 MB" message.
- Some KNPC updates (`PUT /updateMemo` with a wrong-shaped body) return **204 and silently persist nothing** — see §24.

### 1.5 The work-item status guard (concurrency)

Before **every** mutating action on an open work item (save, send, approve, reject, discard, sign, reassign…), the web client verifies the item wasn't already processed elsewhere (another device, a secretary):

```
GET /MemoController/getWorkitemStatusSuccuessOrnot?wflWitmId={witemId}&r={ts}
→ string[]   // proceed ONLY if response[0] === 'Success'
```

If not `Success`: abort the action, show "work item already processed", refresh the list. Mobile must implement the same pre-check.

### 1.6 Unsaved-changes guard

Leaving compose with a dirty form prompts "leave / stay". Programmatic navigation after a successful send/save must bypass the prompt. Fresh programmatic seeding (defaults, template application) must **not** count as dirty.

---

## 2. Runtime switches that change behavior

### 2.1 Company (deployment-level, from `environment.json → COMPANY`)

The single most important switch. `KNPC` and `KOTC` differ in endpoints, payload shapes, and features:

| Behavior | KNPC | KOTC |
|---|---|---|
| Templates in step 1 | ✅ (`memoTemplates`) | ❌ none |
| Reporting (RPT) doc type | ✅ (with permission) | ❌ |
| Reply-With-Memo flow | ✅ | ❌ (no reply re-init) |
| Related Memos tab in compose | ✅ (replaces "Related Docs" button) | ❌ (has "Related Docs" button) |
| Site selectors on From/To/CC | ✅ | ❌ |
| Classify button + classify-before-send prompt | ✅ | ❌ |
| Cross-department employee search | `getAllEmployeesWithCrossDepartmnet` | `getAllDeptEmployeesForForwarAndApprv` |
| Participant enrichment in `composeWorkItem` | sends `participantName` + `roleLogin` | empty strings |
| `updateMemo` before Send-for-Approval/Review | **skipped** (backend does it inside `addMemoApprovers` / `addReviewWorkItem`; committee review is the exception) | always `PUT /updateMemo` first |
| Hard-copy: extra `PUT /updateMemo` right after create | ✅ | ❌ |
| Hard-copy Send-for-Review / Send-for-Approval | ❌ (stripped) | ✅ (Outgoing only) |
| Hard-copy send | `POST /launchHarcopy` | `PUT /updateMemo` + `PUT /updateMemoWorkitem` |
| Sign & Send (electronic, final sender) | single `POST /launchElectronicMemo` | 5-step chain (§18.2) |
| Sign & Send button on **hard copy** | ❌ | ✅ (`HARDCOPY_SIGN_SEND`) |
| Smart Card signing | ✅ (if `SMART_CARD_SIGN_ENABLED` ≠ false) | ❌ |
| Recipient wire format | **numeric** member types (§24) | strings as-is |
| From pool endpoint | `getMemoSiteMembers?isForDceos=true` | `getMemoSiteMemberListFromRestricted?userLogin=` |
| To/CC pool endpoint | `getSiteMembers?siteId=` (+ `getSiteMembersMWF` for MWF TO) | `getSiteMemberListRestrictedNew?siteId&memoType&memoidIs&userIs&ccRecipientMWF` |
| Hard-copy Incoming To/CC pool | `getMemoSiteMemberListIncomingNew?userLogin=` | *(none — per-site pipeline)* |
| Delete attachment | `GET /deleteAttachment?attachmentID&currentUserLogin&witmId&delegateLogin` | `DELETE /deleteAttachment?attachmentId` |
| Book number field | labeled "External Ref. Number", persisted as `memo.extRefNumber` (sending `bookNumber` → Jackson 500) | genuine `memo.bookNumber` |
| Generate-flow memo update | `PUT /updateMemo` (wire-transformed) | `PUT /updateMemoSu` (payload as-is) |
| Site-member identity match | may match on `roleLogin` (`COMPOSE_SITE_MEMBER_BY_ROLE`) | `userLogin` |
| Remote-sign error localization | mapped to localized copy | backend message verbatim |

### 2.2 Config flags (`environment.json` / runtime config)

| Flag | Effect on compose |
|---|---|
| `is_online_office` | Body editor = Word Online iframe instead of CKEditor. Changes Generate/Save flows (must flush the editor and `PUT OfficeOnline/Memo/{id}/message` before `prepareMemo`). Body is **not** part of form validity when on. |
| `SMART_CARD_SIGN_ENABLED` | `false` kills the Smart Card button everywhere and makes MWF signing go straight to Remote (no method dialog). Default `true`. |
| `office_online_delay` | Fallback wait (ms) when the WOPI flush confirmation channel is unavailable. |

### 2.3 User-level permissions (orthogonal to company — always check both)

| Permission | Effect |
|---|---|
| `COMPOSE_HARDCOPY` | Without it, media option "Hard Copy" is not offered. |
| `COMPOSE_REPORTING` | Without it, document type "Reporting" is not offered (also requires KNPC + electronic + new-memo context). |

---

## 3. Core domain model

### 3.1 `ComposeWorkItem` (response of every create endpoint)

```ts
interface ComposeWorkItemDto {
  witemId: string;                 // work item id — used everywhere as wflWitmId/witmId
  witemGroupingId: string;         // grouping id — used by approvals/tracking/comments
  witemType: string;               // 'COMPOSE' | 'SELFCOMPOSE' | 'APPRV' | 'FINALAPPRV' | 'RVW' | ...
  witemRecipient: string;
  witemStatus: 'DRAFT' | 'SENT' | 'Inprogress' | string; // see §3.4
  witemReceivedOn: string;
  stepNo: number;
  senderDept: { id: number; name: string };
  receiverDept: { id: number; name: string };
  senderDiv: { id: number; name: string };
  receiverDiv: { id: number; name: string };
  classified: boolean;
  memo: Memo;                      // §3.2
  dims: boolean;
  witemSentType: 'COMPOSE' | string;
  replyNoteStepNo: number;
  composeCommittee: number;        // committee that composed (0 when none)
  receiverCommittee: number;
  formSignature: boolean;          // MWF final-approver signature flag
  receiverSiteMemberId: number;
  committeeInbox: boolean;
  folderId: number;
  witemSender?: string;
  replied: boolean;
  originalMemo?: Memo;             // reply flow: the memo being replied to
  startReply?: string;             // '1' when created by Reply-With-Memo
}
```

### 3.2 `Memo`

```ts
interface Memo {
  memoId?: string;
  memoRef?: string;                    // reference number, stamped at sign/send
  type: 'Memo' | 'Letter' | 'MWF' | 'RPT';
  electronic: boolean;                 // false = hard copy
  direction: 'Outgoing' | 'Incoming';  // hard copy only meaningful
  memoLanguage: 'en' | 'ar' | 'BOTH';  // NOTE: 'BOTH' is uppercase on the wire; en/ar lowercase
  memoDate: string;
  memoPreparationDate: string;

  memoEnSubject?: string;  memoArSubject?: string;
  memoEnMessage?: string;  memoArMessage?: string;   // HTML body

  subjectRequired: boolean;   // Letter template variant flag ("isSubject" checkbox)
  gtog: boolean;              // Letter "G-to-G" template variant flag ("isKtog" checkbox)
  confidential: boolean;
  departmentCode: number;     // composing dept (committee memos: the COMMITTEE's dept)
  divisionCode: number;       // numeric ECM division code

  siteMember?: SiteMember;    // the FROM (sender) site member
  memoRecepients?: MemoRecipient[];      // TO + CC (+FROM in generate flow) — note spelling
  memoRecepientsBCC?: MemoBccRecipient[];
  memoAttachments?: MemoAttachment[];
  memoApprovers?: MemoApproverEntry[];
  memoPartcpnts?: MemoParticipant[];     // reviewers etc. — note spelling

  memoDocId?: string;         // generated/uploaded main document (FileNet version series id)
  memoMainSADocId?: string; memoRecipientSADocId?: string;

  // classification
  memoFunction?: string; memoSubFunction?: string; memoActivity?: string; memoTransaction?: string;

  bookNumber?: string;        // KOTC only — KNPC uses extRefNumber
  extRefNumber?: string;      // KNPC hard-copy External Ref Number
  primaryAttachName?: string; primaryAttachType?: string;  // hard-copy uploaded doc metadata

  committee: boolean; committeeId: number;
  signed: boolean; discarded: boolean; topManagement: boolean;
  remoteSignStatus: boolean; dimsDailyDocument: boolean; signAnyDoc: boolean;

  // KNPC Reporting fields
  reportAbsentee?: EcmEmployeeRef; reportActing?: EcmEmployeeRef; reportRefMgr?: EcmEmployeeRef;
  reportStartDate?: string;   // 'YYYY-MM-DD' (LOCAL date — do not UTC-shift)
  reportEndDate?: string;
  reportTemplate?: ReportTemplate;

  originalMemoId?: string; originalMemoRef?: string; originalMemo?: boolean; // reply linkage
}
```

### 3.3 Recipients / members

```ts
interface Site { siteId: number; siteArName: string; siteEnName: string;
                 siteShortEnName: string; siteShortArName: string; }

type MemberType = 'TeamMembers' | 'OrganizationalUnits' | 'MyOrganization';
// KNPC numeric wire mapping: TeamMembers=0, OrganizationalUnits=1, MyOrganization=2

interface SiteMember {
  memberId: number;           // unique only WITHIN a site
  type: MemberType | number;  // numeric on KNPC wire
  enName: string; arName: string;      // UI-only on KNPC (stripped on wire)
  enTitle: string; arTitle: string;    // the *title* is the identity shown on chips
  empLogin: string;
  site: Site;
  jobTitle: string;           // UI-only on KNPC wire
  ecmJobTitle?: string;       // job-title CODE (MGR/DCEO…) — routing key for approval chain
  secretaryLogin?: string; committeeId?: number; ecmDeptCode?: number;
  members?: SiteMember[];     // runtime-only for groups — MUST be stripped from all payloads
}

interface MemoRecipient {
  recipientId: string;        // server-assigned; REQUIRED for removal
  loginName: string;
  memberType: MemberType | number;
  memoId: string;
  recipientArDesignation: string; recipientEnDesignation: string;
  recipientType: 'TO' | 'CC' | 'FROM';
  site: Site;
  siteMember: SiteMember;     // lean (no members[])
  orderId: number;            // MUST be unique per memo (duplicates ⇒ silent 204 failure)
}

interface MemoBccRecipient {
  recipientId?: string; memoId: string; recipientType: 'BCC';
  recipientEnName: string; recipientArName: string;
  loginName: string; orderId: number;
}

interface MemoApproverEntry {
  approverId?: string; approverLogin: string; approverOrder: number; // 1 = FIRST to approve
  memoId: string; ecmDeptCode: number; approverType: 'APPRV';
  signatureRequired: boolean;   // MWF per-approver flag
  roleLogin?: string; approverName?: string;
}

interface MemoParticipant {   // reviewers
  participantId: string; participantLogin: string; participantTitle: string;
  participantName: string; actionType: 'RVW' | 'COMPOSE' | string;
  deptCode: number; memoId: string; roleLogin?: string;
}
```

### 3.4 Work-item type & status vocabularies

```
witemType:  COMPOSE, SELFCOMPOSE, APPRV, APPRVSIGN, FINALAPPRV, RVW, FYI, ACTION,
            RWN, IRWN, FRWN, FRWNFOR, FAN, COORD, NEWCC, NEWTO, BCC, DISTRIBUTE, FINALCOMPOSE
witemStatus: NEW, INPROGRESS, COMPLETE, APPROVE, FORWARDED, ARCHIVE, REJECT, REWORK,
             DRAFT, DISCARD, CLOSED
"active" statuses (actions allowed): NEW, INPROGRESS, REWORK, DRAFT
"closed"  statuses (read-only):      COMPLETE, DISCARD, CLOSED
```

Compare status/type **case-insensitively** — the backend mixes case (`'Inprogress'`, `'DRAFT'`).

---

## 4. Entry points into Compose

| # | Entry | Trigger | What happens |
|---|---|---|---|
| 1 | **New compose** | user opens Compose New | Step-1 modal (media + type [+ template on KNPC]) → `POST /composeWorkItem` → Step 2 |
| 2 | **Committee compose** | Compose inside committee context | committee modal (media + type + committee) → `POST /composeCommitteeWorkItem` → Step 2 |
| 3 | **Resume draft / open assigned item** | opening a DRAFT (or an APPRV/FINALAPPRV/RVW compose-shaped item) from Draft/Inbox lists | *No create call.* The full `ComposeWorkItem` is passed in navigation state; client maps `memo` → form, media = `memo.electronic`, type = `memo.type`, straight to Step 2 |
| 4 | **Reply-With-Memo (KNPC)** | "Reply with memo" on a received item | Step-1 modal opens with reply context → `PUT /createReplyForNewMemo` (§23) |
| 5 | **Sign Any Document launch (KNPC)** | Launch from Sign-Any-Document, query `signedDocVersionId` (+`signedDocType`) | Skips modal. `POST /composeWorkItem` (hard copy) → `PUT /updateMemo` → `GET /updateMemoSignDoc?memoId&versionId` → Step 2, type locked, Upload hidden |
| 6 | **DIMS daily document launch** | query `dimsDailyDocId` (+`signedDocType`) | Same as #5 but the link step is `GET /updateMemoDalyDoc?memoId&dailyDocId` |

On resume (#3), also rebuild: attachments context from `memo.memoAttachments`, `memoDocId` state, classification state (`memoFunction+memoSubFunction+memoActivity` all present = classified), reply context if `startReply === '1'` (restore original-memo card + related memos tab).

---

## 5. Step 1 — Media & Document Type selection

### 5.1 Options

```
Media:  Electronic ('electronic')   |   Hard Copy ('hard')
Type:   Memo ('Memo') | Letter ('Letter') | Memo with Form ('MWF') | Reporting ('RPT')
```

Defaults: **Electronic + Memo** pre-selected (legacy parity — 1 click to proceed).

### 5.2 Availability matrix

| Condition | Effect |
|---|---|
| user lacks `COMPOSE_HARDCOPY` | remove Hard Copy from media options |
| media = Hard Copy | types = **Memo, Letter** only (no MWF, no RPT) |
| media = Electronic | types = Memo, Letter, MWF (+ RPT if all RPT conditions hold) |
| RPT shown iff | brand-new memo (not resume, not reply) **and** electronic **and** company has `REPORTING_MEMO` (KNPC) **and** user has `COMPOSE_REPORTING` |
| committee compose | types = **Memo, Letter** only (both medias) |
| on every media switch | reset the selected type to the first type valid for the new media |

---

## 6. Templates (KNPC only)

After the user picks a document type (KNPC), load templates for that type:

```
GET /MemoController/memoTemplates?type={Memo|Letter|MWF|RPT}&depCode={userDeptCode}&r=
→ [{ templateName, templateId, depCode }]
```

Selecting a template loads its full detail:

```
GET /MemoController/memoTemplate?templateId={id}&r=
→ MemoTemplateDetailDto {
    templateId, templateName, templateSubject, templateText /*HTML*/, templateLang: 'en'|'ar'|'both',
    confidentiality | Confidentiality,       // either casing may arrive
    type, depCode,
    keys: TemplateKeyDto[],                  // dynamic-form field descriptors
    senders: TemplateSiteMemberDto[],        // pre-configured FROM
    recipientObjTO: TemplateRecipientDto[],  // pre-configured TO
    recipientObjCC?: TemplateRecipientDto[], // pre-configured CC
    isMemo?: boolean                         // memo template (true) vs reporting-style (false)
  }
```

### 6.1 Dynamic keys → rendered content

`keys[]` describe placeholders inside `templateSubject`/`templateText`:

- Types: `TEXT`, `NUMBER`, `DATE`, `DROPDOWN`, `LIST` (employee picker), `TABLE` (child `keys` = columns).
- Client renders a small form; on proceed it **replaces each `key` placeholder** in subject+body with the value:
  - `DATE` → short local date; `LIST` → `ecmUserName` (joined with `, ` when multi).
  - Unfilled fields replace with **empty string** (the raw key must never leak into the memo).
  - `TABLE`: find the `<tr>` in `templateText` containing the first column key; clone it **once per data row**, substituting column values; splice back. Then run the scalar pass.
- Template also seeds: confidentiality, language, From/To/CC (only where the server response hasn't already provided them — server-assigned `recipientId`s win), subject/message into the right language columns.

The rendered `content`/`subject`/`lang`/`senders`/`recipientObjTO`/`recipientObjCC` are ALSO embedded into the create payload (§7.1) — the server persists them.

---

## 7. Creating the work item

### 7.1 Regular compose — `POST /composeWorkItem`

```jsonc
{
  "media": "electronic" | "hard",
  "type": "Memo" | "Letter" | "MWF" | "RPT",
  "template": "<templateId>",             // only when a template was chosen (KNPC)
  "acting": false,                        // true when delegating
  "memoPartcpnt": [                       // exactly 2 entries: current user, then delegator
    { "participantLogin": "u1", "participantName": "…", "roleLogin": "…", "actionType": "COMPOSE" },
    { "participantLogin": "",   "participantName": "",  "roleLogin": "",  "actionType": "COMPOSE" }
  ],
  // template-derived (only when template selected):
  "content": "<rendered html>", "subject": "<rendered subject>", "lang": "en|ar|both",
  "senders": [ ...TemplateSiteMemberDto minus members[] ],
  "recipientObjTO": [ ...TemplateRecipientDto with siteMember.members stripped ],
  "recipientObjCC": [ ... ]
}
```

Rules:
- **KNPC** fills `participantName` + `roleLogin` (`COMPOSE_PARTICIPANT_ENRICHMENT`); KOTC sends them empty.
- The whole payload is passed through a recursive cleaner that strips `null`/`undefined`/empty-array/empty-object leaves before sending.
- Response = `ComposeWorkItem` (§3.1) with `witemStatus: 'DRAFT'`.
- ⚠️ The response may echo `memo.type` as the server default `"Memo"` — **the client's chosen type is authoritative**; override locally and it will persist on the next update.
- **KNPC + Hard Copy**: immediately follow with `PUT /updateMemo` re-sending the response (`COMPOSE_HARDCOPY_UPDATE_AFTER_CREATE`) so the persisted record is complete.

### 7.2 Committee compose — `POST /composeCommitteeWorkItem`

```jsonc
{
  "memoPartcpnt": [ /* same enriched 2 participants as §7.1 */ ],
  "acting": false,
  "committeId": 123,                    // ⚠ misspelled key
  "direction": "Outgoing",
  "electrnoic": true                    // ⚠ misspelled key; from the media pick
}
```

- No `type` field exists — stamp the modal's chosen type client-side on the response (`memo.type`), it persists via the next update.
- Committee reply re-init instead uses `POST /createReplyForNewMemoCommittee`:

```jsonc
{ "memoPartcpnt": [ { "participantLogin": "u1" }, { "participantLogin": "" } ],  // BARE logins only
  "acting": false, "electrnoic": true, "witmId": "<source work item id>" }
```

### 7.3 Reply-With-Memo (KNPC) — `PUT /createReplyForNewMemo`

See §23. Payload = media/type + `workitemId` (source) + `originalMemo` flag + optional template fields (same shape as §7.1).

### 7.4 Post-create client state

From the create response keep: `witemId`, `witemGroupingId`, `memo.memoId`, `memo.departmentCode`, `witemStatus`, `memo.memoDocId` (null until generate/upload), attachments list, and map `memo` into the Step-2 form (§8.6).

---

## 8. Step 2 — the Compose form

### 8.1 Fields (top-level)

| Field | Notes |
|---|---|
| Document Type | **always disabled** (fixed by step 1 / launch) |
| Confidentiality | `confidential` \| `nonconf` → wire boolean `memo.confidential` |
| Division | options from `getDivisions` (§9.1); wire = numeric `ecmDivisionCode` |
| Language | `en` / `ar` / `both` → wire `'en' | 'ar' | 'BOTH'` (uppercase BOTH!) |
| Group Name | disabled, auto-resolved dept function name (§9.2) |
| Book Number / External Ref | free text; KOTC → `memo.bookNumber`; KNPC → `memo.extRefNumber` (§2.1) |
| Direction | hard copy only: Outgoing/Incoming, **editable**; electronic: fixed Outgoing, disabled |
| Document Date | date |
| Reporting block (RPT only) | Absentee, Acting, Ref. Manager (conditional), Start Date, End Date (§21) |

### 8.2 Compose sub-group

| Field | Notes |
|---|---|
| From | `RecipientViewModel[]` (single member) — required |
| To | required (except RPT) |
| CC | optional |
| BCC | optional; **hidden for RPT** |
| Subject / SubjectAr / SubjectEn | single `subject` unless language=BOTH (then the AR/EN pair) — max length 200 |
| Message / MessageAr / MessageEn | HTML body (CKEditor) — not used when Word Online is on |
| isSubject (Letter "Subject required") | → `memo.subjectRequired` — picks 1 of 4 letter templates on the backend |
| isKtog (Letter "G-to-G") | → `memo.gtog` |

### 8.3 Required-for-Generate ("form valid") matrix

The web app's actionability predicate (a.k.a. `!checkGenerate`) — reuse verbatim:

| Doc type | Required |
|---|---|
| Memo / Letter / MWF, electronic, CKEditor | From + To + active-subject + non-empty body |
| Memo / Letter / MWF, electronic, Word Online | From + To + active-subject (body lives in the iframe) |
| Hard copy (any) | From + To + active-subject (body = uploaded doc) |
| RPT | From + Absentee + Acting + StartDate + EndDate (+ RefMgr only for the DCEO Refinery template) + date validity (start not past, end ≥ start) |

**Active subject** = when language is BOTH *and* type is Memo: `subjectAr` **and** `subjectEn` both non-blank; otherwise the single `subject` non-blank.

Subject requirement by type: Memo=required, Letter=optional, MWF=required, RPT=optional (backend generates it).
`To` requirement: required everywhere except RPT.

### 8.4 Language dynamics

On language change re-apply validators:
- BOTH → `subjectAr`, `subjectEn`, `messageAr`, `messageEn` required; single `subject`/`message` not.
- single language → `subject` + `message` required; the four split fields not.

Mapping form → wire columns (in updates):
- language = ar → `subject|subjectAr` → `memoArSubject`, `message|messageAr` → `memoArMessage`; preserve existing EN columns.
- language = en → `subject` → `memoEnSubject`, `message|messageEn` → `memoEnMessage`; preserve AR.
- language = BOTH → `subjectEn`→EN column, `subjectAr`→AR column (read the split controls, **not** `subject`).
- Empty values are **omitted** (→ NULL), never sent as `""`.
- RPT: never write `memoArSubject` (must remain NULL).

### 8.5 Division defaulting (priority order)

1. Resumed draft: match `memo.divisionCode` → option `ecmDivisionCode`.
2. Fresh: `senderDiv.name` match.
3. Composer's own `empDetails.ecmDivisionCode` (delegator's when acting).
4. First option (never leave blank).

Division dropdown is **locked** for cross-department approvers (§14.4).

### 8.6 Mapping the work item → form (resume/defaults)

- type: match `memo.type` (fallback = chosen media/type), **then override with user's step-1 choice** when present.
- confidentiality: `memo.confidential`.
- direction: match `memo.direction` by name, default Outgoing.
- language: match `memo.memoLanguage` **lowercased**.
- documentDate: `memo.memoDate`.
- recipients: §10.7.
- subject/message columns → both single and split controls.
- bookNumber: KNPC reads `extRefNumber || bookNumber`; KOTC `bookNumber`.
- After population, mark the form pristine.

---

## 9. Lookup / dropdown data sources

### 9.1 Divisions

```
GET /MemoController/getDivisions?deptCode={dept}&r=
→ [{ divShortName, deptShortName, ecmDivisionCode }]
```
- Option label/value = `divShortName`; keep `ecmDivisionCode` (wire value) and `deptShortName` (used in the memoRef format, §18.4).
- Regular compose: current user's dept. Committee compose: **the committee's dept** (`memo.departmentCode`).

### 9.2 Group Name (department function)

```
GET /UserController/getFunctionAndSubFunction?deptcode={dept}&r=
→ { functionName, subFunctionList: string[] }
```
- The single `functionName` is the "Group Name" (disabled field). A resumed draft's `memo.memoFunction` wins over the fetched value.
- Regular compose: effective user's dept; committee: committee dept.

### 9.3 Sites

```
GET /MemoController/site   → Site[]     (cache per session)
```

### 9.4 Others

Classification lookups §13; reporting employee lookups §21; employee searches §16.3/§10.5.

---

## 10. Recipients (From / To / CC / BCC)

### 10.1 From pool (sender identities)

| Context | Endpoint |
|---|---|
| KNPC regular | `GET /getMemoSiteMembers?isForDceos=true&r=` |
| KOTC regular | `GET /getMemoSiteMemberListFromRestricted?userLogin={login}&r=` |
| Committee (not hard-copy-incoming) | `GET /getMemoSiteMembersForCommitte?committeeId={id}&r=` ⚠ spelling |
| Hard copy + Incoming (any) | falls back to the regular per-user pool + per-site loads; senders are **individuals only** (filter out group types) |

KNPC DTO shape is different (numeric `type`, `enTitle/arTitle`, no names) — normalize to the shared shape (`0→TeamMembers, 1→OrganizationalUnits, else MyOrganization`).

### 10.2 To / CC pools

| Context | Endpoint |
|---|---|
| KNPC, electronic/hard outgoing | `GET /getSiteMembers?siteId={siteId}&r=` |
| KNPC, **MWF TO** | `GET /getSiteMembersMWF?siteId=&r=` and additionally **filter out `type === 1` (groups)** — groups stay allowed in CC |
| KOTC | `GET /getSiteMemberListRestrictedNew?siteId&memoType&memoidIs={witemId}&userIs={login}&ccRecipientMWF={bool}&r=` |
| Hard copy + **Incoming**, regular | `GET /getMemoSiteMemberListIncomingNew?userLogin={effectiveLogin}&r=` — replaces per-site pool entirely, no client filtering (KNPC only; KOTC keeps per-site) |
| Hard copy + Incoming, committee | `GET /getMemoSiteMemberListIncomingCommittee?committeeId=&r=` |

Site selector rules (KNPC `COMPOSE_SITE_SELECTOR`): To/CC site can be changed for **Letter** flows only; otherwise locked to own site. On direction flips the pools reload; guard rails prompt before clearing incompatible recipients.

### 10.3 Persisting To/CC adds — every chip add is an API call

```
POST /MemoController/uploadRecipient
{
  recipientEnDesignation, recipientArDesignation,
  loginName, memoId, siteMember, witmId, site,
  recipientType: 'TO' | 'CC', memberType
}
→ echoes request + recipientId
```
- **KNPC (`RECIPIENT_NUMERIC_WIRE_FORMAT`)**: drop `witmId`; convert `memberType` and `siteMember` to numeric wire (§24) — otherwise the server returns no usable `recipientId`.
- **Stamp the returned `recipientId` on the chip.** It's required for removal and round-trips into every memo update.

### 10.4 Removing To/CC

```
GET /MemoController/removeRecepient?recipientId={id}&witmId={witemId}&r=     ⚠ spelling
```

### 10.5 BCC

- **Hidden for RPT.**
- Suggestion source (search-as-you-type, min chars, no global loader):
  - regular KNPC: `GET /getAllEmployeesWithCrossDepartmnet?LoginName={q}&EmpName={q}&deptCode={effectiveUserDept}&r=`
  - committee: `GET /getAllEmployeesInCommitteeExceptFinal?committeId={id}&memoId&userLogin&loginName={q}&empName={q}&r=` ⚠ `committeId`
  - (legacy KOTC BCC list: `GET /getBCCEmployees?LoginName={login}`)
- Add: `POST /uploadRecipientBCC { memoId, loginName, recipientEnName, recipientArName, recipientType:'BCC', orderId }` → `{ recipientId, ... }`
- Remove: `GET /removeRecepientBCC?recipientId=&r=`

### 10.6 Recipient payload rules on every memo update (§15.1)

- `memoRecepients` = form TO array mapped + CC array mapped (order preserved); FROM goes to `memo.siteMember` (and only in the KOTC `updateMemoSu` generate path also as `FROM` rows).
- Recover `recipientId` and server `orderId` from the previously loaded rows by login when the UI copy lost them.
- **`orderId` must be unique per memo** — assign the next free integers; duplicates make `PUT /updateMemo` return 204 and persist nothing.
- Strip `members[]` from every embedded `siteMember` (payload bloat ⇒ 200 MB failures).
- Never let `siteMember.ecmDeptCode` degrade to 0 if the original row had one.
- BCC lives in `memoRecepientsBCC` (separate array). RPT always sends `[]` (wipes stale)… and on the KNPC wire an **empty** BCC array is omitted entirely.
- De-dupe recipients by login on load.

### 10.7 Display rules

Chips show the site-member **title** (`enTitle`/`arTitle`), not the resolved person name; fall back title → name → login. Site short name shown as a badge. From = single member; the person composing is "site member" when their login (or delegator's, for a signing delegate; or `roleLogin` on KNPC) matches the From member's `empLogin` — this drives which send/sign buttons appear (§14).

---

## 11. Attachments

### 11.1 Types

```
Attachment | Enclosure | Refrence (⚠ spelling, = supporting document) | OriginalForm (MWF) | Input | ReplyNote
```

### 11.2 Upload

```
POST /MemoController/uploadAttachement          ⚠ spelling      (committee: /uploadMemoAttachementReplyNoteCommittee)
multipart/form-data:
  Attach          = <file>
  AttachmentInfo  = JSON string {
      attachmentId:'', attachmentMimeType, orderId,       // orderId = per-TYPE 1-based sequence
      attachmentType, docId:'', attachmentName,
      attachmentAddedOn: ISO, attachmentAddedBy: <EmployeeDetails of current user>,
      memoId, isAddedFromRepository:false, departCode, witmGroupingId, witemId }
→ MemoAttachment (echo with ids)
```

### 11.3 Delete

- KNPC: `GET /deleteAttachment?attachmentID={id}&currentUserLogin={physical}&witmId={witemId}&delegateLogin={delegatorOr'undefined'}&r=`
- KOTC: `DELETE /deleteAttachment?attachmentId={id}`

### 11.4 Reorder

`GET /updateatchmntOrderId?atchmntId={id}&orderId={n}&r=` ⚠ spelling — fire one per moved row.

### 11.5 Give-Input (group) attachments — different container

Input files provided by recipients live in the **group** container, not the memo:
- Upload: `POST /uploadGroupAttachement` (multipart `Attach` + `GroupAttachmentInfo`)
- Delete: `GET /deleteGroupAttachment?groupAtchmntId={groupAttachmentsId}&r=`
- Read (comments+attachments in one): `GET /getGroupComntsAndAtchmnts?groupId={witemGroupingId}&addedBy=&memoId&deptCode&r=` — `addedBy` **always empty** (filtering by login hides other recipients' input).

### 11.6 Behavior rules

- Adding/removing an `Attachment` after the document was generated ⇒ show "needs regeneration" notice.
- MWF: an `OriginalForm` attachment is a hard precondition for Generate/Send/Sign (§20).
- Attachment lists are read-only when status ∈ {COMPLETE, DISCARD, CLOSED}.

---

## 12. Body editing & document generation

### 12.1 Body mode per context

| Context | Body |
|---|---|
| Hard copy | **none** (body = uploaded physical document) |
| Electronic + `is_online_office` | Word Online iframe (per-language docs for BOTH) |
| Electronic otherwise | rich-text editor (HTML into `memoEnMessage`/`memoArMessage`) |
| MWF | *form* mode — cover memo body + the Original Form attachment carries the real content |

Word Online body endpoints (root-based, not MemoController):
```
GET {BASE}/OfficeOnline/Memo/{memoId}/message?editable=true|false   → { url … }  (iframe src)
PUT {BASE}/OfficeOnline/Memo/{memoId}/message   body: { en: <html|null>, ar: <html|null> }
```

### 12.2 Generate (electronic) — the exact sequence

```
0. status guard (§1.5)
1. Build the updated work item from the form (§15.1), incl. From siteMember + live attachments
2. Persist:   KOTC → PUT /updateMemoSu        KNPC → PUT /updateMemo   (wire format §24)
3. If Word Online: wait for editor flush confirmation, then PUT OfficeOnline message {en, ar}
4. GET /prepareMemo?memoId={memoId}&witmId={witemId}&delegateLogin=undefined
       &trueOrFlase=true&type={Memo|Letter|MWF|RPT}&r=            ⚠ 'trueOrFlase'
   → CommonResultDto { memo }        // errors: DocSizeMoreEr = >200MB
5. Merge res.memo into local state; memoDocId = res.memo.memoDocId
6. RPT: adopt res.memo.memoEnSubject into the (disabled) subject — backend owns RPT subjects
```

Preconditions: form-valid (§8.3), subject present, not already generating (debounce double taps).
Regenerate = same flow (shown once a document exists and the form is valid).

### 12.3 Viewing the document

```
GET /MemoController/viewDocument?docId={{docId}}&r=     // docId wrapped in literal braces {…}
→ binary (treat as application/pdf even if octet-stream)
```
Used for the main doc preview, reply original-memo preview, etc.

### 12.4 Annotations & referenced memos (badges)

- Annotation count: PdfAnnotation service `getAnnotations(docId)` — refresh when `memoDocId` changes.
- Referenced memos: managed via a dialog; count via referenced-memos service (`getMemoReferences(memoId)`); read-only when status closed. Available for both companies on non-RPT memos once the memo exists.
- Related memos (KNPC reply): `GET /getRelatedMemos?currentMemoId&currentUser&currentUserDept&witmId&r=`.

---

## 13. Classification (KNPC)

Required before any send/sign action (KNPC only, `COMPOSE_CLASSIFY_BEFORE_ACTION`):

- If `memo.memoFunction && memoSubFunction && memoActivity` are not all present and the user hasn't classified this session → prompt "Document not classified" → open Classify dialog → **on confirm, auto-resume the blocked action**. On cancel: drop the pending action entirely.

Dialog data:
```
GET /UserController/getFunctionAndSubFunction?deptcode={dept}&r=     → { functionName, subFunctionList }
GET /UserController/getActivities?function={f}&subFunction={sf}&r=   → string[]
GET /UserController/getTransactions?function&subFunction&activity&r= → string[]
POST /MemoController/updateDocPropeties       ⚠ spelling
  { function, subFunction, activity, transaction, documentId: {memoDocId}, memoId, witmId? }
```
- `witmId` included per company rule (`COMPOSE_CLASSIFY_WITM_ID` — KOTC includes it).
- dept = committee dept for committee memos, else user's dept.
- The chosen values are held client-side ("session classification") and stamped onto every subsequent update/send payload (`memoFunction/SubFunction/Activity/Transaction` + workItem-level `classified: true`).
- A **cross-department approver** must never classify (§14.4).
- Classify button visible (KNPC) once a document exists.

---

## 14. Action visibility rules

Definitions used below:
- `documentReady` = `memoDocId` set (electronic generate) **or** physical doc uploaded (hard copy).
- `formValid` = §8.3.
- `isSiteMember` = current effective identity matches the From member (§10.7).
- `activeStatus` = status ∈ {NEW, INPROGRESS, REWORK, DRAFT}; `closedStatus` = {COMPLETE, DISCARD, CLOSED}.
- `secretaryDelegate` = secretary acting for a delegator.

### 14.1 Footer actions

| Action | Visible when |
|---|---|
| **Save** | always |
| **Send For Review** | not secretaryDelegate; type ∉ {APPRV, FINALAPPRV}; not (COMPOSE/SELFCOMPOSE **and** isSiteMember); activeStatus; electronic → documentReady + formValid; hard copy → doc uploaded + direction **Outgoing** + formValid. **KNPC: removed entirely for hard copy; removed for RPT.** |
| **Send For Approval** | same predicate as Send For Review (KNPC removes it for hard copy; RPT keeps it) |
| **Send Back** | type ∈ {APPRV, FINALAPPRV, RVW} and not closedStatus |
| **Approve** | type = APPRV; not closedStatus; not secretaryDelegate; documentReady. (Non-final approver on plain Memo.) |
| **Approve Form** (MWF) | MWF variant of Approve for non-final approvers (§20) |
| **Send (Hard Copy)** | hard copy; documentReady; activeStatus; direction ∈ {Outgoing, Incoming}; formValid |

*(“not (COMPOSE and isSiteMember)” = when the composer IS the final signer, review/approval are replaced by the signing actions below.)*

### 14.2 Body actions

| Action | Visible when |
|---|---|
| **Generate** | electronic; !documentReady. Disabled while !formValid or a generate is in flight |
| **Regenerate** | electronic; documentReady; formValid |
| **Preview** | documentReady |
| **Upload** (physical doc) | hard copy; hidden in the Sign-Any-Doc launch flow; **never disabled by form validity** |
| **Classify** | KNPC only; documentReady; **not** crossDeptApprover |
| **Sign & Send** | not secretaryDelegate; **never for Letter**; electronic (KOTC adds a hard-copy variant when `HARDCOPY_SIGN_SEND`); not closedStatus; documentReady; formValid; (FINALAPPRV) or (COMPOSE/SELFCOMPOSE and isSiteMember) |
| **Smart Card Sign** | KNPC + `SMART_CARD_SIGNING` on; shown only when Remote Sign is shown |
| **Remote Sign** | not secretaryDelegate; electronic; type ∈ {Letter, MWF}; documentReady + formValid; (FINALAPPRV) or (COMPOSE/SELFCOMPOSE and isSiteMember) |
| **Related Docs** | electronic; **hidden on KNPC** (Related Memos tab replaces it) |

### 14.3 Header actions

Smart Compose (AI, config-gated), Approvers (dialog, §15.9), Comments (badge = count), Track, Reassign, Discard, Annotations/View main doc, Send Reminder (sent items context).

### 14.4 Cross-department approver lock (KNPC-relevant)

When the open item is APPRV/FINALAPPRV on an **electronic** memo and `memo.departmentCode` ≠ approver's own dept (≠0) and not committee context: **Division dropdown disabled** + **Classify hidden**. Committee memos are exempt.

---

## 15. Action execution flows

### 15.1 Building the update payload (shared by everything)

`mapToUpdateMemoPayload(workItem, formValue)` — start from the loaded work item, then overwrite from the form:

- `memo.confidential` ← confidentiality option
- `memo.divisionCode` ← selected option's `ecmDivisionCode`
- `memo.memoLanguage` ← `'en' | 'ar' | 'BOTH'`
- `memo.direction` ← option **name** (`'Outgoing' | 'Incoming'`) — only when set
- subject/message columns per language rules (§8.4); empty → omit
- `memo.subjectRequired` ← isSubject; `memo.gtog` ← isKtog
- RPT extras: `reportAbsentee/Acting/RefMgr` (raw employee objects), `reportStartDate/EndDate` as **local** `YYYY-MM-DD`; clear `memoArSubject`
- KNPC: `memo.extRefNumber` ← bookNumber field; KOTC: `memo.bookNumber`
- `memo.memoRecepients` ← TO+CC from the form (§10.6, unique orderIds); `memo.memoRecepientsBCC` ← BCC (RPT: `[]`)
- `memo.siteMember` ← From member (strip `members[]`)
- `memo.memoAttachments` ← **live attachment list** (the loaded snapshot is stale)
- carry session classification + `classified: true` when classified
- `memo.memoDocId` ← current known doc id

Then apply the **company wire transform** (KNPC numeric formats §24; KOTC identity) before any `PUT /updateMemo` / `updateMemoWorkitem` / embed.

### 15.2 Save (draft)

```
status guard →
PUT /updateMemo            (wire payload §15.1)
[Word Online? await flush → PUT OfficeOnline/Memo/{memoId}/message {en, ar}]   // electronic only
PUT /updateMemoWorkitem    (same wire payload)
→ toast + navigate back to source list (Draft list when status DRAFT, else Inbox; committee-aware)
```

### 15.3 Send For Review — see §17.
### 15.4 Send For Approval — see §16.
### 15.5 Sign flows — see §18. Hard copy — see §19.

### 15.6 Approve (non-final approver, plain memo)

```
comment dialog → status guard →
PUT /approveWorkItem                     (committee: PUT /approveWorkItemCommitte ⚠ spelling)
{ memoWorkitemId: witemId, approvedBy: <effective>, isActing, delegateLogin: <physical>, actionComments }
→ navigate back
```

### 15.7 Send Back (reject)

```
comment dialog (required) → status guard →
PUT /rejectWorkItem            | MWF: PUT /rejectWorkItemMWF   | committee: PUT /rejectWorkItemCommittee
{ memoWorkitemId, actionComments, rejectedBy: <effective>, isActing, delegateLogin: <physical> }
```

### 15.8 Discard

```
confirm dialog → status guard →
if startReply === '1'  → GET /discardWorkitem?witmId=&r=        // reply: returns original memo to initiator
else                   → PUT /updateMemoWorkitem  with { ...workItem, witemStatus:'DISCARD',
                          memo.memoDate → ISO string, recipients' siteMember.members stripped }
```

### 15.9 Small dialogs / info actions

| Action | Endpoint |
|---|---|
| Track | `GET /track?memoGroupId={witemGroupingId}&r=` → history rows |
| Comments | `GET /commentsNew?memoId&deptCode={userDept}&witmType={witemType or COMPOSE}&witemGroupingId&r=` |
| Approvers list | `GET /getAllApprovers?memoId&r=` → `[{approverLogin, approverName, approverOrder, ecmDeptCode, signatureRequired}]` |
| Reassign candidates | `GET /getAllDeptEmployeesReassign?deptCode={effective user's dept}&witmId&r=` — committee: `GET /getAllDeptEmployeesReassignCommittee?deptCode&witmId&employeeLogin={effective}&r=` |
| Reassign submit | `GET /reassignWorkitem?workItemId&newAssignee={ecmUserLogin}&currentUser={effective}&comments&r=` — committee: `GET /reassignWorkToEmployeeCommittee?...` (status-guarded) |

---

## 16. Send For Approval — full detail

### 16.1 Preconditions
Subject present; (KNPC) classified — else prompt-then-resume (§13); MWF → OriginalForm attached.

### 16.2 Loading the suggested approver chain

```
GET /getMemoSuperVisors
  ?employeeLogin={effective}&memoId&fromUserId={From memberId}&fromUserLogin={From empLogin}
  &fromUserTitle={From ecmJobTitle ← the CODE, e.g. MGR/DCEO}&witmId&memoType
  &componentModel=compose&delegateLogin={delegator or 'undefined'}&currentUserLogin={physical}&r=
→ SupervisorApiResponse[] (already sorted: FINAL approver first, first-approver last; do NOT re-sort)
```

Committee variant (no from* params):
```
GET /getMemoSuperVisorsCommitte?employeeLogin&memoId&sitememberId={From memberId}&witmId&memoType&componentModel&delegateLogin&currentUserLogin&r=      ⚠ spelling
```

**Ordering semantics (critical):**
- `approverOrder` **1 = the FIRST person to receive/approve**; highest order = final approver.
- The web UI renders the list top = last/highest, bottom = order 1, and lets the user drag to reorder; after any add/remove/reorder, orders are re-derived from position (bottom row = 1 counting up).
- A newly added employee lands at order 1 (receives first).
- The **From site member is appended automatically as the final approver** with `order = (visible approvers count) + 1`, `ecmDeptCode` = From member's dept; their `signatureRequired` = the dialog's "final approver signature" checkbox (MWF §20; default false).

### 16.3 Adding / removing approvers

- Employee search: KNPC `GET /getAllEmployeesWithCrossDepartmnet?LoginName={q}&EmpName={q}&deptCode={user dept}&r=`; KOTC `GET /getAllDeptEmployeesForForwarAndApprv?userLogin&queryLogin&r=`; committee `GET /getAllEmployeesInCommitteeExceptFinal?committeId&memoId&userLogin&loginName&empName&r=`.
- If the picked employee has a `roleLogin`, the approval routes to the **role account**.
- On each add/remove, call
  `GET /getAllEmployeesDefaultApprovers?LoginName={login}&witmId&memoId&currentUserLogin&delegatLogin={..or 'undefined'}&action=Add|Remove&r=` ⚠ `delegatLogin`
  → employee rows of **default co-approvers** (e.g. a manager's secretary) to auto-add/remove alongside.
- MWF only: when the dialog opens, seed the audit trail:
  `POST /inserInitialUserAudit { memoId, witmId, currentUserLogin, delegateLogin, tempParticipants: [] }` ⚠ spelling.

### 16.4 Submit

Emit approvers sorted by `order` ascending (order 1 first), then append the final approver (§16.2), then:

**KOTC (regular):**
```
status guard → PUT /updateMemo (payload §15.1) →
POST /addMemoApprovers {
  currentUserLogin: <physical>, witemGroupingId, previousWorkitemId: witemId,
  isActing, delegateLogin: <delegator or physical>,
  memoApprovers: [{ approverLogin, approverOrder, memoId, ecmDeptCode, approverType:'APPRV', signatureRequired }]
}
```

**KNPC (regular):** *(no updateMemo — the backend updates inside the call)*
```
status guard →
POST /addMemoApprovers {
  memoApprovers: [{ approverLogin?, roleLogin: <roleLogin || login>, approverOrder, memoId, ecmDeptCode, approverType:'APPRV', signatureRequired }],
  memoWorkitem: <FULL work item, memo in KNPC wire format §24, classified stamped>,
  comment: "<dialog comment>"
}
```

**Committee (both companies):** endpoint `POST /addMemoApproversCommitte` ⚠ spelling; same `{memoApprovers, memoWorkitem, comment}` wrapper; every row's `ecmDeptCode` forced to `memo.departmentCode`; approvers keyed on **personal** login (KNPC: include `roleLogin` only when the source row really had one).

After success: toast + navigate back.

---

## 17. Send For Review — full detail

### 17.1 Load reviewers

```
GET /getReviewrs?employeeLogin={effective}&memoId&r=                       ⚠ spelling
committee: GET /getReviewrsCommittee?employeeLogin&memoId&committeeId&r=
```
Extra employees search: same endpoints as §16.3 (`searchReviewEmployees`).

### 17.2 Submit

Common payload (both companies):
```
POST /addReviewWorkItem            (committee: /addReviewWorkItemCommittee)
{
  currentUserLogin: <effective>,
  instructions: "<review comment>",           // ALWAYS sent; committee inbox renders it
  memo: <memo + memoPartcpnts = reviewers>,   // participants: {participantId=login, participantLogin,
                                              //  participantTitle=ecmUserTitle, participantName,
                                              //  actionType:'RVW', deptCode (committee: memo.departmentCode), memoId}
  witemGroupingId, newFlag: false, previousWorkitemId: witemId,
  isActing, delegateLogin: <physical>,
  delegateLoginUserName: <physical user's display name>
}
```
- **KNPC:** memo embedded in wire format — numeric recipient types, `members` stripped from all site members, `memoDate` as ISO string, session classification stamped. **No prior updateMemo** — *except committee*, which first does `PUT /updateMemo` (wire) with `delegateLogin` stamped on the work item.
- **KOTC:** `PUT /updateMemo` first, then the POST.
- If the comment is non-empty, additionally log it:
  `POST /insertWorkItemHistoryReview { workItemId, memoId, action:'Review', actionBy: <display name>, actionComment, actionDate, deptCode, actionTo: witemSender }`.

---

## 18. Signing flows

### 18.1 Common preamble for Smart-Card & Remote (ref number first!)

Signing requires the memo to already have a reference number:

```
1. GET /getWorkitemStatusSuccuessOrnot            // [0] === 'Success' or abort
2. POST /generateRefNumberNew { departmentCode, divisionCode, memo, witemGroupingId }
   → { outgoingcount, incomingCount, ... }
3. Build memoRef  (§18.4)  and stamp memo.memoRef
4. Persist:  KOTC → PUT /updateMemoSu   KNPC → PUT /updateMemo   (wire §24)
```

> Payload nuance: in this smart-card/remote preamble the web client sends `memo` = the **memo object**; the KOTC Sign & Send chain (§18.2) sends `memo` = the **whole work item** for the same endpoint. The backend tolerates both — replicate whichever flow you are in.

### 18.2 Sign & Send (final electronic send — Memo/MWF/RPT)

**KNPC — single call:**
```
POST /launchElectronicMemo {
  currentUserLogin: <EFFECTIVE>, instructions:'',
  memoWorkitem: <full work item, status kept 'DRAFT', memo in wire format, classified stamped>,
  witemGroupingId, newFlag:true, previousWorkitemId: witemId,
  isActing, formSignature: <MWF flag, else false>
}
→ envelope: success iff errorCode '10'/'1900' (§1.4)
```

**KOTC — 5-step chain (all status-guarded):**
```
POST /generateRefNumberNew → PUT /updateMemoSu →
GET /applySignatureAndDateMEMO?versionSeriesId={memoDocId}&memoId&isActing=YES|NO
    &currentUser={physical}&deptCode&type={docType}&delegateLogin={delegator or physical}&witmId&r=
→ POST /addWorkItemFinalSent {
    currentUserLogin: <physical>, instructions:'', memo: <memo returned by the sign call>,
    witemGroupingId, newFlag:true, previousWorkitemId, isActing,
    delegateLogin: <delegator or physical>, formSignature:false }
```

Payload prep in both: keep `witemStatus:'DRAFT'` (the server transitions it), refresh `memoDocId` and From `siteMember` from the live UI, MWF: rebuild `memoAttachments` (Original Form must be in there).

### 18.3 Smart Card (KNPC, Letter/MWF/Sign-flows)

```
"card inserted?" confirm → §18.1 preamble →
local DSP agent flow (wss://127.0.0.1:8523, profile 'memo') →
GET /applySignatureAndDateMEMO?versionSeriesId&memoId&isActing&currentUser={physical}
    &deptCode&type&delegateLogin={delegator or ''}&witmId&r=
→ envelope check (§1.4; also fail when no memo returned) →
POST /addWorkItemFinalSent { … memo: <sign result memo>, newFlag:true, formSignature:false }
```
Agent errors: agent-not-running / user-cancelled / generic — distinct messages, no state change.

### 18.4 Reference number format

```
{O|I}-{deptShortName}-{divShortName}-{YY}-{NNNN}
O = Outgoing/electronic (uses outgoingcount), I = Incoming hard copy (incomingCount)
deptShortName: from getDivisions rows; divShortName: selected division option name
NNNN = counter zero-padded to ≥4. Abort signing if any segment missing.
```

### 18.5 Remote Sign (Letter/MWF)

```
remote-registration pre-check (certificate/signature/paired device — surface backend message on failure)
→ §18.1 preamble →
GET /applySignatureAndDateRemote?versionSeriesId&memoId&isActing=YES|NO&currentUser={physical}
    &deptCode&delegateLogin={delegator or literal 'undefined'}&workitemId={witemId}
    &WorkitemGroupingId={witemGroupingId}&r=
→ success iff res.docId non-empty; 'DocSizeMoreEr' → size-limit message
→ toast is "request sent" (user still confirms on their phone), navigate back
```
In-flight double-tap guard required. Classify-before-sign gate applies (KNPC).

---

## 19. Hard-copy flow

1. Compose form (no body editor). Direction editable (Outgoing/Incoming) — flips recipient pools (§10.2) and the memoRef prefix.
2. **Upload physical document** (required before send):

```
POST /uploadPhysicalDoc     multipart:
  AttachmentInfo = JSON {
    attachmentMimeType, attachmentName,
    memoWorkitem: <FORM-SYNCED work item; KNPC: memo in wire format>   // KNPC ships whole WI
  }                                                                    // KOTC: trimmed memo variant
  Attach = <file>
→ Memo (or work item — read memoDocId from either `memoDocId` or `.memo.memoDocId`)
```
Re-upload (replace) MUST carry the current `memoDocId` so FileNet supersedes instead of forking. Keep the new id/name/type synced locally after every upload.

3. **Send (Hard Copy)** — payload = §15.1 built work item with `witemStatus:'DRAFT'`, memoDocId, primaryAttach fields, classification:

**KNPC:**
```
PUT /updateMemo (wire memoWorkitem — failure here does NOT block) →
POST /launchHarcopy {                       ⚠ spelling
  currentUserLogin: <EFFECTIVE>, instructions:'', memoWorkitem: <wire>,
  witemGroupingId, newFlag:true, previousWorkitemId, isActing,
  delegateLogin: <physical>, formSignature:false,
  departmentCode: memo.departmentCode || senderDept.id || userDept,
  divisionCode:   memo.divisionCode  || senderDiv.id  || 0 }
→ success iff errorCode === '1900'
```

**KOTC:** `PUT /updateMemo` + `PUT /updateMemoWorkitem` (status-guarded).

4. KNPC hard copy has **no** Send-for-Review/Approval. KOTC allows them for Outgoing once a doc is uploaded.

---

## 20. Memo With Form (MWF) specifics

- TO recipients: KNPC uses `getSiteMembersMWF` and excludes **group** members from TO (still fine in CC).
- **Original Form attachment (`attachmentType: 'OriginalForm'`) is mandatory** before Send-for-Review/Approval/Sign — the signature lands on the form, not the cover memo.
- Send-for-Approval dialog adds per-approver **`signatureRequired` checkboxes** + a final-approver signature checkbox → `formSignature` (persisted on the work item).
- Signing target resolution: sign the OriginalForm's `docId` when present; else fall back to `memoDocId`.
- Flows:
  - **Composer Sign & Send:** choice dialog *(sign form / skip)* → skip ⇒ terminal send with `formSignature:false`; sign ⇒ method dialog (Smart Card vs Remote; skipped when `SMART_CARD_SIGN_ENABLED=false` → Remote directly) → sign pipeline → terminal send with `formSignature:true`. Terminal send = §18.2 per company.
  - **Non-final approver "Approve Form":** resolve own `signatureRequired` from `memo.memoApprovers` (match by `approverLogin` or `roleLogin`, fallback = work item `formSignature`): false ⇒ `PUT /approveWorkItemMWF` directly `{ memoWorkitemId, approvedBy: <effective>, isActing, delegateLogin: <physical>, actionComments }`; true ⇒ method dialog → sign pipeline → same `approveWorkItemMWF`.
  - **Final approver:** signatureRequired ? method dialog → sign → terminal (`formSignature:true`) : terminal directly (`false`).
  - **Send Back:** `PUT /rejectWorkItemMWF` (no formSignature field).
- "Approve Form and Return" (from the receiving side): `POST /approveNoteMWF { currentUserLogin, memoWorkitem, delegateUserLogin, isActing }` (+`/approveNoteMWFCommittee`, + fire-and-forget `POST /emailApproveNoteMWF`).

---

## 21. Reporting memo (RPT, KNPC) specifics

- Template-driven (step 1 template is effectively mandatory — reporting templates carry `tempeditable`, `lang`, etc.).
- Extra fields, all required: **Absentee**, **Acting**, **Start Date**, **End Date**; **Ref. Manager** required only when the selected template is the *DCEO Refinery* template.
- Employee pickers (search-as-you-type):
```
GET /getEmployeeForAbsentee?templateId&currentUser={login}
GET /getEmployeeForActing?templateId&currentUser&selectedUser={absenteeLogin}
GET /getEmployeeForRefMgr?templateId&currentUser&selectedUser={absenteeLogin}   // DCEO Refinery only
→ EmployeeApiResponse[]
```
- Dates: send `YYYY-MM-DD` built from **local** date parts (UTC conversion shifts a day). Validation: start not in the past, end ≥ start (equal allowed).
- Subject: **backend-generated** at `prepareMemo` — display `memoEnSubject` from the generate response in a disabled field; never write `memoArSubject` (must stay NULL).
- No BCC (control hidden, `memoRecepientsBCC: []` sent).
- KNPC: **no Send-for-Review** for RPT (approval only). To/Subject not client-required (§8.3 uses the report fields instead).

---

## 22. Committee compose specifics

Committee mode = compose launched under the committee section (`/committee/compose`); `memo.committee`/`memo.committeeId` identify committee memos.

| Concern | Committee behavior |
|---|---|
| Create | `POST /composeCommitteeWorkItem` (§7.2); reply: `POST /createReplyForNewMemoCommittee` |
| Types | Memo + Letter only |
| Divisions / Group name / Classify dept | use `memo.departmentCode` (the **committee's** dept), not the user's |
| From pool | `getMemoSiteMembersForCommitte?committeeId=` (hard-copy Incoming: site pools instead) |
| To/CC hard-copy incoming | `getMemoSiteMemberListIncomingCommittee?committeeId=` |
| BCC search | `getAllEmployeesInCommitteeExceptFinal` (⚠ `committeId` param) |
| Approver chain | `getMemoSuperVisorsCommitte?sitememberId=` |
| Approver search | `getAllEmployeesInCommitteeExceptFinal` |
| Submit approval | `POST /addMemoApproversCommitte` — `{memoApprovers, memoWorkitem, comment}` wrapper (both companies); rows' `ecmDeptCode` = committee dept; personal logins |
| Submit review | `POST /addReviewWorkItemCommittee`; participants' deptCode = committee dept; KNPC still runs `PUT /updateMemo` first here |
| Approve / Reject | `PUT /approveWorkItemCommitte` ⚠ / `PUT /rejectWorkItemCommittee` |
| Reviewers list | `getReviewrsCommittee?committeeId=` |
| Reassign | pool `getAllDeptEmployeesReassignCommittee?deptCode&witmId&employeeLogin={effective}`; submit `reassignWorkToEmployeeCommittee` (currentUser = effective) |
| Attachments upload | `POST /uploadMemoAttachementReplyNoteCommittee` |
| Committee id resolution for dialogs | replies (memoRef set) → work item `receiverCommittee`, else `memo.committeeId`; **0 is a legitimate id** — gate on `committee && committeeId != null`, never truthiness |
| Hard-copy launch | same `launchHarcopy`, but identity/dept rules matter even more: `currentUserLogin` = effective, `departmentCode` = committee dept; sender must be the narrow 7-field wire shape (§24) or the server 200s without launching |
| Navigation after actions | back to `/committee/…` lists |

---

## 23. Reply-With-Memo specifics (KNPC)

1. Entry carries the source work item. Step-1 modal opens (media+type; committee variant uses the committee modal). Reporting type is never offered.
2. Template picker (optional) + **"Source of Data (From Original Memo)"** checkbox — default = template's `isMemo` flag; user may flip per memo (never written back to the template).
3. Create:

```
PUT /MemoController/createReplyForNewMemo
{ media, type, workitemId: <source witemId>, originalMemo: <checkbox>, template?: <id>,
  content?, subject?, lang?, senders?, recipientObjTO?, recipientObjCC? }   // template fields as §7.1
→ ComposeWorkItem with .originalMemo = <the source memo>
```

4. After create:
   - Persist the linkage so it survives reopen: `GET /updateWItemOriginalMemoId?workItemId={new witemId}&memoId={original memoId}&r=` (fire-and-forget).
   - **Checkbox checked** (payload `originalMemo:true`): seed the form from the original memo — original **sender → TO**; original To+CC minus the replier (dedup by login) → **CC**; subject copied by original language. From stays the replier.
   - **Unchecked**: template data seeds the form (like a fresh compose).
   - Load the Related Memos tab: `GET /getRelatedMemos?currentMemoId&currentUser&currentUserDept&witmId&r=`.
   - Show the Original Memo Reference card (view via §12.3 with the original's `memoDocId`).
5. Reopen of a saved reply draft: `startReply === '1'` on the work item → restore reply UI (card + tab).
6. Discard of a reply uses the dedicated endpoint (§15.8) so the original returns to the initiator's inbox.

---

## 24. KNPC wire-format rules (critical)

Applied to the memo before **every** KNPC `PUT /updateMemo`, `PUT /updateMemoWorkitem`, and everywhere a `memoWorkitem` is embedded (`launchElectronicMemo`, `launchHarcopy`, `addMemoApprovers`, `addReviewWorkItem`, `uploadPhysicalDoc`):

1. **Member types become numbers**: `TeamMembers→0`, `OrganizationalUnits→1`, `MyOrganization→2` — on every `memoRecepients[].memberType` **and** `memoRecepients[].siteMember.type`. A string type makes Jackson reject the payload (visible as an error, or worse a **silent 204 no-op**).
2. **Recipient siteMember wire shape**: `{ memberId, type(num), enTitle, arTitle, empLogin, site, ecmJobTitle, secretaryLogin?, committeeId, ecmDeptCode }` — drop `enName/arName/jobTitle/members/witmId`.
3. **Sender (`memo.siteMember`) is NARROWER — 7 fields only**: `{ enTitle, arTitle, ecmJobTitle, memberId, empLogin, committeeId, ecmDeptCode }`. **No `site`, no `type`, no `secretaryLogin`** — sending them breaks committee hard-copy launch (200 + nothing happens). When no sender exists, send an empty stub `{ arTitle:'', enTitle:'', empLogin:'', ecmJobTitle:'' }`.
4. **Empty `memoRecepientsBCC` is deleted from the payload** (legacy omits the key; populated lists pass through).
5. `uploadRecipient` payload: numeric conversion + drop `witmId` (§10.3).
6. Review-flow embeds additionally: strip `members` everywhere, `memoDate` → ISO string.

KOTC: no transformation — send the UI shapes as-is (and use `updateMemoSu` for the generate-flow persist).

---

## 25. Error handling contracts

| Signal | Meaning / required handling |
|---|---|
| `getWorkitemStatusSuccuessOrnot[0] !== 'Success'` | Item already processed elsewhere → warn toast, abort, refresh list |
| Envelope `errorCode '10'/'1900'` | success (see §1.4) |
| Envelope `errMessage 'DocSizeMoreEr'` | document exceeds 200 MB (generate/sign) |
| Remote sign response without `docId` | signature NOT applied — show error, no success toast |
| Backend `errMessage` containing spaces | show verbatim (unconfigured secretary / no AD-group access / unlicensed recipient / missing Arabic name…) |
| Opaque single-token error codes | generic "sign failed" message |
| KNPC `PUT /updateMemo` answering **204** | payload shape rejected (string member types, duplicate orderIds, unknown keys like `bookNumber`) — nothing persisted; fix the payload, don't retry blindly |
| Word Online flush timeout | draft metadata saved but body snapshot skipped — tell the user to retry; never silently persist stale body |
| `uploadRecipient` returns no `recipientId` (KNPC) | wire format was wrong (§10.3) |

---

## 26. Endpoint quick-reference index

All under `/MemoController` unless noted. ⚠ = spelling is intentional.

**Create / init**
| Method | Route | Purpose |
|---|---|---|
| POST | `/composeWorkItem` | create compose work item |
| POST | `/composeCommitteeWorkItem` | committee create |
| PUT | `/createReplyForNewMemo` | KNPC reply-with-memo |
| POST | `/createReplyForNewMemoCommittee` | committee reply re-init |
| GET | `/updateWItemOriginalMemoId?workItemId&memoId` | persist reply↔original link |
| GET | `/updateMemoSignDoc?memoId&versionId` | sign-any-doc launch link |
| GET | `/updateMemoDalyDoc?memoId&dailyDocId` ⚠ | DIMS launch link |

**Lookups**
| Method | Route | Purpose |
|---|---|---|
| GET | `/site` | sites |
| GET | `/getDivisions?deptCode` | divisions (+deptShortName) |
| GET | `UserController/getFunctionAndSubFunction?deptcode` | group name + subfunctions |
| GET | `UserController/getActivities?function&subFunction` | classification |
| GET | `UserController/getTransactions?function&subFunction&activity` | classification |
| GET | `/memoTemplates?type&depCode` | template list (KNPC) |
| GET | `/memoTemplate?templateId` | template detail |

**Recipients**
| Method | Route | Purpose |
|---|---|---|
| GET | `/getMemoSiteMembers?isForDceos=true` | KNPC From pool |
| GET | `/getMemoSiteMemberListFromRestricted?userLogin` | KOTC From pool |
| GET | `/getMemoSiteMembersForCommitte?committeeId` ⚠ | committee From pool |
| GET | `/getSiteMembers?siteId` | KNPC To/CC pool |
| GET | `/getSiteMembersMWF?siteId` | KNPC MWF TO pool |
| GET | `/getSiteMemberListRestrictedNew?...` | KOTC To/CC pool |
| GET | `/getMemoSiteMemberListIncomingNew?userLogin` | KNPC hard-copy-incoming pool |
| GET | `/getMemoSiteMemberListIncomingCommittee?committeeId` | committee incoming pool |
| GET | `/getBCCEmployees?LoginName` | KOTC BCC pool |
| GET | `/getAllEmployeesWithCrossDepartmnet?...` ⚠ | KNPC employee search (BCC/approvers/reviewers) |
| GET | `/getAllDeptEmployeesForForwarAndApprv?...` ⚠ | KOTC employee search |
| GET | `/getAllEmployeesInCommitteeExceptFinal?committeId...` ⚠ | committee member search |
| POST | `/uploadRecipient` | persist TO/CC add |
| GET | `/removeRecepient?recipientId&witmId` ⚠ | remove TO/CC |
| POST | `/uploadRecipientBCC` | persist BCC add |
| GET | `/removeRecepientBCC?recipientId` ⚠ | remove BCC |

**Attachments**
| Method | Route | Purpose |
|---|---|---|
| POST | `/uploadAttachement` ⚠ | upload (multipart) |
| POST | `/uploadMemoAttachementReplyNoteCommittee` ⚠ | committee upload |
| GET/DELETE | `/deleteAttachment` | delete (KNPC GET / KOTC DELETE) |
| GET | `/updateatchmntOrderId?atchmntId&orderId` ⚠ | reorder |
| POST | `/uploadGroupAttachement` ⚠ | give-input upload |
| GET | `/deleteGroupAttachment?groupAtchmntId` | give-input delete |
| GET | `/getGroupComntsAndAtchmnts?groupId&addedBy&memoId&deptCode` ⚠ | group inputs |
| POST | `/uploadPhysicalDoc` | hard-copy main document |

**Persist / generate / view**
| Method | Route | Purpose |
|---|---|---|
| PUT | `/updateMemo` | persist memo (KNPC generate-persist; both save flows) |
| PUT | `/updateMemoSu` | KOTC generate-persist |
| PUT | `/updateMemoWorkitem` | persist work item (save/discard) |
| GET | `/prepareMemo?memoId&witmId&delegateLogin&trueOrFlase&type` ⚠ | generate PDF |
| GET | `/viewDocument?docId={…}` | fetch PDF (braces around id) |
| GET | `/getDocumentId?versionSeriesId` | docId by version series |
| GET | `/getRelatedMemos?...` | related memos (reply tab) |

**Send / sign / workflow**
| Method | Route | Purpose |
|---|---|---|
| GET | `/getWorkitemStatusSuccuessOrnot?wflWitmId` ⚠ | pre-action status guard |
| POST | `/generateRefNumberNew` | reference counter |
| GET | `/applySignatureAndDateMEMO?...` | apply signature (KOTC chain / smart card) |
| GET | `/applySignatureAndDateRemote?...&workitemId&WorkitemGroupingId` | remote stamp |
| POST | `/addWorkItemFinalSent` | final send after sign (KOTC/smart-card) |
| POST | `/launchElectronicMemo` | KNPC electronic send |
| POST | `/launchHarcopy` ⚠ | KNPC hard-copy send |
| POST | `/addMemoApprovers` | send for approval |
| POST | `/addMemoApproversCommitte` ⚠ | committee approval |
| POST | `/addReviewWorkItem` / `/addReviewWorkItemCommittee` | send for review |
| POST | `/insertWorkItemHistoryReview` | review comment history |
| GET | `/getMemoSuperVisors?...` / `/getMemoSuperVisorsCommitte?...` ⚠ | approver chain |
| GET | `/getAllEmployeesDefaultApprovers?...&delegatLogin&action` ⚠ | default co-approvers |
| POST | `/inserInitialUserAudit` ⚠ | MWF audit seed |
| GET | `/getAllApprovers?memoId` | approvers dialog |
| PUT | `/approveWorkItem` / `/approveWorkItemCommitte` ⚠ / `/approveWorkItemMWF` | approve |
| PUT | `/rejectWorkItem` / `/rejectWorkItemCommittee` / `/rejectWorkItemMWF` | send back |
| GET | `/discardWorkitem?witmId` | discard reply WI |
| GET | `/reassignWorkitem?...` / `/reassignWorkToEmployeeCommittee?...` | reassign |
| GET | `/getAllDeptEmployeesReassign(:Committee)?...` | reassign pool |
| GET | `/track?memoGroupId` | tracking |
| GET | `/commentsNew?memoId&deptCode&witmType&witemGroupingId` | comments |
| GET | `/getEmployeeForAbsentee|Acting|RefMgr?...` | RPT pickers |
| POST | `/updateDocPropeties` ⚠ | classification save |

**Office Online** (root-based)
| Method | Route | Purpose |
|---|---|---|
| GET | `OfficeOnline/Memo/{memoId}/message?editable=` | iframe URL |
| PUT | `OfficeOnline/Memo/{memoId}/message` | persist body `{en, ar}` |

---

## 27. Implementation pitfalls checklist

Sorted by how expensive they were to discover in the web app — verify each one:

1. **Never correct misspelled routes/params** (§ heading note). They are the API.
2. **Status guard before every mutation** (§1.5) — and treat a guard miss as a user-visible "already processed", not a silent no-op.
3. **`delegateLogin=undefined` literal** where specified — not omitted.
4. **HTTP 200 envelopes**: check `errorCode`/`errMessage`/`docId` — success codes are `'10'` and `'1900'`.
5. **KNPC wire format** (§24) — string member types / fat sender / duplicate `orderId`s produce **silent 204 no-persists** or 200-but-nothing-happened launches.
6. **`orderId` uniqueness** for recipients; per-type sequence for attachments.
7. **Strip `members[]`** from every embedded siteMember (200 MB blowups otherwise).
8. **`recipientId` bookkeeping**: stamp from `uploadRecipient` response; recover from server rows on resume; required for `removeRecepient`.
9. **`BOTH` is uppercase** in `memoLanguage`; `en`/`ar` lowercase; compare case-insensitively when reading.
10. **Client-chosen doc type is authoritative** — create/committee/sign-doc responses echo `"Memo"`.
11. **Keep `witemStatus:'DRAFT'` in send payloads** — the server does the transition.
12. **RPT**: local-date `YYYY-MM-DD`, backend-owned subject, NULL Arabic subject, no BCC, (KNPC) no Send-for-Review.
13. **MWF**: OriginalForm gates everything; the signature targets the form's docId; per-approver `signatureRequired`; rebuild `memoAttachments` from the live list before send/approval (the loaded snapshot is stale).
14. **Hard copy KNPC**: Save-then-Send (`updateMemo` before `launchHarcopy`); success = `errorCode '1900'`; re-upload must carry current `memoDocId`.
15. **Committee**: committee dept code everywhere (divisions/classify/approvers/participants), personal-login approvers, dedicated endpoints, `committeeId` may be 0 legitimately.
16. **Word Online**: flush before snapshot; on flush timeout warn — don't persist stale body; skip the body PUT entirely for hard copy.
17. **Empty-string vs null**: subject/message columns — omit empty values so the DB keeps NULL.
18. **Reference number is generated before signing**, stamped into `memo.memoRef` and persisted — signing a memo without it fails.
19. **Secretary delegates**: Save only. Signing delegates: treated as site member for the delegator's From line.
20. **Cross-dept approver**: lock Division, hide Classify (non-committee, electronic only).
21. Compare `witemType`/`witemStatus` **in upper case**; `startReply` may be string `'1'` or number `1`.
22. **De-dupe recipients by login** on load; login is the global identity (memberId is per-site only).
23. After any successful send/save/sign, navigate back to the **originating** list (Draft vs Inbox vs committee variants) and suppress the unsaved-changes prompt.
