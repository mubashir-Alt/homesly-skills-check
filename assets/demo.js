// Demo mode: an in-memory stand-in for the server so the design can be previewed
// before Supabase is connected. Open the site with ?demo. Nothing is saved.
// Sign in as manager@…, sai@… or any other @homeslystays.com address (Harshith).

const DOMAIN = "homeslystays.com";
const SAMPLE = [
  { id: "d1", site: "core", area: "seo", level: 1, type: "single", prompt: "Which schema type best describes a hotel's homepage for search engines?", options: ["Hotel", "Article", "Product", "Event"], answer: 0, explanation: "Hotel (a LodgingBusiness) carries address, check-in times and amenities that search engines show in rich results.", source: "Demo question" },
  { id: "d2", site: "core", area: "speed", level: 2, type: "multi", prompt: "Which changes reduce how long a phone takes to show the first screen?", options: ["Serving background photos as WebP", "Loading only the fonts a page uses", "Adding a second slider plugin", "Delaying chat widget scripts until after load"], answer: [0, 1, 3], explanation: "Smaller images, fewer font files and deferred third-party scripts all shorten the critical path.", source: "Demo question" },
  { id: "d3", site: "core", area: "consent-tracking", level: 2, type: "truefalse", prompt: "A Meta pixel may load before the visitor accepts advertising cookies, as long as it doesn't fire events.", options: ["True", "False"], answer: 1, explanation: "Loading the pixel already sets cookies and sends a request, so it must wait for consent.", source: "Demo question" },
  { id: "d4", site: "core", area: "leads-booking", level: 3, type: "order", prompt: "Put the booking enquiry flow in order.", options: ["Guest clicks Book now", "Availability popup opens with the room name", "Form is validated and checked for spam", "Lead is sent to the CRM", "Guest continues to the booking engine"], explanation: "The lead is captured before the guest leaves for the booking engine.", source: "Demo question" },
  { id: "d5", site: "core", area: "mobile-ux", level: 1, type: "single", prompt: "What is the minimum comfortable tap target size used on the hotel sites?", options: ["24px", "32px", "44px", "60px"], answer: 2, explanation: "44px is the common minimum for comfortable tapping on phones.", source: "Demo question" },
  { id: "d6", site: "core", area: "snippets", level: 3, type: "short", prompt: "Explain why site-specific fixes live in separate, named code snippets instead of the theme's functions.php.", rubric: { model: "Separate snippets survive theme updates, can be switched off individually when something breaks, and document what each fix does.", points: ["Survives theme updates", "Can be disabled one at a time", "Self-documenting"] }, explanation: "Small named snippets make changes reversible and easy to audit.", source: "Demo question" },
  { id: "d7", site: "core", area: "page-building", level: 2, type: "single", prompt: "Why rebuild a page with native Elementor widgets instead of one big HTML widget?", options: ["Editors can change text without touching code", "It always loads faster", "HTML widgets are not allowed on WordPress", "It removes the need for a theme"], answer: 0, explanation: "Native widgets keep content editable for non-developers.", source: "Demo question" },
  { id: "d8", site: "core", area: "content-accuracy", level: 1, type: "single", prompt: "A page says 'Rated 4.5 by 500+ guests' but Google shows 4.4 from 327 reviews. What should you do?", options: ["Leave it; it's close", "Round the Google badge up", "Flag it and update the claim to match real figures", "Remove the Google badge"], answer: 2, explanation: "Public claims must match verifiable figures.", source: "Demo question" },
];
const today = () => new Date().toLocaleDateString("en-CA");
const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toLocaleDateString("en-CA"); };
const store = { session: null, tests: [], staff: [
  { email: "manager@" + DOMAIN, full_name: "Homesly Manager", role: "manager", emp_key: null },
  { email: "harshith@" + DOMAIN, full_name: "Harshith", role: "employee", emp_key: "harshith" },
  { email: "sai@" + DOMAIN, full_name: "Sai Lakshmi", role: "employee", emp_key: "sai" },
] };
const AREA_KEYS = ["page-building", "snippets", "seo", "speed", "consent-tracking", "leads-booking", "mobile-ux", "content-accuracy"];
function fakeStats(emp, seed) {
  const history = []; for (let i = 18; i >= 1; i--) { if ((i + seed) % 6 === 0) continue; history.push({ date: daysAgo(i), pct: Math.min(96, 48 + Math.round((18 - i) * 2.3) + ((i * 7 + seed) % 11)), pending: 0 }); }
  const area_stats = {}; AREA_KEYS.forEach((a, i) => { const m = 20 + ((i * 5 + seed) % 14); area_stats[a] = { m, e: Math.round(m * (0.45 + ((i * 13 + seed * 7) % 50) / 100)) }; });
  return { user_id: emp + "-uid", email: emp + "@" + DOMAIN, emp_key: emp, seen_ids: Array.from({ length: 40 + seed * 9 }, (_, i) => "q" + i), wrong_ids: ["a", "b", "c", "d", "e"].slice(0, 3 + seed), used_facts: [], area_stats, history };
}
const stats = { harshith: fakeStats("harshith", 1), sai: fakeStats("sai", 2) };
for (const emp of ["harshith", "sai"]) for (const hEntry of stats[emp].history.slice(-6)) {
  store.tests.push(makeDone(emp, hEntry.date, hEntry.pct));
}
function makeDone(emp, date, p) {
  const qs = SAMPLE.map((q) => ({ ...q }));
  const grades = {}; qs.forEach((q, i) => (grades[q.id] = { f: (i * 37 + p) % 100 < p ? 1 : 0, by: "auto" }));
  const answers = {}; qs.forEach((q) => (answers[q.id] = grades[q.id].f ? q.answer : q.type === "single" ? (q.answer + 1) % 4 : q.answer));
  const t = { id: `${emp}-${date}`, user_id: emp + "-uid", email: emp + "@" + DOMAIN, emp_key: emp, kind: "daily", test_date: date, status: "done",
    started_at: date + "T09:00:00Z", deadline_at: date + "T09:25:00Z", submitted_at: date + "T09:17:42Z", auto_submitted: false,
    questions_public: qs.map(pub), answers, conf: {}, flags: {}, integrity: { tabAways: 0, pastes: 0 }, cur: 0, grades, review: qs.map((q) => ({ ...pub(q), answer: q.answer ?? null, correct: q.type === "order" ? q.options : null, rubric: q.rubric || null, explanation: q.explanation, source: q.source })), _q: qs };
  t.score = score(qs, grades, {}); return t;
}
function pub(q) { return { id: q.id, site: q.site, area: q.area, level: q.level, type: q.type, prompt: q.prompt, code: q.code || null, options: q.options || null, ai: !!q.ai }; }
function score(qs, grades, conf) {
  let e = 0, m = 0, pending = 0; const byArea = {}, bySite = {}, confWrong = [];
  for (const q of qs) { const g = grades[q.id]; if (!g || g.f == null) { pending++; continue; } e += g.f * q.level; m += q.level; (byArea[q.area] ||= { e: 0, m: 0 }); byArea[q.area].e += g.f * q.level; byArea[q.area].m += q.level; (bySite[q.site] ||= { e: 0, m: 0 }); bySite[q.site].e += g.f * q.level; bySite[q.site].m += q.level; if (g.f < 0.5 && conf[q.id] === "sure") confWrong.push(q.id); }
  return { e: Math.round(e * 100) / 100, m, pct: m ? Math.round((100 * e) / m) : 0, pending, byArea, bySite, confWrong };
}
function grade(q, a) {
  if (q.type === "short") return a && String(a).trim().length > 40 ? 0.75 : a ? 0.25 : 0;
  if (q.type === "single" || q.type === "truefalse") return a === q.answer ? 1 : 0;
  if (q.type === "multi") { const s = new Set(a || []), c = new Set(q.answer); let hit = 0, miss = 0; s.forEach((i) => (c.has(i) ? hit++ : miss++)); return Math.max(0, (hit - miss) / c.size); }
  if (q.type === "order") { const arr = a || q._shuffled; let r = 0; arr.forEach((t, i) => { if (t === q.options[i]) r++; }); return r === arr.length ? 1 : Math.round((r / arr.length) * 50) / 100; }
  return 0;
}
const me = () => store.staff.find((s) => s.email === store.session?.user.email);
// Demo work week: this week's Monday, as if the Friday refresh had run.
function demoWeeks() {
  const d = new Date(today() + "T00:00:00Z"); const mon = new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * 86400000).toISOString().slice(0, 10);
  const plus = (n) => new Date(new Date(mon + "T00:00:00Z").getTime() + n * 86400000).toISOString().slice(0, 10);
  return [
    { emp_key: "harshith", week: mon, from_date: mon, to_date: plus(3), commits: 14, new_questions: 12, loaded_at: new Date().toISOString(), summary: "Demo week: faster hero images on The George, a fixed booking popup on the County Hotel and new FAQ schema on the Hampton.", highlights: ["Converted hero images to WebP and added width/height", "Fixed the Book Now popup closing on iPhone", "Added FAQPage schema to the Hampton FAQ page"] },
    { emp_key: "sai", week: mon, from_date: mon, to_date: plus(3), commits: 9, new_questions: 10, loaded_at: new Date().toISOString(), summary: "Demo week: a new enquiry form on Coach House and cookie-consent fixes on Central Hotel.", highlights: ["Built the group-booking enquiry form", "Consent Mode now waits for the banner choice"] },
  ];
}
const DEMO_BOOK = (emp) => ({
  title: "Demo study guide", intro: "This is **demo mode**. The real textbook loads from the server once it's imported.\n\nRead one chapter a day before your test. Each chapter ends with a short self-check.",
  syllabus: [{ area: "leads-booking", weight: 30, topics: ["Booking popup", "CRM webhooks"] }, { area: "speed", weight: 25, topics: ["WebP images", "Font loading"] }, { area: "seo", weight: 20, topics: ["Hotel schema", "Titles"] }, { area: "consent-tracking", weight: 15, topics: ["Cookie consent"] }, { area: "mobile-ux", weight: 10, topics: ["Tap targets"] }],
  chapters: [
    { id: emp + "-d1", site: "core", title: "How a booking becomes a lead", summary: "Why Book buttons open a popup first.", minutes: 6, areas: ["leads-booking"], sections: [{ heading: "The idea", body: "When a guest clicks **Book now**, the site opens a short form before the booking engine.\n\n- The guest's details reach the CRM even if they don't finish booking.\n- The popup can show which room they picked.", keyPoints: ["Capture the lead before the guest leaves the site"], code: { lang: "js", snippet: "document.querySelectorAll('.book-now').forEach(b => b.addEventListener('click', openPopup));", caption: "Every Book button opens the same popup." } }], checklist: ["Click every Book button on a phone"], glossary: [{ term: "Lead", definition: "A guest's contact details saved in the CRM." }], selfCheck: [{ q: "What is lost if Book buttons go straight to the booking engine?", a: "Guests who abandon the booking leave no contact details, so the team can't follow up." }] },
    { id: emp + "-d2", site: "core", title: "Fast pages on phones", summary: "Images, fonts and scripts.", minutes: 5, areas: ["speed"], sections: [{ heading: "What slows a phone down", body: "Large photos, unused fonts and blocking scripts.", keyPoints: ["Serve WebP", "Load only needed fonts"] }], checklist: [], glossary: [], selfCheck: [] },
  ],
});
const demoReads = [];

export const demoApi = {
  async signIn(email) { store.session = { user: { id: (email.split("@")[0].startsWith("sai") ? "sai" : email.startsWith("manager") || email.startsWith("support") ? "manager" : "harshith") + "-uid", email } }; },
  async signOut() { store.session = null; },
  async session() { return store.session; },
  async myStaff(email) {
    const s = store.staff.find((x) => x.email === email);
    if (s) return s;
    const local = email.split("@")[0];
    if (local.startsWith("sai")) return store.staff[2];
    if (local.startsWith("manager") || local.startsWith("support")) return store.staff[0];
    return store.staff[1];
  },
  async loadEmployee(uid, emp) {
    const weeks = demoWeeks().filter((w) => w.emp_key === emp);
    const sites = { harshith: [["thegeorgehotel.uk", "The George Hotel", "Montrose"], ["stationhotelportsoy.co.uk", "Station Hotel", "Portsoy"], ["countyselkirk.com", "County Hotel", "Selkirk"], ["thehamptonhotel.co.uk", "The Hampton Hotel", "Llandrindod Wells"], ["thewoodmaninnburneston.com", "The Woodman Inn", "Burneston"]], sai: [["homeslystays.com", "Homesly Stays", "Berwick-upon-Tweed"], ["coachhouseotterburn.co.uk", "Coach House", "Otterburn"], ["centralhotel.uk", "Central Hotel", "Gloucester"]] }[emp];
    const facts = sites.flatMap(([d], i) => AREA_KEYS.slice(0, 5).map((a, j) => ({ id: `${d}-${j}`, site: d, area: a, fact: `Demo note ${j + 1} for ${d}: the real study notes show here once the knowledge base is imported.`, source: "Demo" })));
    return { weeks, books: [{ emp_key: emp, data: DEMO_BOOK(emp) }], reads: demoReads, stats: stats[emp], tests: store.tests.filter((t) => t.emp_key === emp).sort((a, b) => b.test_date.localeCompare(a.test_date)), facts, sites: sites.map(([domain, name, place]) => ({ domain, name, place, summary: "Demo summary. The real site summary comes from the knowledge base.", stack: "WordPress, Elementor, WPCode, Cloudbeds, GoHighLevel" })) };
  },
  async loadManager() {
    const bank = []; ["harshith", "sai"].forEach((emp, k) => { for (let i = 0; i < (emp === "harshith" ? 98 : 90); i++) bank.push({ id: emp + i, emp_key: emp, site: emp === "harshith" ? ["thegeorgehotel.uk", "stationhotelportsoy.co.uk", "countyselkirk.com", "thehamptonhotel.co.uk", "thewoodmaninnburneston.com", "core"][i % 6] : ["homeslystays.com", "coachhouseotterburn.co.uk", "centralhotel.uk", "core"][i % 4], area: AREA_KEYS[(i * 3 + k) % 8], level: (i % 3) + 1, type: i % 5 === 0 ? "short" : "single", retired: false }); });
    return { weeks: demoWeeks(), books: [{ emp_key: "harshith", data: DEMO_BOOK("harshith") }, { emp_key: "sai", data: DEMO_BOOK("sai") }], reads: [], staff: store.staff, tests: store.tests.slice().sort((a, b) => b.test_date.localeCompare(a.test_date)), stats: [stats.harshith, stats.sai], bank };
  },
  async getTest(id) { return store.tests.find((t) => t.id === id) || null; },
  async start(practiceAs) {
    const s = me(); const emp = practiceAs || s.emp_key;
    const existing = !practiceAs && store.tests.find((t) => t.emp_key === emp && t.test_date === today() && t.kind === "daily");
    if (existing) return existing;
    await new Promise((r) => setTimeout(r, 900));
    const qs = SAMPLE.map((q) => ({ ...q, ai: q.id === "d2" || q.id === "d7" }));
    const shuffled = {}; const pubQs = qs.map((q) => { const p = pub(q); if (q.type === "order") { p.options = q.options.slice().reverse(); q._shuffled = p.options; } return p; });
    const t = { id: `${emp}-${practiceAs ? "practice-" + Date.now() : today()}`, user_id: store.session.user.id, email: store.session.user.email, emp_key: emp, kind: practiceAs ? "practice" : "daily", test_date: today(), status: "in_progress", started_at: new Date().toISOString(), deadline_at: new Date(Date.now() + 25 * 60000).toISOString(), questions_public: pubQs, answers: {}, conf: {}, flags: {}, integrity: { tabAways: 0, pastes: 0 }, cur: 0, _q: qs };
    store.tests.push(t); return t;
  },
  async save() { return true; },
  async markRead(ch) { if (!demoReads.some((r) => r.chapter_id === ch)) demoReads.push({ chapter_id: ch, read_at: new Date().toISOString() }); },
  async submit(x, auto) {
    const t = store.tests.find((y) => y.id === x.id); Object.assign(t, { answers: x.answers, conf: x.conf, flags: x.flags, integrity: x.integrity });
    await new Promise((r) => setTimeout(r, 900));
    const grades = {}; t._q.forEach((q) => (grades[q.id] = { f: grade(q, t.answers[q.id]), by: q.type === "short" ? "ai" : "auto", feedback: q.type === "short" ? "Demo feedback: good start; name why each benefit matters." : undefined }));
    Object.assign(t, { status: "done", submitted_at: new Date().toISOString(), auto_submitted: !!auto, grades, score: score(t._q, grades, t.conf), review: t._q.map((q) => ({ ...pub(q), answer: q.answer ?? null, correct: q.type === "order" ? q.options : null, rubric: q.rubric || null, explanation: q.explanation, source: q.source })) });
    if (t.kind === "daily") stats[t.emp_key].history.push({ date: t.test_date, pct: t.score.pct, pending: 0 });
    return t;
  },
  async mark(testId, qid, f) { const t = store.tests.find((y) => y.id === testId); t.grades[qid] = { ...(t.grades[qid] || {}), f, by: "manager" }; t.score = score(t._q, t.grades, t.conf); return t; },
  async staffSave(row) { const i = store.staff.findIndex((s) => s.email === row.email); if (i >= 0) store.staff[i] = row; else store.staff.push(row); },
  async staffDelete(email) { store.staff = store.staff.filter((s) => s.email !== email); },
};

/* ============================================================ hiring (demo) */
// Roles and candidates are kept in this browser's localStorage so a candidate link opened in another tab
// still works. Captures and uploads stay in memory (this tab only). Nothing leaves the browser.
const HK = "hsc-demo-hiring-v2";
const hs = (() => { try { return JSON.parse(localStorage.getItem(HK)) || null; } catch { return null; } })() || { roles: [], cands: [] };
const persist = () => { try { localStorage.setItem(HK, JSON.stringify(hs)); } catch { /* private mode */ } };
const blobs = {}; const caps = {};
const isoNow = (ms = Date.now()) => new Date(ms).toISOString();
const hasBd = (c) => (c.pack?.takehome?.tasks || []).length > 0;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const MINI_PACK = {
  role_title: "Demo role", summary: "A small sample assessment for previewing the hiring screens.",
  intro: "This is **demo mode**. The real role packs load from the server.",
  scenario: { name: "Coach House, Otterburn", type: "Country inn", location: "Otterburn, Northumberland", about: "Demo scenario.", guests: ["Walkers", "Couples"], social_now: ["Demo situation"], budget: "£300 per month", offer: "Demo offer", facts: ["Demo fact"], note: "Demo details." },
  timed: { minutes: 20, intro: "Two quick demo questions.", questions: [
    { id: "a1", section: "A", task_id: "t2", type: "single", prompt: "£100 spent, 10 leads. What is the cost per lead?", context: "", options: ["£1", "£10", "£100", "£0.10"], answer: 1, max_words: 0, guide: "£100 ÷ 10 = £10." },
    { id: "a2", section: "B", task_id: "t1", type: "short", prompt: "Reply to a guest who says the Wi-Fi was slow.", context: "", options: [], answer: -1, max_words: 80, guide: "Thank, apologise, say what's being fixed, invite them back." } ] },
  takehome: { hours: 0, effort: "", intro: "", tasks: [] },
  submission: "", rules: ["Demo rule"],
  scorecard: { tasks: [
    { id: "t1", title: "Captions", part: "takehome", weight: 60, look_for: ["Three captions"], band_10: "Excellent", band_7: "Good", band_4: "Weak", band_1: "Missing" },
    { id: "t2", title: "Part A", part: "timed", weight: 40, look_for: ["Correct number", "Kind reply"], band_10: "Excellent", band_7: "Good", band_4: "Weak", band_1: "Missing" } ],
    red_flags: ["Missed the deadline"], decision: { hire_min: 75, second_min: 55, notes: "Demo rule: 75+ hire, 55-74 second round." } },
  followups: [{ q: "Talk me through your first caption.", listen_for: "Clear reasons." }],
};
async function samplePack() {
  try { const r = await fetch("private-bank/roles/social-media-marketing-executive.json", { cache: "no-store" }); if (r.ok) return await r.json(); } catch { /* not available on the public site */ }
  return { id: "demo-role", ...MINI_PACK };
}
let seeding = null;
function seed() { return (seeding ||= doSeed()); }
async function doSeed() {
  if (hs.roles.length) return;
  const { id, ...pack } = await samplePack();
  const rid = id || "demo-role";
  hs.roles.push({ id: rid, title: pack.role_title, summary: pack.summary, status: "live", pack, created_at: isoNow() });
  // One finished candidate so the review screen has something to show.
  const t0 = Date.now() - 30 * 3600_000; const answers = {};
  const reply = "Thank you for letting us know, and I am really sorry the room was cold and the radiator was not fixed after you asked twice. That is not the stay we want for anyone. We have had the radiator replaced and reminded the team to act on requests straight away. Please email our manager directly so we can put this right. Kind regards, the Station Hotel team";
  pack.timed.questions.forEach((q, i) => { answers[q.id] = q.type === "single" ? (i % 3 === 2 ? (q.answer + 1) % q.options.length : q.answer) : reply; });
  const marks = {}; pack.timed.questions.forEach((q) => { marks[q.id] = q.type === "single" ? { correct: answers[q.id] === q.answer, answered: true } : { score: 7, reason: "Demo: warm and specific, but could name the guest and keep it shorter.", ai: true }; });
  const single = pack.timed.questions.filter((q) => q.type === "single"); marks._numbers = { right: single.filter((q) => marks[q.id].correct).length, of: single.length };
  hs.cands.push({
    id: "demo-cand-1", token: "demo-token-priya-000000000", role_id: rid, full_name: "Priya Sharma", email: "priya@example.com", phone: "", cv_path: null, notes: "Demo candidate. Strong Canva portfolio; less ads experience.",
    pack, link_expires_at: isoNow(t0 + 14 * 86400_000), status: "submitted", accepted_at: isoNow(t0), deadline_at: isoNow(t0 + 48 * 3600_000), consent: { rules: true },
    timed_started_at: isoNow(t0 + 3600_000), timed_deadline_at: isoNow(t0 + 3600_000 + pack.timed.minutes * 60_000), timed_submitted_at: isoNow(t0 + 3600_000 + 46 * 60_000), timed_auto: false,
    timed_answers: answers, timed_marks: marks,
    integrity: { strikes: 1, tabAways: 1, pastes: 1, events: [{ t: 0, type: "start", detail: "Assessment started with camera ok" }, { t: 612, type: "paste-blocked", detail: "Tried to paste" }, { t: 1385, type: "left-page", detail: "Left the test page for 4 seconds", strike: 1, dur: 4 }] },
    devices: [{ ip: "203.0.113.10", ua: "Chrome", at: isoNow(t0) }],
    takehome: { files: [], links: pack.takehome.tasks.map((t) => ({ task: t.id, url: "https://example.com/demo-" + t.id })), ai_tools: "Task 1: ChatGPT for first drafts of captions, then rewritten. Task 3: HeyGen avatar, ElevenLabs voice, CapCut auto-captions.", note: "I assumed the restaurant is open every evening in December.", declared: true },
    submitted_at: isoNow(t0 + 40 * 3600_000), review: {}, created_at: isoNow(t0 - 86400_000),
  });
  persist();
}
const pubPack = (p) => ({ role_title: p.role_title, intro: p.intro, scenario: p.scenario, submission: p.submission, rules: p.rules, takehome: p.takehome,
  timed: { minutes: p.timed.minutes, intro: p.timed.intro, questions: p.timed.questions.map((q) => ({ id: q.id, section: q.section, type: q.type, prompt: q.prompt, context: q.context, options: q.options, max_words: q.max_words })) } });
function view(c) {
  const t = Date.now(); const open = !!c.timed_started_at && !c.timed_submitted_at;
  return { id: c.id, full_name: c.full_name, status: c.status, accepted_at: c.accepted_at, deadline_at: c.deadline_at, link_expires_at: c.link_expires_at, timed_started_at: c.timed_started_at, timed_deadline_at: c.timed_deadline_at,
    timed_submitted_at: c.timed_submitted_at, timed_answers: open ? c.timed_answers : undefined, integrity: open ? c.integrity : undefined, takehome: c.takehome, submitted_at: c.submitted_at, server_now: isoNow(),
    expired: !c.accepted_at ? new Date(c.link_expires_at).getTime() < t : new Date(c.deadline_at).getTime() < t && !c.submitted_at, pack: pubPack(c.pack) };
}
const byTok = (token) => { const c = hs.cands.find((x) => x.token === token); if (!c) throw new Error("This assessment link isn't valid (demo links only work in the browser that created them)."); return c; };
const stripCand = ({ token, ...c }) => c;
function finishTimed(c, auto) {
  const qs = c.pack.timed.questions; const m = {};
  qs.forEach((q) => { const a = c.timed_answers[q.id]; if (q.type === "single") m[q.id] = { correct: a === q.answer, answered: a != null }; else { const w = (String(a || "").match(/\S+/g) || []).length; m[q.id] = w ? { score: Math.min(9, 3 + Math.round(w / 15)), reason: "Demo suggestion based on length only. Live mode uses Claude and the marking guide.", ai: true } : { score: 0, reason: "No answer given." }; } });
  const single = qs.filter((q) => q.type === "single"); m._numbers = { right: single.filter((q) => m[q.id].correct).length, of: single.length };
  Object.assign(c, { timed_marks: m, timed_auto: !!auto, timed_submitted_at: isoNow() }, hasBd(c) ? { status: "part_a_done" } : { status: "submitted", submitted_at: isoNow() });
}

export const demoHiring = {
  async load() { await seed(); return { roles: hs.roles, candidates: hs.cands.map(stripCand) }; },
  async saveRole(r) { const i = hs.roles.findIndex((x) => x.id === r.id); const row = { ...(hs.roles[i] || { created_at: isoNow() }), ...r, updated_at: isoNow() }; if (i >= 0) hs.roles[i] = row; else hs.roles.unshift(row); persist(); },
  async generate() { await wait(2500); const { id: _ignore, ...p } = await samplePack(); return JSON.parse(JSON.stringify(p)); },
  async invite({ cv, ...row }) {
    const role = hs.roles.find((r) => r.id === row.role_id); const token = "demo" + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    const id = "demo-" + Date.now();
    hs.cands.unshift({ id, token, role_id: role.id, full_name: row.full_name, email: row.email || null, phone: row.phone || null, notes: row.notes || null, cv_path: cv ? `cv/${id}/${cv.name}` : null, pack: role.pack,
      link_expires_at: isoNow(Date.now() + 7 * 86400_000), status: "invited", timed_answers: {}, integrity: {}, devices: [], takehome: { files: [], links: [] }, review: {}, created_at: isoNow() });
    if (cv) blobs[`cv/${id}/${cv.name}`] = URL.createObjectURL(cv);
    persist(); return { id, token };
  },
  async newLink(id) { const c = hs.cands.find((x) => x.id === id); c.token = "demo" + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2); c.link_expires_at = isoNow(Date.now() + 14 * 86400_000); persist(); return { token: c.token }; },
  async extend(id, hours) { const c = hs.cands.find((x) => x.id === id); c.deadline_at = isoNow(Math.max(Date.now(), new Date(c.deadline_at).getTime()) + hours * 3600_000); persist(); },
  async candidate(id) { await seed(); const c = hs.cands.find((x) => x.id === id); return c ? stripCand(JSON.parse(JSON.stringify(c))) : null; },
  async files(id) { const list = caps[id] || []; const urls = {}; Object.keys(blobs).forEach((k) => { if (k.includes(id)) urls[k] = blobs[k]; }); return { urls, captures: list }; },
  async review(id, review) { const c = hs.cands.find((x) => x.id === id); c.review = { ...review, reviewed_at: isoNow() }; if (review.decision) c.status = review.decision; persist(); },
  async purge(id) { delete caps[id]; },
  async remove(id) { hs.cands = hs.cands.filter((x) => x.id !== id); persist(); },
  async cOpen(token) { await seed(); return { cand: view(byTok(token)) }; },
  async cAccept(token, consent) { const c = byTok(token); if (!c.accepted_at) Object.assign(c, { accepted_at: isoNow(), deadline_at: hasBd(c) ? isoNow(Date.now() + 48 * 3600_000) : c.link_expires_at, status: "accepted", consent }); persist(); return { cand: view(c) }; },
  async cStart(token) {
    const c = byTok(token);
    if (!c.timed_started_at) Object.assign(c, { timed_started_at: isoNow(), timed_deadline_at: isoNow(Date.now() + c.pack.timed.minutes * 60_000), status: "part_a" });
    else if (!c.timed_submitted_at && Date.now() > new Date(c.timed_deadline_at).getTime()) finishTimed(c, true);
    persist(); return { cand: view(c) };
  },
  async cSave(token, answers, integrity) { const c = byTok(token); if (c.timed_submitted_at) return { ok: false }; c.timed_answers = answers; if (integrity) c.integrity = integrity; persist(); return { ok: true }; },
  async cSubmitTimed(token, answers, integrity, auto) { const c = byTok(token); if (!c.timed_submitted_at) { c.timed_answers = answers; c.integrity = integrity || c.integrity; finishTimed(c, auto); persist(); } return { cand: view(c) }; },
  async cCapture(token, kind, reason, t, blob) { const c = byTok(token); const path = `captures/${c.id}/${kind}-${Date.now()}.jpg`; blobs[path] = URL.createObjectURL(blob); (caps[c.id] ||= []).push({ kind, reason, t, path }); },
  async cUpload(token, task, file) { const c = byTok(token); await wait(400); const path = `submissions/${c.id}/${task}-${Date.now()}-${file.name}`; blobs[path] = URL.createObjectURL(file); return path; },
  async cSaveTakehome(token, takehome) { const c = byTok(token); c.takehome = JSON.parse(JSON.stringify(takehome)); persist(); return { cand: view(c) }; },
  async cSubmit(token, takehome) { const c = byTok(token); if (!c.timed_submitted_at) throw new Error("Please finish Part A before you submit."); Object.assign(c, { takehome: JSON.parse(JSON.stringify(takehome)), submitted_at: isoNow(), status: "submitted" }); persist(); return { cand: view(c) }; },
};
