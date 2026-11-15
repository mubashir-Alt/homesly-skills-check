// Candidate side of hiring assessments: opened from a private link (#/c/<token>), no sign-in.
// Steps: read the brief and agree → Part A (live, proctored, camera + whole screen) → Part B (uploads) → done.
import { Proctor, MAX_STRIKES } from "./proctor.js";
import { Capture } from "./capture.js";

let X = null;          // shared helpers from app.js
const C = { token: null, cand: null, answers: {}, cur: 0, timer: null, saveT: null, proctor: null, cap: null, submitting: false, th: null, uploads: {} };

/* ============================================================ shared: the brief */
export function briefHtml(x, p, { compact = false } = {}) {
  const { h, md } = x;
  const sc = p.scenario || {};
  const list = (a) => `<ul class="hb-list">${(a || []).map((s) => `<li>${h(s)}</li>`).join("")}</ul>`;
  return `<div class="stack" style="gap:20px">
    ${compact ? "" : `<section class="card stack"><div class="prose">${md(p.intro)}</div></section>`}
    <section class="card stack hb-scn">
      <div class="row between"><div><span class="eyebrow">Your scenario</span><h2 class="hb-h2">${h(sc.name)}</h2><p class="small muted">${h(sc.type)} · ${h(sc.location)}</p></div>
        ${sc.budget ? `<div class="hb-budget"><span class="eyebrow">Budget</span><b>${h(sc.budget)}</b></div>` : ""}</div>
      ${sc.about ? `<p class="ink2" style="max-width:75ch">${h(sc.about)}</p>` : ""}
      <div class="grid g-2" style="gap:16px">
        <div class="hb-box"><b>Who the guests are</b>${list(sc.guests)}</div>
        <div class="hb-box"><b>Where things stand now</b>${list(sc.social_now)}</div>
        ${sc.offer ? `<div class="hb-box"><b>The goal / offer</b><p class="small ink2">${h(sc.offer)}</p></div>` : ""}
        ${(sc.facts || []).length ? `<div class="hb-box"><b>Useful facts</b>${list(sc.facts)}</div>` : ""}
      </div>
      ${sc.note ? `<p class="notice">${h(sc.note)}</p>` : ""}
    </section>
    <section class="card stack">
      <div class="row between"><div><span class="eyebrow">Part A · live</span><h3 style="margin-top:4px">${p.timed.minutes}-minute live exercise</h3></div><span class="chip accent">${p.timed.questions.length} questions</span></div>
      <p class="ink2">${h(p.timed.intro)}</p>
    </section>
    <section class="card stack">
      <div class="row between"><div><span class="eyebrow">Part B · take-home</span><h3 style="margin-top:4px">${p.takehome.tasks.length} tasks within ${p.takehome.hours} hours</h3></div><span class="chip gold">${h(p.takehome.effort)}</span></div>
      ${p.takehome.intro ? `<div class="prose">${md(p.takehome.intro)}</div>` : ""}
      <div class="stack">${p.takehome.tasks.map((t, i) => `<article class="hb-task">
        <div class="row between"><h4>Task ${i + 1}. ${h(t.title)}</h4><span class="xs muted">${h(t.time_guide)}</span></div>
        <div class="prose">${md(t.what)}</div>
        <div class="hb-deliv"><span><b>Hand in:</b> ${h(t.deliverable)}</span><span><b>Format:</b> ${h(t.format)}</span></div>
      </article>`).join("")}</div>
    </section>
    <div class="grid g-2" style="gap:20px">
      <section class="card stack-s"><h3>How to submit</h3><div class="prose">${md(p.submission)}</div></section>
      <section class="card stack-s"><h3>Rules</h3>${list(p.rules)}</section>
    </div>
  </div>`;
}

/* ============================================================ entry */
export async function renderCandidate(x, token) {
  X = x; const { app } = X;
  if (C.proctor && C.token === token && C.cand?.timed_started_at && !C.cand?.timed_submitted_at) return renderExam();
  C.token = token;
  app.innerHTML = `<div class="center"><div class="spinner"></div></div>`;
  try { C.cand = (await X.HAPI.cOpen(token)).cand; }
  catch (e) { return bare(`<h2>We couldn't open this assessment</h2><p class="ink2">${X.h(e.message)}</p>`); }
  route();
}
function route() {
  const c = C.cand;
  if (c.submitted_at) return renderDone();
  if (c.expired) return bare(c.accepted_at
    ? `<h2>Your 48 hours have ended</h2><p class="ink2">The deadline was ${X.h(when(c.deadline_at))}. If something went wrong, reply to the email from our hiring team.</p>`
    : `<h2>This invite has expired</h2><p class="ink2">Ask our hiring team for a new link.</p>`);
  if (!c.accepted_at) return renderWelcome();
  if (c.timed_started_at && !c.timed_submitted_at) return renderCheck(true);
  return renderHome();
}

/* ============================================================ layout */
const when = (iso) => new Date(iso).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
function frame(inner, { step = 1 } = {}) {
  const { h, themeButton } = X; const c = C.cand;
  const steps = ["Brief", "Part A · live", "Part B · upload", "Done"];
  X.app.innerHTML = `<div class="cand">
    <header class="cand-top"><div class="cand-top-in">
      <div class="brand-mark" style="width:32px;height:32px;font-size:19px">H</div>
      <div class="exam-title grow"><b>${h(c.pack.role_title)}</b><span>Homesly hiring assessment · ${h(c.full_name)}</span></div>
      ${c.deadline_at && !c.submitted_at ? `<div class="timer" id="cand-left" role="timer" aria-label="Time left">${X.ICON.clock}<span>${left()}</span></div>` : ""}
      ${themeButton()}
    </div></header>
    <nav class="journey cand-steps" aria-label="Steps"><ol>${steps.map((s, i) => `<li class="${i + 1 < step ? "done" : ""}"${i + 1 === step ? ' aria-current="step"' : ""}><span class="n">${i + 1 < step ? "✓" : i + 1}</span><span class="t">${s}</span></li>`).join("")}</ol></nav>
    <main class="cand-main fade-in">${inner}</main>
    <footer class="cand-foot xs muted">Homesly Stays · This page is private to you. Please don't share the link.</footer>
  </div>`;
  clearInterval(C.leftT);
  if (c.deadline_at) C.leftT = setInterval(() => { const el = document.getElementById("cand-left"); if (!el) return clearInterval(C.leftT); el.querySelector("span").textContent = left(); el.classList.toggle("low", msLeft() < 3 * 3600_000); }, 30_000);
}
const skew = () => (C.cand?.server_now ? new Date(C.cand.server_now).getTime() - Date.now() : 0);
const msLeft = () => new Date(C.cand.deadline_at).getTime() - (Date.now() + skew());
function left() { const ms = Math.max(0, msLeft()); const hr = Math.floor(ms / 3600_000), m = Math.floor((ms % 3600_000) / 60_000); return `${hr}h ${String(m).padStart(2, "0")}m left`; }
function bare(inner) {
  X.app.innerHTML = `<div class="center"><div class="card stack fade-in" style="max-width:520px">
    <div class="brand" style="padding:0"><div class="brand-mark">H</div><div><b style="color:var(--ink)">Homesly hiring</b></div></div>${inner}</div></div>`;
}

/* ============================================================ 1. welcome + consent */
function renderWelcome() {
  const { h } = X; const c = C.cand; const p = c.pack;
  frame(`<div class="stack" style="gap:24px">
    <div class="hello"><span class="eyebrow">Hello ${h(c.full_name.split(" ")[0])}</span><h1 class="h-display">Your ${h(p.role_title)} assessment</h1>
      <p class="lede">Read the brief below. When you're ready, agree to the rules at the bottom: your <b>48 hours</b> start then. Part A (${p.timed.minutes} minutes, live) can be done any time inside those 48 hours.</p></div>
    ${briefHtml(X, p)}
    <form class="card stack" id="consent" novalidate>
      <h3>Before you start</h3>
      <p class="ink2 small">During Part A only, this page uses your camera and a share of your whole screen to keep the assessment fair. It checks you're alone and facing the screen, and logs if you leave the page.</p>
      <label class="ck"><input type="checkbox" name="rules"> I've read the brief and the rules, and the work I submit will be my own.</label>
      <label class="ck"><input type="checkbox" name="camera"> During Part A, I agree to my camera being on and a still photo being taken about every 30 seconds and whenever a warning happens.</label>
      <label class="ck"><input type="checkbox" name="screen"> During Part A, I'll share my <b>entire screen</b>, and a screenshot will be taken about every 60 seconds and whenever a warning happens.</label>
      <label class="ck"><input type="checkbox" name="privacy"> I understand the photos, screenshots and my work are stored privately, seen only by Homesly's hiring team, used only for this hiring decision, and deleted within 6 months (or sooner if I ask).</label>
      <div class="field" style="max-width:360px"><label for="typed">Type your full name to confirm</label><input class="input" id="typed" autocomplete="name" placeholder="${h(c.full_name)}"></div>
      <div id="consent-err"></div>
      <div class="row"><button class="btn primary lg" type="submit">Accept and start my 48 hours</button><span class="small muted">You'll have until about ${h(new Date(Date.now() + 48 * 3600_000).toLocaleString(undefined, { weekday: "long", hour: "numeric", minute: "2-digit" }))}.</span></div>
    </form>
  </div>`, { step: 1 });
  document.getElementById("consent").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target; const err = (m) => (document.getElementById("consent-err").innerHTML = `<div class="notice bad" role="alert">${h(m)}</div>`);
    const consent = { rules: f.rules.checked, camera: f.camera.checked, screen: f.screen.checked, privacy: f.privacy.checked, typed_name: document.getElementById("typed").value.trim() };
    if (!consent.rules || !consent.camera || !consent.screen || !consent.privacy) return err("Please tick all four boxes.");
    if (consent.typed_name.length < 3) return err("Type your full name to confirm.");
    try { C.cand = (await X.HAPI.cAccept(C.token, consent)).cand; window.scrollTo({ top: 0 }); route(); } catch (x) { err(x.message); }
  });
}

/* ============================================================ 2. home (after accepting) */
function renderHome() {
  const { h, ICON } = X; const c = C.cand; const p = c.pack;
  const aDone = !!c.timed_submitted_at;
  frame(`<div class="stack" style="gap:22px">
    <div class="hello"><span class="eyebrow">Deadline · ${h(when(c.deadline_at))}</span><h1 class="h-display">${aDone ? "Part A is done. Now Part B." : "Two parts, at your own pace."}</h1>
      <p class="lede">${aDone ? "Upload your take-home work below. Your progress saves as you go. Submit once everything is in." : `Do Part A when you have ${p.timed.minutes} quiet, uninterrupted minutes on a laptop or desktop. You can work on Part B before or after it.`}</p></div>
    <div class="grid g-2" style="gap:20px">
      <section class="hero stack"><span class="eyebrow">Part A · live</span>
        <h2>${aDone ? "Submitted" : `${p.timed.minutes} minutes, one sitting`}</h2>
        <p>${aDone ? `Thank you. Submitted ${h(when(c.timed_submitted_at))}.` : "Camera on, whole screen shared, full screen. No copy and paste. Leaving the page is logged."}</p>
        ${aDone ? "" : `<div class="row"><button class="btn primary lg" data-c="parta">${ICON.play} Start Part A</button></div>`}</section>
      <section class="card stack"><span class="eyebrow">Part B · take-home</span><h3>${p.takehome.tasks.length} tasks</h3>
        <div class="list">${p.takehome.tasks.map((t, i) => { const n = (c.takehome.files || []).filter((f) => f.task === t.id).length + (c.takehome.links || []).filter((l) => l.task === t.id).length; return `<div class="li"><span class="avatar" style="${n ? "background:var(--good-soft);color:var(--good)" : ""}">${n ? "✓" : i + 1}</span><div class="grow"><b style="font-weight:500">${h(t.title)}</b><div class="xs muted">${n ? `${n} item${n > 1 ? "s" : ""} added` : h(t.time_guide)}</div></div></div>`; }).join("")}</div></section>
    </div>
    ${takehomeForm(aDone)}
    <details class="card"><summary class="hb-sum">Read the full brief again</summary><div style="margin-top:16px">${briefHtml(X, p)}</div></details>
  </div>`, { step: aDone ? 3 : 2 });
  bindTakehome();
}

/* ---------------- Part B form ---------------- */
function takehomeForm(aDone) {
  const { h } = X; const c = C.cand; const p = c.pack;
  C.th = C.th || JSON.parse(JSON.stringify(c.takehome || {}));
  const th = C.th; th.files ||= []; th.links ||= [];
  const task = (t, i) => `<div class="hb-up" data-task="${h(t.id)}">
    <div class="row between"><b>Task ${i + 1}. ${h(t.title)}</b><span class="xs muted">${h(t.format)}</span></div>
    <div class="up-list">${th.files.filter((f) => f.task === t.id).map((f) => `<div class="up-item"><span class="chip">${h(ext(f.name))}</span><span class="grow">${h(f.name)}</span><span class="xs muted">${size(f.size)}</span><button class="btn sm ghost" data-c="rm-file" data-path="${h(f.path)}" aria-label="Remove ${h(f.name)}">Remove</button></div>`).join("")}
      ${th.links.filter((l) => l.task === t.id).map((l, k) => `<div class="up-item"><span class="chip accent">Link</span><a class="grow" href="${h(l.url)}" target="_blank" rel="noopener noreferrer">${h(l.url)}</a><button class="btn sm ghost" data-c="rm-link" data-url="${h(l.url)}" data-task="${h(t.id)}">Remove</button></div>`).join("")}
      ${(C.uploads[t.id] || []).map((u) => `<div class="up-item"><span class="spinner" style="width:14px;height:14px"></span><span class="grow">${h(u.name)}</span><span class="xs muted">Uploading…</span></div>`).join("")}</div>
    <div class="row" style="gap:8px">
      <label class="btn sm"><input type="file" multiple hidden data-c="file" data-task="${h(t.id)}" accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.ppt,.pptx,.zip">Upload files</label>
      <input class="input" style="flex:1;min-width:200px;height:34px" placeholder="…or paste a view-only link (https://)" data-link="${h(t.id)}"><button class="btn sm" data-c="add-link" data-task="${h(t.id)}">Add link</button>
    </div></div>`;
  return `<section class="card stack" id="partb">
    <div class="card-h" style="margin:0"><div><h3>Hand in Part B</h3><p class="xs muted" style="margin-top:2px">Up to 50 MB per file. For bigger videos, paste a Google Drive or YouTube (unlisted) link.</p></div><span class="xs muted" id="th-saved"></span></div>
    ${p.takehome.tasks.map(task).join("")}
    <div class="field"><label for="ai-tools">AI tools you used, and for which task (required; write "None" if you used none)</label><textarea class="input" id="ai-tools" rows="3" placeholder="Task 1: ChatGPT for caption ideas, then rewritten. Task 3: HeyGen avatar + ElevenLabs voice, edited in CapCut.">${h(th.ai_tools || "")}</textarea></div>
    <div class="field"><label for="th-note">Anything you'd like us to know? Assumptions you made, what you'd do with more time (optional)</label><textarea class="input" id="th-note" rows="3">${h(th.note || "")}</textarea></div>
    <label class="ck"><input type="checkbox" id="declared" ${th.declared ? "checked" : ""}> I confirm this work is my own, I've listed every AI tool I used, and nobody else helped me.</label>
    <div id="th-err"></div>
    <div class="row"><button class="btn primary lg" data-c="submit-all" ${aDone ? "" : "disabled"}>Submit my assessment</button><span class="small muted">${aDone ? "You can't change anything after submitting." : "You can upload now. Submitting opens after Part A."}</span></div>
  </section>`;
}
const ext = (n) => (String(n).split(".").pop() || "file").slice(0, 5).toUpperCase();
const size = (b) => (b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
function readForm() { const th = C.th; th.ai_tools = document.getElementById("ai-tools")?.value || ""; th.note = document.getElementById("th-note")?.value || ""; th.declared = !!document.getElementById("declared")?.checked; return th; }
function queueThSave() {
  clearTimeout(C.saveT);
  C.saveT = setTimeout(async () => { try { const out = await X.HAPI.cSaveTakehome(C.token, readForm()); C.cand = out.cand; const s = document.getElementById("th-saved"); if (s) s.textContent = "Saved " + new Date().toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }); } catch (e) { X.toast(e.message); } }, 800);
}
function bindTakehome() {
  const box = document.getElementById("partb"); if (!box) return;
  ["ai-tools", "th-note", "declared"].forEach((id) => document.getElementById(id)?.addEventListener(id === "declared" ? "change" : "input", queueThSave));
  box.querySelectorAll('input[type=file][data-c="file"]').forEach((inp) => inp.addEventListener("change", async () => {
    const files = [...inp.files]; const task = inp.dataset.task; inp.value = "";
    for (const f of files) {
      if (f.size > 50 * 1024 * 1024) { X.toast(`${f.name} is over 50 MB. Paste a link for it instead.`); continue; }
      (C.uploads[task] ||= []).push({ name: f.name }); rerenderB();
      try { const path = await X.HAPI.cUpload(C.token, task, f); C.th.files.push({ task, path, name: f.name, size: f.size, type: f.type }); }
      catch (e) { X.toast(`${f.name}: ${e.message}`); }
      C.uploads[task] = (C.uploads[task] || []).filter((u) => u.name !== f.name); rerenderB(); queueThSave();
    }
  }));
}
function rerenderB() { readForm(); const el = document.getElementById("partb"); if (!el) return; el.outerHTML = takehomeForm(!!C.cand.timed_submitted_at); bindTakehome(); }

/* ============================================================ 3. Part A: pre-check */
function renderCheck(resume = false) {
  const { h, ICON } = X; const p = C.cand.pack;
  if (!Capture.supported() || matchMedia("(pointer:coarse)").matches && innerWidth < 900) {
    return frame(`<section class="card stack" style="max-width:620px"><h2>Please switch to a laptop or desktop</h2><p class="ink2">Part A needs screen sharing, which phones and tablets don't support. Open this same link in Chrome or Edge on a computer. Your 48 hours keep running.</p><div><button class="btn" data-c="home">Back</button></div></section>`, { step: 2 });
  }
  C.proctor?.stop(); C.cap?.stop();
  const pr = new Proctor({ startedAt: new Date().toISOString(), audience: "the hiring team" });
  const cap = new Capture({ proctor: pr, upload: (kind, reason, t, blob) => X.HAPI.cCapture(C.token, kind, reason, t, blob) });
  C.proctor = pr; C.cap = cap;
  frame(`<div class="check">
    <section class="stack" style="gap:20px">
      <span class="eyebrow">${resume ? "Resume Part A" : "Part A · system check"}</span>
      <h1 class="serif" style="font-size:clamp(30px,4vw,42px);line-height:1.05">${resume ? "Your Part A clock is still running." : `Three checks, then ${p.timed.minutes} minutes.`}</h1>
      <p class="ink2" style="max-width:60ch">${resume ? "Reconnect your camera and screen to carry on. Leaving was logged." : "Once you start, the timer can't be paused. Close other apps and turn off notifications first."}</p>
      <div class="stack-s">
        <div class="check-item" id="ck-cam"><span class="st">${ICON.cam}</span><div class="grow"><b style="font-weight:500">Camera</b><div class="small muted" id="ck-cam-t">Waiting for permission…</div></div><button class="btn sm" data-c="cam-retry" id="ck-cam-btn" hidden>Try again</button></div>
        <div class="check-item" id="ck-face"><span class="st">${ICON.eye}</span><div class="grow"><b style="font-weight:500">Only you, facing the screen</b><div class="small muted" id="ck-face-t">Starting face check…</div></div></div>
        <div class="check-item wait" id="ck-scr"><span class="st">${ICON.monitor}</span><div class="grow"><b style="font-weight:500">Whole screen shared</b><div class="small muted" id="ck-scr-t">Click Share and choose <b>Entire screen</b>.</div></div><button class="btn sm primary" data-c="share">Share screen</button></div>
        <div class="check-item ${document.fullscreenEnabled ? "wait" : "ok"}"><span class="st">${ICON.expand}</span><div class="grow"><b style="font-weight:500">Full screen</b><div class="small muted">Starting switches to full screen.</div></div></div>
      </div>
      <div class="card flat stack-s" style="padding:18px"><b style="font-weight:600">The rules</b>
        <div class="rules"><span>· Stay on this page, in full screen</span><span>· Keep your whole screen shared</span><span>· No phone, notes, other people or AI chat</span><span>· Copy and paste are switched off</span><span>· Each warning is a strike and takes a photo</span><span>· ${MAX_STRIKES} strikes submits Part A</span></div></div>
      <div class="row"><button class="btn primary lg" data-c="begin" id="ck-go" disabled>${resume ? "Resume Part A" : "I'm ready. Start Part A"}</button><button class="btn ghost" data-c="home">Not now</button></div>
    </section>
    <aside class="stack-s"><div class="cam-big" id="ck-video"><div class="empty-cam" id="ck-empty">Allow camera access when your browser asks.</div><div class="tag"><i></i><span id="ck-tag">Starting camera…</span></div><div class="note">Photos during Part A only</div></div>
      <p class="xs muted">Nothing is captured until you start Part A. Captures stop when you submit.</p></aside>
  </div>`, { step: 2 });
  const paint = () => {
    const s = pr.status();
    const set = (id, cls, text) => { const el = document.getElementById(id); if (!el) return; el.className = "check-item " + cls; const t = document.getElementById(id + "-t"); if (t) t.innerHTML = text; };
    const camText = { ok: "Camera is on", denied: "Camera access was blocked. Allow it in the address bar, then try again.", error: "No camera found, or another app is using it.", unsupported: "This browser can't use the camera. Use Chrome or Edge.", stopped: "The camera turned off.", off: "Waiting for permission…" }[s.camera];
    set("ck-cam", s.camera === "ok" ? "ok" : s.camera === "off" ? "wait" : "bad", camText);
    const fOk = s.face === "ok" || s.face === "unavailable";
    set("ck-face", s.camera !== "ok" ? "" : fOk ? "ok" : s.face === "loading" ? "wait" : "bad", s.camera !== "ok" ? "Needs the camera" : s.face === "unavailable" ? "Face check couldn't load; the camera still runs" : X.h(s.label));
    set("ck-scr", cap.screenOk() ? "ok" : "wait", cap.screenOk() ? "Entire screen is shared" : C.scrErr ? X.h(C.scrErr) : "Click Share and choose <b>Entire screen</b>.");
    const btn = document.getElementById("ck-cam-btn"); if (btn) btn.hidden = s.camera === "ok" || s.camera === "off";
    const vid = document.getElementById("ck-video");
    if (vid) { vid.className = "cam-big " + (s.camera === "ok" && fOk ? "ok" : s.camera === "ok" && s.face !== "loading" ? "bad" : ""); document.getElementById("ck-tag").textContent = s.camera === "ok" ? s.label : "Camera off"; document.getElementById("ck-empty").hidden = s.camera === "ok"; }
    const go = document.getElementById("ck-go"); if (go) go.disabled = !(pr.ready() && cap.screenOk());
  };
  pr.onStatus(paint); cap.onChange = paint;
  pr.attachPreview(document.getElementById("ck-video"));
  pr.startCamera();
}

/* ============================================================ 3b. Part A: the exam */
async function beginPartA() {
  const pr = C.proctor, cap = C.cap; if (!pr?.ready() || !cap?.screenOk()) return;
  await Proctor.enterFullscreen();
  try { C.cand = (await X.HAPI.cStart(C.token)).cand; } catch (e) { X.toast(e.message); return; }
  if (C.cand.timed_submitted_at) { pr.stop(); cap.stop(); return route(); }
  const prev = C.cand.integrity || {};
  C.answers = { ...(C.cand.timed_answers || {}) }; C.cur = 0;
  pr.startedAt = C.cand.timed_started_at;
  pr.log = { strikes: prev.strikes || 0, tabAways: prev.tabAways || 0, pastes: prev.pastes || 0, events: (prev.events || []).slice(-150) };
  pr.onLog = () => queueSave();
  pr.onEvent = (e) => cap.onEvent(e);
  pr.onScreen = async () => { const err = await cap.shareScreen(); return err; };
  pr.onAutoSubmit = () => submitPartA(true);
  if (prev.events?.length) pr.record("resume", "Came back to Part A");
  pr.begin(); cap.begin();
  renderExam(); startTimer();
}
const tLeft = () => new Date(C.cand.timed_deadline_at).getTime() - (Date.now() + skew());
function startTimer() {
  clearInterval(C.timer);
  C.timer = setInterval(() => {
    const ms = tLeft(); const el = document.getElementById("timer");
    if (el) { el.querySelector("span").textContent = X.fmtClock(ms); el.classList.toggle("low", ms < 5 * 60_000); }
    if (ms <= 0) { clearInterval(C.timer); submitPartA(true); }
  }, 1000);
}
const words = (s) => (String(s || "").trim().match(/\S+/g) || []).length;
const isAns = (q, a) => (q.type === "single" ? a != null : String(a || "").trim().length > 0);
function renderExam() {
  const { h, ICON, fmtClock, md } = X; const p = C.cand.pack; const qs = p.timed.questions; const q = qs[C.cur]; const a = C.answers[q.id]; const n = qs.length;
  const done = qs.filter((x) => isAns(x, C.answers[x.id])).length;
  X.app.innerHTML = `<div class="exam">
    <header class="exam-top"><div class="exam-top-in">
      <div class="brand-mark" style="width:32px;height:32px;font-size:19px">H</div>
      <div class="exam-title grow"><b>Part A · ${h(p.role_title)}</b><span>${done} of ${n} answered</span></div>
      <div class="timer ${tLeft() < 300000 ? "low" : ""}" id="timer" role="timer" aria-label="Time left">${ICON.clock}<span>${fmtClock(tLeft())}</span></div>
      <button class="btn dark" data-c="finish">Finish</button>
    </div><div class="progress"><i style="width:${(100 * done) / n}%"></i></div></header>
    <div class="exam-body">
      <aside class="qnav" aria-label="Questions"><span class="eyebrow">Questions</span>
        <div class="qnav-grid">${qs.map((x, i) => `<button class="qn ${i === C.cur ? "cur" : ""} ${isAns(x, C.answers[x.id]) ? "ans" : ""}" data-c="goto" data-i="${i}" aria-label="Question ${i + 1}">${i + 1}</button>`).join("")}</div>
        <div class="legend"><span><i class="a"></i>Answered</span><span><i></i>Not answered</span></div>
        <p class="xs muted">Answers save automatically.</p></aside>
      <section class="qpane"><article class="qcard fade-in" aria-labelledby="qprompt">
        <div class="qhead"><span class="qno">${String(C.cur + 1).padStart(2, "0")}<small>/ ${n}</small></span><span class="grow"></span><span class="chip">${q.type === "single" ? "Choose one" : "Written answer"}</span></div>
        ${q.context ? `<div class="hb-context">${q.context.split("\n").map((l) => `<div>${h(l)}</div>`).join("")}</div>` : ""}
        <p class="qprompt" id="qprompt">${h(q.prompt)}</p>
        ${q.type === "single"
          ? `<div class="opts" role="radiogroup" aria-labelledby="qprompt">${q.options.map((o, i) => `<button class="opt ${a === i ? "sel" : ""}" role="radio" aria-checked="${a === i}" data-c="pick" data-i="${i}"><span class="key">${String.fromCharCode(65 + i)}</span><span class="t">${h(o)}</span></button>`).join("")}</div>`
          : `<textarea class="input hb-ta" id="short-answer" aria-labelledby="qprompt" placeholder="Type your answer…" spellcheck="true">${h(a || "")}</textarea>
             <div class="row between xs muted"><span>Copy and paste are off. Write it yourself.</span><span id="wc">${words(a)} / about ${q.max_words} words</span></div>`}
      </article></section>
    </div>
    <footer class="exam-foot"><div class="exam-foot-in"><span class="grow"></span>
      <button class="btn" data-c="goto" data-i="${C.cur - 1}" ${C.cur === 0 ? "disabled" : ""}>${ICON.left}Back</button>
      ${C.cur < n - 1 ? `<button class="btn primary" data-c="goto" data-i="${C.cur + 1}">Next${ICON.right}</button>` : `<button class="btn primary" data-c="finish">Review &amp; submit${ICON.right}</button>`}
    </div></footer>
  </div>`;
  const ta = document.getElementById("short-answer");
  if (ta) {
    ta.focus();
    ta.addEventListener("input", () => { C.answers[q.id] = ta.value; document.getElementById("wc").textContent = `${words(ta.value)} / about ${q.max_words} words`; queueSave(); });
    ta.addEventListener("drop", (e) => { e.preventDefault(); C.proctor?.record("paste-blocked", "Tried to drop text in"); });
  }
}
let saving = Promise.resolve();
function queueSave() {
  clearTimeout(C.saveT);
  C.saveT = setTimeout(() => { const ans = { ...C.answers }; const log = C.proctor ? { ...C.proctor.log, screen: C.cap?.screenOk() ? "monitor" : "off" } : undefined; saving = saving.then(() => X.HAPI.cSave(C.token, ans, log)).catch(() => {}); }, 800);
}
function finishModal() {
  const qs = C.cand.pack.timed.questions; const un = qs.map((q, i) => [q, i]).filter(([q]) => !isAns(q, C.answers[q.id]));
  X.modal(`<h3 style="font-size:20px">Submit Part A?</h3>
    <p class="ink2">${qs.length - un.length} of ${qs.length} answered. You can't change your answers after submitting.</p>
    ${un.length ? `<div class="stack-s"><span class="eyebrow">Not answered</span><div class="row" style="gap:6px">${un.map(([, i]) => `<button class="qn" style="width:36px;height:36px" data-c="goto-close" data-i="${i}">${i + 1}</button>`).join("")}</div></div>` : ""}
    <div class="row end"><button class="btn" data-c="close">Keep working</button><button class="btn primary" data-c="submit-a">Submit Part A</button></div>`);
}
async function submitPartA(auto = false) {
  if (C.submitting) return; C.submitting = true; X.closeModal(); clearInterval(C.timer); clearTimeout(C.saveT);
  const pr = C.proctor, cap = C.cap;
  const integrity = pr ? { ...pr.log, events: pr.log.events.slice(), screen: cap?.screenOk() ? "monitor" : "off" } : undefined;
  X.app.innerHTML = `<div class="center"><div class="card stack fade-in" style="max-width:420px;text-align:center;align-items:center"><div class="spinner" style="width:28px;height:28px"></div><h3>${auto ? "Time's up. Saving Part A" : "Saving Part A"}</h3><p class="ink2">Finishing the last uploads. Please keep this page open.</p></div></div>`;
  try {
    await cap?.flush(); await saving;
    cap?.stop(); pr?.stop(); C.proctor = null; C.cap = null;
    C.cand = (await X.HAPI.cSubmitTimed(C.token, C.answers, integrity, auto)).cand;
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    X.toast("Part A submitted. Now for Part B."); route();
  } catch (e) { X.toast(e.message); if (C.proctor) { renderExam(); startTimer(); } else route(); }
  finally { C.submitting = false; }
}

/* ============================================================ 4. done */
function renderDone() {
  const { h } = X; const c = C.cand;
  frame(`<section class="hero stack" style="max-width:720px"><span class="eyebrow">Submitted · ${h(when(c.submitted_at))}</span>
    <h2>Thank you, ${h(c.full_name.split(" ")[0])}. Everything is in.</h2>
    <p>Our hiring team will review your work and get in touch to book a 20-minute call, where you'll talk us through it. Keep your files handy (including your Canva or editing projects), as we may ask you to open them.</p>
    <p class="small" style="opacity:.85">You can close this page now.</p></section>`, { step: 4 });
}

/* ============================================================ events */
document.addEventListener("click", async (e) => {
  const el = e.target.closest("[data-c]"); if (!el || !C.cand) return;
  const d = el.dataset;
  switch (d.c) {
    case "home": C.proctor?.stop(); C.cap?.stop(); C.proctor = null; C.cap = null; return route();
    case "parta": return renderCheck(false);
    case "cam-retry": return C.proctor?.startCamera();
    case "share": { C.scrErr = await C.cap?.shareScreen(); C.cap?.onChange?.(); return; }
    case "begin": return beginPartA();
    case "pick": { const q = C.cand.pack.timed.questions[C.cur]; C.answers[q.id] = +d.i; queueSave(); return renderExam(); }
    case "goto": { const i = +d.i; if (i < 0 || i >= C.cand.pack.timed.questions.length) return; C.cur = i; renderExam(); queueSave(); return; }
    case "goto-close": X.closeModal(); C.cur = +d.i; return renderExam();
    case "finish": return finishModal();
    case "close": return X.closeModal();
    case "submit-a": return submitPartA(false);
    case "rm-file": C.th.files = C.th.files.filter((f) => f.path !== d.path); rerenderB(); return queueThSave();
    case "rm-link": C.th.links = C.th.links.filter((l) => !(l.url === d.url && l.task === d.task)); rerenderB(); return queueThSave();
    case "add-link": {
      const inp = document.querySelector(`[data-link="${CSS.escape(d.task)}"]`); const url = (inp?.value || "").trim();
      if (!/^https:\/\/\S+$/i.test(url)) return X.toast("Paste a full link starting with https://");
      C.th.links.push({ task: d.task, url }); rerenderB(); return queueThSave();
    }
    case "submit-all": {
      const th = readForm(); const err = (m) => (document.getElementById("th-err").innerHTML = `<div class="notice bad" role="alert">${X.h(m)}</div>`);
      const missing = C.cand.pack.takehome.tasks.filter((t) => !th.files.some((f) => f.task === t.id) && !th.links.some((l) => l.task === t.id));
      if (th.ai_tools.trim().length < 3) return err("Tell us which AI tools you used (or write 'None').");
      if (!th.declared) return err("Tick the declaration to confirm the work is your own.");
      if (missing.length && el.dataset.armed !== "1") { el.dataset.armed = "1"; el.textContent = "Submit anyway"; return err(`Nothing added yet for: ${missing.map((t) => t.title).join(", ")}. Click again to submit anyway.`); }
      el.disabled = true; el.textContent = "Submitting…";
      try { clearTimeout(C.saveT); C.cand = (await X.HAPI.cSubmit(C.token, th)).cand; window.scrollTo({ top: 0 }); route(); }
      catch (x) { el.disabled = false; el.textContent = "Submit my assessment"; err(x.message); }
    }
  }
});
document.addEventListener("keydown", (e) => {
  if (!C.proctor?.running || document.getElementById("modal") || e.target.closest("textarea,input")) return;
  const qs = C.cand?.pack.timed.questions; if (!qs) return;
  if (e.key === "ArrowRight" && C.cur < qs.length - 1) { C.cur++; renderExam(); }
  else if (e.key === "ArrowLeft" && C.cur > 0) { C.cur--; renderExam(); }
});
