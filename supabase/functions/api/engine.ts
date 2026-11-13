// Question selection, preparation and marking. Pure functions, no I/O.

export type QType = "single" | "multi" | "truefalse" | "order" | "short";
export interface Question {
  id: string; emp_key?: string; site: string; area: string; level: number; type: QType;
  prompt: string; code?: string | null; options?: string[] | null; answer?: number | number[] | null;
  rubric?: { model: string; points: string[] } | null; explanation?: string | null; source?: string | null;
  ai?: boolean; factId?: string; correct?: string[];
}
export interface Fact { id: string; site: string; site_name?: string; area: string; fact: string; source?: string }
export interface Stats {
  seen_ids: string[]; wrong_ids: string[]; used_facts: string[]; recent_prompts: string[];
  area_stats: Record<string, { e: number; m: number }>; history: { date: string; pct: number; pending: number }[];
}
export interface Grade { f: number | null; by: "auto" | "ai" | "manager" | "pending"; feedback?: string }

export const AREAS = ["page-building", "snippets", "seo", "speed", "consent-tracking", "leads-booking", "mobile-ux", "content-accuracy"];
export const EMP_SITES: Record<string, string[]> = {
  harshith: ["thegeorgehotel.uk", "stationhotelportsoy.co.uk", "countyselkirk.com", "thehamptonhotel.co.uk", "thewoodmaninnburneston.com"],
  sai: ["homeslystays.com", "coachhouseotterburn.co.uk", "centralhotel.uk"],
};
export const EMP_NAMES: Record<string, string> = { harshith: "Harshith", sai: "Sai Lakshmi" };
export const TEST_SIZE = 15, AI_COUNT = 4, MINUTES = 25, MAX_SHORT = 3;
const LEVEL_MIX: Record<number, number> = { 1: 0.33, 2: 0.4, 3: 0.27 };

export function hash(str: string): number {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) { const c = str.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0) * 4294967296 + (h1 >>> 0);
}
export function rngFrom(seed: number): () => number {
  let a = seed % 4294967296;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export function shuffle<T>(arr: T[], rnd: () => number): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
function weightedPick<T>(items: T[], weights: number[], rnd: () => number): number {
  let r = rnd() * weights.reduce((a, b) => a + b, 0), i = 0;
  while ((r -= weights[i]) > 0 && i < items.length - 1) i++;
  return i;
}
const accuracy = (s: Stats, area: string) => { const v = s.area_stats[area]; return v && v.m ? v.e / v.m : 0.5; };

export function validQuestion(q: Question): boolean {
  if (!q || !q.id || !q.prompt || !q.type) return false;
  const opts = Array.isArray(q.options) ? q.options : null;
  if (q.type === "single" || q.type === "truefalse") return !!opts && Number.isInteger(q.answer) && (q.answer as number) >= 0 && (q.answer as number) < opts.length;
  if (q.type === "multi") return !!opts && Array.isArray(q.answer) && q.answer.length > 0 && q.answer.every((i) => Number.isInteger(i) && i >= 0 && i < opts.length);
  if (q.type === "order") return !!opts && opts.length >= 3;
  if (q.type === "short") return !!q.rubric;
  return false;
}

/** Pick bank questions: unseen first, then wrong ones, then oldest seen; weak areas weighted up; spread over sites and levels. */
export function selectFromBank(emp: string, bank: Question[], stats: Stats, n: number, rnd: () => number): Question[] {
  const seen = new Set(stats.seen_ids), wrong = new Set(stats.wrong_ids);
  const order = new Map(stats.seen_ids.map((id, i) => [id, i]));
  let pool = bank.filter((q) => !seen.has(q.id));
  if (pool.length < n) {
    const recycled = bank.filter((q) => seen.has(q.id))
      .sort((a, b) => (Number(wrong.has(b.id)) - Number(wrong.has(a.id))) || ((order.get(a.id) ?? 0) - (order.get(b.id) ?? 0)))
      .slice(0, Math.max(n * 2 - pool.length, n));
    pool = pool.concat(recycled);
  }
  const sites = (EMP_SITES[emp] || []).concat("core");
  const activeSites = sites.filter((s) => pool.some((q) => q.site === s)).length || 1;
  const siteCap = Math.ceil(n / activeSites) + 1;
  const target: Record<number, number> = { 1: Math.round(n * LEVEL_MIX[1]), 2: Math.round(n * LEVEL_MIX[2]) };
  target[3] = n - target[1] - target[2];
  const picked: Question[] = [];
  const cnt = { site: {} as Record<string, number>, level: { 1: 0, 2: 0, 3: 0 } as Record<number, number>, short: 0 };
  const fits = (q: Question, strict: boolean) => {
    if (q.type === "short" && cnt.short >= MAX_SHORT) return false;
    if (!strict) return true;
    if ((cnt.site[q.site] || 0) >= siteCap) return false;
    if ((cnt.level[q.level] || 0) >= (target[q.level] ?? n)) return false;
    return true;
  };
  for (const strict of [true, false]) {
    let cand = pool.filter((q) => !picked.includes(q));
    while (picked.length < n && cand.length) {
      const ok = cand.filter((q) => fits(q, strict));
      if (!ok.length) break;
      const w = ok.map((q) => (1 + 2 * (1 - accuracy(stats, q.area))) * (wrong.has(q.id) ? 1.5 : 1) * (seen.has(q.id) ? 0.6 : 1));
      const q = ok[weightedPick(ok, w, rnd)];
      picked.push(q);
      cnt.site[q.site] = (cnt.site[q.site] || 0) + 1; cnt.level[q.level] = (cnt.level[q.level] || 0) + 1;
      if (q.type === "short") cnt.short++;
      cand = cand.filter((x) => x !== q);
    }
  }
  return picked;
}

export function pickFacts(facts: Fact[], stats: Stats, k: number, rnd: () => number): Fact[] {
  const used = new Set(stats.used_facts);
  let pool = facts.filter((f) => !used.has(f.id));
  if (pool.length < k) pool = facts.slice();
  const picked: Fact[] = [];
  while (picked.length < k && pool.length) {
    const i = weightedPick(pool, pool.map((f) => 1 + 2 * (1 - accuracy(stats, f.area))), rnd);
    picked.push(pool[i]); pool.splice(i, 1);
  }
  return picked;
}

/** Shuffle options per test and remap the answer key. */
export function prepare(q: Question, rnd: () => number): Question {
  const p: Question = JSON.parse(JSON.stringify(q));
  delete p.emp_key;
  if ((p.type === "single" || p.type === "multi") && q.options) {
    const idx = shuffle(q.options.map((_, i) => i), rnd);
    p.options = idx.map((i) => q.options![i]);
    p.answer = p.type === "single" ? idx.indexOf(q.answer as number) : (q.answer as number[]).map((a) => idx.indexOf(a)).sort((a, b) => a - b);
  }
  if (p.type === "order" && q.options) {
    p.correct = q.options.slice();
    let s: string[]; let tries = 0;
    do { s = shuffle(q.options, rnd); tries++; } while (s.join("|") === q.options.join("|") && tries < 6);
    p.options = s;
  }
  return p;
}

/** What the browser may see while the test runs. */
export function publicView(q: Question) {
  return { id: q.id, site: q.site, area: q.area, level: q.level, type: q.type, prompt: q.prompt, code: q.code ?? null, options: q.options ?? null, ai: !!q.ai };
}

export function isAnswered(q: Question, a: unknown): boolean {
  if (a == null) return false;
  if (q.type === "multi") return Array.isArray(a) && a.length > 0;
  if (q.type === "short") return String(a).trim().length > 0;
  return true;
}

export function gradeAuto(q: Question, a: unknown): number | null {
  if (q.type === "short") return null;
  if (q.type === "single" || q.type === "truefalse") return a === q.answer ? 1 : 0;
  if (q.type === "multi") {
    const sel = new Set(Array.isArray(a) ? a : []), cor = new Set(q.answer as number[]);
    let hit = 0, miss = 0; sel.forEach((i) => (cor.has(i as number) ? hit++ : miss++));
    return Math.max(0, (hit - miss) / cor.size);
  }
  if (q.type === "order") {
    const arr = Array.isArray(a) && a.length === q.options!.length ? (a as string[]) : q.options!;
    let right = 0; arr.forEach((t, i) => { if (t === q.correct![i]) right++; });
    return right === arr.length ? 1 : Math.round((right / arr.length) * 0.5 * 100) / 100;
  }
  return 0;
}

export function computeScore(questions: Question[], grades: Record<string, Grade>, conf: Record<string, string>) {
  let e = 0, m = 0, pending = 0;
  const byArea: Record<string, { e: number; m: number }> = {}, bySite: Record<string, { e: number; m: number }> = {};
  const confWrong: string[] = [];
  for (const q of questions) {
    const g = grades[q.id]; const pts = q.level || 1;
    if (!g || g.f == null) { pending++; continue; }
    e += g.f * pts; m += pts;
    (byArea[q.area] ||= { e: 0, m: 0 }); byArea[q.area].e += g.f * pts; byArea[q.area].m += pts;
    (bySite[q.site] ||= { e: 0, m: 0 }); bySite[q.site].e += g.f * pts; bySite[q.site].m += pts;
    if (g.f < 0.5 && conf[q.id] === "sure") confWrong.push(q.id);
  }
  return { e: Math.round(e * 100) / 100, m, pct: m ? Math.round((100 * e) / m) : 0, pending, byArea, bySite, confWrong };
}

export function buildReview(questions: Question[]) {
  return questions.map((q) => ({ ...publicView(q), answer: q.answer ?? null, correct: q.correct ?? null, rubric: q.rubric ?? null, explanation: q.explanation ?? null, source: q.source ?? null }));
}

export function updateStats(stats: Stats, questions: Question[], grades: Record<string, Grade>, date: string, score: { pct: number; pending: number }): Stats {
  const s: Stats = JSON.parse(JSON.stringify(stats));
  const seen = new Set(s.seen_ids);
  questions.filter((q) => !q.ai).forEach((q) => { seen.delete(q.id); seen.add(q.id); });
  s.seen_ids = [...seen];
  const wrong = new Set(s.wrong_ids);
  for (const q of questions) {
    const g = grades[q.id]; if (!g || g.f == null || q.ai) continue;
    if (g.f < 0.75) wrong.add(q.id); else wrong.delete(q.id);
  }
  s.wrong_ids = [...wrong];
  for (const q of questions) {
    const g = grades[q.id]; if (!g || g.f == null) continue;
    const a = (s.area_stats[q.area] ||= { e: 0, m: 0 }); a.e += g.f * (q.level || 1); a.m += q.level || 1;
  }
  const facts = new Set(s.used_facts); questions.filter((q) => q.ai && q.factId).forEach((q) => facts.add(q.factId!)); s.used_facts = [...facts];
  s.recent_prompts = s.recent_prompts.concat(questions.filter((q) => q.ai).map((q) => q.prompt)).slice(-60);
  s.history = s.history.filter((x) => x.date !== date).concat([{ date, pct: score.pct, pending: score.pending }]).slice(-180);
  return s;
}
