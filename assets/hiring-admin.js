// Manager side of hiring assessments: roles built from a JD, candidates with private links,
// and a plain-English scorecard review (with captures, Part A answers and Part B files).
import { briefHtml } from "./candidate.js";

let X = null;
const H = { data: null, cand: null, files: null, review: null, capFilter: "warn", roleTab: "candidates", draft: null };

const STATUS = {
  invited: ["Invited", ""], accepted: ["Brief accepted", "accent"], part_a: ["Doing Part A", "warn"], part_a_done: ["Part A done", "accent"],
  submitted: ["To review", "gold"], hire: ["Hire", "good"], second_round: ["Second round", "accent"], rejected: ["Rejected", "bad"],
};
function statusOf(c) {
  const t = Date.now();
  if (!c.accepted_at && new Date(c.link_expires_at).getTime() < t) return ["Link expired", "bad"];
  if (c.accepted_at && !c.submitted_at && c.deadline_at && new Date(c.deadline_at).getTime() < t && !["hire", "second_round", "rejected"].includes(c.status)) return ["Missed deadline", "bad"];
  return STATUS[c.status] || [c.status, ""];
}
const hasB = (p) => (p?.takehome?.tasks || []).length > 0;
const secOf = (q) => q.section || (q.type === "single" ? "A" : "B");
const link = (token) => `${location.origin}${location.pathname}${X.DEMO ? "?demo" : ""}#/c/${token}`;
const slug = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "role";
function hoursLeft(c) {
  if (c.submitted_at) return "–";
  if (!hasB(c.pack)) { if (c.timed_started_at) return "Taking it now"; const d = c.deadline_at || c.link_expires_at; return new Date(d).getTime() < Date.now() ? "Expired" : "Start by " + new Date(d).toLocaleDateString(undefined, { day: "numeric", month: "short" }); }
  if (!c.deadline_at) return "–";
  const ms = new Date(c.deadline_at).getTime() - Date.now();
  return ms <= 0 ? "Ended" : `${Math.floor(ms / 3600_000)}h ${Math.floor((ms % 3600_000) / 60_000)}m`;
}

/* ---------------- scoring ---------------- */
export function computeScore(pack, review) {
  const tasks = pack.scorecard.tasks; const s = review?.scores || {};
  const scored = tasks.filter((t) => Number.isFinite(s[t.id]));
  const total = Math.round(tasks.reduce((a, t) => a + (Number.isFinite(s[t.id]) ? (t.weight * s[t.id]) / 10 : 0), 0));
  const complete = scored.length === tasks.length;
  const flags = (review?.flags || []).length;
  const low = tasks.filter((t) => Number.isFinite(s[t.id]) && s[t.id] < 5);
  const d = pack.scorecard.decision;
  let rec = null;
  if (flags) rec = ["Reject", "bad", "A red flag was ticked"];
  else if (complete) rec = total >= d.hire_min && !low.length ? ["Hire", "good", `${total} ≥ ${d.hire_min} and no task below 5`]
    : total >= d.second_min ? ["Second round", "accent", total >= d.hire_min ? `${total} points, but ${low.map((t) => t.title).join(", ")} scored below 5` : `${total} is between ${d.second_min} and ${d.hire_min - 1}`]
    : ["Reject", "bad", `${total} is below ${d.second_min}`];
  return { total, complete, scored: scored.length, of: tasks.length, rec };
}

/* ============================================================ entry */
export async function renderHiring(x, parts) {
  X = x;
  const [page, id, tab] = parts;
  try {
    if (page === "new") return renderNew();
    if (page === "cand" && id) return await renderCand(id);
    await load();
    if (page === "role" && id) return renderRole(id, tab);
    return renderOverview();
  } catch (e) { console.error(e); X.paint("hiring", `<div class="card stack"><h3>Couldn't load hiring</h3><p class="ink2">${X.h(e.message)}</p><p class="small muted">If this is a new setup, run the hiring database migration first (see README).</p></div>`); }
}
async function load() { H.data = await X.HAPI.load(); }

/* ============================================================ overview */
function renderOverview() {
  const { h, ICON, kpi } = X; const { roles, candidates } = H.data;
  const live = roles.filter((r) => r.status === "live").length;
  const going = candidates.filter((c) => ["accepted", "part_a", "part_a_done"].includes(c.status) && statusOf(c)[0] !== "Missed deadline").length;
  const toReview = candidates.filter((c) => c.status === "submitted").length;
  const decided = candidates.filter((c) => ["hire", "second_round", "rejected"].includes(c.status)).length;
  X.paint("hiring", `
    <div class="page-h"><div><h1>Hiring</h1><p class="sub">Assessments built from your job descriptions. Send a private link to each shortlisted candidate.</p></div>
      <a class="btn primary" href="#/hiring/new">${ICON.spark}New assessment from a JD</a></div>
    <div class="stack" style="gap:20px">
      <div class="grid g-4">
        ${kpi("Live roles", `${live}`, `${roles.length} in total`)}
        ${kpi("In progress", `${going}`, "Accepted the brief, not yet submitted")}
        ${kpi("Waiting for you", `${toReview}`, toReview ? "Submitted and ready to score" : "Nothing to review")}
        ${kpi("Decided", `${decided}`, "Hire, second round or reject")}
      </div>
      <section class="card"><div class="card-h"><h3>How it works</h3></div>
        <ol class="hw-steps">
          <li><b>Upload the JD.</b> Claude writes the brief, quick questions, written tasks, a scorecard and follow-up questions. Check and edit them.</li>
          <li><b>Add a candidate.</b> You get a private link. Send it after the verbal interview.</li>
          <li><b>They take the test.</b> One sitting (about 90 minutes) any time within 7 days, with camera and whole-screen captures. Quick questions are marked automatically; Claude suggests marks for written answers.</li>
          <li><b>Score it.</b> Each area out of 10 with plain descriptions and red flags, then a 20-minute review call with the follow-up questions.</li>
        </ol></section>
      <section class="card"><div class="card-h"><h3>Roles</h3></div>
        ${roles.length ? `<div class="grid g-2">${roles.map(roleCard).join("")}</div>` : `<div class="empty">No roles yet. <a href="#/hiring/new">Create the first assessment from a JD.</a></div>`}</section>
      <section class="card"><div class="card-h"><h3>Candidates</h3><span class="xs muted">${candidates.length} in total</span></div>${candTable(candidates, true)}</section>
    </div>`);
}
function roleCard(r) {
  const { h } = X; const cs = H.data.candidates.filter((c) => c.role_id === r.id);
  const n = (f) => cs.filter(f).length;
  return `<a class="card stack-s" href="#/hiring/role/${h(r.id)}" style="text-decoration:none;color:inherit">
    <div class="row between"><h3 style="font-size:17px">${h(r.title)}</h3><span class="chip ${r.status === "live" ? "good" : r.status === "draft" ? "warn" : ""}">${r.status === "live" ? "Live" : r.status === "draft" ? "Draft" : "Closed"}</span></div>
    <p class="small ink2">${h(r.summary || "")}</p>
    <div class="row" style="gap:18px;margin-top:6px">
      <div class="kpi"><span class="eyebrow">Invited</span><span class="v" style="font-size:22px">${cs.length}</span></div>
      <div class="kpi"><span class="eyebrow">In progress</span><span class="v" style="font-size:22px">${n((c) => ["accepted", "part_a", "part_a_done"].includes(c.status))}</span></div>
      <div class="kpi"><span class="eyebrow">To review</span><span class="v" style="font-size:22px">${n((c) => c.status === "submitted")}</span></div>
      <div class="kpi"><span class="eyebrow">Hire / 2nd</span><span class="v" style="font-size:22px">${n((c) => c.status === "hire")} / ${n((c) => c.status === "second_round")}</span></div>
    </div></a>`;
}
function candTable(cs, showRole) {
  const { h, ICON } = X;
  if (!cs.length) return `<div class="empty">No candidates yet.</div>`;
  const roleTitle = (id) => H.data.roles.find((r) => r.id === id)?.title || id;
  return `<div class="tablebox"><table><thead><tr><th>Candidate</th>${showRole ? "<th>Role</th>" : ""}<th>Status</th><th>Time left</th><th>Test</th><th>Score</th><th></th></tr></thead><tbody>
    ${cs.map((c) => { const [l, k] = statusOf(c); const sc = c.review?.scores && Object.keys(c.review.scores).length ? computeScore(c.pack, c.review) : null; const nums = c.timed_marks?._numbers;
      return `<tr class="click" data-href="#/hiring/cand/${c.id}"><td><div class="row" style="gap:10px;flex-wrap:nowrap"><span class="avatar">${X.initials(c.full_name)}</span><div><b style="font-weight:500">${h(c.full_name)}</b><div class="xs muted">${h(c.email || "")}</div></div></div></td>
        ${showRole ? `<td class="small">${h(roleTitle(c.role_id))}</td>` : ""}
        <td><span class="chip ${k}">${h(l)}</span></td><td class="mono xs">${hoursLeft(c)}</td>
        <td class="xs">${c.timed_submitted_at ? `${nums ? `${nums.right}/${nums.of} right · ` : ""}${c.integrity?.strikes ? `<span class="chip ${c.integrity.strikes >= 5 ? "bad" : "warn"}">${c.integrity.strikes} strikes</span>` : `<span class="chip good">Clean</span>`}` : "–"}</td>
        <td>${sc ? `<b>${sc.total}</b><span class="xs muted">/100${sc.complete ? "" : " so far"}</span>` : "–"}</td>
        <td style="text-align:right">${ICON.right.replace("<svg", '<svg style="width:16px;height:16px;color:var(--muted)"')}</td></tr>`; }).join("")}
  </tbody></table></div>`;
}

/* ============================================================ new role from a JD */
async function loadScript(src) {
  if (document.querySelector(`script[src="${src}"]`)) return;
  await new Promise((res, rej) => { const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = () => rej(new Error("Couldn't load the Word reader. Paste the text instead.")); document.head.appendChild(s); });
}
async function readJd(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf")) {
    const buf = new Uint8Array(await file.arrayBuffer()); let bin = "";
    for (let i = 0; i < buf.length; i += 32768) bin += String.fromCharCode(...buf.subarray(i, i + 32768));
    return { pdf: btoa(bin), text: "" };
  }
  if (name.endsWith(".docx")) {
    await loadScript("https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js");
    const zip = await window.JSZip.loadAsync(file);
    const xml = await zip.file("word/document.xml").async("string");
    const text = xml.replace(/<w:tab\/>/g, "\t").replace(/<\/w:p>/g, "\n").replace(/<[^>]+>/g, "")
      .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'")
      .split("\n").map((l) => l.trim()).filter(Boolean).join("\n");
    return { text, pdf: null };
  }
  return { text: await file.text(), pdf: null };
}
function renderNew(state = {}) {
  const { h, ICON } = X;
  if (H.draft && !state.form) return renderDraft();
  X.paint("hiring", `
    <div class="page-h"><div><a href="#/hiring" class="btn sm ghost" style="margin-left:-12px">${ICON.left}Hiring</a><h1 style="margin-top:6px">New assessment from a JD</h1>
      <p class="sub">Claude reads the job description and writes the whole assignment. You check it before anyone sees it.</p></div></div>
    <form class="card stack" id="jd-form" novalidate>
      <div class="field"><label for="jd-file">1. The job description: upload a Word, PDF or text file…</label>
        <input class="input" id="jd-file" type="file" accept=".docx,.pdf,.txt,.md"></div>
      <div class="field"><label for="jd-text">…or paste it here</label><textarea class="input" id="jd-text" rows="10" placeholder="Paste the full JD">${h(state.text || "")}</textarea>
        <span class="xs muted" id="jd-note">${state.pdfName ? `PDF attached: ${h(state.pdfName)}` : ""}</span></div>
      <div class="field"><label for="jd-notes">2. Anything to steer it (optional)</label><textarea class="input" id="jd-notes" rows="3" placeholder="e.g. Use Coach House Otterburn. Keep the ads budget at £300. Part A 45 minutes. The role also handles TikTok.">${h(state.notes || "")}</textarea></div>
      <div id="jd-err"></div>
      <div class="row"><button class="btn primary lg" type="submit" id="jd-go">${ICON.spark}Write the assessment</button><span class="small muted">Takes 1–2 minutes.</span></div>
    </form>`);
  let pdf = state.pdf || null, pdfName = state.pdfName || "";
  document.getElementById("jd-file").addEventListener("change", async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try { const out = await readJd(f); if (out.pdf) { pdf = out.pdf; pdfName = f.name; document.getElementById("jd-note").textContent = `PDF attached: ${f.name}`; } else { document.getElementById("jd-text").value = out.text; pdf = null; } }
    catch (x) { X.toast(x.message); }
  });
  document.getElementById("jd-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = document.getElementById("jd-text").value.trim(), notes = document.getElementById("jd-notes").value.trim();
    if (text.length < 80 && !pdf) { document.getElementById("jd-err").innerHTML = `<div class="notice bad">Upload or paste the job description first.</div>`; return; }
    X.paint("hiring", `<div class="center" style="min-height:50vh"><div class="card stack fade-in" style="max-width:520px;text-align:center;align-items:center"><div class="spinner" style="width:28px;height:28px"></div>
      <h3>Writing the assessment</h3><p class="ink2">Claude is reading the JD and writing the candidate brief, the live Part A questions, the take-home tasks, your scorecard and the follow-up questions.</p><p class="small muted">Usually 1–2 minutes. Keep this tab open.</p></div></div>`);
    try { const pack = await X.HAPI.generate({ jd_text: text, pdf_base64: pdf, notes }); H.draft = { pack, jd_text: text }; renderDraft(); }
    catch (x) { X.toast(x.message); renderNew({ form: true, text, notes, pdf, pdfName }); }
  });
}
function renderDraft() {
  const { h, ICON } = X; const d = H.draft;
  X.paint("hiring", `
    <div class="page-h"><div><span class="eyebrow">Draft · not saved yet</span><h1 style="margin-top:4px">${h(d.pack.role_title)}</h1><p class="sub">Read it through. You can edit any wording after saving.</p></div>
      <div class="row"><button class="btn ghost" data-h="draft-discard">Discard</button><button class="btn" data-h="draft-redo">${ICON.spark}Write again</button></div></div>
    <form class="card stack" id="save-form" novalidate>
      <div class="grid g-3" style="align-items:end">
        <div class="field"><label for="r-title">Role title</label><input class="input" id="r-title" value="${h(d.pack.role_title)}"></div>
        <div class="field"><label for="r-id">Short name (used in links and reports)</label><input class="input mono" id="r-id" value="${h(slug(d.pack.role_title))}"></div>
        <div class="field"><label for="r-status">Status</label><select class="input" id="r-status"><option value="live">Live: ready to invite candidates</option><option value="draft">Draft</option></select></div>
      </div>
      <div class="row end"><button class="btn primary" type="submit">${ICON.check}Save assessment</button></div>
    </form>
    ${packTabs(d.pack, "brief", "draft")}`);
  bindPackTabs(d.pack, "draft");
  document.getElementById("save-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = slug(document.getElementById("r-id").value), title = document.getElementById("r-title").value.trim() || d.pack.role_title;
    try {
      await load();
      if (H.data.roles.some((r) => r.id === id)) return X.toast("That short name is already used. Pick another.");
      const pack = { ...d.pack, role_title: title };
      await X.HAPI.saveRole({ id, title, summary: pack.summary, jd_text: d.jd_text, pack, status: document.getElementById("r-status").value });
      H.draft = null; X.toast("Assessment saved."); X.go(`#/hiring/role/${id}`);
    } catch (x) { X.toast(x.message); }
  });
}

/* ---------------- pack viewer (brief / Part A / scorecard / follow-ups) ---------------- */
const PACK_TABS = [["brief", "Candidate brief"], ["parta", "Questions + answers"], ["score", "Scorecard"], ["follow", "Follow-up questions"]];
function packTabs(pack, tab, where) {
  return `<section class="stack" style="gap:16px" id="pack-view"><div class="tabs" role="tablist">${PACK_TABS.map(([k, l]) => `<button role="tab" class="${tab === k ? "on" : ""}" data-h="pack-tab" data-k="${k}" data-where="${where}">${l}</button>`).join("")}</div>
    <div id="pack-body">${packBody(pack, tab)}</div></section>`;
}
function bindPackTabs() { /* tabs are handled by the delegated click handler */ }
function packBody(pack, tab) {
  const { h, md } = X;
  if (tab === "parta") return `<section class="card stack"><p class="ink2">${h(pack.timed.intro)}</p><span class="chip accent" style="align-self:flex-start">${pack.timed.minutes} minutes · camera + whole screen</span>
    ${pack.timed.questions.map((q, i) => `<div class="rv"><div class="row between"><span class="qno" style="font-size:22px">${String(i + 1).padStart(2, "0")}</span><span class="chip">${q.type === "single" ? "Multiple choice · marked automatically" : `Written · about ${q.max_words} words`}</span></div>
      ${q.context ? `<div class="hb-context">${q.context.split("\n").map((l) => `<div>${h(l)}</div>`).join("")}</div>` : ""}
      <p style="font-weight:500">${h(q.prompt)}</p>
      ${q.type === "single" ? `<div class="stack-s">${q.options.map((o, k) => `<div class="ans ${k === q.answer ? "right" : ""}">${String.fromCharCode(65 + k)}. ${h(o)}${k === q.answer ? " ✓" : ""}</div>`).join("")}</div>` : ""}
      <p class="why"><b>${q.type === "single" ? "Why." : "A good answer."}</b> ${h(q.guide)}</p></div>`).join("")}</section>`;
  if (tab === "score") return scorecardDoc(pack);
  if (tab === "follow") return `<section class="card stack">${pack.followups.map((f, i) => `<div class="rv"><p style="font-weight:500">${i + 1}. ${h(f.q)}</p><p class="why"><b>Listen for.</b> ${h(f.listen_for)}</p></div>`).join("")}</section>`;
  return briefHtml(X, pack);
}
function scorecardDoc(pack) {
  const { h } = X; const sc = pack.scorecard;
  return `<div class="stack" style="gap:16px">
    <section class="card stack-s"><h3>How the total works</h3><p class="ink2">${h(sc.decision.notes)}</p>
      <div class="row" style="gap:8px"><span class="chip good">${sc.decision.hire_min}+ Hire</span><span class="chip accent">${sc.decision.second_min}–${sc.decision.hire_min - 1} Second round</span><span class="chip bad">Below ${sc.decision.second_min} Reject</span><span class="chip bad">Any red flag: Reject</span></div></section>
    ${sc.tasks.map((t) => `<section class="card stack-s"><div class="row between"><h3>${h(t.title)}</h3><span class="row" style="gap:6px">${hasB(pack) ? `<span class="chip">${t.part === "timed" ? "Part A" : "Part B"}</span>` : ""}<span class="chip gold">Weight ${t.weight}</span></span></div>
      <span class="eyebrow">Quick checks</span><ul class="hb-list">${t.look_for.map((x) => `<li>${h(x)}</li>`).join("")}</ul>
      <div class="bands">${[["9–10", t.band_10, "good"], ["6–8", t.band_7, "accent"], ["3–5", t.band_4, "warn"], ["0–2", t.band_1, "bad"]].map(([b, txt, k]) => `<div class="band"><span class="chip ${k}">${b}</span><span class="small">${h(txt)}</span></div>`).join("")}</div></section>`).join("")}
    <section class="card stack-s"><h3>Red flags: automatic reject</h3><ul class="hb-list">${sc.red_flags.map((x) => `<li>${h(x)}</li>`).join("")}</ul></section>
  </div>`;
}

/* ============================================================ role page */
function renderRole(id, tab = "candidates") {
  const { h, ICON } = X; const r = H.data.roles.find((x) => x.id === id);
  if (!r) return X.paint("hiring", `<div class="empty">That role doesn't exist. <a href="#/hiring">Back to hiring</a></div>`);
  const cs = H.data.candidates.filter((c) => c.role_id === id);
  const tabs = [["candidates", `Candidates (${cs.length})`], ...PACK_TABS, ["edit", "Edit"]];
  const t = tabs.some(([k]) => k === tab) ? tab : "candidates";
  X.paint("hiring", `
    <div class="page-h"><div><a href="#/hiring" class="btn sm ghost" style="margin-left:-12px">${ICON.left}Hiring</a><h1 style="margin-top:6px">${h(r.title)}</h1><p class="sub">${h(r.summary || "")}</p></div>
      <div class="row"><select class="input" style="width:auto" data-h="role-status" data-id="${h(id)}" aria-label="Role status">${[["live", "Live"], ["draft", "Draft"], ["closed", "Closed"]].map(([v, l]) => `<option value="${v}" ${r.status === v ? "selected" : ""}>${l}</option>`).join("")}</select>
        <button class="btn primary" data-h="invite" data-id="${h(id)}" ${r.status === "live" ? "" : "disabled title='Set the role to Live first'"}>${ICON.plus}Add candidate</button></div></div>
    <div class="tabs" role="tablist" style="margin-bottom:16px">${tabs.map(([k, l]) => `<a role="tab" class="${t === k ? "on" : ""}" href="#/hiring/role/${h(id)}/${k}">${l}</a>`).join("")}</div>
    ${t === "candidates" ? `<section class="card">${candTable(cs, false)}</section>`
      : t === "edit" ? `<section class="card stack"><p class="ink2 small">Edit the wording, questions, answers or scorecard. Changes apply to candidates you invite from now on; people already invited keep the version they received.</p>
          <textarea class="input mono" id="pack-json" rows="28" spellcheck="false">${h(JSON.stringify(r.pack, null, 2))}</textarea><div id="pack-err"></div>
          <div class="row end"><button class="btn primary" data-h="pack-save" data-id="${h(id)}">Save changes</button></div></section>`
      : `<div id="pack-body">${packBody(r.pack, t)}</div>`}`);
}
function inviteModal(roleId) {
  X.modal(`<form class="stack" id="inv-form" novalidate><h3 style="font-size:20px">Add a candidate</h3>
    <div class="field"><label for="c-name">Full name</label><input class="input" id="c-name" required autocomplete="off"></div>
    <div class="grid g-2"><div class="field"><label for="c-email">Email</label><input class="input" id="c-email" type="email" autocomplete="off"></div><div class="field"><label for="c-phone">Phone</label><input class="input" id="c-phone" autocomplete="off"></div></div>
    <div class="field"><label for="c-cv">CV (optional, PDF or Word, up to 10 MB)</label><input class="input" id="c-cv" type="file" accept=".pdf,.doc,.docx"></div>
    <div class="field"><label for="c-notes">Notes from the interview (optional)</label><textarea class="input" id="c-notes" rows="3"></textarea></div>
    <div id="inv-err"></div>
    <div class="row end"><button class="btn" type="button" data-h="close">Cancel</button><button class="btn primary" type="submit">Create private link</button></div></form>`);
  document.getElementById("inv-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = (m) => (document.getElementById("inv-err").innerHTML = `<div class="notice bad">${X.h(m)}</div>`);
    const cv = document.getElementById("c-cv").files[0];
    const row = { role_id: roleId, full_name: document.getElementById("c-name").value.trim(), email: document.getElementById("c-email").value.trim(), phone: document.getElementById("c-phone").value.trim(), notes: document.getElementById("c-notes").value.trim(), cv };
    if (!row.full_name) return err("Enter their name.");
    if (cv && cv.size > 10 * 1024 * 1024) return err("The CV is over 10 MB.");
    try { const out = await X.HAPI.invite(row); X.closeModal(); linkModal(row.full_name, row.email, out.token); await load(); renderRole(roleId); }
    catch (x) { err(x.message); }
  });
}
function linkModal(name, email, token) {
  const { h } = X; const url = link(token); const first = name.split(" ")[0];
  const body = `Hi ${first},\n\nThank you for interviewing with Homesly. As the next step, we'd like you to take a short online assessment (about 90 minutes in one sitting).\n\nOpen your private link here:\n${url}\n\nYou'll need a laptop or desktop with a webcam, Chrome or Edge, and a quiet room. Your camera and screen are shared during the test. Please take it within the next 7 days, at a time that suits you.\n\nBest wishes,\nHomesly hiring team`;
  X.modal(`<div class="stack"><h3 style="font-size:20px">Private link for ${h(name)}</h3>
    <p class="ink2 small">This link is shown only once, so copy it now. If it's lost, make a new one from the candidate's page (the old link stops working).</p>
    <div class="row" style="gap:8px;flex-wrap:nowrap"><input class="input mono" id="lnk" readonly value="${h(url)}"><button class="btn primary" data-h="copy" data-v="${h(url)}">Copy</button></div>
    <div class="field"><label for="lnk-mail">Suggested message</label><textarea class="input" id="lnk-mail" rows="9">${h(body)}</textarea></div>
    <div class="row end">${email ? `<a class="btn" href="mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent("Your Homesly assessment")}&body=${encodeURIComponent(body)}">Open in my email</a>` : ""}<button class="btn" data-h="copy" data-v="${h(body)}">Copy message</button><button class="btn primary" data-h="close">Done</button></div></div>`);
}

/* ============================================================ candidate review */
async function renderCand(id) {
  X.paint("hiring", `<div class="center" style="min-height:40vh"><div class="spinner"></div></div>`);
  if (!H.data) await load();
  const c = await X.HAPI.candidate(id);
  if (!c) return X.paint("hiring", `<div class="empty">Candidate not found. <a href="#/hiring">Back</a></div>`);
  H.cand = c; H.review = JSON.parse(JSON.stringify(c.review || {})); H.review.scores ||= {}; H.review.notes ||= {}; H.review.flags ||= []; H.review.followups ||= {};
  if (c.timed_submitted_at && !Object.keys(H.review.scores).length && !c.pack.timed.questions.some((q) => q.type === "short")) {
    for (const t of c.pack.scorecard.tasks) { const v = suggestFor(c, t); if (v != null) H.review.scores[t.id] = v; }
    H.prefilled = true;
  } else H.prefilled = false;
  H.files = { urls: {}, captures: [] };
  try { H.files = await X.HAPI.files(id); } catch (e) { X.toast(e.message); }
  paintCand();
}
function paintCand() {
  const { h, ICON } = X; const c = H.cand; const p = c.pack; const [sl, sk] = statusOf(c);
  const role = H.data?.roles.find((r) => r.id === c.role_id);
  X.paint("hiring", `
    <div class="page-h"><div><a href="#/hiring/role/${h(c.role_id)}" class="btn sm ghost" style="margin-left:-12px">${ICON.left}${h(role?.title || p.role_title)}</a>
      <div class="row" style="margin-top:6px"><div class="avatar lg">${X.initials(c.full_name)}</div><div><h1>${h(c.full_name)}</h1><p class="sub">${h([c.email, c.phone].filter(Boolean).join(" · ") || "No contact details")}</p></div><span class="chip ${sk}">${h(sl)}</span></div></div>
      <div class="row"><button class="btn" data-h="new-link">New link</button>${c.deadline_at && !c.submitted_at && !c.timed_started_at ? `<button class="btn" data-h="extend">${hasB(c.pack) ? "+24 hours" : "+3 days to start"}</button>` : ""}
        ${H.files.urls[c.cv_path] ? `<a class="btn" href="${h(H.files.urls[c.cv_path])}" target="_blank" rel="noopener">${ICON.clip}CV</a>` : ""}</div></div>
    <div class="stack" style="gap:20px">
      ${c.timed_submitted_at ? summary(c) : ""}
      ${timeline(c)}
      ${c.notes ? `<section class="card stack-s"><h3>Interview notes</h3><p class="ink2" style="white-space:pre-wrap">${h(c.notes)}</p></section>` : ""}
      ${c.timed_started_at ? integrity(c) : ""}
      ${c.timed_started_at ? captures() : ""}
      ${c.timed_submitted_at ? partA(c) : ""}
      ${c.accepted_at && hasB(c.pack) ? partB(c) : ""}
      ${scoreForm(c)}
      ${followups(c)}
      <section class="card stack-s"><h3>Privacy</h3><p class="small ink2">Captures and files are private and only reachable through short-lived links. Delete them once you've decided (the candidate was told: within 6 months).</p>
        <div class="row"><button class="btn sm danger" data-h="purge">Delete camera and screen captures</button><button class="btn sm danger" data-h="delete-cand">Delete candidate and all files</button></div></section>
    </div>`);
  bindScoreForm();
}
function summary(c) {
  const { h } = X; const m = c.timed_marks || {}; const n = m._numbers; const ig = c.integrity || {};
  const written = c.pack.timed.questions.filter((q) => q.type === "short").map((q) => m[q.id]?.score).filter(Number.isFinite);
  const wAvg = written.length ? Math.round((10 * written.reduce((a, b) => a + b, 0)) / written.length) / 10 : null;
  const s = computeScore(c.pack, H.review);
  const ips = new Set((c.devices || []).map((d) => d.ip)).size;
  const mins = c.timed_submitted_at && c.timed_started_at ? Math.round((new Date(c.timed_submitted_at) - new Date(c.timed_started_at)) / 60000) : null;
  return `<section class="card stack"><div class="card-h" style="margin:0"><h3>At a glance</h3>${s.rec ? `<span class="chip ${s.rec[1]}">Scorecard says: ${s.rec[0]} · ${s.total}/100</span>` : `<span class="xs muted">Score the areas below to get a recommendation</span>`}</div>
    <div class="sum-grid">
      <div class="kpi"><span class="eyebrow">Quick questions</span><span class="v">${n ? `${n.right}<small>/${n.of}</small>` : "–"}</span><span class="d">${n ? Math.round((100 * n.right) / Math.max(1, n.of)) + "% right" : ""}</span></div>
      ${c.pack.timed.questions.some((q) => q.type === "short")
        ? `<div class="kpi"><span class="eyebrow">Written (AI suggestion)</span><span class="v">${wAvg == null ? "–" : `${wAvg}<small>/10</small>`}</span><span class="d">Average over ${written.length} answers</span></div>`
        : (() => { const qs = c.pack.timed.questions; const ans = qs.filter((q) => (c.timed_answers || {})[q.id] != null).length; return `<div class="kpi"><span class="eyebrow">Answered</span><span class="v">${ans}<small>/${qs.length}</small></span><span class="d">${qs.length - ans} left blank</span></div>`; })()}
      <div class="kpi"><span class="eyebrow">Integrity</span><span class="v">${ig.strikes || 0}<small> strikes</small></span><span class="d">${(ig.tabAways || 0)} page leaves${ips > 1 ? ` · ${ips} connections` : ""}</span></div>
      <div class="kpi"><span class="eyebrow">Time used</span><span class="v">${mins == null ? "–" : `${mins}<small> min</small>`}</span><span class="d">${c.timed_auto ? "Submitted automatically" : "Submitted by them"}</span></div>
    </div>
    <p class="xs muted">The AI marks are a first opinion. Read the written answers, then set your own scores in the scorecard.</p></section>`;
}
function timeline(c) {
  const { h } = X; const w = (d) => (d ? new Date(d).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : null);
  const steps = hasB(c.pack)
    ? [["Invited", w(c.created_at)], ["Accepted the brief", w(c.accepted_at)], ["Started Part A", w(c.timed_started_at)], ["Submitted Part A", w(c.timed_submitted_at) && w(c.timed_submitted_at) + (c.timed_auto ? " (automatic)" : "")], ["Submitted everything", w(c.submitted_at)]]
    : [["Invited", w(c.created_at)], ["Opened and agreed", w(c.accepted_at)], ["Started the test", w(c.timed_started_at)], ["Submitted", w(c.timed_submitted_at) && w(c.timed_submitted_at) + (c.timed_auto ? " (automatic)" : "")]];
  return `<section class="card"><div class="card-h"><h3>Progress</h3>${c.deadline_at && hasB(c.pack) ? `<span class="xs muted">Deadline ${h(w(c.deadline_at))} · ${hoursLeft(c)} left</span>` : c.deadline_at ? `<span class="xs muted">Must start by ${h(w(c.deadline_at))}</span>` : `<span class="xs muted">Link valid until ${h(w(c.link_expires_at))}</span>`}</div>
    <ol class="tl-steps" style="grid-template-columns:repeat(${steps.length},minmax(0,1fr))">${steps.map(([l, v]) => `<li class="${v ? "done" : ""}"><b>${l}</b><span class="xs muted">${v ? h(v) : "Not yet"}</span></li>`).join("")}</ol></section>`;
}
const EV_KIND = { "face-none": "bad", "face-multi": "bad", "face-side": "bad", "face-down": "bad", "left-page": "warn", "fullscreen-exit": "warn", "idle-unanswered": "warn", "camera-stopped": "bad", "screen-stopped": "bad", "paste-blocked": "warn", "copy-blocked": "info" };
function integrity(c) {
  const { h, fmtClock } = X; const ig = c.integrity || {}; const evs = (ig.events || []).filter((e) => e.type !== "start");
  const total = Math.max(1, Math.round((new Date(c.timed_submitted_at || c.timed_deadline_at) - new Date(c.timed_started_at)) / 1000));
  const strikes = ig.strikes || 0; const ips = [...new Set((c.devices || []).map((d) => d.ip))];
  const st = strikes === 0 ? ["No strikes", "good"] : strikes >= 5 ? ["Auto-submitted after 5 strikes", "bad"] : [`${strikes} strike${strikes > 1 ? "s" : ""}`, "warn"];
  const count = (t) => evs.filter((e) => e.type === t).length;
  return `<section class="card stack">
    <div class="card-h" style="margin:0"><div><h3>${hasB(c.pack) ? "Part A integrity" : "Test integrity"}</h3><p class="xs muted" style="margin-top:2px">Warnings are signals, not proof. Look at the captures before deciding.</p></div><span class="chip ${st[1]}">${st[0]}</span></div>
    <div class="grid g-4" style="gap:12px">
      <div class="kpi"><span class="eyebrow">Left the page</span><span class="mono">${ig.tabAways || 0}×</span></div>
      <div class="kpi"><span class="eyebrow">Face warnings</span><span class="mono">${evs.filter((e) => /^face-/.test(e.type) && e.strike).length}</span></div>
      <div class="kpi"><span class="eyebrow">Screen share stopped</span><span class="mono">${count("screen-stopped")}×</span></div>
      <div class="kpi"><span class="eyebrow">Paste attempts</span><span class="mono">${ig.pastes || 0}</span></div>
    </div>
    ${ips.length > 1 ? `<div class="notice warn">Used ${ips.length} different internet connections during the assessment. That can be innocent (Wi-Fi to phone hotspot), but ask about it.</div>` : ""}
    ${evs.length ? `<div class="tl" role="img" aria-label="Events across the test">${evs.map((e) => `<i class="${EV_KIND[e.type] || "info"}" style="left:${Math.min(99, (100 * e.t) / total)}%" data-tip="${fmtClock(e.t * 1000)} · ${h(e.detail)}"></i>`).join("")}</div>
      <div class="row between xs muted mono"><span>0:00</span><span>${fmtClock(total * 1000)}</span></div>
      <details><summary class="small" style="cursor:pointer">All ${evs.length} events</summary>${evs.map((e) => `<div class="ev"><span class="t">${fmtClock(e.t * 1000)}</span>${e.strike ? `<span class="chip ${EV_KIND[e.type] === "bad" ? "bad" : "warn"}">Strike ${e.strike}</span>` : `<span class="chip">Logged</span>`}<span class="grow">${h(e.detail)}</span></div>`).join("")}</details>`
      : `<p class="small muted">No warnings. Camera, face, tab and screen checks ran the whole time.</p>`}
  </section>`;
}
function captures() {
  const { h, fmtClock } = X; const all = H.files.captures || []; const f = H.capFilter;
  const shown = all.filter((x) => f === "all" || (f === "warn" ? !["interval", "start"].includes(x.reason) : x.kind === f));
  return `<section class="card stack"><div class="card-h" style="margin:0;flex-wrap:wrap"><div><h3>Camera and screen captures</h3><p class="xs muted" style="margin-top:2px">${all.filter((x) => x.kind === "cam").length} camera · ${all.filter((x) => x.kind === "screen").length} screen. Click to enlarge.</p></div>
      <div class="tabs">${[["warn", "At warnings"], ["cam", "Camera"], ["screen", "Screen"], ["all", "All"]].map(([k, l]) => `<button class="${f === k ? "on" : ""}" data-h="cap-filter" data-k="${k}">${l}</button>`).join("")}</div></div>
    ${shown.length ? `<div class="caps">${shown.map((x) => { const u = H.files.urls[x.path]; return `<button class="cap ${x.kind} ${["interval", "start"].includes(x.reason) ? "" : "warn"}" data-h="cap-open" data-path="${h(x.path)}"><span class="cap-img">${u ? `<img src="${h(u)}" alt="${x.kind === "cam" ? "Camera" : "Screen"} at ${fmtClock(x.t * 1000)}" loading="lazy">` : `<span class="xs muted">Not available</span>`}</span>
      <span class="cap-meta"><b class="mono">${fmtClock(x.t * 1000)}</b> ${x.kind === "cam" ? "Camera" : "Screen"}${["interval", "start"].includes(x.reason) ? "" : ` · ${h(x.reason)}`}</span></button>`; }).join("")}</div>`
      : `<div class="empty">${f === "warn" ? "No captures at warnings. Good sign. Check All to see the regular ones." : "No captures."}</div>`}
  </section>`;
}
function partA(c) {
  const qs = c.pack.timed.questions;
  if (!qs.some((q) => q.section)) return partAOld(c);
  const { h } = X; const m = c.timed_marks || {}; const a = c.timed_answers || {}; const n = m._numbers;
  const mcq = qs.map((q, i) => [q, i]).filter(([q]) => q.type === "single");
  const wr = qs.map((q, i) => [q, i]).filter(([q]) => q.type === "short");
  return `<section class="card stack"><div class="card-h" style="margin:0"><h3>${wr.length ? "Section 1 · quick questions" : "Answers"}</h3>${n ? `<span class="chip ${n.right >= n.of * 0.75 ? "good" : n.right >= n.of / 2 ? "warn" : "bad"}">${n.right} of ${n.of} right</span>` : ""}</div>
    <div class="tablebox"><table class="mcq-table"><thead><tr><th>#</th><th>Question</th><th>Their answer</th><th></th></tr></thead><tbody>
    ${mcq.map(([q, i]) => { const ans = a[q.id]; const ok = m[q.id]?.correct; return `<tr><td>${i + 1}</td><td>${h(q.prompt)}</td><td>${ans == null ? '<span class="muted">No answer</span>' : h(q.options[ans])}${ok || ans == null ? "" : `<div class="xs muted">Right answer: ${h(q.options[q.answer])}</div>`}</td><td>${ans == null ? '<span class="chip">–</span>' : ok ? '<span class="chip good">✓</span>' : '<span class="chip bad">✗</span>'}</td></tr>`; }).join("")}
    </tbody></table></div></section>
  ${wr.length ? `<section class="card stack"><div class="card-h" style="margin:0"><div><h3>Section 2 · written answers</h3><p class="xs muted" style="margin-top:2px">Click each one to read the answer, the AI note and what a good answer has.</p></div></div>
    <div>${wr.map(([q, i]) => { const mk = m[q.id] || {}; const ans = a[q.id]; const wc = (String(ans || "").match(/\S+/g) || []).length;
      return `<details class="wr"><summary><span class="qno" style="font-size:18px">${String(i + 1).padStart(2, "0")}</span><span class="grow" style="font-weight:500">${h(q.prompt)}</span>${Number.isFinite(mk.score) ? `<span class="chip ${mk.score >= 7 ? "good" : mk.score >= 5 ? "warn" : "bad"}">${mk.ai ? "AI " : ""}${mk.score}/10</span>` : '<span class="chip warn">Not marked</span>'}<span class="xs muted">${wc} words</span></summary>
        <div class="rv">${q.context ? `<div class="hb-context">${q.context.split("\n").map((l) => `<div>${h(l)}</div>`).join("")}</div>` : ""}
        <div class="ans"><span class="k">Their answer</span><span style="white-space:pre-wrap">${h(ans || "No answer")}</span></div>
        ${mk.reason ? `<p class="why"><b>${mk.ai ? "AI note." : "Note."}</b> ${h(mk.reason)}</p>` : ""}
        <p class="why"><b>A good answer.</b> ${h(q.guide)}</p></div></details>`; }).join("")}</div></section>` : ""}`;
}
function partAOld(c) {
  const { h } = X; const qs = c.pack.timed.questions; const m = c.timed_marks || {}; const a = c.timed_answers || {};
  const nums = m._numbers;
  return `<section class="card stack"><div class="card-h" style="margin:0"><h3>Part A answers</h3>${nums ? `<span class="chip ${nums.right === nums.of ? "good" : nums.right >= nums.of / 2 ? "warn" : "bad"}">Numbers: ${nums.right} of ${nums.of} right</span>` : ""}</div>
    ${qs.map((q, i) => { const mk = m[q.id] || {}; const ans = a[q.id];
      return `<div class="rv"><div class="row between"><span class="qno" style="font-size:22px">${String(i + 1).padStart(2, "0")}</span>
        ${q.type === "single" ? (ans == null ? `<span class="chip">No answer</span>` : mk.correct ? `<span class="chip good">Correct</span>` : `<span class="chip bad">Wrong</span>`) : Number.isFinite(mk.score) ? `<span class="chip ${mk.score >= 7 ? "good" : mk.score >= 5 ? "warn" : "bad"}">${mk.ai ? "AI suggests " : ""}${mk.score}/10</span>` : `<span class="chip warn">Not marked</span>`}</div>
        ${q.context ? `<div class="hb-context">${q.context.split("\n").map((l) => `<div>${h(l)}</div>`).join("")}</div>` : ""}
        <p style="font-weight:500">${h(q.prompt)}</p>
        ${q.type === "single" ? `<div class="ans ${mk.correct ? "right" : "wrong"}"><span class="k">Their answer</span>${ans == null ? "No answer" : h(q.options[ans])}</div>${mk.correct ? "" : `<div class="ans model"><span class="k">Correct answer</span>${h(q.options[q.answer])}</div>`}`
          : `<div class="ans"><span class="k">Their answer · ${(String(ans || "").match(/\S+/g) || []).length} words</span><span style="white-space:pre-wrap">${h(ans || "No answer")}</span></div>${mk.reason ? `<p class="why"><b>${mk.ai ? "AI note." : "Note."}</b> ${h(mk.reason)}</p>` : ""}`}
        <details><summary class="small" style="cursor:pointer">What a good answer has</summary><p class="why" style="margin-top:8px">${h(q.guide)}</p></details></div>`; }).join("")}
  </section>`;
}
function partB(c) {
  const { h } = X; const th = c.takehome || {}; const tasks = c.pack.takehome.tasks;
  const item = (t) => { const fs = (th.files || []).filter((f) => f.task === t.id), ls = (th.links || []).filter((l) => l.task === t.id);
    return `<div class="hb-up"><b>${h(t.title)}</b>${fs.length || ls.length ? `<div class="up-list">${fs.map((f) => `<div class="up-item"><span class="chip">${h((f.name.split(".").pop() || "").toUpperCase())}</span>${H.files.urls[f.path] ? `<a class="grow" href="${h(H.files.urls[f.path])}" target="_blank" rel="noopener">${h(f.name)}</a>` : `<span class="grow">${h(f.name)}</span>`}</div>`).join("")}
      ${ls.map((l) => `<div class="up-item"><span class="chip accent">Link</span><a class="grow" href="${h(l.url)}" target="_blank" rel="noopener noreferrer">${h(l.url)}</a></div>`).join("")}</div>` : `<p class="small muted">Nothing handed in.</p>`}</div>`; };
  return `<section class="card stack"><div class="card-h" style="margin:0"><h3>Part B work</h3>${c.submitted_at ? `<span class="chip good">Submitted</span>` : `<span class="chip warn">Not submitted yet · draft</span>`}</div>
    ${tasks.map(item).join("")}${(th.files || []).some((f) => f.task === "other") ? item({ id: "other", title: "Other files" }) : ""}
    <div class="grid g-2"><div class="hb-box"><b>AI tools they declared</b><p class="small ink2" style="white-space:pre-wrap">${h(th.ai_tools || "Not filled in")}</p></div>
      <div class="hb-box"><b>Their note</b><p class="small ink2" style="white-space:pre-wrap">${h(th.note || "None")}</p></div></div>
    <p class="xs muted">Open links in a private window to check they work for anyone with the link. Paste one caption sentence into Google to spot copying.</p></section>`;
}
function suggestFor(c, t) {
  const m = c.timed_marks || {}; const qs = c.pack.timed.questions.filter((q) => q.task_id === t.id);
  const mcq = qs.filter((q) => q.type === "single" && m[q.id]);
  const wr = qs.filter((q) => q.type === "short").map((q) => m[q.id]?.score).filter(Number.isFinite);
  const parts = [];
  if (mcq.length) parts.push((10 * mcq.filter((q) => m[q.id].correct).length) / mcq.length);
  if (wr.length) parts.push(wr.reduce((a, b) => a + b, 0) / wr.length);
  return parts.length ? Math.round(parts.reduce((a, b) => a + b, 0) / parts.length) : null;
}
function scoreForm(c) {
  const { h } = X; const p = c.pack; const r = H.review; const s = computeScore(p, r);
  return `<section class="card stack" id="scoreform"><div class="card-h" style="margin:0"><div><h3>Scorecard</h3><p class="xs muted" style="margin-top:2px">${H.prefilled ? "Filled in automatically from the right answers. Check the captures, adjust if needed, then save." : "Score each area out of 10. Click the description that fits best, then adjust."}</p></div></div>
    ${p.scorecard.tasks.map((t) => { const v = r.scores[t.id]; const sug = suggestFor(c, t);
      return `<div class="sc-task"><div class="row between"><div><b style="font-size:15.5px">${h(t.title)}</b> <span class="xs muted">${hasB(p) ? (t.part === "timed" ? "Part A · " : "Part B · ") : ""}weight ${t.weight}</span></div>
        <div class="row" style="gap:8px">${sug != null ? `<span class="xs muted">AI suggests ${sug}</span>` : ""}<span class="sc-val">${Number.isFinite(v) ? v : "–"}<small>/10</small></span></div></div>
        <ul class="hb-list sc-look">${t.look_for.map((x) => `<li>${h(x)}</li>`).join("")}</ul>
        <div class="bands">${[[9, "9–10", t.band_10, "good"], [7, "6–8", t.band_7, "accent"], [4, "3–5", t.band_4, "warn"], [1, "0–2", t.band_1, "bad"]].map(([n, b, txt, k]) => { const on = Number.isFinite(v) && (n === 9 ? v >= 9 : n === 7 ? v >= 6 && v <= 8 : n === 4 ? v >= 3 && v <= 5 : v <= 2);
          return `<button class="band click ${on ? "on" : ""}" data-h="band" data-t="${h(t.id)}" data-n="${n}"><span class="chip ${k}">${b}</span><span class="small">${h(txt)}</span></button>`; }).join("")}</div>
        <div class="row" style="gap:4px">${Array.from({ length: 11 }, (_, n) => `<button class="sc-n ${v === n ? "on" : ""}" data-h="score" data-t="${h(t.id)}" data-n="${n}" aria-label="${n} out of 10">${n}</button>`).join("")}</div>
        <input class="input" placeholder="Notes (optional)" data-note="${h(t.id)}" value="${h(r.notes[t.id] || "")}"></div>`; }).join("")}
    <div class="sc-task"><b style="font-size:15.5px">Red flags</b><p class="xs muted">Any tick means Reject, whatever the score.</p>
      ${p.scorecard.red_flags.map((f, i) => `<label class="ck"><input type="checkbox" data-flag="${i}" ${r.flags.includes(i) ? "checked" : ""}> ${h(f)}</label>`).join("")}</div>
    <div class="sc-total"><div><span class="eyebrow">Total</span><div class="sc-big">${s.total}<small>/100</small></div><span class="xs muted">${s.scored} of ${s.of} tasks scored</span></div>
      <div class="grow stack-s">${s.rec ? `<div class="row"><span class="eyebrow">Scorecard says</span><span class="chip ${s.rec[1]}">${s.rec[0]}</span></div><span class="small ink2">${h(s.rec[2])}</span>` : `<span class="small muted">Score every task to see the recommendation.</span>`}</div></div>
    <div class="field"><label for="sc-sum">Summary for the team</label><textarea class="input" id="sc-sum" rows="3">${h(r.summary || "")}</textarea></div>
    <div class="row between"><div class="seg" role="group" aria-label="Decision">${[["hire", "Hire"], ["second_round", "Second round"], ["rejected", "Reject"]].map(([k, l]) => `<button class="${r.decision === k ? "on" : ""}" data-h="decide" data-k="${k}">${l}</button>`).join("")}</div>
      <button class="btn primary" data-h="save-review">Save review</button></div>
  </section>`;
}
function followups(c) {
  const { h } = X;
  return `<section class="card stack"><div class="card-h" style="margin:0"><div><h3>Review call: follow-up questions</h3><p class="xs muted" style="margin-top:2px">20 minutes. Ask them to share their screen and open their own files. Notes save with the review.</p></div></div>
    ${c.pack.followups.map((f, i) => `<div class="rv"><p style="font-weight:500">${i + 1}. ${h(f.q)}</p><p class="why"><b>Listen for.</b> ${h(f.listen_for)}</p>
      <textarea class="input" rows="2" placeholder="What they said" data-fu="${i}">${h(H.review.followups[i] || "")}</textarea></div>`).join("")}
    <div class="row end"><button class="btn primary" data-h="save-review">Save review</button></div></section>`;
}
function readReview() {
  const r = H.review;
  document.querySelectorAll("[data-note]").forEach((el) => { r.notes[el.dataset.note] = el.value; });
  document.querySelectorAll("[data-fu]").forEach((el) => { r.followups[el.dataset.fu] = el.value; });
  r.flags = [...document.querySelectorAll("[data-flag]")].filter((el) => el.checked).map((el) => +el.dataset.flag);
  const sum = document.getElementById("sc-sum"); if (sum) r.summary = sum.value;
  return r;
}
function repaintScore() { readReview(); const y = scrollY; const el = document.getElementById("scoreform"); if (!el) return; el.outerHTML = scoreForm(H.cand); bindScoreForm(); scrollTo({ top: y }); }
function bindScoreForm() { document.querySelectorAll("[data-flag]").forEach((el) => el.addEventListener("change", repaintScore)); }

/* ============================================================ events */
document.addEventListener("click", async (e) => {
  const el = e.target.closest("[data-h]"); if (!el || !X) return;
  const d = el.dataset;
  switch (d.h) {
    case "close": return X.closeModal();
    case "copy": try { await navigator.clipboard.writeText(d.v); X.toast("Copied."); } catch { X.toast("Couldn't copy. Select the text and copy it."); } return;
    case "pack-tab": { const pack = d.where === "draft" ? H.draft.pack : null; if (!pack) return; document.querySelectorAll('[data-h="pack-tab"]').forEach((b) => b.classList.toggle("on", b === el)); document.getElementById("pack-body").innerHTML = packBody(pack, d.k); return; }
    case "draft-discard": H.draft = null; return renderNew();
    case "draft-redo": H.draft = null; return renderNew({ form: true });
    case "invite": return inviteModal(d.id);
    case "pack-save": {
      let pack; try { pack = JSON.parse(document.getElementById("pack-json").value); } catch (x) { document.getElementById("pack-err").innerHTML = `<div class="notice bad">That isn't valid JSON: ${X.h(x.message)}</div>`; return; }
      if (!pack?.timed?.questions || !pack?.takehome?.tasks || !pack?.scorecard?.tasks) { document.getElementById("pack-err").innerHTML = `<div class="notice bad">Keep the timed, takehome and scorecard sections.</div>`; return; }
      const r = H.data.roles.find((x) => x.id === d.id);
      try { await X.HAPI.saveRole({ ...r, title: pack.role_title || r.title, summary: pack.summary || r.summary, pack }); await load(); X.toast("Saved."); renderRole(d.id, "edit"); } catch (x) { X.toast(x.message); }
      return;
    }
    case "new-link": {
      if (d.armed !== "1") { el.dataset.armed = "1"; el.textContent = "Old link stops working. Click again"; setTimeout(() => { if (el.isConnected) { el.dataset.armed = ""; el.textContent = "New link"; } }, 4000); return; }
      try { const out = await X.HAPI.newLink(H.cand.id); linkModal(H.cand.full_name, H.cand.email, out.token); } catch (x) { X.toast(x.message); } return;
    }
    case "extend": try { const hrs = hasB(H.cand.pack) ? 24 : 72; await X.HAPI.extend(H.cand.id, hrs); X.toast(hrs === 24 ? "Deadline extended by 24 hours." : "They now have 3 more days to start."); return renderCand(H.cand.id); } catch (x) { X.toast(x.message); } return;
    case "cap-filter": H.capFilter = d.k; readReview(); return paintCand();
    case "cap-open": { const u = H.files.urls[d.path]; const x = (H.files.captures || []).find((y) => y.path === d.path); if (!u) return;
      X.modal(`<div class="stack"><div class="row between"><b>${x?.kind === "cam" ? "Camera" : "Screen"} · ${X.fmtClock((x?.t || 0) * 1000)}${x && !["interval", "start"].includes(x.reason) ? ` · ${X.h(x.reason)}` : ""}</b><button class="btn sm" data-h="close">Close</button></div><img src="${X.h(u)}" alt="" style="width:100%;border-radius:10px"></div>`);
      document.querySelector("#modal .modal")?.classList.add("wide"); return; }
    case "band": { const n = +d.n; const cur = H.review.scores[d.t]; const inBand = Number.isFinite(cur) && (n === 9 ? cur >= 9 : n === 7 ? cur >= 6 && cur <= 8 : n === 4 ? cur >= 3 && cur <= 5 : cur <= 2); if (!inBand) H.review.scores[d.t] = n; return repaintScore(); }
    case "score": H.review.scores[d.t] = +d.n; return repaintScore();
    case "decide": readReview(); H.review.decision = H.review.decision === d.k ? null : d.k; return repaintScore();
    case "save-review": try { await X.HAPI.review(H.cand.id, readReview()); X.toast("Review saved."); H.cand = await X.HAPI.candidate(H.cand.id); H.review = JSON.parse(JSON.stringify(H.cand.review)); H.review.scores ||= {}; H.review.notes ||= {}; H.review.flags ||= []; H.review.followups ||= {}; await load(); paintCand(); } catch (x) { X.toast(x.message); } return;
    case "purge": case "delete-cand": {
      if (d.armed !== "1") { el.dataset.armed = "1"; const old = el.textContent; el.textContent = "Can't be undone. Click again"; setTimeout(() => { if (el.isConnected) { el.dataset.armed = ""; el.textContent = old; } }, 4000); return; }
      try { if (d.h === "purge") { await X.HAPI.purge(H.cand.id); X.toast("Captures deleted."); return renderCand(H.cand.id); } const rid = H.cand.role_id; await X.HAPI.remove(H.cand.id); X.toast("Candidate deleted."); return X.go(`#/hiring/role/${rid}`); } catch (x) { X.toast(x.message); } return;
    }
  }
});
document.addEventListener("change", async (e) => {
  const el = e.target.closest('[data-h="role-status"]'); if (!el || !X) return;
  const r = H.data.roles.find((x) => x.id === el.dataset.id);
  try { await X.HAPI.saveRole({ ...r, status: el.value }); await load(); X.toast("Status updated."); renderRole(r.id); } catch (x) { X.toast(x.message); }
});
