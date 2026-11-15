// Homesly Skills Check API (Supabase Edge Function).
// Actions: start (draw today's test), submit (mark it), mark (manager override), import (load the question bank).
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  AI_COUNT, MINUTES, TEST_SIZE, buildReview, computeScore, gradeAuto, hash, isAnswered, pickFacts, prepare,
  publicView, rngFrom, selectFromBank, shuffle, updateStats, validQuestion, weekOf, WEEK_FOCUS,
  type Fact, type Grade, type Question, type Stats,
} from "./engine.ts";
import { markWrittenAnswers, writeFreshQuestions } from "./claude.ts";
import { hiringAction, importRole } from "./hiring.ts";

const ALLOWED_ORIGIN = Deno.env.get("ALLOWED_ORIGIN") || "*";
const TIMEZONE = Deno.env.get("TEST_TIMEZONE") || "Asia/Kolkata";
const cors = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-import-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const fail = (message: string, status = 400) => json({ error: message }, status);

const admin: SupabaseClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const hourNow = () => Number(new Intl.DateTimeFormat("en-GB", { timeZone: TIMEZONE, hour: "numeric", hourCycle: "h23" }).format(new Date()));
/** Until this hour on Friday, wait for the weekly refresh rather than falling back to a general test. */
const FRIDAY_WAIT_UNTIL = Number(Deno.env.get("FRIDAY_WAIT_UNTIL") || 13);

async function caller(req: Request) {
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user?.email) return null;
  const email = data.user.email.toLowerCase();
  if (!email.endsWith("@homeslystays.com")) return null;
  const { data: staff } = await admin.from("staff").select("*").eq("email", email).maybeSingle();
  return { id: data.user.id, email, staff: staff as { role: string; emp_key: string | null; full_name: string } | null };
}

async function loadStats(userId: string, email: string, emp: string): Promise<Stats> {
  const { data } = await admin.from("learner_stats").select("*").eq("user_id", userId).maybeSingle();
  return data
    ? { seen_ids: data.seen_ids, wrong_ids: data.wrong_ids, used_facts: data.used_facts, recent_prompts: data.recent_prompts, area_stats: data.area_stats, history: data.history }
    : { seen_ids: [], wrong_ids: [], used_facts: [], recent_prompts: [], area_stats: {}, history: [] };
}
async function saveStats(userId: string, email: string, emp: string, s: Stats) {
  await admin.from("learner_stats").upsert({ user_id: userId, email, emp_key: emp, ...s, updated_at: new Date().toISOString() });
}
const publicTest = (t: Record<string, unknown>) => { const { questions: _hidden, ...rest } = t; return rest; };

// ------------------------------------------------------------------ start
async function start(user: NonNullable<Awaited<ReturnType<typeof caller>>>, body: { practiceAs?: string }) {
  const isManager = user.staff?.role === "manager";
  const practice = !!body.practiceAs;
  const emp = practice ? body.practiceAs! : user.staff?.emp_key;
  if (practice && !isManager) return fail("Only managers can take practice tests.", 403);
  if (!emp || !["harshith", "sai"].includes(emp)) return fail("Your account isn't set up for a test yet. Ask your manager to add you.", 403);
  const date = today();

  if (!practice) {
    const { data: existing } = await admin.from("tests").select("*").eq("user_id", user.id).eq("test_date", date).eq("kind", "daily").maybeSingle();
    if (existing) return json({ test: publicTest(existing) });
  }

  const [{ data: bankRows }, { data: factRows }] = await Promise.all([
    admin.from("questions").select("*").eq("emp_key", emp).eq("retired", false),
    admin.from("facts").select("*").eq("emp_key", emp),
  ]);
  const bank = (bankRows || []).filter(validQuestion) as Question[];
  if (!bank.length) return fail("The question bank is empty. Ask your manager to import it.", 500);
  const stats = practice ? { seen_ids: [], wrong_ids: [], used_facts: [], recent_prompts: [], area_stats: {}, history: [] } : await loadStats(user.id, user.email, emp);
  const rnd = rngFrom(hash(`${emp}|${user.id}|${date}|${practice ? Date.now() : "daily"}`));
  const allFacts = (factRows || []) as Fact[];

  // Work weeks: Friday is about this week's Mon-Thu work; other days revise the latest weeks.
  const { dow, monday } = weekOf(date);
  const { data: weeks } = await admin.from("work_weeks").select("week").eq("emp_key", emp).order("week", { ascending: false }).limit(2);
  const latest = weeks?.[0]?.week as string | undefined, previous = weeks?.[1]?.week as string | undefined;
  const weekly = dow === 5 && latest === monday;
  if (dow === 5 && !weekly && !practice && hourNow() < FRIDAY_WAIT_UNTIL) {
    return fail(`This week's questions are still being prepared from GitHub. Friday's test opens once they're loaded, or at ${FRIDAY_WAIT_UNTIL}:00 at the latest.`, 409);
  }
  const boost = (x: { week?: string | null }) => (x.week && x.week === latest ? 2.5 : x.week && x.week === previous ? 1.5 : 1);

  let fresh: Question[] = [];
  try {
    const weekFacts = weekly ? allFacts.filter((f) => f.week === latest) : [];
    const facts = weekFacts.length ? pickFacts(weekFacts, stats, AI_COUNT * 3, rnd) : pickFacts(allFacts, stats, AI_COUNT * 3, rnd, boost);
    fresh = (await writeFreshQuestions(emp, facts, stats.recent_prompts, AI_COUNT, date)).filter(validQuestion);
  } catch (e) { console.error("fresh questions failed", e); }
  let picked: Question[];
  if (weekly) {
    const weekBank = bank.filter((q) => q.week === latest);
    const nWeek = Math.min(weekBank.length, Math.max(0, Math.round(TEST_SIZE * WEEK_FOCUS) - fresh.length));
    const fromWeek = selectFromBank(emp, weekBank, stats, nWeek, rnd);
    const rest = selectFromBank(emp, bank.filter((q) => !fromWeek.includes(q)), stats, TEST_SIZE - fresh.length - fromWeek.length, rnd, boost);
    picked = fromWeek.concat(rest);
  } else {
    picked = selectFromBank(emp, bank, stats, TEST_SIZE - fresh.length, rnd, boost);
  }
  const questions = shuffle(picked.concat(fresh), rnd).sort((a, b) => a.level - b.level).map((q) => prepare(q, rnd));

  const startedAt = new Date();
  const row = {
    user_id: user.id, email: user.email, emp_key: emp, kind: practice ? "practice" : "daily", test_date: date,
    started_at: startedAt.toISOString(), deadline_at: new Date(startedAt.getTime() + MINUTES * 60_000).toISOString(),
    questions, questions_public: questions.map(publicView), week: weekly ? latest : null,
  };
  const { data, error } = await admin.from("tests").insert(row).select("*").single();
  if (error) {
    // A second tab may have created today's test at the same moment: return that one.
    const { data: again } = await admin.from("tests").select("*").eq("user_id", user.id).eq("test_date", date).eq("kind", "daily").maybeSingle();
    if (again && !practice) return json({ test: publicTest(again) });
    console.error(error); return fail("Today's test couldn't be created. Try again.", 500);
  }
  return json({ test: publicTest(data), freshCount: fresh.length });
}

// ------------------------------------------------------------------ submit
async function submit(user: NonNullable<Awaited<ReturnType<typeof caller>>>, body: { testId: string; answers?: Record<string, unknown>; conf?: Record<string, string>; flags?: Record<string, boolean>; integrity?: Record<string, number> }) {
  const { data: t } = await admin.from("tests").select("*").eq("id", body.testId).maybeSingle();
  if (!t || t.user_id !== user.id) return fail("Test not found.", 404);
  if (t.status === "done") return json({ test: publicTest(t) });
  const late = Date.now() > new Date(t.deadline_at).getTime() + 30_000;
  // After the deadline only what was autosaved in time counts.
  const answers = late ? t.answers : { ...t.answers, ...(body.answers || {}) };
  const conf = { ...t.conf, ...(body.conf || {}) };
  const questions = t.questions as Question[];

  const grades: Record<string, Grade> = {};
  for (const q of questions) { const f = gradeAuto(q, answers[q.id]); if (f != null) grades[q.id] = { f, by: "auto" }; }
  const written = questions.filter((q) => q.type === "short");
  for (const q of written) if (!isAnswered(q, answers[q.id])) grades[q.id] = { f: 0, by: "auto", feedback: "No answer given." };
  const toMark = written.filter((q) => isAnswered(q, answers[q.id])).map((q) => ({ q, answer: String(answers[q.id]) }));
  let marks = new Map<string, { score: number; feedback: string }>();
  try { marks = await markWrittenAnswers(toMark); } catch (e) { console.error("marking failed", e); }
  for (const { q } of toMark) { const m = marks.get(q.id); grades[q.id] = m ? { f: m.score, by: "ai", feedback: m.feedback } : { f: null, by: "pending" }; }

  const score = computeScore(questions, grades, conf);
  const update = {
    status: "done", submitted_at: new Date().toISOString(), auto_submitted: late || !!(body as { auto?: boolean }).auto,
    answers, conf, flags: { ...t.flags, ...(body.flags || {}) }, integrity: { ...t.integrity, ...(body.integrity || {}) },
    grades, score, review: buildReview(questions),
  };
  const { data: saved, error } = await admin.from("tests").update(update).eq("id", t.id).eq("status", "in_progress").select("*").single();
  if (error || !saved) { const { data: cur } = await admin.from("tests").select("*").eq("id", t.id).single(); return json({ test: publicTest(cur) }); }
  if (t.kind === "daily") {
    const stats = await loadStats(user.id, user.email, t.emp_key);
    await saveStats(user.id, user.email, t.emp_key, updateStats(stats, questions, grades, t.test_date, score));
  }
  return json({ test: publicTest(saved) });
}

// ------------------------------------------------------------------ manager mark
async function mark(user: NonNullable<Awaited<ReturnType<typeof caller>>>, body: { testId: string; questionId: string; f: number }) {
  if (user.staff?.role !== "manager") return fail("Only managers can change marks.", 403);
  if (![0, 0.25, 0.5, 0.75, 1].includes(body.f)) return fail("Marks must be 0, 25, 50, 75 or 100%.");
  const { data: t } = await admin.from("tests").select("*").eq("id", body.testId).maybeSingle();
  if (!t || t.status !== "done") return fail("Test not found.", 404);
  const grades = { ...t.grades, [body.questionId]: { ...(t.grades?.[body.questionId] || {}), f: body.f, by: "manager" } };
  const score = computeScore(t.questions as Question[], grades, t.conf);
  const { data: saved } = await admin.from("tests").update({ grades, score }).eq("id", t.id).select("*").single();
  if (t.kind === "daily") {
    const { data: s } = await admin.from("learner_stats").select("history").eq("user_id", t.user_id).maybeSingle();
    if (s) {
      const history = (s.history as { date: string }[]).map((h) => h.date === t.test_date ? { ...h, pct: score.pct, pending: score.pending } : h);
      await admin.from("learner_stats").update({ history }).eq("user_id", t.user_id);
    }
  }
  return json({ test: publicTest(saved) });
}

// ------------------------------------------------------------------ import (setup script + weekly refresh)
async function importBank(req: Request, body: { emp: string; weeks?: Array<{ week: string; from?: string; to?: string; commits?: number; summary?: string; highlights?: string[]; newQuestions?: number }>; questions?: Question[]; sites?: Array<{ domain: string; name?: string; place?: string; stack?: string; summary?: string; facts?: Fact[] }> }) {
  const expected = Deno.env.get("IMPORT_TOKEN");
  if (!expected || req.headers.get("x-import-token") !== expected) return fail("Not allowed.", 401);
  if (!["harshith", "sai"].includes(body.emp)) return fail("Unknown employee.");
  const qs = (body.questions || []).map((q) => ({
    id: q.id, emp_key: body.emp, site: q.site, area: q.area, level: q.level, type: q.type, prompt: q.prompt, code: q.code ?? null,
    options: q.options ?? null, answer: q.answer ?? null, rubric: q.rubric ?? null, explanation: q.explanation ?? null,
    source: q.source ?? null, retired: !!(q as { retired?: boolean }).retired, week: q.week ?? null, updated_at: new Date().toISOString(),
  }));
  const invalid = qs.filter((q) => !q.retired && !validQuestion(q as Question)).map((q) => q.id);
  if (invalid.length) return fail(`Invalid questions: ${invalid.join(", ")}`);
  const facts = (body.sites || []).flatMap((s) => (s.facts || []).map((f) => ({ id: f.id, emp_key: body.emp, site: s.domain, site_name: s.name ?? null, area: f.area, fact: f.fact, source: f.source ?? null, week: f.week ?? null, updated_at: new Date().toISOString() })));
  const sites = (body.sites || []).map((s) => ({ domain: s.domain, emp_key: body.emp, name: s.name ?? null, place: s.place ?? null, stack: s.stack ?? null, summary: s.summary ?? null }));
  for (let i = 0; i < qs.length; i += 200) { const { error } = await admin.from("questions").upsert(qs.slice(i, i + 200)); if (error) return fail(error.message, 500); }
  for (let i = 0; i < facts.length; i += 200) { const { error } = await admin.from("facts").upsert(facts.slice(i, i + 200)); if (error) return fail(error.message, 500); }
  if (sites.length) { const { error } = await admin.from("site_info").upsert(sites); if (error) return fail(error.message, 500); }
  const weeks = (body.weeks || []).filter((w) => /^\d{4}-\d{2}-\d{2}$/.test(w.week)).map((w) => ({
    emp_key: body.emp, week: w.week, from_date: w.from ?? null, to_date: w.to ?? null, commits: w.commits ?? 0,
    summary: w.summary ?? null, highlights: w.highlights ?? [], new_questions: w.newQuestions ?? 0, loaded_at: new Date().toISOString(),
  }));
  if (weeks.length) { const { error } = await admin.from("work_weeks").upsert(weeks); if (error) return fail(error.message, 500); }
  const book = (body as { textbook?: { chapters?: unknown[] } }).textbook;
  if (book) {
    if (!Array.isArray(book.chapters) || !book.chapters.length) return fail("Textbook has no chapters.");
    const { error } = await admin.from("textbooks").upsert({ emp_key: body.emp, data: book, updated_at: new Date().toISOString() });
    if (error) return fail(error.message, 500);
  }
  return json({ ok: true, weeks: weeks.length, questions: qs.length, facts: facts.length, sites: sites.length, textbookChapters: book?.chapters?.length || 0 });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return fail("Use POST.", 405);
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return fail("Invalid JSON."); }
  try {
    if (body.action === "import") return await importBank(req, body as never);
    const hctx = {
      admin, json, fail,
      manager: async () => { const u = await caller(req); return u?.staff?.role === "manager" ? { email: u.email } : null; },
    };
    if (body.action === "import_role") return await importRole(req, hctx, body);
    const hired = await hiringAction(req, hctx, body);
    if (hired) return hired;
    const user = await caller(req);
    if (!user) return fail("Please sign in with your Homesly email.", 401);
    if (body.action === "start") return await start(user, body as never);
    if (body.action === "submit") return await submit(user, body as never);
    if (body.action === "mark") return await mark(user, body as never);
    return fail("Unknown action.");
  } catch (e) {
    console.error(e);
    return fail("Something went wrong on the server. Try again in a moment.", 500);
  }
});
