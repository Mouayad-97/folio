/* ============================================================
   Folio — app
   Loads docs/manifest.json, renders Markdown, exports PDF.
   No build step. Everything is plain files.
   ============================================================ */

(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };

  // Optional chrome: any of these buttons may be deleted from index.html
  // without breaking the rest of the page.
  var on = function (node, ev, fn) { if (node) node.addEventListener(ev, fn); };
  var text = function (node, str) { if (node) node.textContent = str; };

  var el = {
    list: $("list"), listEmpty: $("listEmpty"), filter: $("filter"), count: $("count"),
    prose: $("prose"), head: $("docHead"), title: $("docTitle"), folioNo: $("folioNo"),
    section: $("docSection"), updated: $("docUpdated"), read: $("docRead"),
    toc: $("toc"), tocList: $("tocList"), doc: $("doc"),
    pdf: $("pdf"), pdfLabel: $("pdfLabel"), print: $("print"),
    copy: $("copy"), copyLabel: $("copyLabel"),
    theme: $("theme"), themeLabel: $("themeLabel"),
    menu: $("menu"), index: $("index"), scrim: $("scrim"),
    toast: $("toast"), here: $("topbarHere"), stage: $("pdfStage")
  };

  var docs = [];          // flat list, in index order
  var byId = {};
  var site = { name: "Folio", tagline: "Documentation" };
  var current = null;
  var cache = {};
  var spy = null;

  /* ── helpers ──────────────────────────────────────────────── */

  function slug(s) {
    return String(s).toLowerCase().trim()
      .replace(/[^\w\s-]/g, "")
      .replace(/[\s_]+/g, "-")
      .replace(/-+/g, "-");
  }

  function pad(n) { return (n < 10 ? "0" : "") + n; }

  function niceDate(iso) {
    if (!iso) return "";
    var d = new Date(iso + "T00:00:00");
    if (isNaN(d)) return iso;
    return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  }

  function readingTime(text) {
    var words = text.trim().split(/\s+/).length;
    return Math.max(1, Math.round(words / 220)) + " min read";
  }

  function toast(msg) {
    el.toast.textContent = msg;
    el.toast.classList.add("up");
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { el.toast.classList.remove("up"); }, 2200);
  }

  function store(key, val) {
    try {
      if (val === undefined) return localStorage.getItem(key);
      localStorage.setItem(key, val);
    } catch (e) { /* storage unavailable — fine */ }
  }

  /* ── theme ────────────────────────────────────────────────── */

  function setTheme(mode) {
    document.documentElement.setAttribute("data-theme", mode);
    text(el.themeLabel, mode === "dark" ? "Light" : "Dark");
    store("folio:theme", mode);
  }

  (function initTheme() {
    var saved = store("folio:theme");
    var prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    setTheme(saved || (prefersDark ? "dark" : "light"));
  })();

  on(el.theme, "click", function () {
    setTheme(document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark");
    renderFiguresIn(el.prose, mermaidTheme());   // repaint any diagrams for the new theme
  });

  /* ── drawer (mobile) ──────────────────────────────────────── */

  function drawer(open) {
    if (!el.index) return;
    el.index.classList.toggle("open", open);
    if (el.menu) el.menu.setAttribute("aria-expanded", String(open));
    if (!el.scrim) return;
    el.scrim.hidden = !open;
    requestAnimationFrame(function () { el.scrim.classList.toggle("on", open); });
  }
  on(el.menu, "click", function () { drawer(!el.index.classList.contains("open")); });
  on(el.scrim, "click", function () { drawer(false); });

  /* ── index ────────────────────────────────────────────────── */

  function buildIndex(manifest) {
    site = manifest.site || site;
    document.title = site.name + " — " + (site.tagline || "Documentation");

    var n = 0;
    el.list.innerHTML = "";

    (manifest.sections || []).forEach(function (sec) {
      var group = document.createElement("div");
      group.className = "group";

      var label = document.createElement("p");
      label.className = "group__label";
      label.textContent = sec.label;
      group.appendChild(label);

      (sec.docs || []).forEach(function (d) {
        n += 1;
        d.no = "f." + pad(n);
        d.section = sec.label;
        d.id = d.id || slug(d.title);
        docs.push(d);
        byId[d.id] = d;

        var a = document.createElement("a");
        a.className = "entry";
        a.href = "#/" + d.id;
        a.dataset.id = d.id;
        a.innerHTML =
          '<span class="entry__no">' + d.no + '</span>' +
          '<span class="entry__title"></span>';
        a.querySelector(".entry__title").textContent = d.title;
        group.appendChild(a);
      });

      el.list.appendChild(group);
    });

    text(el.count, docs.length + " documents");
  }

  function markActive(id) {
    Array.prototype.forEach.call(el.list.querySelectorAll(".entry"), function (a) {
      if (a.dataset.id === id) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });
  }

  /* ── filter ───────────────────────────────────────────────── */

  on(el.filter, "input", function () {
    var q = el.filter.value.trim().toLowerCase();
    var shown = 0;

    Array.prototype.forEach.call(el.list.querySelectorAll(".group"), function (g) {
      var hits = 0;
      Array.prototype.forEach.call(g.querySelectorAll(".entry"), function (a) {
        var d = byId[a.dataset.id];
        var hay = (d.title + " " + (d.summary || "") + " " + d.section).toLowerCase();
        var hit = !q || hay.indexOf(q) !== -1;
        a.hidden = !hit;
        if (hit) { hits += 1; shown += 1; }
      });
      g.hidden = hits === 0;
    });

    if (el.listEmpty) el.listEmpty.hidden = shown !== 0;
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "/" && el.filter && document.activeElement !== el.filter && !/^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName)) {
      e.preventDefault();
      el.filter.focus();
      el.filter.select();
    }
    if (e.key === "Escape") {
      if (el.index.classList.contains("open")) drawer(false);
      else if (el.filter && document.activeElement === el.filter) { el.filter.value = ""; el.filter.dispatchEvent(new Event("input")); el.filter.blur(); }
    }
  });

  /* ── markdown ─────────────────────────────────────────────── */

  function renderMarkdown(md) {
    if (window.marked) {
      marked.setOptions({ gfm: true, breaks: false });
      var raw = marked.parse(md);
      return window.DOMPurify ? DOMPurify.sanitize(raw) : raw;
    }
    var pre = document.createElement("pre");
    pre.textContent = md;
    return pre.outerHTML;
  }

  function highlightAll() {
    if (!window.hljs) return;
    Array.prototype.forEach.call(el.prose.querySelectorAll("pre code"), function (block) {
      if (/\blanguage-mermaid\b/.test(block.className)) return;  // a diagram, not code — see renderMermaid
      block.removeAttribute("data-highlighted");
      try { hljs.highlightElement(block); } catch (e) { /* unknown language */ }
    });
  }

  /* ── mermaid diagrams ─────────────────────────────────────── */

  // ```mermaid fences render as code by default; turn them into SVG. The raw
  // source is kept on data-src so the figure can be re-rendered when the theme
  // flips (on screen) or forced light (for the PDF).
  var mmSeq = 0;

  function mermaidTheme() {
    return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "neutral";
  }

  function mermaidInit(theme) {
    if (!window.mermaid) return false;
    mermaid.initialize({
      startOnLoad: false,
      theme: theme,
      securityLevel: "strict",
      flowchart: { htmlLabels: false, useMaxWidth: true },   // SVG <text> labels survive html2canvas
      sequence: { useMaxWidth: true }
    });
    return true;
  }

  function drawFigure(fig, theme) {
    var src = fig.getAttribute("data-src");
    if (!src) return Promise.resolve();
    mmSeq += 1;
    return mermaid.render("mmd-" + mmSeq, src)
      .then(function (out) { fig.innerHTML = out.svg; })
      .catch(function (err) {
        fig.className = "mermaid-figure mermaid-failed";
        var pre = document.createElement("pre");
        pre.textContent = src;
        fig.innerHTML = "";
        fig.appendChild(pre);
        if (window.console) console.error("mermaid render failed", err);
      });
  }

  // Replace each mermaid <pre><code> with a figure, then draw it.
  function renderMermaid() {
    if (!mermaidInit(mermaidTheme())) return;
    Array.prototype.forEach.call(el.prose.querySelectorAll("pre code"), function (code) {
      if (!/\blanguage-mermaid\b/.test(code.className)) return;
      var pre = code.parentNode;
      var fig = document.createElement("div");
      fig.className = "mermaid-figure";
      fig.setAttribute("data-src", code.textContent);
      pre.parentNode.replaceChild(fig, pre);
      drawFigure(fig, mermaidTheme());
    });
  }

  // Re-draw every figure inside root in the given mermaid theme, in sequence.
  function renderFiguresIn(root, theme) {
    if (!window.mermaid || !root) return Promise.resolve();
    var figs = root.querySelectorAll(".mermaid-figure[data-src]");
    if (!figs.length) return Promise.resolve();
    mermaidInit(theme);
    var chain = Promise.resolve();
    Array.prototype.forEach.call(figs, function (fig) {
      chain = chain.then(function () { return drawFigure(fig, theme); });
    });
    return chain;
  }

  function decorateHeadings() {
    var used = {};
    var items = [];
    Array.prototype.forEach.call(el.prose.querySelectorAll("h2, h3"), function (h) {
      var base = slug(h.textContent) || "section";
      used[base] = (used[base] || 0) + 1;
      var id = used[base] > 1 ? base + "-" + used[base] : base;
      h.id = id;

      var a = document.createElement("a");
      a.className = "anchor";
      a.href = "#/" + (current ? current.id : "") + "#" + id;
      a.textContent = "#";
      a.setAttribute("aria-label", "Link to this section");
      h.appendChild(a);

      items.push({ id: id, text: h.firstChild ? h.textContent.replace(/#$/, "") : "", level: h.tagName === "H3" ? 3 : 2, node: h });
    });
    return items;
  }

  function buildToc(items) {
    if (spy) { spy.disconnect(); spy = null; }
    el.tocList.innerHTML = "";

    if (items.length < 2) { el.toc.hidden = true; return; }
    el.toc.hidden = false;

    items.forEach(function (it) {
      var li = document.createElement("li");
      if (it.level === 3) li.className = "lvl3";
      var a = document.createElement("a");
      a.href = "#/" + (current ? current.id : "") + "#" + it.id;
      a.textContent = it.text;
      a.dataset.for = it.id;
      li.appendChild(a);
      el.tocList.appendChild(li);
    });

    if (!("IntersectionObserver" in window)) return;

    var seen = {};
    spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { seen[e.target.id] = e.isIntersecting ? e.boundingClientRect.top : null; });
      var first = items.filter(function (i) { return seen[i.id] != null; })[0];
      Array.prototype.forEach.call(el.tocList.querySelectorAll("a"), function (a) {
        a.classList.toggle("on", !!first && a.dataset.for === first.id);
      });
    }, { rootMargin: "-10% 0px -70% 0px", threshold: 0 });

    items.forEach(function (it) { spy.observe(it.node); });
  }

  /* ── loading a document ───────────────────────────────────── */

  function showFailure(d, err) {
    el.head.hidden = true;
    el.prose.innerHTML =
      '<div class="fail">' +
      '<h2>That document could not be loaded</h2>' +
      '<p>Folio asked for <code>docs/' + d.file + '</code> and the browser refused. ' +
      'This almost always means the page was opened straight from the file system, ' +
      'where browsers block file reads.</p>' +
      '<p>Run a small local server from the project folder instead:</p>' +
      '<pre><code>python3 -m http.server 8080</code></pre>' +
      '<p>Then open <code>http://localhost:8080</code>. On GitHub Pages this works with no extra setup.</p>' +
      '</div>';
    el.toc.hidden = true;
    if (window.console) console.error(err);
  }

  function load(id, push) {
    var d = byId[id];
    if (!d) { showHome(); return; }

    current = d;
    markActive(id);
    text(el.here, d.title);
    document.title = d.title + " — " + site.name;
    if (push) history.replaceState(null, "", "#/" + id);

    var done = function (md) {
      cache[id] = md;
      el.head.hidden = false;
      el.folioNo.textContent = d.no;
      el.section.textContent = d.section;
      el.title.textContent = d.title;
      el.updated.textContent = d.updated ? "Updated " + niceDate(d.updated) : "";
      el.read.textContent = readingTime(md);

      el.prose.innerHTML = renderMarkdown(md);
      highlightAll();
      renderMermaid();
      buildToc(decorateHeadings());

      var hash = location.hash.split("#")[2];
      if (hash) {
        var target = document.getElementById(hash);
        if (target) target.scrollIntoView();
      } else {
        window.scrollTo({ top: 0, behavior: "auto" });
      }
      el.doc.focus({ preventScroll: true });
    };

    if (cache[id]) { done(cache[id]); return; }

    fetch("./docs/" + d.file, { cache: "no-cache" })
      .then(function (r) {
        if (!r.ok) throw new Error(r.status + " " + r.statusText);
        return r.text();
      })
      .then(done)
      .catch(function (err) { showFailure(d, err); });
  }

  function showHome() {
    current = null;
    markActive(null);
    el.head.hidden = true;
    el.toc.hidden = true;
    text(el.here, site.name);
    document.title = site.name + " — " + (site.tagline || "Documentation");
    el.prose.innerHTML =
      '<div class="boot">' +
      '<p class="boot__eyebrow">' + site.name + '</p>' +
      '<h2 class="boot__title">Pick a document from the index.</h2>' +
      '<p class="boot__body">Everything here is a plain Markdown file in <code>docs/</code>. ' +
      'Read it in the browser, or take it with you as a PDF.</p>' +
      '</div>';
  }

  /* ── routing ──────────────────────────────────────────────── */

  function route() {
    var h = location.hash.replace(/^#\/?/, "");
    var parts = h.split("#");
    var id = parts[0];
    var anchor = parts[1];

    if (!id) { showHome(); return; }

    if (current && current.id === id) {
      // Same document — this is a jump to a heading, not a navigation.
      var target = anchor && document.getElementById(anchor);
      if (target) target.scrollIntoView();
      return;
    }

    load(id, false);
    if (window.innerWidth <= 860) drawer(false);
  }

  window.addEventListener("hashchange", route);

  /* ── actions ──────────────────────────────────────────────── */

  on(el.copy, "click", function () {
    var url = location.href;
    var write = navigator.clipboard && navigator.clipboard.writeText
      ? navigator.clipboard.writeText(url)
      : Promise.reject();
    write.then(function () { toast("Link copied"); })
      .catch(function () { window.prompt("Copy this link", url); });
  });

  on(el.print, "click", function () { window.print(); });

  /* ── PDF ──────────────────────────────────────────────────── */

  /* Long documents cannot be photographed in one go: a canvas taller than
     about 65,000 device pixels comes back blank in every browser, and the
     ceiling is far lower on phones. So the sheet is captured in bands, and
     each band is cut into A4 pages. Everything below is in CSS pixels of
     the off-screen sheet unless the name says otherwise. */

  var PDF = {
    scale: 1.8,             // capture density — ~215 dpi on A4, and every page is an image,
    quality: 0.85,          // so both of these are really file-size dials
    band: 12000,            // max device px per html2canvas call
    page: { w: 210, h: 297 },                 // A4, mm
    margin: { top: 16, right: 15, bottom: 18, left: 15 }
  };

  function buildSheet() {
    var sheet = document.createElement("div");
    sheet.className = "sheet";
    sheet.innerHTML =
      '<header class="sheet__head">' +
      '<p class="sheet__folio">' + current.no + " · " + current.section + " · " + site.name + '</p>' +
      '<h1 class="sheet__title"></h1>' +
      '<p class="sheet__meta">' + (current.updated ? "Updated " + niceDate(current.updated) : "") + '</p>' +
      '</header>' +
      el.prose.innerHTML;
    sheet.querySelector(".sheet__title").textContent = current.title;
    return sheet;
  }

  /* Page boundaries that try not to cut through a block. Walks the sheet for
     elements that fit inside one page and treats their top edge as a legal
     break; anything taller than a page (a long table, a long pre) is cut. */
  function pageBreaks(sheet, pageHeight) {
    var top = sheet.getBoundingClientRect().top;
    var edges = [];

    (function walk(node) {
      Array.prototype.forEach.call(node.children, function (child) {
        var box = child.getBoundingClientRect();
        var start = box.top - top;
        if (box.height <= pageHeight) { edges.push(start); return; }
        edges.push(start);
        walk(child);           // too tall to keep whole — look for breaks inside it
      });
    })(sheet);

    edges.sort(function (a, b) { return a - b; });

    var total = sheet.scrollHeight;
    var pages = [];
    var at = 0;

    while (at < total - 1) {
      var limit = at + pageHeight;
      if (limit >= total) { pages.push({ start: at, height: total - at }); break; }

      var best = 0;
      for (var i = 0; i < edges.length; i++) {
        if (edges[i] > at + pageHeight * 0.25 && edges[i] <= limit) best = edges[i];
      }
      var end = best || limit;      // no usable edge — hard cut
      pages.push({ start: at, height: end - at });
      at = end;
    }
    return pages;
  }

  function capture(sheet, startCss, heightCss, widthCss, totalCss) {
    return html2canvas(sheet, {
      backgroundColor: "#FFFFFF",
      scale: PDF.scale,
      useCORS: true,
      logging: false,
      x: 0, y: startCss,
      width: widthCss, height: heightCss,
      windowWidth: widthCss, windowHeight: totalCss
    });
  }

  function sliceOf(band, offsetPx, heightPx) {
    var slice = document.createElement("canvas");
    slice.width = band.width;
    slice.height = Math.max(1, Math.round(heightPx));
    var ctx = slice.getContext("2d");
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, slice.width, slice.height);
    ctx.drawImage(band, 0, Math.round(offsetPx), band.width, slice.height,
                        0, 0, slice.width, slice.height);
    return slice;
  }

  function buildPdf(sheet) {
    var JsPdf = window.jspdf.jsPDF;
    var pdf = new JsPdf({ unit: "mm", format: "a4", orientation: "portrait" });

    var innerW = PDF.page.w - PDF.margin.left - PDF.margin.right;
    var innerH = PDF.page.h - PDF.margin.top - PDF.margin.bottom;

    var widthCss = Math.max(sheet.scrollWidth, sheet.offsetWidth);
    var totalCss = sheet.scrollHeight;
    var mmPerCss = innerW / widthCss;
    var pageCss = innerH / mmPerCss;

    var pages = pageBreaks(sheet, pageCss);
    var bandCss = Math.max(pageCss, Math.floor(PDF.band / PDF.scale));
    var done = Promise.resolve();
    var placed = 0;

    // Group pages into bands, so one capture covers several pages.
    var bands = [];
    pages.forEach(function (p) {
      var last = bands[bands.length - 1];
      if (last && (p.start + p.height) - last.start <= bandCss) last.pages.push(p);
      else bands.push({ start: p.start, pages: [p] });
    });

    bands.forEach(function (band) {
      done = done.then(function () {
        var last = band.pages[band.pages.length - 1];
        var heightCss = Math.min(last.start + last.height, totalCss) - band.start;
        text(el.pdfLabel, "Preparing PDF… " + Math.round(placed / pages.length * 100) + "%");

        return capture(sheet, band.start, heightCss, widthCss, totalCss).then(function (canvas) {
          band.pages.forEach(function (p) {
            var slice = sliceOf(canvas, (p.start - band.start) * PDF.scale, p.height * PDF.scale);
            if (placed) pdf.addPage();
            pdf.addImage(slice.toDataURL("image/jpeg", PDF.quality), "JPEG",
              PDF.margin.left, PDF.margin.top, innerW, p.height * mmPerCss);
            placed += 1;
          });
        });
      });
    });

    return done.then(function () { pdf.save(current.id + ".pdf"); return pages.length; });
  }

  on(el.pdf, "click", function () {
    if (!current) return;

    if (!window.html2canvas || !window.jspdf || !window.jspdf.jsPDF) {
      toast("PDF library unavailable — opening print instead");
      window.print();
      return;
    }

    el.pdf.disabled = true;
    text(el.pdfLabel, "Preparing PDF…");

    var sheet = buildSheet();
    el.stage.appendChild(sheet);

    // The sheet inherits whatever theme the diagrams were drawn in on screen;
    // the PDF is always light, so repaint them neutral before capture.
    renderFiguresIn(sheet, "neutral")
      .then(function () { return buildPdf(sheet); })
      .then(function (count) { toast("Downloaded " + current.id + ".pdf — " + count + " pages"); })
      .catch(function (err) {
        if (window.console) console.error(err);
        toast("Could not build the PDF — opening print instead");
        window.print();
      })
      .then(function () {
        el.stage.removeChild(sheet);
        el.pdf.disabled = false;
        text(el.pdfLabel, "Download PDF");
      });
  });

  /* ── start ────────────────────────────────────────────────── */

  fetch("./docs/manifest.json", { cache: "no-cache" })
    .then(function (r) {
      if (!r.ok) throw new Error(r.status + " " + r.statusText);
      return r.json();
    })
    .then(function (manifest) {
      buildIndex(manifest);
      route();
    })
    .catch(function (err) {
      if (window.console) console.error(err);
      el.head.hidden = true;
      text(el.count, "index unavailable");
      el.prose.innerHTML =
        '<div class="fail">' +
        '<h2>The index could not be loaded</h2>' +
        '<p>Folio asked for <code>docs/manifest.json</code> and the browser refused. ' +
        'Opening <code>index.html</code> straight from the file system will always fail this way — ' +
        'browsers block local file reads.</p>' +
        '<p>Run a small local server from the project folder:</p>' +
        '<pre><code>python3 -m http.server 8080</code></pre>' +
        '<p>Then open <code>http://localhost:8080</code>. Once the site is on GitHub Pages, it just works.</p>' +
        '</div>';
    });

})();
