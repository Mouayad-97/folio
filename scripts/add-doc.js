#!/usr/bin/env node
/* ============================================================
   Folio — add-doc
   Interactive: copies a Markdown file into docs/ and adds its
   entry to docs/manifest.json.

       node scripts/add-doc.js

   No dependencies. Node 16+.
   ============================================================ */

"use strict";

var fs = require("fs");
var path = require("path");
var readline = require("readline");

var ROOT = path.resolve(__dirname, "..");
var DOCS = path.join(ROOT, "docs");
var MANIFEST = path.join(DOCS, "manifest.json");

var rl = readline.createInterface({ input: process.stdin });

/* ── prompting ────────────────────────────────────────────── */

/* Lines are queued rather than read through rl.question: when stdin is a
   pipe rather than a terminal, readline emits every line at once and any
   line arriving without a question waiting on it is lost. */
var waiting = [];
var lines = [];
var ended = false;

rl.on("line", function (line) {
  if (waiting.length) waiting.shift()(line);
  else lines.push(line);
});
rl.on("close", function () {
  ended = true;
  while (waiting.length) waiting.shift()(null);
});

function ask(question, fallback) {
  process.stdout.write(question + (fallback ? " [" + fallback + "]" : "") + ": ");

  var next = lines.length
    ? Promise.resolve(lines.shift())
    : ended
      ? Promise.resolve(null)
      : new Promise(function (resolve) { waiting.push(resolve); });

  return next.then(function (line) {
    if (line === null) { process.stdout.write("\n"); return null; }   // end of input
    return line.trim() || fallback || "";
  });
}

async function askUntil(question, fallback, validate) {
  for (;;) {
    var answer = await ask(question, fallback);
    if (answer === null) throw new Error("Input ended before the question was answered.");
    var problem = validate(answer);
    if (!problem) return answer;
    console.log("  " + problem);
  }
}

async function confirm(question, defaultYes) {
  var answer = await ask(question, defaultYes ? "y" : "n");
  if (answer === null) return defaultYes;
  return /^y/i.test(answer);
}

/* ── helpers ──────────────────────────────────────────────── */

// Terminals paste dragged paths wrapped in quotes; Windows also adds & '...'
function cleanPath(input) {
  return input.replace(/^\s*&\s*/, "").replace(/^["']|["']$/g, "").trim();
}

function slug(s) {
  return String(s).toLowerCase().trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function today() {
  var d = new Date();
  return d.getFullYear() + "-" +
    String(d.getMonth() + 1).padStart(2, "0") + "-" +
    String(d.getDate()).padStart(2, "0");
}

// Best-effort defaults read out of the file itself.
function readHints(markdown) {
  var lines = markdown.split(/\r?\n/);
  var title = "";
  var summary = "";
  var inFence = false;

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    if (/^(```|~~~)/.test(line)) { inFence = !inFence; continue; }
    if (inFence || !line) continue;

    var heading = line.match(/^#{1,3}\s+(.*)$/);
    if (heading) { if (!title) title = heading[1].trim(); continue; }
    if (/^[>|\-*+]|^\d+\./.test(line)) continue;

    summary = line.replace(/[*_`[\]]/g, "");
    if (summary.length > 110) summary = summary.slice(0, 107).trimEnd() + "…";
    break;
  }
  return { title: title, summary: summary };
}

function flatten(manifest) {
  var all = [];
  (manifest.sections || []).forEach(function (sec) {
    (sec.docs || []).forEach(function (d) { all.push(d); });
  });
  return all;
}

/* ── the script ───────────────────────────────────────────── */

async function main() {
  if (!fs.existsSync(MANIFEST)) {
    throw new Error("No manifest at " + MANIFEST + " — run this from inside the Folio repo.");
  }

  var manifest = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
  manifest.sections = manifest.sections || [];
  var existing = flatten(manifest);

  console.log("\nFolio — add a document\n");

  /* 1. the source file */
  var source = await askUntil("Path to the Markdown file", null, function (value) {
    if (!value) return "Enter a path.";
    var resolved = path.resolve(ROOT, cleanPath(value));
    if (!fs.existsSync(resolved)) return "No file at " + resolved;
    if (!fs.statSync(resolved).isFile()) return "That is a directory.";
    if (!/\.(md|markdown)$/i.test(resolved)) return "That is not a .md file.";
    return null;
  });
  source = path.resolve(ROOT, cleanPath(source));

  var markdown = fs.readFileSync(source, "utf8");
  var hints = readHints(markdown);
  var alreadyInDocs = path.dirname(source) === DOCS;

  /* 2. title */
  var title = await askUntil(
    "Title",
    hints.title || path.basename(source, path.extname(source)),
    function (value) { return value ? null : "A title is required."; }
  );

  /* 3. section */
  console.log("\nSections:");
  manifest.sections.forEach(function (sec, i) {
    console.log("  " + (i + 1) + ") " + sec.label + "  (" + (sec.docs || []).length + ")");
  });
  console.log("  " + (manifest.sections.length + 1) + ") + new section\n");

  var pick = await askUntil("Section number", "1", function (value) {
    var n = Number(value);
    if (!Number.isInteger(n) || n < 1 || n > manifest.sections.length + 1) return "Pick 1–" + (manifest.sections.length + 1) + ".";
    return null;
  });

  var section;
  if (Number(pick) === manifest.sections.length + 1) {
    var label = await askUntil("New section label", null, function (value) {
      if (!value) return "A label is required.";
      if (manifest.sections.some(function (s) { return s.label === value; })) return "That section already exists.";
      return null;
    });
    section = { label: label, docs: [] };
    manifest.sections.push(section);
  } else {
    section = manifest.sections[Number(pick) - 1];
    section.docs = section.docs || [];
  }

  /* 4. id — also the PDF filename and the URL hash */
  var id = await askUntil("URL id", slug(title), function (value) {
    if (!value) return "An id is required.";
    if (slug(value) !== value) return "Use lowercase letters, numbers and hyphens: " + slug(value);
    if (existing.some(function (d) { return d.id === value; })) return "That id is already in the manifest.";
    return null;
  });

  /* 5. filename inside docs/ */
  var file = path.basename(source);
  if (!alreadyInDocs) {
    file = await askUntil("Filename in docs/", id + ".md", function (value) {
      if (!/^[\w.-]+\.(md|markdown)$/i.test(value)) return "Use a simple .md filename, no folders.";
      var taken = existing.some(function (d) { return d.file === value; });
      if (taken) return "Another manifest entry already uses that filename.";
      return null;
    });
  }

  /* 6. the rest */
  var summary = (await ask("Summary (searched by the filter box)", hints.summary)) || "";
  var updated = await askUntil("Updated (YYYY-MM-DD)", today(), function (value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return "Use YYYY-MM-DD.";
    return null;
  });

  var destination = path.join(DOCS, file);
  var overwriting = !alreadyInDocs && fs.existsSync(destination);

  /* 7. confirm */
  console.log("\n  " + (alreadyInDocs ? "already in docs/  " : "copy   ") +
    (alreadyInDocs ? file : path.relative(ROOT, source) + "  →  docs/" + file + (overwriting ? "   (overwrites!)" : "")));
  console.log("  add    " + section.label + " › " + title + "   (#/" + id + ")\n");

  if (!(await confirm("Write these changes?", true))) {
    console.log("Nothing written.");
    return;
  }

  /* 8. write */
  if (!alreadyInDocs) fs.copyFileSync(source, destination);

  section.docs.push({ id: id, title: title, file: file, updated: updated, summary: summary });
  fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + "\n", "utf8");

  var position = flatten(manifest).findIndex(function (d) { return d.id === id; }) + 1;
  console.log("\nDone. " + title + " is f." + String(position).padStart(2, "0") + ", at #/" + id + ".");
  console.log("Serve the folder and check it:  npx serve .\n");
}

main()
  .catch(function (err) { console.error("\n" + err.message + "\n"); process.exitCode = 1; })
  .finally(function () { rl.close(); });
