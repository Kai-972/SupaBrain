// @ts-nocheck: a faithful port of the "Supabrain · Night" reference animation (canvas field, scroll story, dot tiles).
// Imperative DOM/canvas code; it only touches elements inside `root` and returns a cleanup function.
import type story from "../../fixtures/story-v2.json";

type Story = typeof story & { tagText?: string; tagW?: number; blockedCount?: number };

export function mountLanding(root: HTMLElement, S: Story): () => void {
  const RM = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const cssv = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const GLOW = 10;
  const q = (s) => root.querySelector(s);
  const qa = (s) => [...root.querySelectorAll(s)];
  const off: (() => void)[] = [];
  const on = (t, ev, fn, o?) => { t.addEventListener(ev, fn, o); off.push(() => t.removeEventListener(ev, fn, o)); };
  let alive = true;
  const raf = (fn) => { if (alive) requestAnimationFrame(fn); };

  /* ---------------- hero field ---------------- */
  function mkField(cv) {
    if (!cv) return;
    const ctx = cv.getContext("2d");
    let W, H, N = [], E = [], P = [], lie = -1, lieT = 0, run = true;
    const C = () => ({ line: cssv("--line"), node: cssv("--line2"), flow: cssv("--flow"), lie: cssv("--lie") });
    const R = (a, b) => a + Math.random() * (b - a);
    function init() {
      const d = Math.min(2, devicePixelRatio || 1), r = cv.getBoundingClientRect(); W = r.width; H = r.height; cv.width = W * d; cv.height = H * d; ctx.setTransform(d, 0, 0, d, 0, 0);
      N = []; E = []; P = []; const CL = [[0.16, 0.34], [0.5, 0.42], [0.84, 0.3]], per = W < 700 ? 8 : 15;
      CL.forEach((c, ci) => { for (let i = 0; i < per; i++) N.push({ x: (c[0] + R(-0.15, 0.15)) * W, y: (c[1] + R(-0.2, 0.2)) * H, r: R(1.4, 3), c: ci, p: R(0, 6.3) }); });
      N.forEach((a, i) => { N.map((b, j) => [j, (a.x - b.x) ** 2 + (a.y - b.y) ** 2]).filter((x) => x[0] !== i).sort((x, y) => x[1] - y[1]).slice(0, 2).forEach(([j]) => { if (!E.some((e) => (e.a == i && e.b == j) || (e.a == j && e.b == i))) E.push({ a: i, b: j }); }); });
      for (let k = 0; k < 6; k++) { const a = R(0, N.length) | 0, b = R(0, N.length) | 0; if (N[a].c !== N[b].c) E.push({ a, b }); }
      for (let k = 0; k < E.length * 0.7; k++) P.push({ e: R(0, E.length) | 0, t: Math.random(), s: R(0.0025, 0.007) });
    }
    const pos = (n, t) => [n.x + Math.sin(t * 0.0004 + n.p) * 5, n.y + Math.cos(t * 0.00033 + n.p) * 5];
    function frame(t) {
      if (!alive) return;
      const c = C();
      ctx.clearRect(0, 0, W, H);
      if (lie < 0 && t - lieT > 3800) { lie = R(0, N.length) | 0; lieT = t; }
      const age = lie >= 0 ? t - lieT : 0; if (lie >= 0 && age > 3800) { lie = -1; lieT = t; }
      const bad = new Set(); if (lie >= 0) { bad.add(lie); if (age > 600) E.forEach((e) => { if (e.a == lie) bad.add(e.b); if (e.b == lie) bad.add(e.a); }); }
      const f = lie < 0 ? 0 : age < 2700 ? 1 : Math.max(0, 1 - (age - 2700) / 900);
      const isBad = (e) => f > 0 && bad.has(e.a) && bad.has(e.b);
      ctx.lineWidth = 1;
      E.forEach((e) => { const [a, b] = [pos(N[e.a], t), pos(N[e.b], t)]; const k = isBad(e); ctx.strokeStyle = k ? c.lie : c.line; ctx.globalAlpha = k ? 0.25 + 0.6 * f : 1; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); });
      P.forEach((p) => { p.t += p.s; if (p.t > 1) { p.t = 0; p.e = R(0, E.length) | 0; } const e = E[p.e], [a, b] = [pos(N[e.a], t), pos(N[e.b], t)], k = isBad(e); ctx.fillStyle = k ? c.lie : c.flow; ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = GLOW; ctx.globalAlpha = Math.sin(p.t * Math.PI); ctx.beginPath(); ctx.arc(a[0] + (b[0] - a[0]) * p.t, a[1] + (b[1] - a[1]) * p.t, 1.7, 0, 6.3); ctx.fill(); });
      ctx.globalAlpha = 1; ctx.shadowBlur = 0;
      N.forEach((n, i) => {
        const [x, y] = pos(n, t), k = f > 0 && bad.has(i); ctx.fillStyle = k ? c.lie : c.node; if (k) { ctx.shadowColor = c.lie; ctx.shadowBlur = GLOW * 1.6; } ctx.beginPath(); ctx.arc(x, y, k ? n.r + 1.2 : n.r, 0, 6.3); ctx.fill(); ctx.shadowBlur = 0;
        if (i == lie && age > 2700) { const qq = (age - 2700) / 900; ctx.strokeStyle = c.lie; ctx.globalAlpha = Math.max(0, 1 - qq); ctx.beginPath(); ctx.arc(x, y, 6 + qq * 46, 0, 6.3); ctx.stroke(); ctx.globalAlpha = 1; }
      });
      if (run && !RM) raf(frame);
    }
    init(); on(window, "resize", () => { init(); if (RM) frame(0); });
    const io = new IntersectionObserver((es) => { const v = es[0].isIntersecting; if (v && !run && !RM) { run = true; raf(frame); } else if (!v) run = false; });
    io.observe(cv); off.push(() => io.disconnect());
    RM ? frame(0) : raf(frame);
  }
  qa("canvas[data-field]").forEach(mkField);

  /* ============ story: lineage tree ============ */
  const svg = q("#sb-g"), tree = q("#sb-tree"), tipc = q("#sb-tipc"), feed = q("#sb-feed"), storyEl = q("#sb-story");
  if (svg && tree && storyEl) {
    const LANES = S.lanes;
    const VC = { C: "var(--vc)", G: "var(--vg)", O: "var(--vo)", H: "var(--vh)" };
    const EV = S.events.map((e) => ({ ...e }));
    const LOG = S.log;
    const LAY = { d: { w: 680, h: 720, ys: 1, x: { H: 44, G: 200, C: 356, O: 512 }, side: () => 1, pill: "n" }, m: { w: 420, h: 600, ys: 0.8, x: { H: 20, G: 118, C: 222, O: 326 }, side: (x) => (x < 200 ? 1 : -1), pill: "s" } };
    const NS = "http://www.w3.org/2000/svg"; // hardcode-ok: SVG namespace, not a network URL
    const mk = (t, a, p?) => { const e = document.createElementNS(NS, t); for (const k in a) e.setAttribute(k, a[k]); if (p) p.appendChild(e); return e; };
    const byId = {}; EV.forEach((e) => (byId[e.id] = e));
    let L, CON = [], DOTS = [], EG = {}, rip, tag, pills = {};
    function build() {
      L = matchMedia("(max-width:900px)").matches ? LAY.m : LAY.d;
      svg.innerHTML = ""; svg.setAttribute("viewBox", `0 0 ${L.w} ${L.h}`); svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
      const defs = mk("defs", {}, svg), f = mk("filter", { id: "sbglow2", x: "-300%", y: "-300%", width: "700%", height: "700%" }, defs);
      mk("feGaussianBlur", { stdDeviation: "3", result: "b" }, f); const mg = mk("feMerge", {}, f); mk("feMergeNode", { in: "b" }, mg); mk("feMergeNode", { in: "SourceGraphic" }, mg);
      const gl = mk("g", {}, svg), gc = mk("g", {}, svg), gp = mk("g", {}, svg), ge = mk("g", {}, svg), gh = mk("g", {}, svg);
      CON = []; pills = {}; EV.forEach((e) => (e.yy = 52 + (e.y - 52) * L.ys));
      LANES.forEach((ln) => {
        const x = L.x[ln.id]; mk("line", { class: "lane", x1: x, x2: x, y1: 52, y2: L.h }, gl);
        const g = mk("g", { class: "pill" }, gh), txt = L.pill === "n" ? ln.n : ln.s, w = txt.length * 7.3 + (L.pill === "n" ? 48 : 46);
        const rx = Math.max(4, Math.min(L.w - w - 4, x - 14)); mk("rect", { x: rx, y: 24, width: w, height: 24, rx: 12 }, g);
        mk("circle", { cx: rx + 12, cy: 36, r: 7, fill: VC[ln.v] }, g); const vt = mk("text", { x: rx + 12, y: 36.5, "text-anchor": "middle", "dominant-baseline": "central", style: "font:700 9px var(--mono);fill:#000" }, g); vt.textContent = ln.v;
        const t = mk("text", { x: rx + 24, y: 40 }, g); t.textContent = txt; const c = mk("text", { class: "cnt", x: rx + w - 12, y: 40, "text-anchor": "end" }, g); c.textContent = "0"; pills[ln.id] = c;
        let prevY = 48, prev = null;
        EV.filter((e) => e.ln === ln.id).forEach((e) => {
          const lin = prev && (e.p || []).includes(prev.id);
          const el = mk("path", { d: `M${x},${prevY} L${x},${e.yy}`, class: "tk" + (lin && e.bad ? " bad" : ""), pathLength: 1, "stroke-dasharray": 1, "stroke-dashoffset": 1 }, gc);
          CON.push({ el, ev: e, trunk: 1, bad: lin && e.bad, lin }); prevY = e.yy; prev = e;
        });
      });
      EV.forEach((e) => (e.p || []).forEach((pid) => {
        const p = byId[pid]; if (p.ln === e.ln) return; const x1 = L.x[p.ln], y1 = p.yy, x2 = L.x[e.ln], y2 = e.yy, m = (y1 + y2) / 2;
        const el = mk("path", { d: `M${x1},${y1} C${x1},${m} ${x2},${m} ${x2},${y2}`, class: "cv" + (e.bad && (p.bad || e.id !== "m2" || pid === "m1") ? " bad" : ""), pathLength: 1, "stroke-dasharray": 1, "stroke-dashoffset": 1 }, gc);
        CON.push({ el, ev: e, bad: el.classList.contains("bad"), lin: 1 });
      }));
      CON.forEach((c) => (c.len = c.el.getTotalLength()));
      DOTS = []; CON.filter((c) => c.lin || c.trunk).forEach((c) => { const n = c.trunk && !c.lin ? 1 : 2; for (let k = 0; k < n; k++) DOTS.push({ c, t: k / n + Math.random() * 0.2, s: 0.00022 + Math.random() * 0.00012, el: mk("circle", { r: 2.1, class: "pd", opacity: 0 }, gp) }); });
      EG = {};
      const e1 = byId.e1;
      EV.forEach((e) => {
        const x = L.x[e.ln], sd = L.side(x);
        const g = mk("g", { class: `ev ${e.k}${e.bad ? " bad" : ""}`, tabindex: 0, role: "button", "aria-label": e.l, style: `--dl:${e.bad ? (Math.hypot(x - L.x[e1.ln], e.yy - e1.yy) / 900).toFixed(2) : 0}s` }, ge);
        mk("circle", { class: "gl", cx: x, cy: e.yy, r: 7 }, g);
        mk("circle", { class: "hl", cx: x, cy: e.yy, r: 7 }, g);
        if (e.k === "pay") mk("rect", { class: "d", x: x - 5.5, y: e.yy - 5.5, width: 11, height: 11, rx: 2, transform: `rotate(45 ${x} ${e.yy})` }, g);
        else mk("circle", { class: "d", cx: x, cy: e.yy, r: e.k === "e" ? 6 : 5.5 }, g);
        mk("path", { class: "x", d: `M${x - 3},${e.yy - 3}L${x + 3},${e.yy + 3}M${x + 3},${e.yy - 3}L${x - 3},${e.yy + 3}` }, g);
        const lb = mk("text", { class: "lb", x: x + 14 * sd, y: e.yy + 4.5, "text-anchor": sd > 0 ? "start" : "end" }, g); lb.textContent = e.l;
        const tw = lb.getComputedTextLength(); mk("line", { class: "st", x1: sd > 0 ? x + 14 : x - 14 - tw, x2: sd > 0 ? x + 14 + tw : x - 14, y1: e.yy, y2: e.yy }, g);
        g.addEventListener("mouseenter", () => tip(e, g)); g.addEventListener("mouseleave", untip); g.addEventListener("focus", () => tip(e, g)); g.addEventListener("blur", untip);
        g.addEventListener("click", (ev) => { ev.stopPropagation(); tip(e, g); });
        EG[e.id] = { g, e, lbw: tw, sd };
      });
      const py = byId.py, px = L.x[py.ln], ps = L.side(px), tw = EG.py.lbw;
      tag = mk("g", { class: "tag" }, ge); const tx = ps > 0 ? px + 24 + tw : px - 24 - tw - (S.tagW ?? 166); mk("rect", { x: tx, y: py.yy - 11, width: S.tagW ?? 166, height: 22, rx: 11 }, tag); const tt = mk("text", { x: tx + (S.tagW ?? 166) / 2, y: py.yy + 4, "text-anchor": "middle" }, tag); tt.textContent = S.tagText ?? "Blocked";
      rip = mk("circle", { class: "rip", cx: L.x[e1.ln], cy: e1.yy, r: 0 }, svg);
    }
    function tip(e, g) {
      const tr = tree.getBoundingClientRect(), r = g.querySelector(".d").getBoundingClientRect();
      const par = (e.p || []).map((p) => byId[p].l); const dead = svg.classList.contains("rv") && e.bad;
      const ln = LANES.find((l) => l.id === e.ln);
      tipc.innerHTML = `<b style="font-weight:500">${e.l}</b><div class="m">${ln.n}${S.teamSuffix}${ln.v === "H" ? " · person" : ""} · T${e.tr}${dead ? " · stopped" : ""}</div>${par.length ? `<div class="m">built from ${par.join(" + ")}</div>` : ""}<q>${e.q}</q>`;
      let x = r.left - tr.left + 16, y = r.top - tr.top + 16; if (x + 260 > tr.width) x = r.left - tr.left - 266; if (y + 140 > tr.height) y = r.top - tr.top - 130; tipc.style.left = Math.max(0, x) + "px"; tipc.style.top = Math.max(0, y) + "px"; tipc.classList.add("on");
    }
    function untip() { tipc.classList.remove("on"); }
    on(document, "click", untip);

    const LI = LOG.map(([ta, v, h, cls]) => { const d = document.createElement("div"); if (v === "card") { d.className = "it card"; d.innerHTML = h; } else { d.className = "it " + (cls || ""); d.innerHTML = `<span class="vb" style="background:${VC[v]}">${v}</span><span>${h}</span>`; } feed.appendChild(d); return { ta, d }; });

    const STEPS = qa("#sb-list li");
    const cap = q("#sb-cap");
    let tCur = 0, tTgt = 0, lastStep = -1, revoked = false;
    const stepOf = (t) => Math.min(4, Math.floor(t));
    const scrollT = () => { const r = storyEl.getBoundingClientRect(), span = storyEl.offsetHeight - innerHeight; return Math.max(0, Math.min(4.999, (-r.top / span) * 5)); };
    const goStep = (s) => { const span = storyEl.offsetHeight - innerHeight; const y = storyEl.offsetTop + span * ((s + 0.5) / 5); scrollTo({ top: y, behavior: RM ? "auto" : "smooth" }); };
    on(root, "click", (e) => { const b = e.target.closest("[data-s]"); if (b) { e.preventDefault(); goStep(+b.dataset.s); } });
    const cM = q("#sb-cM"), cC = q("#sb-cC"), cQ = q("#sb-cQ"), cP = q("#sb-cP"), bC = q("#sb-bC"), bQ = q("#sb-bQ");
    function ripple() { if (RM) return; const t0 = performance.now(); (function f(t) { const k = Math.min(1, (t - t0) / 1200); rip.setAttribute("r", k * 900); rip.setAttribute("opacity", ((1 - k) * 0.9).toFixed(2)); if (k < 1) raf(f); })(t0); }
    function render(t) {
      const s = stepOf(t);
      if (s !== lastStep) { lastStep = s; STEPS.forEach((li, i) => li.classList.toggle("on", i === s)); const li = STEPS[s]; cap.innerHTML = `<div class="k">${s + 1} / 5</div><b>${li.querySelector("b").textContent}</b><span>${li.querySelector("span").textContent}</span>`; q("#sb-prog").textContent = `Step ${s + 1} of 5`; }
      svg.classList.toggle("blast", t >= 2 && t < 3.05);
      const rv = t >= 3.05; if (rv !== revoked) { revoked = rv; svg.classList.toggle("rv", rv); if (rv) ripple(); }
      tag.classList.toggle("on", t >= 4.05);
      qa(".it.card [data-s]").forEach((b) => { b.dataset.label ??= b.textContent; b.textContent = rv ? (b.dataset.done ?? "Done") : b.dataset.label; b.className = rv ? "btn g sm" : "btn r sm"; b.disabled = rv; });
      let shown = 0, bad = 0; const lc = { H: 0, G: 0, C: 0, O: 0 };
      EV.forEach((e) => { const f = Math.max(0, Math.min(1, (t - e.ta) / 0.14)), g = EG[e.id].g; g.style.opacity = f; g.style.transform = `scale(${0.4 + 0.6 * f})`; e.f = f; if (f > 0.5 && e.k !== "pay") { shown++; lc[e.ln]++; if (e.bad) bad++; } g.classList.toggle("keep", rv && !e.bad); });
      for (const k in pills) pills[k].textContent = lc[k];
      CON.forEach((c) => { c.f = c.ev.f; c.el.setAttribute("stroke-dashoffset", (1 - c.f).toFixed(3)); if (rv && c.bad) c.el.removeAttribute("stroke-dasharray"); else c.el.setAttribute("stroke-dasharray", 1); });
      cM.textContent = shown; cQ.textContent = rv ? bad : 0; cC.textContent = shown - (rv ? bad : 0); cP.textContent = t >= 4.05 ? (S.blockedCount ?? 1) : 0;
      bC.style.width = ((shown - (rv ? bad : 0)) / 10) * 100 + "%"; bQ.style.width = ((rv ? bad : 0) / 10) * 100 + "%";
      LI.forEach((x) => x.d.classList.toggle("on", t >= x.ta));
    }
    const rebuild = () => { build(); lastStep = -1; revoked = false; render(tCur); };
    build();
    let last = performance.now();
    function loop(now) {
      if (!alive) return;
      const dt = Math.min(50, now - last); last = now;
      tTgt = scrollT(); tCur += RM ? tTgt - tCur : (tTgt - tCur) * Math.min(1, dt / 120); if (Math.abs(tTgt - tCur) < 0.001) tCur = tTgt;
      render(tCur);
      if (!RM) DOTS.forEach((d) => {
        const c = d.c, live = c.f >= 1 && !(revoked && c.bad); if (!live) { d.el.setAttribute("opacity", 0); return; }
        d.t = (d.t + dt * d.s * (c.bad ? 1.5 : 1) * (600 / Math.max(60, c.len))) % 1; const p = c.el.getPointAtLength(d.t * c.len); d.el.setAttribute("cx", p.x.toFixed(1)); d.el.setAttribute("cy", p.y.toFixed(1)); d.el.setAttribute("opacity", Math.sin(d.t * Math.PI).toFixed(2)); d.el.setAttribute("class", "pd" + (c.bad ? " bad" : ""));
      });
      raf(loop);
    }
    raf(loop);
    const mq = matchMedia("(max-width:900px)"); mq.addEventListener("change", rebuild); off.push(() => mq.removeEventListener("change", rebuild));
  }

  /* ============ dot-matrix tiles ============ */
  qa("canvas[data-m]").forEach((cv) => {
    const ctx = cv.getContext("2d"), mode = cv.dataset.m; let W, H, cols, rows, sp = 11, cells = [], run = false; const t0 = performance.now() - 4000;
    const C = () => ({ off: cssv("--line"), dim: cssv("--line2"), flow: cssv("--flow"), fg: cssv("--fg"), lie: cssv("--lie"), amber: cssv("--amber") });
    function init() { const d = Math.min(2, devicePixelRatio || 1), r = cv.getBoundingClientRect(); W = r.width; H = r.height; cv.width = W * d; cv.height = H * d; ctx.setTransform(d, 0, 0, d, 0, 0); cols = Math.floor((W - 16) / sp); rows = Math.floor((H - 16) / sp); cells = []; for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) cells.push({ x, y, r: Math.random(), life: Math.random(), keep: Math.random() < 0.06 }); }
    function dot(x, y, c, a, rad?) { ctx.globalAlpha = a; ctx.fillStyle = c; ctx.beginPath(); ctx.arc(8 + x * sp + sp / 2, 8 + y * sp + sp / 2, rad || 2.6, 0, 6.3); ctx.fill(); }
    function draw(now) {
      if (!alive) return;
      const c = C(); const t = (now - t0) / 1000; ctx.clearRect(0, 0, W, H);
      if (mode === "grow") { const fill = (t % 9) / 7; cells.forEach((cl) => { const h = rows * (0.25 + 0.6 * Math.abs(Math.sin(cl.x * 0.33 + 1))) * Math.min(1, fill * 1.3 - (cl.x / cols) * 0.5); const onn = rows - cl.y <= h; dot(cl.x, cl.y, onn ? (cl.r < 0.18 ? c.fg : c.flow) : c.off, onn ? 0.35 + 0.55 * (1 - (rows - cl.y) / Math.max(1, h)) : 1); }); }
      else if (mode === "blast") {
        const ph = t % 8, cx = cols * 0.38, cy = rows * 0.5; const Rr = ph < 1 ? 0 : ph < 4 ? ((ph - 1) / 3) * cols * 0.42 : cols * 0.42;
        cells.forEach((cl) => { const d = Math.hypot(cl.x - cx, (cl.y - cy) * 1.6); const inR = d < Rr && cl.r < 0.72; let col = c.dim, a = 0.9; if (inR) { if (ph < 5.2) { col = c.lie; a = 0.5 + 0.5 * Math.max(0, 1 - d / (Rr + 1)); } else if (ph < 7) { col = c.off; a = 1; } else { col = c.dim; a = ph - 7; } } if (cl.x === Math.round(cx) && cl.y === Math.round(cy) && ph >= 0.4 && ph < 7) { col = c.lie; a = 1; } dot(cl.x, cl.y, col, a, inR && ph > 5.2 && ph < 7 ? 1.6 : 2.6); });
      } else { cells.forEach((cl) => { const v = cl.keep ? 1 : 1 - ((cl.life + t / 10) % 1); dot(cl.x, cl.y, cl.keep ? c.amber : c.flow, cl.keep ? 0.9 : Math.max(0.06, v * v * 0.8)); }); }
      ctx.globalAlpha = 1; if (run && !RM) raf(draw);
    }
    init(); on(window, "resize", init);
    const io = new IntersectionObserver((es) => { const v = es[0].isIntersecting; if (v && !run) { run = true; raf(draw); } else if (!v) run = false; });
    io.observe(cv); off.push(() => io.disconnect());
    if (RM) draw(t0 + 4000);
  });

  return () => { alive = false; off.forEach((f) => f()); if (feed) feed.innerHTML = ""; };
}
