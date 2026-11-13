// Homesly Skills Check — browser app.
import { CONFIG } from "./config.js";
import { Proctor, MAX_STRIKES } from "./proctor.js";

/* ============================================================ constants */
const DEMO = !CONFIG.supabaseUrl || new URLSearchParams(location.search).has("demo");
const DOMAIN = CONFIG.companyDomain || "homeslystays.com";
const EMPLOYEES = {
  harshith: { key: "harshith", name: "Harshith", sites: ["thegeorgehotel.uk", "stationhotelportsoy.co.uk", "countyselkirk.com", "thehamptonhotel.co.uk", "thewoodmaninnburneston.com"] },
  sai: { key: "sai", name: "Sai Lakshmi", sites: ["homeslystays.com", "coachhouseotterburn.co.uk", "centralhotel.uk"] },
};
const AREAS = {
  "page-building": "Page building", snippets: "Code snippets", seo: "SEO & schema", speed: "Site speed",
  "consent-tracking": "Consent & tracking", "leads-booking": "Leads & booking", "mobile-ux": "Mobile & UX", "content-accuracy": "Content accuracy",
};
const LEVELS = ["", "Recall", "Understand", "Apply"];
const CONF = [["guess", "Guessing"], ["fair", "Fairly sure"], ["sure", "Certain"]];
const TEST_SIZE = 15, MINUTES = 25;

/* ============================================================ icons */
const I = (d, extra = "") => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${d}</svg>`;
const ICON = {
  home: I('<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>'),
  clip: I('<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4h6v3H9zM9 12h6M9 16h4"/>'),
  chart: I('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'),
  book: I('<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM4 19V5M8 7h7"/>'),
  users: I('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 3.5 6"/>'),
  key: I('<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M17 6l3 3M15 8l2 2"/>'),
  layers: I('<path d="m12 3 9 5-9 5-9-5zM3 13l9 5 9-5"/>'),
  out: I('<path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 16l-4-4 4-4M6 12h10"/>'),
  clock: I('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  flag: I('<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>'),
  left: I('<path d="M15 6l-6 6 6 6"/>'), right: I('<path d="m9 6 6 6-6 6"/>'),
  up: I('<path d="m6 15 6-6 6 6"/>'), down: I('<path d="m6 9 6 6 6-6"/>'),
  check: I('<path d="m5 12 5 5 9-10"/>'), x: I('<path d="M6 6l12 12M18 6 6 18"/>'),
  search: I('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),
  menu: I('<path d="M4 7h16M4 12h16M4 17h16"/>'),
  mail: I('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>'),
  spark: I('<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>'),
  shield: I('<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/><path d="m9 12 2 2 4-4"/>'),
  target: I('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>'),
  play: I('<path d="M8 5v14l11-7z"/>'),
  plus: I('<path d="M12 5v14M5 12h14"/>'),
  sun: I('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
  moon: I('<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>'),
  monitor: I('<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>'),
  cam: I('<rect x="3" y="6" width="13" height="12" rx="2"/><path d="m16 10 5-3v10l-5-3"/>'),
  eye: I('<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
  expand: I('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>'),
};

/* ============================================================ theme */
const THEMES = [["system", "System", "monitor"], ["light", "Light", "sun"], ["dark", "Dark", "moon"]];
function getTheme() { try { return localStorage.getItem("hsc-theme") || "system"; } catch { return "system"; } }
function setTheme(t) {
  try { localStorage.setItem("hsc-theme", t); } catch { /* private mode */ }
  if (t === "system") delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = t;
}
function themeButton(extra = "") {
  const t = getTheme(); const [, label, icon] = THEMES.find((x) => x[0] === t) || THEMES[0];
  return `<button class="theme-btn ${extra}" data-act="theme" title="Change theme" aria-label="Theme: ${label}. Click to change">${ICON[icon]}${label}</button>`;
}

/* ============================================================ utils */
const app = document.getElementById("app");
const S = { user: null, staff: null, data: null, exam: null, menu: false, cache: {} };
const h = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pct = (e, m) => (m ? Math.round((100 * e) / m) : 0);
const band = (p) => (p >= 85 ? ["Excellent", "good"] : p >= 70 ? ["Solid", "good"] : p >= 50 ? ["Developing", "warn"] : ["Needs coaching", "bad"]);
const localDate = (d = new Date()) => d.toLocaleDateString("en-CA");
const fmtDay = (k, opts = { weekday: "short", day: "numeric", month: "short" }) => new Date(k + "T12:00:00").toLocaleDateString(undefined, opts);
const fmtClock = (ms) => { ms = Math.max(0, ms); const m = Math.floor(ms / 60000), s = Math.floor((ms % 60000) / 1000); return `${m}:${String(s).padStart(2, "0")}`; };
const initials = (n) => String(n || "?").split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
const siteLabel = (d) => (d === "core" ? "WordPress core" : d);
const firstName = (n) => String(n || "").split(" ")[0];
function toast(msg) { const t = document.createElement("div"); t.className = "toast"; t.setAttribute("role", "status"); t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 4500); }
function greeting() { const hr = new Date().getHours(); return hr < 12 ? "Good morning" : hr < 18 ? "Good afternoon" : "Good evening"; }

/* ============================================================ data layer */
let sb = null;
if (!DEMO) {
  const { createClient } = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm");
  sb = createClient(CONFIG.supabaseUrl, CONFIG.supabaseAnonKey, { auth: { persistSession: true, detectSessionInUrl: true, flowType: "pkce" } });
}
const LIGHT_TEST = "id,user_id,email,emp_key,kind,test_date,status,started_at,deadline_at,submitted_at,score";
const FULL_TEST = LIGHT_TEST + ",auto_submitted,questions_public,answers,conf,flags,integrity,cur,grades,review";

async function callApi(body) {
  const { data: { session } } = await sb.auth.getSession();
  const res = await fetch(`${CONFIG.supabaseUrl}/functions/v1/api`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}`, apikey: CONFIG.supabaseAnonKey },
    body: JSON.stringify(body),
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out.error || "The server didn't respond. Try again.");
  return out;
}
const must = ({ data, error }) => { if (error) throw new Error(error.message); return data; };

const API = DEMO ? null : {
  async signIn(email) {
    const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + location.pathname, shouldCreateUser: true } });
    if (error) {
      if (/homeslystays|Database error/i.test(error.message)) throw new Error(`Only @${DOMAIN} addresses can sign in.`);
      if (/rate limit/i.test(error.message)) throw new Error("Too many sign-in emails were sent in the last hour. Wait a while and try again. If this keeps happening, the site's email sender needs setting up.");
      throw new Error(error.message);
    }
  },
  async signOut() { await sb.auth.signOut(); },
  async session() { const { data } = await sb.auth.getSession(); return data.session; },
  async myStaff(email) { return must(await sb.from("staff").select("*").eq("email", email).maybeSingle()); },
  async loadEmployee(uid, emp) {
    const [stats, tests, facts, sites, books, reads] = await Promise.all([
      sb.from("learner_stats").select("*").eq("user_id", uid).maybeSingle().then(must),
      sb.from("tests").select(LIGHT_TEST).eq("user_id", uid).order("test_date", { ascending: false }).limit(120).then(must),
      sb.from("facts").select("id,site,site_name,area,fact,source").eq("emp_key", emp).then(must),
      sb.from("site_info").select("*").eq("emp_key", emp).then(must),
      sb.from("textbooks").select("emp_key,data").eq("emp_key", emp).then(must),
      sb.from("reading_progress").select("chapter_id,read_at").eq("user_id", uid).then(must),
    ]);
    return { stats, tests: tests || [], facts: facts || [], sites: sites || [], books: books || [], reads: reads || [] };
  },
  async loadManager() {
    const [staff, tests, stats, bank, books, reads] = await Promise.all([
      sb.from("staff").select("*").order("role").then(must),
      sb.from("tests").select(LIGHT_TEST + ",integrity").order("test_date", { ascending: false }).limit(500).then(must),
      sb.from("learner_stats").select("*").then(must),
      sb.from("questions").select("id,emp_key,site,area,level,type,retired").then(must),
      sb.from("textbooks").select("emp_key,data").then(must),
      sb.from("reading_progress").select("user_id,email,chapter_id,read_at").then(must),
    ]);
    return { staff: staff || [], tests: tests || [], stats: stats || [], bank: bank || [], books: books || [], reads: reads || [] };
  },
  async markRead(chapterId) { must(await sb.from("reading_progress").upsert({ user_id: S.user.id, email: S.user.email, chapter_id: chapterId, read_at: new Date().toISOString() })); },
  async getTest(id) { return must(await sb.from("tests").select(FULL_TEST).eq("id", id).maybeSingle()); },
  async start(practiceAs) { return (await callApi({ action: "start", practiceAs })).test; },
  async save(t) { const { data } = await sb.rpc("save_progress", { p_test: t.id, p_answers: t.answers, p_conf: t.conf, p_flags: t.flags, p_integrity: t.integrity, p_cur: t.cur }); return data; },
  async submit(t, auto) { return (await callApi({ action: "submit", testId: t.id, answers: t.answers, conf: t.conf, flags: t.flags, integrity: t.integrity, auto })).test; },
  async mark(testId, questionId, f) { return (await callApi({ action: "mark", testId, questionId, f })).test; },
  async staffSave(row) { must(await sb.from("staff").upsert(row)); },
  async staffDelete(email) { must(await sb.from("staff").delete().eq("email", email)); },
};

/* ============================================================ boot & routing */
async function boot() {
  if (DEMO) { const { demoApi } = await import("./demo.js"); Object.assign(window, { __API: demoApi }); }
  const api = DEMO ? window.__API : API;
  S.api = api;
  if (DEMO) window.__hsc = S; // demo-only hook for testing; never set on the live site
  if (!DEMO) sb.auth.onAuthStateChange((evt) => { if (evt === "SIGNED_IN" || evt === "SIGNED_OUT") route(true); });
  window.addEventListener("hashchange", () => route());
  await route(true);
}

const isNetErr = (e) => e instanceof TypeError && /fetch|network|load failed/i.test(e.message || "");
async function route(reload = false, attempt = 0) {
  const api = S.api;
  try {
    if (reload) {
      const session = await api.session();
      if (!session) { S.user = null; S.staff = null; S.data = null; return renderSignIn(); }
      S.user = { id: session.user.id, email: session.user.email.toLowerCase() };
      S.staff = await api.myStaff(S.user.email);
      if (!S.staff) return renderNotSetUp();
      await loadData();
    }
    if (!S.user) return renderSignIn();
    if (!S.staff) return renderNotSetUp();
    const [_, page, arg] = (location.hash || "").replace(/^#/, "").split("/");
    const isMgr = S.staff.role === "manager";
    if (page === "exam" && S.exam) return renderExam();
    if (page === "exam" && !S.exam) { const t = todayTest(); if (t && t.status === "in_progress") return go(`#/check/${t.id}`); }
    if (page !== "exam" && page !== "check" && S.proctor && !S.exam) { S.proctor.stop(); S.proctor = null; }
    if (page === "results" && arg) return renderTestPage(arg);
    if (page === "check") return renderCheck(arg);
    if (page === "textbook") return renderTextbook(arg);
    if (isMgr) {
      if (page === "person" && EMPLOYEES[arg]) return renderPerson(arg);
      if (page === "people") return renderPeople();
      if (page === "bank") return renderBank();
      return renderTeam();
    }
    if (page === "results") return renderHistory();
    if (page === "study") return renderStudy();
    return renderOverview();
  } catch (e) {
    console.error(e);
    if (isNetErr(e) && attempt < 2) { await new Promise((r) => setTimeout(r, 1200 * (attempt + 1))); return route(reload, attempt + 1); }
    const msg = isNetErr(e) ? "Couldn't reach the server. Check your internet connection. If it keeps happening, an ad blocker or privacy extension may be blocking supabase.co: allow it for this site, or try an Incognito window." : e.message;
    app.innerHTML = `<div class="center"><div class="card stack" style="max-width:440px"><h3>${isNetErr(e) ? "Connection problem" : "Something went wrong"}</h3><p class="ink2">${h(msg)}</p><div><button class="btn" data-act="reload">Reload</button></div></div></div>`;
  }
}
async function loadData() {
  S.data = S.staff.role === "manager" ? await S.api.loadManager() : await S.api.loadEmployee(S.user.id, S.staff.emp_key);
}
const go = (hash) => { if (location.hash === hash) route(); else location.hash = hash; };
function todayTest() { return (S.data?.tests || []).find((t) => t.kind === "daily" && t.test_date === localDate() && t.user_id === S.user.id) || (S.data?.tests || []).find((t) => t.kind === "daily" && t.status === "in_progress" && t.user_id === S.user.id); }

/* ============================================================ sign in */
function renderSignIn(state = {}) {
  app.innerHTML = `<div class="auth fade-in">
    <section class="auth-art">
      <div class="brand" style="padding:0"><div class="brand-mark">H</div><div><b>Homesly Stays</b><span>Web team</span></div></div>
      <div class="stack-l">
        <h1>Skills that show up <em>on the live site.</em></h1>
        <ul>
          <li>${ICON.target}<span>A short daily assessment built from the real changes on your hotel websites.</span></li>
          <li>${ICON.spark}<span>Fresh questions every day, never the same as your colleague's.</span></li>
          <li>${ICON.chart}<span>Clear feedback on every answer, and a score trend you can watch improve.</span></li>
        </ul>
      </div>
      <div class="preview-card" aria-hidden="true">
        <div class="row between"><span class="eyebrow" style="color:#9FD6C3">Question 4 of 15</span><span class="chip site" style="background:rgba(255,255,255,.1);color:#DDF0E9">thegeorgehotel.uk</span></div>
        <p class="pq">Why do the room "Book Now" buttons open the availability popup instead of going straight to the booking engine?</p>
        <div class="po"><i></i>It loads faster on phones</div>
        <div class="po on"><i></i>Every booking is captured as a lead first</div>
        <div class="po"><i></i>The booking engine blocks direct links</div>
      </div>
    </section>
    <section class="auth-form">
      <div class="auth-theme">${themeButton()}</div>
      ${state.sent ? `
      <div class="auth-box fade-in">
        <div class="avatar lg" style="width:52px;height:52px">${ICON.mail.replace("<svg", '<svg style="width:22px;height:22px"')}</div>
        <div class="stack-s"><h2>Check your inbox</h2><p class="ink2">We sent a sign-in link to <b>${h(state.email)}</b>. Open it on this device to continue. The link works once and expires after an hour.</p></div>
        <div class="notice">Can't find it? Check spam or the Promotions tab, or send it again.</div>
        <div class="row"><button class="btn" data-act="signin-again">Use a different email</button><button class="btn ghost" data-act="signin-resend" data-email="${h(state.email)}">Send again</button></div>
      </div>` : `
      <form class="auth-box fade-in" id="signin-form" novalidate>
        <div class="stack-s"><span class="eyebrow">Homesly Skills Check</span><h2>Sign in</h2><p class="ink2">Use your company email. We'll send you a one-time sign-in link — no password needed.</p></div>
        ${state.error ? `<div class="notice bad" role="alert">${h(state.error)}</div>` : ""}
        <div class="field"><label for="email">Work email</label><input class="input" id="email" type="email" autocomplete="email" placeholder="name@${h(DOMAIN)}" value="${h(state.email || "")}" required></div>
        <button class="btn primary lg" type="submit" id="signin-btn">Email me a sign-in link</button>
        <p class="xs muted">Only @${h(DOMAIN)} addresses can sign in.${DEMO ? " Demo mode: no email is sent." : ""}</p>
      </form>`}
    </section>
  </div>`;
  const f = document.getElementById("signin-form");
  if (f) f.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("email").value.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+$/.test(email)) return renderSignIn({ email, error: "Enter your full email address." });
    if (!email.endsWith("@" + DOMAIN)) return renderSignIn({ email, error: `Only @${DOMAIN} addresses can sign in.` });
    const btn = document.getElementById("signin-btn"); btn.disabled = true; btn.innerHTML = `<span class="spinner" style="border-top-color:#fff"></span> Sending…`;
    try { await S.api.signIn(email); if (DEMO) return route(true); renderSignIn({ sent: true, email }); }
    catch (err) { renderSignIn({ email, error: err.message }); }
  });
}
function renderNotSetUp() {
  app.innerHTML = `<div class="center"><div class="card stack fade-in" style="max-width:460px">
    <div class="brand" style="padding:0"><div class="brand-mark">H</div><div><b style="color:var(--ink)">Homesly Skills Check</b></div></div>
    <h2 style="font-size:22px">You're signed in, but not set up yet</h2>
    <p class="ink2">You signed in as <b>${h(S.user.email)}</b>. Your manager needs to add this address under People &amp; access before your first test.</p>
    <div class="row"><button class="btn" data-act="reload">Check again</button><button class="btn ghost" data-act="signout">Sign out</button></div>
  </div></div>`;
}

/* ============================================================ shell */
function shell(active, inner) {
  const mgr = S.staff.role === "manager";
  const pending = mgr ? (S.data.tests || []).reduce((a, t) => a + (t.score?.pending || 0), 0) : 0;
  const items = mgr
    ? [["team", "Team overview", ICON.home], ["people", "People & access", ICON.key], ["bank", "Question bank", ICON.layers], ["textbook", "Textbooks & syllabus", ICON.book]]
    : [["overview", "Overview", ICON.home], ["textbook", "Textbook & syllabus", ICON.book], ["results", "My results", ICON.chart], ["study", "Quick notes", ICON.clip]];
  const persons = mgr ? Object.values(EMPLOYEES).map((e) => `<a href="#/person/${e.key}" class="${active === "person-" + e.key ? "on" : ""}"><span class="avatar" style="width:22px;height:22px;font-size:10px;background:var(--side-2);color:#9FE3CB">${initials(e.name)}</span>${h(e.name)}</a>`).join("") : "";
  return `<div class="shell ${S.menu ? "menu-open" : ""}">
    <div class="mob-top"><button data-act="menu" aria-label="Open menu">${ICON.menu.replace("<svg", '<svg style="width:22px;height:22px"')}</button><div class="brand-mark" style="width:28px;height:28px;font-size:17px">H</div><b style="font-size:14px">Skills Check</b></div>
    ${S.menu ? `<div class="scrim" data-act="menu"></div>` : ""}
    <aside class="side">
      <div class="brand"><div class="brand-mark">H</div><div><b>Skills Check</b><span>Homesly web team</span></div></div>
      <nav class="nav" aria-label="Main">
        <div class="lbl">${mgr ? "Manage" : "Learn"}</div>
        ${items.map(([k, l, ic]) => `<a href="#/${k}" class="${active === k ? "on" : ""}">${ic}${l}${k === "team" && pending ? `<span class="badge">${pending}</span>` : ""}</a>`).join("")}
        ${mgr ? `<div class="lbl">People</div>${persons}` : ""}
      </nav>
      <div style="margin-top:auto">${themeButton()}</div>
      <div class="side-foot"><div class="avatar">${initials(S.staff.full_name)}</div><div class="who"><b>${h(S.staff.full_name)}</b><span>${h(S.user.email)}</span></div><button data-act="signout" title="Sign out" aria-label="Sign out">${ICON.out.replace("<svg", '<svg style="width:18px;height:18px"')}</button></div>
    </aside>
    <main class="main"><div class="main-inner fade-in">${inner}</div></main>
  </div>`;
}
function paint(active, inner) { app.innerHTML = shell(active, inner); bindTips(); window.scrollTo({ top: 0 }); }

/* ============================================================ charts */
function trendChart(history, { height = 190 } = {}) {
  const pts = (history || []).slice(-21);
  if (!pts.length) return `<div class="empty">Your score line starts after the first test.</div>`;
  const W = 640, H = height, L = 34, R = 12, T = 10, B = 26;
  const x = (i) => (pts.length === 1 ? (L + W - R) / 2 : L + ((W - L - R) * i) / (pts.length - 1));
  const y = (v) => T + (H - T - B) * (1 - v / 100);
  const line = pts.map((p, i) => `${x(i).toFixed(1)},${y(p.pct).toFixed(1)}`).join(" ");
  const grid = [0, 50, 100].map((v) => `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)"/><text x="${L - 8}" y="${y(v) + 4}" text-anchor="end">${v}%</text>`).join("");
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Score per test, last ${pts.length} tests">
    ${grid}
    <line x1="${L}" x2="${W - R}" y1="${y(70)}" y2="${y(70)}" stroke="var(--gold)" stroke-dasharray="4 4" opacity=".7"/>
    <text x="${W - R}" y="${y(70) - 6}" text-anchor="end" style="fill:var(--gold)">Solid · 70%</text>
    <polygon points="${x(0)},${y(0)} ${line} ${x(pts.length - 1)},${y(0)}" fill="var(--accent)" opacity=".09"/>
    <polyline points="${line}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
    ${pts.map((p, i) => `<circle cx="${x(i)}" cy="${y(p.pct)}" r="${i === pts.length - 1 ? 5 : 3.5}" fill="var(--accent)" stroke="var(--surface)" stroke-width="2"/><rect x="${x(i) - 12}" y="${T}" width="24" height="${H - T - B}" fill="transparent" data-tip="${h(fmtDay(p.date))} · ${p.pct}%"/>`).join("")}
    <text x="${x(0)}" y="${H - 6}" text-anchor="${pts.length === 1 ? "middle" : "start"}">${h(fmtDay(pts[0].date, { day: "numeric", month: "short" }))}</text>
    ${pts.length > 1 ? `<text x="${x(pts.length - 1)}" y="${H - 6}" text-anchor="end">${h(fmtDay(pts[pts.length - 1].date, { day: "numeric", month: "short" }))}</text>` : ""}
  </svg>`;
}
function spark(history) {
  const pts = (history || []).slice(-14); if (pts.length < 2) return "";
  const W = 120, H = 34; const x = (i) => (W * i) / (pts.length - 1), y = (v) => 3 + (H - 6) * (1 - v / 100);
  return `<svg viewBox="0 0 ${W} ${H}" width="120" height="34" aria-hidden="true"><polyline points="${pts.map((p, i) => `${x(i)},${y(p.pct)}`).join(" ")}" fill="none" stroke="var(--accent)" stroke-width="1.8" stroke-linejoin="round"/></svg>`;
}
function heatmap(history) {
  const byDate = new Map((history || []).map((x) => [x.date, x.pct]));
  const end = new Date(); const start = new Date(end); start.setDate(end.getDate() - 34);
  const cells = [];
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const k = localDate(d); const v = byDate.get(k);
    const lvl = v == null ? "" : v < 50 ? "l1" : v < 70 ? "l2" : v < 85 ? "l3" : "l4";
    cells.push(`<i class="${lvl} ${k === localDate() ? "today" : ""}" data-tip="${h(fmtDay(k))}${v == null ? " · no test" : ` · ${v}%`}"></i>`);
  }
  return `<div class="heat" role="img" aria-label="Daily scores over the last 5 weeks">${cells.join("")}</div>
  <div class="row xs muted" style="gap:6px;margin-top:10px">Lower <span class="heat" style="display:inline-grid;grid-template-columns:repeat(4,12px);gap:3px"><i class="l1"></i><i class="l2"></i><i class="l3"></i><i class="l4"></i></span> Higher</div>`;
}
function skillBars(stats, { empty = "Scores by area appear after your first test." } = {}) {
  const rows = Object.keys(AREAS).filter((a) => stats?.[a]?.m);
  if (!rows.length) return `<div class="empty">${empty}</div>`;
  rows.sort((a, b) => stats[b].e / stats[b].m - stats[a].e / stats[a].m);
  return `<div class="bars">${rows.map((a) => { const p = pct(stats[a].e, stats[a].m); return `<div class="bar" data-tip="${h(AREAS[a])}: ${Math.round(stats[a].e * 10) / 10} of ${stats[a].m} points"><span class="ink2">${h(AREAS[a])}</span><span class="trk"><span class="fill" style="width:${p}%"></span></span><span class="v">${p}%</span></div>`; }).join("")}</div>`;
}
function ring(p, size = 148) {
  const r = 58, c = 2 * Math.PI * r;
  return `<svg class="ring" width="${size}" height="${size}" viewBox="0 0 140 140" role="img" aria-label="Score ${p} percent">
    <circle cx="70" cy="70" r="${r}" fill="none" stroke="var(--sunk)" stroke-width="11"/>
    <circle cx="70" cy="70" r="${r}" fill="none" stroke="var(--accent)" stroke-width="11" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - p / 100)}" transform="rotate(-90 70 70)"/>
    <text x="70" y="76" text-anchor="middle" font-size="30">${p}%</text></svg>`;
}
function bindTips() {
  const tip = document.getElementById("tip");
  app.querySelectorAll("[data-tip]").forEach((el) => {
    el.addEventListener("pointermove", (ev) => { tip.textContent = el.getAttribute("data-tip"); tip.hidden = false; tip.style.left = Math.min(ev.clientX + 12, innerWidth - tip.offsetWidth - 8) + "px"; tip.style.top = ev.clientY - 36 + "px"; });
    el.addEventListener("pointerleave", () => (tip.hidden = true));
  });
}

/* ============================================================ employee: overview */
function metrics(history) {
  const hist = history || [];
  const last7 = hist.slice(-7); const avg7 = last7.length ? Math.round(last7.reduce((a, b) => a + b.pct, 0) / last7.length) : null;
  const prev7 = hist.slice(-14, -7); const avgPrev = prev7.length ? Math.round(prev7.reduce((a, b) => a + b.pct, 0) / prev7.length) : null;
  const set = new Set(hist.map((x) => x.date)); let streak = 0; const d = new Date(); if (!set.has(localDate(d))) d.setDate(d.getDate() - 1);
  while (set.has(localDate(d))) { streak++; d.setDate(d.getDate() - 1); }
  const best = hist.reduce((m, x) => Math.max(m, x.pct), 0);
  return { avg7, delta: avg7 != null && avgPrev != null ? avg7 - avgPrev : null, streak, count: hist.length, best };
}
function renderOverview() {
  const emp = EMPLOYEES[S.staff.emp_key]; const st = S.data.stats || {}; const hist = st.history || []; const m = metrics(hist);
  const t = todayTest(); const now = Date.now();
  let hero;
  if (t && t.status === "done") {
    const [bl] = band(t.score.pct);
    hero = `<span class="eyebrow">Today · ${h(fmtDay(t.test_date, { weekday: "long", day: "numeric", month: "long" }))}</span>
      <h2>Done for today. You scored ${t.score.pct}%.</h2>
      <p>${bl}. Your answers and explanations are ready, and tomorrow's set will lean toward the areas you found hardest.</p>
      <div class="row"><a class="btn primary lg" href="#/results/${t.id}">Review answers ${ICON.right}</a></div>`;
  } else if (t && t.status === "in_progress") {
    const left = new Date(t.deadline_at).getTime() - now;
    hero = `<span class="eyebrow">In progress</span><h2>Pick up where you left off.</h2>
      <p>${left > 0 ? `${fmtClock(left)} left on the clock. Your answers so far are saved.` : "Time ran out. Your saved answers will be submitted now."}</p>
      <div class="row"><button class="btn primary lg" data-act="resume" data-id="${t.id}">${left > 0 ? "Resume assessment" : "Submit and see results"} ${ICON.right}</button></div>`;
  } else {
    hero = `<span class="eyebrow">Today's assessment · ${h(fmtDay(localDate(), { weekday: "long", day: "numeric", month: "long" }))}</span>
      <h2>Ready when you are, ${h(firstName(emp.name))}.</h2>
      <p>Fifteen questions about the work on your sites, including a few written fresh for you today. Take it in one sitting; the timer starts when you begin.</p>
      <div class="hero-meta"><div><b>${TEST_SIZE}</b><span>questions</span></div><div><b>${MINUTES} min</b><span>time limit</span></div><div><b>~4</b><span>new today</span></div><div><b>${emp.sites.length}</b><span>sites covered</span></div></div>
      <div class="row"><button class="btn primary lg" data-act="start">${ICON.play} Start assessment</button><a class="btn ghost" href="#/textbook">Open my textbook</a></div>`;
  }
  const recent = (S.data.tests || []).filter((x) => x.status === "done" && x.kind === "daily").slice(0, 5);
  paint("overview", `
    <div class="page-h"><div><h1>${greeting()}, ${h(firstName(emp.name))}</h1><p class="sub">Your daily skills check across ${emp.sites.length} hotel websites.</p></div>
      <div class="row" style="gap:6px">${emp.sites.slice(0, 3).map((s) => `<span class="chip site">${h(s)}</span>`).join("")}${emp.sites.length > 3 ? `<span class="chip">+${emp.sites.length - 3}</span>` : ""}</div></div>
    <div class="stack" style="gap:20px">
      <section class="hero stack">${hero}</section>
      ${(() => { const book = bookFor(S.staff.emp_key); if (!book) return ""; const reads = readSet(S.staff.emp_key); const sug = suggestedChapter(book, reads, st.area_stats); const done = book.chapters.filter((c) => reads.has(c.id)).length;
        return `<section class="card row" style="gap:18px"><span class="avatar lg" style="border-radius:12px">${ICON.book.replace("<svg", '<svg style="width:20px;height:20px"')}</span>
          <div class="grow" style="min-width:220px"><span class="eyebrow">Textbook · ${done} of ${book.chapters.length} chapters read</span><div style="font-weight:500;margin-top:2px">${sug ? `Suggested next: ${h(sug.title)}` : "You've read every chapter. Revisit the ones covering your weaker areas."}</div><div class="xs muted">${sug ? `Covers ${(sug.areas || []).map((a) => AREAS[a] || a).join(", ")} · ${sug.minutes || "–"} min` : ""}</div></div>
          <a class="btn" href="#/textbook${sug ? "/" + h(sug.id) : ""}">${sug ? "Read now" : "Open textbook"}</a></section>`; })()}
      <div class="grid g-4">
        ${kpi("7-day average", m.avg7 == null ? "–" : `${m.avg7}<small>%</small>`, m.delta == null ? "Builds after a week of tests" : `${m.delta >= 0 ? "▲" : "▼"} ${Math.abs(m.delta)} pts vs previous week`)}
        ${kpi("Day streak", `${m.streak}<small> ${m.streak === 1 ? "day" : "days"}</small>`, m.streak ? "Keep it going tomorrow" : "Take today's test to start one")}
        ${kpi("Tests completed", `${m.count}`, m.count ? `Best score ${m.best}%` : "Your first one is waiting")}
        ${kpi("Questions seen", `${(st.seen_ids || []).length}`, `${(st.wrong_ids || []).length} queued for another try`)}
      </div>
      <div class="grid g-main">
        <section class="card"><div class="card-h"><h3>Score trend</h3><span class="xs muted">Last ${Math.min(hist.length, 21) || 0} tests</span></div>${trendChart(hist)}</section>
        <section class="card"><div class="card-h"><h3>Activity</h3><span class="xs muted">Last 5 weeks</span></div>${heatmap(hist)}</section>
      </div>
      <div class="grid g-main">
        <section class="card"><div class="card-h"><h3>Skills by area</h3><span class="xs muted">All time, weighted by difficulty</span></div>${skillBars(st.area_stats)}</section>
        <section class="card"><div class="card-h"><h3>Recent results</h3><a class="btn sm ghost" href="#/results">See all</a></div>
          ${recent.length ? `<div class="list">${recent.map((x) => resultRow(x)).join("")}</div>` : `<div class="empty">Finished tests appear here.</div>`}</section>
      </div>
    </div>`);
}
const kpi = (label, value, detail) => `<div class="card kpi"><span class="eyebrow">${label}</span><span class="v">${value}</span><span class="d">${detail}</span></div>`;
function resultRow(t, who) {
  const [bl, bc] = band(t.score?.pct || 0);
  return `<a class="li click" href="#/results/${t.id}" style="text-decoration:none;color:inherit">
    <div class="avatar" style="background:var(--${bc}-soft);color:var(--${bc})">${t.score?.pct ?? "–"}</div>
    <div class="grow"><b style="font-weight:500">${who ? h(who) + " · " : ""}${h(fmtDay(t.test_date, { weekday: "long", day: "numeric", month: "short" }))}</b><div class="xs muted">${bl}${t.score?.pending ? ` · ${t.score.pending} written answer${t.score.pending > 1 ? "s" : ""} awaiting marking` : ""}${t.kind === "practice" ? " · practice" : ""}</div></div>
    ${ICON.right.replace("<svg", '<svg style="width:16px;height:16px;color:var(--muted)"')}</a>`;
}

/* ============================================================ employee: history & study */
function renderHistory() {
  const tests = (S.data.tests || []).filter((t) => t.status === "done");
  const hist = S.data.stats?.history || [];
  paint("results", `
    <div class="page-h"><div><h1>My results</h1><p class="sub">Every daily assessment, with answers and explanations.</p></div></div>
    <div class="stack" style="gap:20px">
      <section class="card"><div class="card-h"><h3>Score trend</h3></div>${trendChart(hist, { height: 210 })}</section>
      <section class="card"><div class="card-h"><h3>All assessments</h3><span class="xs muted">${tests.length} completed</span></div>
        ${tests.length ? `<div class="tablebox"><table><thead><tr><th>Date</th><th>Score</th><th>Result</th><th>Time taken</th><th></th></tr></thead><tbody>
        ${tests.map((t) => { const [bl, bc] = band(t.score.pct); return `<tr class="click" data-href="#/results/${t.id}"><td>${h(fmtDay(t.test_date, { weekday: "short", day: "numeric", month: "short", year: "numeric" }))}</td><td><b>${t.score.pct}%</b> <span class="muted xs">${t.score.e}/${t.score.m} pts</span></td><td><span class="chip ${bc}">${bl}</span>${t.score.pending ? ` <span class="chip warn">${t.score.pending} to mark</span>` : ""}</td><td class="mono xs">${t.submitted_at ? fmtClock(new Date(t.submitted_at) - new Date(t.started_at)) : "–"}</td><td style="text-align:right">${ICON.right.replace("<svg", '<svg style="width:16px;height:16px;color:var(--muted)"')}</td></tr>`; }).join("")}
        </tbody></table></div>` : `<div class="empty">No finished assessments yet.</div>`}</section>
    </div>`);
}
function renderStudy() {
  const sites = S.data.sites.length ? S.data.sites : EMPLOYEES[S.staff.emp_key].sites.map((d) => ({ domain: d, name: d }));
  const sel = S.cache.studySite && sites.some((s) => s.domain === S.cache.studySite) ? S.cache.studySite : sites[0]?.domain;
  const q = (S.cache.studyQ || "").toLowerCase();
  const site = sites.find((s) => s.domain === sel) || {};
  const facts = S.data.facts.filter((f) => f.site === sel && (!q || f.fact.toLowerCase().includes(q)));
  const byArea = {}; facts.forEach((f) => (byArea[f.area] ||= []).push(f));
  paint("study", `
    <div class="page-h"><div><h1>Study notes</h1><p class="sub">What changed on your sites and why. Today's fresh questions are written from these notes.</p></div></div>
    <div class="stack" style="gap:20px">
      <div class="row between"><div class="tabs" role="tablist">${sites.map((s) => `<button role="tab" class="${s.domain === sel ? "on" : ""}" data-act="study-site" data-site="${h(s.domain)}">${h(s.name || s.domain)}</button>`).join("")}</div>
        <label class="search" style="min-width:min(100%,280px)">${ICON.search}<input class="input" id="study-q" placeholder="Search notes" value="${h(S.cache.studyQ || "")}" aria-label="Search notes"></label></div>
      <section class="card site-card">
        <div class="row between"><div class="stack-s"><span class="chip site" style="align-self:flex-start">${h(sel)}</span><h2 style="font-size:22px">${h(site.name || sel)}${site.place ? ` <span class="muted" style="font-weight:400">· ${h(site.place)}</span>` : ""}</h2></div><span class="xs muted">${facts.length} notes</span></div>
        ${site.summary ? `<p class="ink2" style="max-width:75ch">${h(site.summary)}</p>` : ""}
        ${site.stack ? `<p class="xs muted"><b>Stack:</b> ${h(site.stack)}</p>` : ""}
      </section>
      ${Object.keys(byArea).length ? `<div class="grid g-2">${Object.keys(AREAS).filter((a) => byArea[a]).map((a) => `<section class="card"><div class="card-h"><h3>${h(AREAS[a])}</h3><span class="chip">${byArea[a].length}</span></div><div>${byArea[a].map((f) => `<div class="fact"><div class="stack-s" style="gap:4px"><span>${h(f.fact)}</span>${f.source ? `<span class="src">${h(f.source)}</span>` : ""}</div></div>`).join("")}</div></section>`).join("")}</div>` : `<div class="empty">${q ? "No notes match your search." : "No notes for this site yet."}</div>`}
    </div>`);
  const input = document.getElementById("study-q");
  input?.addEventListener("input", () => { S.cache.studyQ = input.value; clearTimeout(S.cache.studyT); S.cache.studyT = setTimeout(() => { renderStudy(); const i = document.getElementById("study-q"); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }, 250); });
}

/* ============================================================ textbook */
function md(text) {
  const inline = (s) => h(s).replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/`([^`]+)`/g, "<code>$1</code>");
  return String(text || "").split(/\n{2,}/).map((block) => {
    const lines = block.split("\n").filter((l) => l.trim());
    if (lines.length && lines.every((l) => /^\s*-\s+/.test(l))) return `<ul>${lines.map((l) => `<li>${inline(l.replace(/^\s*-\s+/, ""))}</li>`).join("")}</ul>`;
    return `<p>${lines.map(inline).join("<br>")}</p>`;
  }).join("");
}
function bookFor(emp) { return (S.data.books || []).find((b) => b.emp_key === emp)?.data || null; }
function readSet(emp) {
  if (S.staff.role !== "manager") return new Set((S.data.reads || []).map((r) => r.chapter_id));
  const email = S.data.staff.find((s) => s.role === "employee" && s.emp_key === emp)?.email;
  return new Set((S.data.reads || []).filter((r) => r.email === email).map((r) => r.chapter_id));
}
function suggestedChapter(book, reads, areaStats) {
  if (!book) return null;
  const acc = (a) => { const v = areaStats?.[a]; return v && v.m ? v.e / v.m : 0.5; };
  const unread = book.chapters.filter((c) => !reads.has(c.id));
  if (!unread.length) return null;
  return unread.slice().sort((a, b) => Math.min(...(a.areas || []).map(acc), 1) - Math.min(...(b.areas || []).map(acc), 1))[0];
}
function renderTextbook(chId) {
  const mgr = S.staff.role === "manager";
  const emp = mgr ? (S.cache.tbEmp || "harshith") : S.staff.emp_key;
  const book = bookFor(emp); const reads = readSet(emp);
  const empTabs = mgr ? `<div class="tabs">${Object.values(EMPLOYEES).map((e) => `<button class="${e.key === emp ? "on" : ""}" data-act="tb-emp" data-emp="${e.key}">${h(e.name)}</button>`).join("")}</div>` : "";
  if (!book) return paint("textbook", `<div class="page-h"><div><h1>${mgr ? "Textbooks" : "Textbook"}</h1><p class="sub">The pre-exam study guide.</p></div>${empTabs}</div><div class="empty">The textbook hasn't been loaded yet.</div>`);
  const chapters = book.chapters; const done = chapters.filter((c) => reads.has(c.id)).length; const pctRead = Math.round((100 * done) / chapters.length);
  const totalMin = chapters.reduce((a, c) => a + (c.minutes || 0), 0);
  const ch = chapters.find((c) => c.id === chId);
  const toc = `<nav class="card toc" aria-label="Chapters"><span class="eyebrow" style="padding:8px 10px">Chapters</span>${chapters.map((c, i) => `<a href="#/textbook/${h(c.id)}" class="${ch && c.id === ch.id ? "on" : ""}"><span class="rd ${reads.has(c.id) ? "done" : ""}">${reads.has(c.id) ? "✓" : ""}</span><span>${i + 1}. ${h(c.title)}</span><span class="mins">${c.minutes || "–"} min</span></a>`).join("")}</nav>`;
  const head = `<div class="page-h"><div><span class="eyebrow">Pre-exam textbook${mgr ? " · " + h(EMPLOYEES[emp].name) : ""}</span><h1 style="margin-top:4px">${h(book.title)}</h1></div>
    <div class="row">${empTabs}<span class="small muted">${done} of ${chapters.length} chapters read</span><div class="bar" style="grid-template-columns:140px;width:140px"><span class="trk"><span class="fill" style="width:${pctRead}%"></span></span></div></div></div>`;
  if (!ch) {
    const next = suggestedChapter(book, reads, mgr ? null : S.data.stats?.area_stats);
    return paint("textbook", `${head}
      <div class="stack" style="gap:20px">
        <section class="card stack"><div class="prose">${md(book.intro)}</div>
          <div class="row">${next ? `<a class="btn primary" href="#/textbook/${h(next.id)}">${ICON.book}${done ? "Continue with" : "Start with"} "${h(next.title)}"</a>` : `<span class="chip good">All chapters read</span>`}<span class="small muted">${chapters.length} chapters · about ${totalMin} minutes in total</span></div></section>
        <section class="card"><div class="card-h"><h3>Syllabus: what the test covers</h3><span class="xs muted">Share of questions per area</span></div>
          <div class="syl">${(book.syllabus || []).slice().sort((a, b) => b.weight - a.weight).map((s) => `<div class="syl-item"><div class="row between"><b style="font-weight:600">${h(AREAS[s.area] || s.area)}</b><span class="mono small">${s.weight}%</span></div><span class="trk"><i style="width:${Math.min(100, s.weight * 3)}%"></i></span><span class="small ink2">${(s.topics || []).map(h).join(" · ")}</span></div>`).join("")}</div></section>
        <section class="card"><div class="card-h"><h3>Chapters</h3></div><div class="list">${chapters.map((c, i) => `<a class="li click" href="#/textbook/${h(c.id)}" style="text-decoration:none;color:inherit"><span class="avatar" style="${reads.has(c.id) ? "background:var(--good-soft);color:var(--good)" : ""}">${reads.has(c.id) ? "✓" : i + 1}</span><div class="grow"><b style="font-weight:500">${h(c.title)}</b><div class="xs muted">${h(c.summary || "")}</div></div><span class="chip site">${h(siteLabel(c.site))}</span><span class="xs muted" style="white-space:nowrap">${c.minutes || "–"} min</span></a>`).join("")}</div></section>
      </div>`);
  }
  const idx = chapters.indexOf(ch); const prev = chapters[idx - 1]; const next = chapters[idx + 1];
  paint("textbook", `${head}
    <div class="tb">${toc}
      <article class="card reader stack" style="gap:20px">
        <div class="row" style="gap:6px"><span class="chip site">${h(siteLabel(ch.site))}</span>${(ch.areas || []).map((a) => `<span class="chip">${h(AREAS[a] || a)}</span>`).join("")}<span class="xs muted">${ch.minutes || "–"} min read</span></div>
        <h2 class="ch">Chapter ${idx + 1}. ${h(ch.title)}</h2>
        ${ch.summary ? `<p class="ink2" style="font-size:17px;max-width:68ch">${h(ch.summary)}</p>` : ""}
        ${(ch.sections || []).map((s) => `<section class="stack" style="gap:12px">
          <h3 class="section-h">${h(s.heading)}</h3>
          <div class="prose">${md(s.body)}</div>
          ${s.code?.snippet ? `<figure style="margin:0">${codeBlock(s.code.snippet)}${s.code.caption ? `<figcaption class="figcap">${h(s.code.caption)}</figcaption>` : ""}</figure>` : ""}
          ${s.keyPoints?.length ? `<div class="keybox"><span class="k">Key points</span><ul>${s.keyPoints.map((k) => `<li>${h(k)}</li>`).join("")}</ul></div>` : ""}
        </section>`).join("")}
        ${ch.checklist?.length ? `<section class="stack-s"><h3 class="section-h">On-the-job checklist</h3><ul class="prose" style="padding-left:20px">${ch.checklist.map((c) => `<li>${h(c)}</li>`).join("")}</ul></section>` : ""}
        ${ch.glossary?.length ? `<section class="stack-s"><h3 class="section-h">Glossary</h3><dl class="gloss">${ch.glossary.map((g) => `<dt>${h(g.term)}</dt><dd>${h(g.definition)}</dd>`).join("")}</dl></section>` : ""}
        ${ch.selfCheck?.length ? `<section class="stack-s"><h3 class="section-h">Check yourself</h3>${ch.selfCheck.map((q) => `<details class="selfq"><summary>${h(q.q)}</summary><p>${h(q.a)}</p></details>`).join("")}</section>` : ""}
        <div class="row between" style="border-top:1px solid var(--line);padding-top:18px">
          ${prev ? `<a class="btn" href="#/textbook/${h(prev.id)}">${ICON.left}Previous</a>` : `<a class="btn" href="#/textbook">${ICON.left}Contents</a>`}
          ${mgr ? (next ? `<a class="btn primary" href="#/textbook/${h(next.id)}">Next chapter${ICON.right}</a>` : "") : `<button class="btn primary" data-act="mark-read" data-ch="${h(ch.id)}" data-next="${h(next?.id || "")}">${reads.has(ch.id) ? (next ? "Next chapter" : "Back to contents") : next ? "Mark as read and continue" : "Mark as read"}${ICON.right}</button>`}
        </div>
      </article>
    </div>`);
}

/* ============================================================ pre-exam check */
// arg: undefined (today's test), a test id (resume), or "practice-<emp>" (manager practice)
function renderCheck(arg) {
  const practiceAs = arg?.startsWith("practice-") ? arg.slice(9) : null;
  const resumeId = arg && !practiceAs ? arg : null;
  if (S.proctor && !S.exam) { S.proctor.stop(); S.proctor = null; }
  const pr = new Proctor({ startedAt: new Date().toISOString() });
  S.proctor = pr;
  const back = S.staff.role === "manager" ? "#/bank" : "#/overview";
  app.innerHTML = `<div class="exam">
    <header class="exam-top"><div class="exam-top-in">
      <div class="brand-mark" style="width:32px;height:32px;font-size:19px">H</div>
      <div class="exam-title grow"><b>${practiceAs ? `Practice · ${h(EMPLOYEES[practiceAs].name)}` : resumeId ? "Resume your assessment" : "Daily assessment"}</b><span>${h(fmtDay(localDate(), { weekday: "long", day: "numeric", month: "long" }))}</span></div>
      ${themeButton()}<a class="btn ghost" href="${back}" data-act="leave-check">Not now</a>
    </div></header>
    <main class="main-inner fade-in" style="width:100%;padding:36px max(20px,env(safe-area-inset-right,0px)) 60px max(20px,env(safe-area-inset-left,0px))">
      <div class="check">
        <section class="stack" style="gap:22px">
          <span class="eyebrow">Before you start</span>
          <h1 class="serif" style="font-size:clamp(32px,4.4vw,46px);line-height:1.05">A quick check, then ${MINUTES} minutes that count.</h1>
          <p class="ink2" style="max-width:60ch">Your camera stays on during the test so we know the answers are yours. Nothing is recorded or uploaded. Only warnings are logged, such as leaving the page or looking away.</p>
          <div class="stack-s">
            <div class="check-item" id="ck-cam"><span class="st">${ICON.cam}</span><div class="grow"><b style="font-weight:500">Camera</b><div class="small muted" id="ck-cam-t">Waiting for permission…</div></div><button class="btn sm" data-act="cam-retry" id="ck-cam-btn" hidden>Try again</button></div>
            <div class="check-item" id="ck-face"><span class="st">${ICON.eye}</span><div class="grow"><b style="font-weight:500">Face in view, looking at the screen</b><div class="small muted" id="ck-face-t">Starting face check…</div></div></div>
            <div class="check-item ${document.fullscreenEnabled ? "wait" : "ok"}"><span class="st">${ICON.expand}</span><div class="grow"><b style="font-weight:500">Full screen</b><div class="small muted">${document.fullscreenEnabled ? "Starting the test switches to full screen. Leaving it is logged." : "Not available on this device, so it's skipped."}</div></div></div>
          </div>
          <div class="card flat stack-s" style="padding:18px">
            <b style="font-weight:600">The rules</b>
            <div class="rules"><span>· Stay on this page and in full screen</span><span>· No phone, notes or second screen</span><span>· Copy and paste are switched off</span><span>· 90 seconds idle triggers a check-in</span><span>· Each warning counts as a strike</span><span>· ${MAX_STRIKES} strikes submits the test automatically</span></div>
          </div>
          <div class="row"><button class="btn primary lg" data-act="begin" data-practice="${h(practiceAs || "")}" data-resume="${h(resumeId || "")}" id="ck-go" disabled>${resumeId ? "Resume the assessment" : "I agree. Start the assessment"}</button><span class="small muted">${TEST_SIZE} questions · ${MINUTES} minutes · one attempt</span></div>
        </section>
        <aside class="stack-s">
          <div class="cam-big" id="ck-video"><div class="empty-cam" id="ck-empty">Allow camera access when your browser asks.</div><div class="tag"><i></i><span id="ck-tag">Starting camera…</span></div><div class="note">Not recorded</div></div>
          <p class="xs muted">The image stays in this browser. The page only checks that one face is in view and facing the screen.</p>
        </aside>
      </div>
    </main>
  </div>`;
  pr.onStatus((s) => {
    const set = (id, cls, text) => { const el = document.getElementById(id); if (!el) return; el.className = "check-item " + cls; document.getElementById(id + "-t").textContent = text; };
    const camText = { ok: "Camera is on", denied: "Camera access was blocked. Allow it in your browser's address bar, then try again.", error: "No camera found, or it's in use by another app.", unsupported: "This browser can't use the camera. Use Chrome, Edge or Safari.", stopped: "The camera turned off.", off: "Waiting for permission…" }[s.camera];
    set("ck-cam", s.camera === "ok" ? "ok" : s.camera === "off" ? "wait" : "bad", camText);
    const fOk = s.face === "ok" || s.face === "unavailable";
    set("ck-face", s.camera !== "ok" ? "" : fOk ? "ok" : s.face === "loading" ? "wait" : "bad", s.camera !== "ok" ? "Needs the camera" : s.face === "unavailable" ? "Face check couldn't load; the camera still runs" : s.label);
    const btn = document.getElementById("ck-cam-btn"); if (btn) btn.hidden = s.camera === "ok" || s.camera === "off";
    const vid = document.getElementById("ck-video");
    if (vid) { vid.className = "cam-big " + (s.camera === "ok" && fOk ? "ok" : s.camera === "ok" && s.face !== "loading" ? "bad" : ""); document.getElementById("ck-tag").textContent = s.camera === "ok" ? s.label : "Camera off"; document.getElementById("ck-empty").hidden = s.camera === "ok"; }
    const go = document.getElementById("ck-go"); if (go) go.disabled = !pr.ready();
  });
  document.getElementById("ck-video").prepend(pr.video);
  pr.startCamera();
}

/* ============================================================ exam */
async function beginFromCheck(practiceAs, resumeId) {
  const pr = S.proctor; if (!pr || !pr.ready()) return;
  await Proctor.enterFullscreen();
  if (resumeId) return resumeTest(resumeId);
  return startTest(practiceAs || undefined);
}
async function startTest(practiceAs) {
  app.innerHTML = `<div class="center"><div class="card stack fade-in" style="max-width:460px;text-align:center;align-items:center">
    <div class="spinner" style="width:28px;height:28px"></div><h3>Preparing your questions</h3>
    <p class="ink2">Drawing today's set from your question bank and writing a few fresh ones from your study notes. This can take up to a minute.</p></div></div>`;
  try {
    const t = await S.api.start(practiceAs);
    if (t.status === "done") { await loadData(); return go(`#/results/${t.id}`); }
    openExam(t);
  } catch (e) { toast(e.message); route(); }
}
async function resumeTest(id) {
  const t = await S.api.getTest(id);
  if (!t) return go("#/overview");
  if (t.status === "done") return go(`#/results/${id}`);
  openExam(t);
}
function openExam(t) {
  S.exam = { ...t, answers: t.answers || {}, conf: t.conf || {}, flags: t.flags || {}, integrity: t.integrity || { tabAways: 0, pastes: 0 }, cur: t.cur || 0, practice: t.kind === "practice" };
  if (new Date(t.deadline_at).getTime() <= Date.now()) return submitExam(true);
  const pr = S.proctor;
  if (!pr || pr.camera !== "ok") { S.exam = null; return go(`#/check/${t.kind === "practice" ? "practice-" + t.emp_key : t.id}`); }
  const prev = S.exam.integrity || {};
  pr.startedAt = t.started_at;
  pr.log = { strikes: prev.strikes || 0, tabAways: prev.tabAways || 0, pastes: prev.pastes || 0, events: (prev.events || []).slice(-150) };
  pr.onLog = (log) => { if (!S.exam) return; S.exam.integrity = { ...log, events: log.events.slice() }; queueSave(); };
  pr.onAutoSubmit = () => submitExam(true);
  if (prev.events?.length) pr.record("resume", "Came back to the assessment");
  pr.begin();
  if (location.hash !== "#/exam") location.hash = "#/exam"; else renderExam();
  startTimer();
}
let timerId = null;
function startTimer() {
  clearInterval(timerId);
  timerId = setInterval(() => {
    if (!S.exam) return clearInterval(timerId);
    const left = new Date(S.exam.deadline_at).getTime() - Date.now();
    const el = document.getElementById("timer");
    if (el) { el.querySelector("span").textContent = fmtClock(left); el.classList.toggle("low", left < 120000); }
    if (left <= 0) { clearInterval(timerId); submitExam(true); }
  }, 1000);
}
const answered = (q, a) => a != null && (q.type === "multi" ? a.length > 0 : q.type === "short" ? String(a).trim().length > 0 : true);
function renderExam() {
  const t = S.exam; const qs = t.questions_public; const q = qs[t.cur]; const a = t.answers[q.id]; const n = qs.length;
  const done = qs.filter((x) => answered(x, t.answers[x.id])).length;
  const left = new Date(t.deadline_at).getTime() - Date.now();
  app.innerHTML = `<div class="exam">
    <header class="exam-top">
      <div class="exam-top-in">
        <div class="brand-mark" style="width:32px;height:32px;font-size:19px">H</div>
        <div class="exam-title grow"><b>${t.practice ? `Practice · ${h(EMPLOYEES[t.emp_key].name)}` : "Daily assessment"}</b><span>${h(fmtDay(t.test_date, { weekday: "long", day: "numeric", month: "long" }))} · ${done} of ${n} answered</span></div>
        ${themeButton()}
        <div class="timer ${left < 120000 ? "low" : ""}" id="timer" role="timer" aria-label="Time left">${ICON.clock}<span>${fmtClock(left)}</span></div>
        <button class="btn dark" data-act="finish">Finish</button>
      </div>
      <div class="progress"><i style="width:${(100 * done) / n}%"></i></div>
    </header>
    <div class="exam-body">
      <aside class="qnav" aria-label="Questions">
        <span class="eyebrow">Questions</span>
        <div class="qnav-grid">${qs.map((x, i) => `<button class="qn ${i === t.cur ? "cur" : ""} ${answered(x, t.answers[x.id]) ? "ans" : ""} ${t.flags[x.id] ? "flag" : ""}" data-act="goto" data-i="${i}" aria-label="Question ${i + 1}${answered(x, t.answers[x.id]) ? ", answered" : ""}${t.flags[x.id] ? ", flagged" : ""}">${i + 1}</button>`).join("")}</div>
        <div class="legend"><span><i class="a"></i>Answered</span><span><i></i>Not answered</span><span><i class="f"></i>Flagged for review</span></div>
        <p class="xs muted">Keys: 1–4 to choose, ← → to move.</p>
      </aside>
      <section class="qpane">
        <article class="qcard fade-in" aria-labelledby="qprompt">
          <div class="qhead">
            <span class="qno">${String(t.cur + 1).padStart(2, "0")}<small>/ ${n}</small></span>
            <span class="grow"></span>
            ${q.ai ? `<span class="chip gold">${ICON.spark.replace("<svg", '<svg style="width:12px;height:12px"')} New today</span>` : ""}
            <span class="chip site">${h(siteLabel(q.site))}</span><span class="chip">${h(AREAS[q.area] || q.area)}</span>
            <span class="lvl" title="${LEVELS[q.level]}">${[1, 2, 3].map((l) => `<i class="${l <= q.level ? "on" : ""}"></i>`).join("")} ${LEVELS[q.level]}</span>
          </div>
          <div class="stack-s">
            <p class="qprompt" id="qprompt">${h(q.prompt)}</p>
            ${q.type === "multi" ? `<p class="small muted">Select all that apply.</p>` : q.type === "order" ? `<p class="small muted">Put the steps in the right order using the arrows.</p>` : q.type === "short" ? `<p class="small muted">Explain in your own words. Two to four sentences is enough.</p>` : ""}
          </div>
          ${q.code ? codeBlock(q.code) : ""}
          ${answerUI(q, a)}
          <div class="confbox"><span class="small ink2">How sure are you?</span><div class="seg" role="group" aria-label="Confidence">${CONF.map(([k, l]) => `<button class="${t.conf[q.id] === k ? "on" : ""}" data-act="conf" data-k="${k}" aria-pressed="${t.conf[q.id] === k}">${l}</button>`).join("")}</div></div>
        </article>
      </section>
    </div>
    <footer class="exam-foot"><div class="exam-foot-in">
      <button class="btn ghost" data-act="flag">${ICON.flag}${t.flags[q.id] ? "Unflag" : "Flag for review"}</button>
      <span class="grow"></span>
      <button class="btn" data-act="goto" data-i="${t.cur - 1}" ${t.cur === 0 ? "disabled" : ""}>${ICON.left}Back</button>
      ${t.cur < n - 1 ? `<button class="btn primary" data-act="goto" data-i="${t.cur + 1}">Next${ICON.right}</button>` : `<button class="btn primary" data-act="finish">Review &amp; submit${ICON.right}</button>`}
    </div></footer>
  </div>`;
  const ta = document.getElementById("short-answer");
  if (ta) ta.addEventListener("input", () => { S.exam.answers[q.id] = ta.value; queueSave(); });
}
function codeBlock(code) { return `<pre class="code" tabindex="0">${String(code).split("\n").map((l, i) => `<span class="ln">${i + 1}</span>${h(l)}`).join("\n")}</pre>`; }
function answerUI(q, a) {
  const key = (i) => String.fromCharCode(65 + i);
  if (q.type === "single" || q.type === "truefalse") return `<div class="opts" role="radiogroup" aria-labelledby="qprompt">${q.options.map((o, i) => `<button class="opt ${a === i ? "sel" : ""}" role="radio" aria-checked="${a === i}" data-act="pick" data-i="${i}"><span class="key">${key(i)}</span><span class="t">${h(o)}</span></button>`).join("")}</div>`;
  if (q.type === "multi") { const s = new Set(a || []); return `<div class="opts" role="group" aria-labelledby="qprompt">${q.options.map((o, i) => `<button class="opt multi ${s.has(i) ? "sel" : ""}" role="checkbox" aria-checked="${s.has(i)}" data-act="toggle" data-i="${i}"><span class="key">${s.has(i) ? "✓" : key(i)}</span><span class="t">${h(o)}</span></button>`).join("")}</div>`; }
  if (q.type === "order") { const arr = a || q.options; return `<div class="opts">${arr.map((o, i) => `<div class="ord"><span class="n">${i + 1}</span><span class="t">${h(o)}</span><span class="mv"><button data-act="move" data-i="${i}" data-d="-1" aria-label="Move up" ${i === 0 ? "disabled" : ""}>${ICON.up}</button><button data-act="move" data-i="${i}" data-d="1" aria-label="Move down" ${i === arr.length - 1 ? "disabled" : ""}>${ICON.down}</button></span></div>`).join("")}</div>`; }
  if (q.type === "short") return `<textarea class="input" id="short-answer" aria-labelledby="qprompt" placeholder="Type your answer…">${h(a || "")}</textarea>`;
  return "";
}
let saveT = null, saving = Promise.resolve();
function queueSave() {
  clearTimeout(saveT);
  saveT = setTimeout(() => { const t = S.exam; if (!t) return; const snap = JSON.parse(JSON.stringify(t)); saving = saving.then(() => S.api.save(snap)).catch(() => {}); }, 700);
}
function examAct(act, d) {
  const t = S.exam; const q = t.questions_public[t.cur];
  if (act === "pick") t.answers[q.id] = +d.i;
  if (act === "toggle") { const s = new Set(t.answers[q.id] || []); s.has(+d.i) ? s.delete(+d.i) : s.add(+d.i); t.answers[q.id] = [...s].sort((x, y) => x - y); }
  if (act === "move") { const arr = (t.answers[q.id] || q.options).slice(); const i = +d.i, j = i + +d.d; if (j < 0 || j >= arr.length) return; [arr[i], arr[j]] = [arr[j], arr[i]]; t.answers[q.id] = arr; }
  if (act === "conf") t.conf[q.id] = d.k;
  if (act === "flag") t.flags[q.id] = !t.flags[q.id];
  if (act === "goto") { const i = +d.i; if (i < 0 || i >= t.questions_public.length) return; t.cur = i; renderExam(); window.scrollTo({ top: 0 }); queueSave(); return; }
  queueSave(); renderExam();
}
function finishModal() {
  const t = S.exam; const qs = t.questions_public;
  const un = qs.map((q, i) => [q, i]).filter(([q]) => !answered(q, t.answers[q.id]));
  const fl = qs.map((q, i) => [q, i]).filter(([q]) => t.flags[q.id]);
  modal(`<h3 style="font-size:20px">Submit your assessment?</h3>
    <p class="ink2">${qs.length - un.length} of ${qs.length} questions answered. You can't change answers after submitting.</p>
    ${un.length ? `<div class="stack-s"><span class="eyebrow">Not answered</span><div class="row" style="gap:6px">${un.map(([, i]) => `<button class="qn" style="width:36px;height:36px" data-act="goto-close" data-i="${i}">${i + 1}</button>`).join("")}</div></div>` : ""}
    ${fl.length ? `<div class="stack-s"><span class="eyebrow">Flagged</span><div class="row" style="gap:6px">${fl.map(([, i]) => `<button class="qn flag" style="width:36px;height:36px" data-act="goto-close" data-i="${i}">${i + 1}</button>`).join("")}</div></div>` : ""}
    <div class="row end"><button class="btn" data-act="close-modal">Keep working</button><button class="btn primary" data-act="submit">Submit assessment</button></div>`);
}
function modal(inner) { closeModal(); const m = document.createElement("div"); m.className = "modal-back"; m.id = "modal"; m.innerHTML = `<div class="modal fade-in" role="dialog" aria-modal="true">${inner}</div>`; document.body.appendChild(m); m.addEventListener("click", (e) => { if (e.target === m) closeModal(); }); }
function closeModal() { document.getElementById("modal")?.remove(); }
let submitting = false;
async function submitExam(auto = false) {
  if (submitting || !S.exam) return; submitting = true; closeModal(); clearInterval(timerId); clearTimeout(saveT);
  if (S.proctor) { S.exam.integrity = { ...S.proctor.log, events: S.proctor.log.events.slice() }; S.proctor.stop(); S.proctor = null; }
  app.innerHTML = `<div class="center"><div class="card stack fade-in" style="max-width:420px;text-align:center;align-items:center"><div class="spinner" style="width:28px;height:28px"></div><h3>${auto ? "Time's up. Marking your answers" : "Marking your answers"}</h3><p class="ink2">Written answers are being checked against the model answer.</p></div></div>`;
  try {
    await saving;
    const t = await S.api.submit(S.exam, auto);
    S.exam = null; await loadData();
    location.hash = `#/results/${t.id}`;
  } catch (e) { toast(e.message); renderExam(); startTimer(); }
  finally { submitting = false; }
}
document.addEventListener("keydown", (e) => {
  if (!S.exam || location.hash !== "#/exam" || document.getElementById("modal")) return;
  if (e.target.closest("textarea,input")) return;
  const q = S.exam.questions_public[S.exam.cur];
  if (e.key === "ArrowRight") examAct("goto", { i: S.exam.cur + 1 });
  else if (e.key === "ArrowLeft") examAct("goto", { i: S.exam.cur - 1 });
  else if (/^[1-6]$/.test(e.key) && q.options && +e.key <= q.options.length) {
    if (q.type === "single" || q.type === "truefalse") examAct("pick", { i: +e.key - 1 });
    else if (q.type === "multi") examAct("toggle", { i: +e.key - 1 });
  }
});

/* ============================================================ results (shared) */
async function renderTestPage(id) {
  const t = await S.api.getTest(id);
  if (!t) return paint("", `<div class="empty">That assessment isn't available.</div>`);
  if (t.status !== "done") { if (t.user_id === S.user.id) return resumeTest(id); return paint("", `<div class="empty">This assessment is still in progress.</div>`); }
  const mgr = S.staff.role === "manager"; const own = t.user_id === S.user.id;
  const who = mgr ? (S.data.staff.find((s) => s.email === t.email)?.full_name || EMPLOYEES[t.emp_key].name) : null;
  const sc = t.score; const [bl, bc] = band(sc.pct);
  const filter = S.cache.rvFilter || "all";
  const review = t.review.map((q, i) => ({ q, i, g: t.grades?.[q.id], a: t.answers?.[q.id] }));
  const shown = review.filter(({ q, g }) => filter === "all" || (filter === "wrong" && g && g.f != null && g.f < 1) || (filter === "flag" && t.flags?.[q.id]) || (filter === "written" && q.type === "short"));
  const weak = Object.entries(sc.byArea || {}).filter(([, v]) => v.m).sort((a, b) => a[1].e / a[1].m - b[1].e / b[1].m).slice(0, 3);
  const back = mgr ? (own ? "#/bank" : `#/person/${t.emp_key}`) : "#/results";
  paint(mgr ? (own ? "bank" : `person-${t.emp_key}`) : "results", `
    <div class="page-h"><div><a href="${back}" class="btn sm ghost" style="margin-left:-12px">${ICON.left}Back</a>
      <h1 style="margin-top:6px">${who ? h(who) + " · " : ""}${h(fmtDay(t.test_date, { weekday: "long", day: "numeric", month: "long" }))}</h1>
      <p class="sub">${t.kind === "practice" ? "Practice assessment · not counted" : "Daily assessment"}</p></div></div>
    <div class="stack" style="gap:20px">
      <section class="card score-hero">
        ${ring(sc.pct)}
        <div class="stack">
          <div class="row"><span class="chip ${bc}">${bl}</span>${sc.pending ? `<span class="chip warn">${sc.pending} written answer${sc.pending > 1 ? "s" : ""} awaiting marking</span>` : ""}${sc.confWrong?.length ? `<span class="chip bad">${sc.confWrong.length} certain but wrong</span>` : ""}</div>
          <h2 style="font-size:24px">${sc.e} of ${sc.m} points</h2>
          <div class="grid g-3" style="gap:12px;max-width:520px">
            <div class="kpi"><span class="eyebrow">Time taken</span><span class="mono">${fmtClock(new Date(t.submitted_at) - new Date(t.started_at))}${t.auto_submitted ? " · time ran out" : ""}</span></div>
            <div class="kpi"><span class="eyebrow">Strikes</span><span class="mono">${t.integrity?.strikes || 0} / ${MAX_STRIKES}</span></div>
            <div class="kpi"><span class="eyebrow">Left the page</span><span class="mono">${t.integrity?.tabAways || 0}×</span></div>
          </div>
        </div>
      </section>
      ${integrityCard(t)}
      <div class="grid g-main">
        <section class="card"><div class="card-h"><h3>By area</h3></div>${skillBars(sc.byArea, { empty: "Nothing marked yet." })}</section>
        <section class="card"><div class="card-h"><h3>Focus next</h3></div>
          ${weak.length ? `<div class="list">${weak.map(([a, v]) => `<div class="li"><span class="avatar" style="background:var(--warn-soft);color:var(--warn)">${pct(v.e, v.m)}</span><div class="grow"><b style="font-weight:500">${h(AREAS[a] || a)}</b><div class="xs muted">${Math.round(v.e * 10) / 10} of ${v.m} points</div></div></div>`).join("")}</div>` : `<div class="empty">Nothing to flag.</div>`}
          <p class="xs muted" style="margin-top:12px">Tomorrow's assessment leans toward weaker areas automatically.</p></section>
      </div>
      <section class="card">
        <div class="card-h" style="flex-wrap:wrap"><h3>Answers &amp; explanations</h3>
          <div class="tabs">${[["all", "All"], ["wrong", "To review"], ["flag", "Flagged"], ["written", "Written"]].map(([k, l]) => `<button class="${filter === k ? "on" : ""}" data-act="rv-filter" data-k="${k}" data-id="${t.id}">${l}</button>`).join("")}</div></div>
        ${shown.length ? shown.map((r) => reviewItem(t, r, mgr && !own)).join("") : `<div class="empty">Nothing in this view.</div>`}
      </section>
    </div>`);
}
const EV_KIND = { "face-none": "bad", "face-multi": "bad", "face-side": "bad", "face-down": "bad", "left-page": "warn", "fullscreen-exit": "warn", "idle-unanswered": "warn", "camera-stopped": "bad", "paste-blocked": "warn", "copy-blocked": "info", idle: "info", start: "info", resume: "info" };
function integrityCard(t) {
  const ig = t.integrity || {}; const evs = (ig.events || []).filter((e) => e.type !== "start");
  const total = Math.max(1, Math.round((new Date(t.submitted_at || t.deadline_at) - new Date(t.started_at)) / 1000));
  const strikes = ig.strikes || 0;
  const status = !ig.events ? ["Not monitored (older test)", ""] : strikes === 0 ? ["Clean: no strikes", "good"] : strikes >= MAX_STRIKES ? ["Submitted automatically after " + MAX_STRIKES + " strikes", "bad"] : [`${strikes} strike${strikes > 1 ? "s" : ""}`, "warn"];
  return `<section class="card stack">
    <div class="card-h" style="margin:0"><h3>Integrity</h3><span class="chip ${status[1]}">${status[0]}</span></div>
    ${evs.length ? `<div class="tl" role="img" aria-label="Events across the test">${evs.map((e) => `<i class="${EV_KIND[e.type] || "info"}" style="left:${Math.min(99, (100 * e.t) / total)}%" data-tip="${fmtClock(e.t * 1000)} · ${h(e.detail)}"></i>`).join("")}</div>
      <div class="row between xs muted mono"><span>0:00</span><span>${fmtClock(total * 1000)}</span></div>
      <div>${evs.map((e) => `<div class="ev"><span class="t">${fmtClock(e.t * 1000)}</span>${e.strike ? `<span class="chip ${EV_KIND[e.type] === "bad" ? "bad" : "warn"}">Strike ${e.strike}</span>` : `<span class="chip">Logged</span>`}<span class="grow">${h(e.detail)}</span></div>`).join("")}</div>`
      : `<p class="small muted">${ig.events ? "No warnings during this test. The camera, tab and idle checks ran the whole time." : "This test was taken before monitoring was added."}</p>`}
  </section>`;
}
function reviewItem(t, { q, i, g, a }, canMark) {
  const verdict = !g || g.f == null ? `<span class="chip warn">Awaiting marking</span>` : g.f >= 1 ? `<span class="chip good">${ICON.check.replace("<svg", '<svg style="width:12px;height:12px"')} Correct</span>` : g.f > 0 ? `<span class="chip warn">Partly right · ${Math.round(g.f * 100)}%</span>` : `<span class="chip bad">Incorrect</span>`;
  let yours = "", right = "";
  if (q.type === "single" || q.type === "truefalse") { yours = a == null ? "No answer" : q.options[a]; right = q.options[q.answer]; }
  if (q.type === "multi") { yours = (a || []).map((x) => q.options[x]).join(" · ") || "No answer"; right = (q.answer || []).map((x) => q.options[x]).join(" · "); }
  if (q.type === "order") { yours = (a || q.options).map((x, k) => `${k + 1}. ${x}`).join("   "); right = (q.correct || []).map((x, k) => `${k + 1}. ${x}`).join("   "); }
  if (q.type === "short") { yours = a || "No answer"; right = q.rubric?.model || ""; }
  const ok = g && g.f >= 1;
  return `<div class="rv">
    <div class="row between"><div class="row" style="gap:6px"><span class="qno" style="font-size:24px">${String(i + 1).padStart(2, "0")}</span><span class="chip site">${h(siteLabel(q.site))}</span><span class="chip">${h(AREAS[q.area] || q.area)}</span>${q.ai ? `<span class="chip gold">New that day</span>` : ""}${t.conf?.[q.id] === "sure" && g && g.f != null && g.f < 0.5 ? `<span class="chip bad">Certain but wrong</span>` : ""}</div>${verdict}</div>
    <p style="font-weight:500;font-size:15.5px;max-width:72ch">${h(q.prompt)}</p>
    ${q.code ? codeBlock(q.code) : ""}
    <div class="ans ${g && g.f != null ? (ok ? "right" : "wrong") : ""}"><span class="k">${canMark ? "Their answer" : "Your answer"}</span>${h(yours)}</div>
    ${ok ? "" : `<div class="ans model"><span class="k">${q.type === "short" ? "Model answer" : "Correct answer"}</span>${h(right)}</div>`}
    ${g?.feedback ? `<p class="why"><b>Feedback.</b> ${h(g.feedback)}</p>` : ""}
    ${q.explanation ? `<p class="why"><b>Why.</b> ${h(q.explanation)}</p>` : ""}
    ${q.source ? `<p class="src">Source: ${h(q.source)}</p>` : ""}
    ${canMark && q.type === "short" ? `<div class="row" style="gap:6px"><span class="small ink2">Your mark</span>${[0, 0.25, 0.5, 0.75, 1].map((f) => `<button class="btn sm ${g && g.f === f ? "primary" : ""}" data-act="mark" data-test="${t.id}" data-q="${h(q.id)}" data-f="${f}">${f * 100}%</button>`).join("")}</div>` : ""}
  </div>`;
}

/* ============================================================ manager */
function empData(k) {
  const d = S.data; const staffRow = d.staff.find((s) => s.role === "employee" && s.emp_key === k);
  const stats = d.stats.find((s) => s.emp_key === k && (!staffRow || s.email === staffRow.email));
  const tests = d.tests.filter((t) => t.emp_key === k && t.kind === "daily" && (!staffRow || t.email === staffRow.email));
  return { staffRow, stats, tests, hist: stats?.history || [], bank: d.bank.filter((q) => q.emp_key === k && !q.retired) };
}
function renderTeam() {
  const today = localDate();
  const emps = Object.values(EMPLOYEES).map((e) => ({ e, ...empData(e.key) }));
  const all7 = emps.flatMap((x) => x.hist.slice(-7)); const teamAvg = all7.length ? Math.round(all7.reduce((a, b) => a + b.pct, 0) / all7.length) : null;
  const doneToday = emps.filter((x) => x.tests.some((t) => t.test_date === today && t.status === "done")).length;
  const pending = S.data.tests.reduce((a, t) => a + (t.score?.pending || 0), 0);
  const recent = S.data.tests.filter((t) => t.status === "done" && t.kind === "daily").slice(0, 8);
  paint("team", `
    <div class="page-h"><div><h1>${greeting()}, ${h(firstName(S.staff.full_name))}</h1><p class="sub">How the web team is doing on their daily skills checks.</p></div>
      <div class="row"><a class="btn" href="#/people">${ICON.key}People &amp; access</a></div></div>
    <div class="stack" style="gap:20px">
      <div class="grid g-4">
        ${kpi("Team 7-day average", teamAvg == null ? "–" : `${teamAvg}<small>%</small>`, "Across both learners")}
        ${kpi("Done today", `${doneToday}<small> / ${emps.length}</small>`, fmtDay(today, { weekday: "long", day: "numeric", month: "short" }))}
        ${kpi("Written answers to mark", `${pending}`, pending ? "Open a test to mark them" : "All marked")}
        ${kpi("Question bank", `${S.data.bank.filter((q) => !q.retired).length}`, "Plus 4 fresh questions per person daily")}
      </div>
      <div class="grid g-2">${emps.map(personCard).join("")}</div>
      <section class="card"><div class="card-h"><h3>Latest results</h3></div>
        ${recent.length ? `<div class="list">${recent.map((t) => resultRow(t, S.data.staff.find((s) => s.email === t.email)?.full_name || EMPLOYEES[t.emp_key]?.name)).join("")}</div>` : `<div class="empty">Results appear here once your team takes their first assessment.</div>`}</section>
    </div>`);
}
function personCard({ e, staffRow, tests, hist, bank, stats }) {
  const today = localDate(); const t = tests.find((x) => x.test_date === today); const m = metrics(hist);
  const status = !staffRow ? ["Not added yet", ""] : !t ? ["Not started today", ""] : t.status === "done" ? [`Done today · ${t.score.pct}%`, band(t.score.pct)[1]] : ["In progress now", "warn"];
  const weak = Object.entries(stats?.area_stats || {}).filter(([, v]) => v.m).sort((a, b) => a[1].e / a[1].m - b[1].e / b[1].m).slice(0, 2);
  return `<a class="card stack" href="#/person/${e.key}" style="text-decoration:none;color:inherit">
    <div class="row"><div class="avatar lg">${initials(e.name)}</div><div class="grow"><h3 style="font-size:17px">${h(staffRow?.full_name || e.name)}</h3><div class="xs muted">${h(staffRow?.email || "No email linked yet")}</div></div><span class="chip ${status[1]}">${status[0]}</span></div>
    <div class="row" style="gap:6px">${e.sites.map((s) => `<span class="chip site">${h(s)}</span>`).join("")}</div>
    <div class="row between" style="align-items:flex-end">
      <div class="row" style="gap:28px"><div class="kpi"><span class="eyebrow">7-day avg</span><span class="v" style="font-size:24px">${m.avg7 == null ? "–" : m.avg7 + "%"}</span></div><div class="kpi"><span class="eyebrow">Streak</span><span class="v" style="font-size:24px">${m.streak}</span></div><div class="kpi"><span class="eyebrow">Bank seen</span><span class="v" style="font-size:24px">${(stats?.seen_ids || []).length}<small>/${bank.length}</small></span></div></div>
      ${spark(hist)}
    </div>
    ${weak.length ? `<p class="small ink2">Weakest: ${weak.map(([a, v]) => `<b style="font-weight:500">${h(AREAS[a])}</b> ${pct(v.e, v.m)}%`).join(" · ")}</p>` : `<p class="small muted">No scores yet.</p>`}
  </a>`;
}
function renderPerson(k) {
  const e = EMPLOYEES[k]; const { staffRow, stats, tests, hist, bank } = empData(k); const m = metrics(hist);
  const done = tests.filter((t) => t.status === "done");
  paint(`person-${k}`, `
    <div class="page-h"><div class="row"><div class="avatar lg">${initials(e.name)}</div><div><h1>${h(staffRow?.full_name || e.name)}</h1><p class="sub">${h(staffRow?.email || "Not added yet — add their email under People & access")}</p></div></div>
      <button class="btn" data-act="practice" data-emp="${k}">${ICON.play}Try their test</button></div>
    <div class="stack" style="gap:20px">
      <div class="grid g-4">
        ${kpi("7-day average", m.avg7 == null ? "–" : `${m.avg7}<small>%</small>`, m.delta == null ? "Needs two weeks of tests" : `${m.delta >= 0 ? "▲" : "▼"} ${Math.abs(m.delta)} pts vs previous week`)}
        ${kpi("Streak", `${m.streak}`, "Consecutive days")}
        ${kpi("Tests completed", `${m.count}`, m.count ? `Best ${m.best}%` : "None yet")}
        ${kpi("Bank seen", `${(stats?.seen_ids || []).length}<small> / ${bank.length}</small>`, `${Math.max(0, Math.floor((bank.length - (stats?.seen_ids || []).length) / 11))} days of unseen questions left`)}
      </div>
      <div class="grid g-main">
        <section class="card"><div class="card-h"><h3>Score trend</h3></div>${trendChart(hist)}</section>
        <section class="card"><div class="card-h"><h3>Activity</h3></div>${heatmap(hist)}</section>
      </div>
      <div class="grid g-main">
        <section class="card"><div class="card-h"><h3>Skills by area</h3></div>${skillBars(stats?.area_stats, { empty: "No scores yet." })}</section>
        <section class="card"><div class="card-h"><h3>Sites</h3></div><div class="stack-s">${e.sites.map((s) => `<span class="chip site" style="align-self:flex-start">${h(s)}</span>`).join("")}</div></section>
      </div>
      <section class="card"><div class="card-h"><h3>Assessments</h3><span class="xs muted">${done.length} completed</span></div>
        ${tests.length ? `<div class="tablebox"><table><thead><tr><th>Date</th><th>Score</th><th>Time</th><th>Integrity</th><th>Status</th></tr></thead><tbody>
        ${tests.map((t) => `<tr class="click" data-href="#/results/${t.id}"><td>${h(fmtDay(t.test_date, { weekday: "short", day: "numeric", month: "short" }))}</td>
          <td>${t.status === "done" ? `<b>${t.score.pct}%</b> <span class="xs muted">${t.score.e}/${t.score.m}</span>` : "–"}</td>
          <td class="mono xs">${t.submitted_at ? fmtClock(new Date(t.submitted_at) - new Date(t.started_at)) : "–"}</td>
          <td class="xs">${t.integrity?.strikes ? `<span class="chip ${t.integrity.strikes >= MAX_STRIKES ? "bad" : "warn"}">${t.integrity.strikes} strike${t.integrity.strikes > 1 ? "s" : ""}</span>` : t.integrity?.events ? `<span class="chip good">Clean</span>` : "<span class='muted'>–</span>"}</td>
          <td>${t.status !== "done" ? `<span class="chip warn">In progress</span>` : t.score.pending ? `<span class="chip warn">${t.score.pending} to mark</span>` : `<span class="chip ${band(t.score.pct)[1]}">${band(t.score.pct)[0]}</span>`}</td></tr>`).join("")}
        </tbody></table></div>` : `<div class="empty">No assessments yet.</div>`}</section>
    </div>`);
}
function renderPeople() {
  const staff = S.data.staff;
  paint("people", `
    <div class="page-h"><div><h1>People &amp; access</h1><p class="sub">Anyone with an @${h(DOMAIN)} email can sign in. Only people listed here get a role.</p></div></div>
    <div class="stack" style="gap:20px">
      <section class="card"><div class="card-h"><h3>Team</h3><span class="xs muted">${staff.length} people</span></div>
        <div class="tablebox"><table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Takes the test for</th><th></th></tr></thead><tbody>
        ${staff.map((s) => `<tr><td><div class="row" style="gap:10px;flex-wrap:nowrap"><span class="avatar">${initials(s.full_name)}</span><b style="font-weight:500">${h(s.full_name)}</b></div></td><td class="mono xs">${h(s.email)}</td>
          <td><span class="chip ${s.role === "manager" ? "accent" : ""}">${s.role === "manager" ? "Manager" : "Employee"}</span></td><td>${s.emp_key ? h(EMPLOYEES[s.emp_key].name) + "'s sites" : "–"}</td>
          <td style="text-align:right">${s.email === S.user.email ? `<span class="xs muted">You</span>` : `<button class="btn sm danger" data-act="staff-del" data-email="${h(s.email)}">Remove</button>`}</td></tr>`).join("")}
        </tbody></table></div></section>
      <form class="card stack" id="staff-form" novalidate>
        <div class="card-h" style="margin:0"><h3>Add or update a person</h3></div>
        <div class="grid g-4" style="align-items:end">
          <div class="field"><label for="sf-name">Full name</label><input class="input" id="sf-name" required placeholder="Sai Lakshmi"></div>
          <div class="field"><label for="sf-email">Work email</label><input class="input" id="sf-email" type="email" required placeholder="name@${h(DOMAIN)}"></div>
          <div class="field"><label for="sf-role">Role</label><select class="input" id="sf-role"><option value="employee">Employee</option><option value="manager">Manager</option></select></div>
          <div class="field"><label for="sf-emp">Takes the test for</label><select class="input" id="sf-emp"><option value="harshith">Harshith's sites</option><option value="sai">Sai Lakshmi's sites</option><option value="">None (manager)</option></select></div>
        </div>
        <div id="sf-err"></div>
        <div class="row end"><button class="btn primary" type="submit">${ICON.plus}Save person</button></div>
      </form>
      <section class="card stack-s"><h3>How sign-in works</h3>
        <p class="ink2 small">People go to this site, enter their @${h(DOMAIN)} email and click the link we email them. Addresses on any other domain are refused. Someone who signs in but isn't listed here sees a "not set up yet" message until you add them.</p></section>
    </div>`);
  document.getElementById("staff-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const row = { full_name: document.getElementById("sf-name").value.trim(), email: document.getElementById("sf-email").value.trim().toLowerCase(), role: document.getElementById("sf-role").value, emp_key: document.getElementById("sf-emp").value || null };
    const err = (m) => (document.getElementById("sf-err").innerHTML = `<div class="notice bad">${h(m)}</div>`);
    if (!row.full_name) return err("Enter their name.");
    if (!row.email.endsWith("@" + DOMAIN)) return err(`The email must end in @${DOMAIN}.`);
    if (row.role === "employee" && !row.emp_key) return err("Choose whose sites this employee is tested on.");
    try { await S.api.staffSave(row); await loadData(); toast(`${row.full_name} saved.`); renderPeople(); } catch (x) { err(x.message); }
  });
}
function renderBank() {
  const bank = S.data.bank;
  const section = (k) => {
    const e = EMPLOYEES[k]; const qs = bank.filter((q) => q.emp_key === k && !q.retired); const { stats } = empData(k);
    const sites = [...e.sites, "core"].filter((s) => qs.some((q) => q.site === s));
    return `<section class="card stack">
      <div class="row between"><div class="row"><div class="avatar lg">${initials(e.name)}</div><div><h3 style="font-size:17px">${h(e.name)}</h3><div class="xs muted">${qs.length} active questions · ${bank.filter((q) => q.emp_key === k && q.retired).length} retired</div></div></div>
        <button class="btn" data-act="practice" data-emp="${k}">${ICON.play}Practice test</button></div>
      <div class="tablebox"><table><thead><tr><th>Site</th><th>Questions</th><th>Recall</th><th>Understand</th><th>Apply</th><th>Written</th></tr></thead><tbody>
      ${sites.map((s) => { const sq = qs.filter((q) => q.site === s); return `<tr><td><span class="chip site">${h(siteLabel(s))}</span></td><td><b>${sq.length}</b></td>${[1, 2, 3].map((l) => `<td>${sq.filter((q) => q.level === l).length}</td>`).join("")}<td>${sq.filter((q) => q.type === "short").length}</td></tr>`; }).join("")}
      </tbody></table></div>
      <div class="stack-s"><span class="eyebrow">Coverage by area</span>${skillBarsCount(qs)}</div>
      <p class="xs muted">${(stats?.seen_ids || []).length} of ${qs.length} seen so far. Refreshed every Friday from the week's GitHub changes.</p>
    </section>`;
  };
  paint("bank", `
    <div class="page-h"><div><h1>Question bank</h1><p class="sub">Each person draws from their own bank, so they never get the same question.</p></div></div>
    <div class="stack" style="gap:20px">${Object.keys(EMPLOYEES).map(section).join("")}</div>`);
}
function skillBarsCount(qs) {
  const max = Math.max(1, ...Object.keys(AREAS).map((a) => qs.filter((q) => q.area === a).length));
  return `<div class="bars">${Object.keys(AREAS).map((a) => { const n = qs.filter((q) => q.area === a).length; return `<div class="bar" data-tip="${h(AREAS[a])}: ${n} questions"><span class="ink2">${h(AREAS[a])}</span><span class="trk"><span class="fill" style="width:${(100 * n) / max}%"></span></span><span class="v">${n}</span></div>`; }).join("")}</div>`;
}

/* ============================================================ events */
document.addEventListener("click", async (e) => {
  const row = e.target.closest("tr[data-href]"); if (row) { location.hash = row.dataset.href; return; }
  const el = e.target.closest("[data-act]"); if (!el) return;
  const d = el.dataset; const act = d.act;
  if (["pick", "toggle", "move", "conf", "flag", "goto"].includes(act) && S.exam) return examAct(act, d);
  switch (act) {
    case "reload": return location.reload();
    case "signout": await S.api.signOut(); S.exam = null; location.hash = ""; return route(true);
    case "menu": S.menu = !S.menu; return route();
    case "start": return go("#/check");
    case "resume": return go(`#/check/${d.id}`);
    case "practice": return go(`#/check/practice-${d.emp}`);
    case "begin": return beginFromCheck(d.practice, d.resume);
    case "cam-retry": return S.proctor?.startCamera();
    case "theme": {
      const order = THEMES.map((x) => x[0]); const next = order[(order.indexOf(getTheme()) + 1) % order.length];
      setTheme(next);
      document.querySelectorAll('[data-act="theme"]').forEach((b) => { b.outerHTML = themeButton(); });
      return;
    }
    case "mark-read": {
      try { await S.api.markRead(d.ch); if (!S.data.reads.some((r) => r.chapter_id === d.ch)) S.data.reads.push({ chapter_id: d.ch, read_at: new Date().toISOString() }); } catch (x) { toast(x.message); return; }
      return d.next ? go(`#/textbook/${d.next}`) : go("#/textbook");
    }
    case "tb-emp": S.cache.tbEmp = d.emp; return renderTextbook();
    case "finish": return finishModal();
    case "submit": return submitExam(false);
    case "close-modal": return closeModal();
    case "goto-close": closeModal(); return examAct("goto", d);
    case "signin-again": return renderSignIn();
    case "signin-resend": try { await S.api.signIn(d.email); toast("Sent again. Check your inbox."); } catch (x) { toast(x.message); } return;
    case "study-site": S.cache.studySite = d.site; return renderStudy();
    case "rv-filter": S.cache.rvFilter = d.k; return renderTestPage(d.id);
    case "mark": try { await S.api.mark(d.test, d.q, +d.f); await loadData(); toast("Mark saved."); renderTestPage(d.test); } catch (x) { toast(x.message); } return;
    case "staff-del":
      if (el.dataset.armed !== "1") { el.dataset.armed = "1"; el.textContent = "Click again to remove"; setTimeout(() => { if (el.isConnected) { el.dataset.armed = ""; el.textContent = "Remove"; } }, 4000); return; }
      try { await S.api.staffDelete(d.email); await loadData(); toast("Removed."); renderPeople(); } catch (x) { toast(x.message); } return;
  }
});
window.addEventListener("hashchange", () => { S.menu = false; });

boot();
