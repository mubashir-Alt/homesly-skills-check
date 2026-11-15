// Hiring assessments: candidate actions (private invite token, no sign-in) and manager actions.
import type { SupabaseClient } from "@supabase/supabase-js";
import { generateRolePack, normalisePack, suggestWrittenMarks, type RolePack } from "./hiring-ai.ts";

/** Setup script / scheduled task: load a role pack (e.g. from private-bank/roles) without signing in. */
export async function importRole(req: Request, ctx: Ctx, body: Record<string, any>) {
  const expected = Deno.env.get("IMPORT_TOKEN");
  if (!expected || req.headers.get("x-import-token") !== expected) return ctx.fail("Not allowed.", 401);
  const r = body.role || {};
  if (!/^[a-z0-9-]{3,80}$/.test(String(r.id || ""))) return ctx.fail("Role id must be lowercase letters, numbers and dashes.");
  if (!r.timed?.questions || !r.scorecard?.tasks) return ctx.fail("That doesn't look like a role pack.");
  const { id, ...rest } = r;
  const pack = normalisePack(rest as RolePack);
  const { error } = await ctx.admin.from("hiring_roles").upsert({
    id, title: pack.role_title, summary: pack.summary, pack, jd_text: body.jd_text ?? null, status: body.status || "live", updated_at: new Date().toISOString(), created_by: "import",
  });
  if (error) return ctx.fail(error.message, 500);
  return ctx.json({ ok: true, id });
}

type Ctx = {
  admin: SupabaseClient;
  json: (b: unknown, s?: number) => Response;
  fail: (m: string, s?: number) => Response;
  manager: () => Promise<{ email: string } | null>;
};
type Cand = Record<string, any>;

const BUCKET = "hiring";
const TAKEHOME_HOURS = 48;
const LINK_DAYS = 14;                // an unaccepted invite link works this long
const MAX_CAPTURES = 600;            // per candidate (50 min ≈ 100 camera + 50 screen + warnings)
const MAX_FILES = 25;
const GRACE_MS = 30_000;

/* ---------------- helpers ---------------- */
const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const newToken = () => b64url(crypto.getRandomValues(new Uint8Array(24)));
async function sha256(s: string) {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
  return [...d].map((b) => b.toString(16).padStart(2, "0")).join("");
}
const safeName = (n: string) => String(n || "file").normalize("NFKD").replace(/[^\w.\-]+/g, "_").replace(/_+/g, "_").slice(-80);
const now = () => Date.now();
const iso = (ms: number) => new Date(ms).toISOString();

/** What the candidate may see: no answers, no marking guides, no scorecard, no follow-ups. */
export function publicPack(p: RolePack) {
  return {
    role_title: p.role_title, intro: p.intro, scenario: p.scenario, submission: p.submission, rules: p.rules,
    takehome: p.takehome,
    timed: {
      minutes: p.timed.minutes, intro: p.timed.intro,
      questions: p.timed.questions.map((q) => ({ id: q.id, type: q.type, prompt: q.prompt, context: q.context, options: q.options, max_words: q.max_words })),
    },
  };
}
function candView(c: Cand) {
  const t = now();
  const timedOpen = !!c.timed_started_at && !c.timed_submitted_at;
  return {
    id: c.id, full_name: c.full_name, status: c.status, accepted_at: c.accepted_at, deadline_at: c.deadline_at,
    timed_started_at: c.timed_started_at, timed_deadline_at: c.timed_deadline_at, timed_submitted_at: c.timed_submitted_at,
    timed_answers: timedOpen ? c.timed_answers : undefined, integrity: timedOpen ? c.integrity : undefined,
    takehome: c.takehome, submitted_at: c.submitted_at, server_now: iso(t),
    expired: !c.accepted_at ? new Date(c.link_expires_at).getTime() < t : !!c.deadline_at && new Date(c.deadline_at).getTime() + GRACE_MS < t && !c.submitted_at,
    pack: publicPack(c.pack),
  };
}
function device(req: Request) {
  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "unknown";
  return { ip, ua: (req.headers.get("user-agent") || "").slice(0, 180) };
}

async function byToken(ctx: Ctx, token: unknown): Promise<Cand | null> {
  if (typeof token !== "string" || token.length < 20 || token.length > 64) return null;
  const { data } = await ctx.admin.from("candidates").select("*").eq("token_hash", await sha256(token)).maybeSingle();
  return data;
}
async function touchDevice(ctx: Ctx, req: Request, c: Cand) {
  const d = device(req); const list = (c.devices || []) as Array<{ ip: string; ua: string; at: string; n?: number }>;
  const last = list[list.length - 1];
  if (last && last.ip === d.ip && last.ua === d.ua) return;
  const next = list.concat({ ...d, at: iso(now()) }).slice(-30);
  await ctx.admin.from("candidates").update({ devices: next }).eq("id", c.id);
  c.devices = next;
}
const timedLive = (c: Cand) => !!c.timed_started_at && !c.timed_submitted_at && now() <= new Date(c.timed_deadline_at).getTime() + GRACE_MS;
const beforeDeadline = (c: Cand) => !!c.deadline_at && now() <= new Date(c.deadline_at).getTime() + GRACE_MS;

/* ---------------- candidate actions ---------------- */
async function candidateAction(req: Request, ctx: Ctx, body: Record<string, any>) {
  const c = await byToken(ctx, body.token);
  if (!c) return ctx.fail("This assessment link isn't valid. Check you copied the whole link, or ask us for a new one.", 404);
  await touchDevice(ctx, req, c);
  const A = ctx.admin.from("candidates");
  const reload = async () => (await A.select("*").eq("id", c.id).single()).data as Cand;

  switch (body.action) {
    case "cand_open":
      return ctx.json({ cand: candView(c) });

    case "cand_accept": {
      if (c.accepted_at) return ctx.json({ cand: candView(c) });
      if (new Date(c.link_expires_at).getTime() < now()) return ctx.fail("This invite has expired. Ask us for a new link.", 410);
      const k = body.consent || {};
      if (!k.rules || !k.camera || !k.screen || !k.privacy) return ctx.fail("Please tick every box to continue.");
      const t = now();
      await A.update({
        accepted_at: iso(t), deadline_at: iso(t + TAKEHOME_HOURS * 3600_000), status: "accepted",
        consent: { ...k, typed_name: String(k.typed_name || "").slice(0, 120), at: iso(t), ...device(req) },
      }).eq("id", c.id).is("accepted_at", null);
      return ctx.json({ cand: candView(await reload()) });
    }

    case "cand_timed_start": {
      if (!c.accepted_at) return ctx.fail("Accept the brief first.");
      if (c.timed_submitted_at) return ctx.json({ cand: candView(c) });
      if (c.timed_started_at) {
        if (!timedLive(c)) return await finishTimed(ctx, c, c.timed_answers, c.integrity, true);
        return ctx.json({ cand: candView(c) });
      }
      if (!beforeDeadline(c)) return ctx.fail("Your 48 hours have ended, so Part A can't be started.", 410);
      const t = now();
      const end = Math.min(t + (c.pack.timed.minutes || 50) * 60_000, new Date(c.deadline_at).getTime());
      await A.update({ timed_started_at: iso(t), timed_deadline_at: iso(end), status: "part_a" }).eq("id", c.id).is("timed_started_at", null);
      return ctx.json({ cand: candView(await reload()) });
    }

    case "cand_timed_save": {
      if (!timedLive(c)) return ctx.json({ ok: false });
      await A.update({ timed_answers: cleanAnswers(c, body.answers), integrity: cleanIntegrity(body.integrity) }).eq("id", c.id).is("timed_submitted_at", null);
      return ctx.json({ ok: true });
    }

    case "cand_capture": {
      if (!timedLive(c)) return ctx.fail("Part A isn't running.", 409);
      const kind = body.kind === "screen" ? "screen" : "cam";
      const { count } = await ctx.admin.from("candidate_captures").select("id", { count: "exact", head: true }).eq("candidate_id", c.id);
      if ((count || 0) >= MAX_CAPTURES) return ctx.json({ skip: true });
      const path = `captures/${c.id}/${kind}-${now()}-${crypto.randomUUID().slice(0, 8)}.jpg`;
      const { data, error } = await ctx.admin.storage.from(BUCKET).createSignedUploadUrl(path);
      if (error || !data) return ctx.fail("Couldn't prepare the capture upload.", 500);
      await ctx.admin.from("candidate_captures").insert({
        candidate_id: c.id, kind, path, reason: String(body.reason || "interval").slice(0, 120),
        t: Math.max(0, Math.min(36000, Math.round(Number(body.t) || 0))),
      });
      return ctx.json({ path, token: data.token });
    }

    case "cand_timed_submit": {
      if (c.timed_submitted_at) return ctx.json({ cand: candView(c) });
      if (!c.timed_started_at) return ctx.fail("Part A hasn't started.");
      const late = now() > new Date(c.timed_deadline_at).getTime() + GRACE_MS;
      return await finishTimed(ctx, c, late ? c.timed_answers : cleanAnswers(c, body.answers), cleanIntegrity(body.integrity ?? c.integrity), late || !!body.auto);
    }

    case "cand_upload": {
      if (c.submitted_at) return ctx.fail("You've already submitted.", 409);
      if (!beforeDeadline(c)) return ctx.fail("Your 48 hours have ended.", 410);
      if ((c.takehome?.files || []).length >= MAX_FILES) return ctx.fail(`You can upload up to ${MAX_FILES} files.`);
      const size = Number(body.size) || 0;
      if (size > 50 * 1024 * 1024) return ctx.fail("Files can be up to 50 MB. For bigger videos, paste a Google Drive or YouTube (unlisted) link instead.");
      const task = (c.pack.takehome.tasks || []).some((x: { id: string }) => x.id === body.task) ? body.task : "other";
      const path = `submissions/${c.id}/${task}-${now()}-${safeName(body.name)}`;
      const { data, error } = await ctx.admin.storage.from(BUCKET).createSignedUploadUrl(path);
      if (error || !data) return ctx.fail("Couldn't prepare the upload. Try again.", 500);
      return ctx.json({ path, token: data.token });
    }

    case "cand_takehome_save":
    case "cand_submit": {
      if (c.submitted_at) return ctx.json({ cand: candView(c) });
      if (!beforeDeadline(c)) return ctx.fail("Your 48 hours have ended, so we can't accept changes.", 410);
      const takehome = await cleanTakehome(ctx, c, body.takehome || {});
      if (body.action === "cand_takehome_save") {
        await A.update({ takehome }).eq("id", c.id).is("submitted_at", null);
        return ctx.json({ cand: candView(await reload()) });
      }
      if (!c.timed_submitted_at) return ctx.fail("Please finish Part A before you submit.");
      if (!takehome.declared) return ctx.fail("Tick the declaration to confirm the work is your own.");
      if (!takehome.ai_tools || takehome.ai_tools.length < 3) return ctx.fail("Tell us which AI tools you used (or write 'None').");
      if (!takehome.files.length && !takehome.links.length) return ctx.fail("Add at least one file or link.");
      await A.update({ takehome, submitted_at: iso(now()), status: "submitted" }).eq("id", c.id).is("submitted_at", null);
      return ctx.json({ cand: candView(await reload()) });
    }
  }
  return ctx.fail("Unknown action.");
}

function cleanAnswers(c: Cand, a: unknown) {
  const out: Record<string, unknown> = {};
  const src = (a && typeof a === "object" ? a : {}) as Record<string, unknown>;
  for (const q of c.pack.timed.questions as Array<{ id: string; type: string; options: string[] }>) {
    const v = src[q.id];
    if (q.type === "single" && Number.isInteger(v) && (v as number) >= 0 && (v as number) < q.options.length) out[q.id] = v;
    if (q.type === "short" && typeof v === "string") out[q.id] = v.slice(0, 6000);
  }
  return out;
}
function cleanIntegrity(x: unknown) {
  const i = (x && typeof x === "object" ? x : {}) as Record<string, any>;
  const num = (v: unknown) => Math.max(0, Math.min(10000, Math.round(Number(v) || 0)));
  return {
    strikes: num(i.strikes), tabAways: num(i.tabAways), pastes: num(i.pastes),
    screen: typeof i.screen === "string" ? i.screen.slice(0, 40) : undefined,
    events: Array.isArray(i.events) ? i.events.slice(-200).map((e: any) => ({ t: num(e?.t), type: String(e?.type || "").slice(0, 40), detail: String(e?.detail || "").slice(0, 200), strike: e?.strike ? num(e.strike) : undefined, dur: e?.dur ? num(e.dur) : undefined })) : [],
  };
}
async function cleanTakehome(ctx: Ctx, c: Cand, t: Record<string, any>) {
  const prefix = `submissions/${c.id}/`;
  const files = (Array.isArray(t.files) ? t.files : []).filter((f: any) => typeof f?.path === "string" && f.path.startsWith(prefix) && !f.path.includes(".."))
    .slice(0, MAX_FILES).map((f: any) => ({ path: f.path, name: String(f.name || "").slice(0, 120), task: String(f.task || "other").slice(0, 20), size: Number(f.size) || 0, type: String(f.type || "").slice(0, 80) }));
  // Keep only files that really reached storage.
  if (files.length) {
    const { data } = await ctx.admin.storage.from(BUCKET).list(`submissions/${c.id}`, { limit: 200 });
    const have = new Set((data || []).map((o) => `${prefix}${o.name}`));
    for (let i = files.length - 1; i >= 0; i--) if (!have.has(files[i].path)) files.splice(i, 1);
  }
  const links = (Array.isArray(t.links) ? t.links : []).map((l: any) => ({ task: String(l?.task || "other").slice(0, 20), url: String(l?.url || "").trim().slice(0, 600) }))
    .filter((l: any) => /^https:\/\/[^\s]+$/i.test(l.url)).slice(0, 20);
  return { files, links, ai_tools: String(t.ai_tools || "").slice(0, 3000), note: String(t.note || "").slice(0, 3000), declared: !!t.declared };
}

async function finishTimed(ctx: Ctx, c: Cand, answers: Record<string, unknown>, integrity: Record<string, unknown>, auto: boolean) {
  const qs = c.pack.timed.questions as RolePack["timed"]["questions"];
  const marks: Record<string, any> = {};
  for (const q of qs) if (q.type === "single") marks[q.id] = { correct: answers[q.id] === q.answer, answered: answers[q.id] != null };
  const written = qs.filter((q) => q.type === "short" && typeof answers[q.id] === "string" && String(answers[q.id]).trim().length > 0);
  try {
    const ai = await suggestWrittenMarks(c.pack.role_title, c.pack.scenario?.name || "", written.map((q) => ({ id: q.id, prompt: q.prompt, context: q.context, guide: q.guide, answer: String(answers[q.id]) })));
    for (const q of written) marks[q.id] = ai.get(q.id) || { pending: true };
  } catch (e) { console.error("AI suggestions failed", e); }
  for (const q of qs) if (q.type === "short" && !marks[q.id]) marks[q.id] = { score: 0, reason: "No answer given." };
  const single = qs.filter((q) => q.type === "single");
  marks._numbers = { right: single.filter((q) => marks[q.id].correct).length, of: single.length };
  await ctx.admin.from("candidates").update({
    timed_answers: answers, integrity, timed_marks: marks, timed_auto: auto, timed_submitted_at: iso(now()), status: "part_a_done",
  }).eq("id", c.id).is("timed_submitted_at", null);
  const { data } = await ctx.admin.from("candidates").select("*").eq("id", c.id).single();
  return ctx.json({ cand: candView(data as Cand) });
}

/* ---------------- manager actions ---------------- */
async function managerAction(ctx: Ctx, body: Record<string, any>) {
  const me = await ctx.manager();
  if (!me) return ctx.fail("Only managers can do this.", 403);
  const C = ctx.admin.from("candidates");
  switch (body.action) {
    case "hire_generate": {
      const jd = String(body.jd_text || "").slice(0, 40000);
      const pdf = typeof body.pdf_base64 === "string" && body.pdf_base64.length < 14_000_000 ? body.pdf_base64 : null;
      if (jd.trim().length < 80 && !pdf) return ctx.fail("Paste the job description or upload it as a PDF or Word file.");
      const pack = await generateRolePack({ jd, pdf, notes: String(body.notes || "").slice(0, 4000) });
      if (!pack) return ctx.fail("Claude couldn't write the assignment just now. Check the ANTHROPIC_API_KEY secret, then try again.", 502);
      return ctx.json({ pack });
    }
    case "hire_invite": {
      const { data: role } = await ctx.admin.from("hiring_roles").select("*").eq("id", body.role_id).maybeSingle();
      if (!role) return ctx.fail("Role not found.", 404);
      if (role.status !== "live") return ctx.fail("Set the role to Live before inviting candidates.");
      const name = String(body.full_name || "").trim().slice(0, 120);
      if (!name) return ctx.fail("Enter the candidate's name.");
      const token = newToken();
      const { data: cand, error } = await C.insert({
        role_id: role.id, full_name: name, email: String(body.email || "").trim().toLowerCase().slice(0, 200) || null,
        phone: String(body.phone || "").trim().slice(0, 40) || null, notes: String(body.notes || "").slice(0, 2000) || null,
        pack: role.pack, token_hash: await sha256(token), link_expires_at: iso(now() + LINK_DAYS * 86400_000), created_by: me.email,
      }).select("id").single();
      if (error || !cand) return ctx.fail(error?.message || "Couldn't add the candidate.", 500);
      let cvUpload = null;
      if (body.cv?.name) {
        const path = `cv/${cand.id}/${safeName(body.cv.name)}`;
        const { data } = await ctx.admin.storage.from(BUCKET).createSignedUploadUrl(path);
        if (data) { cvUpload = { path, token: data.token }; await C.update({ cv_path: path }).eq("id", cand.id); }
      }
      return ctx.json({ id: cand.id, token, cvUpload });
    }
    case "hire_new_link": {
      const { data: c } = await C.select("id,submitted_at").eq("id", body.candidate_id).maybeSingle();
      if (!c) return ctx.fail("Candidate not found.", 404);
      const token = newToken();
      await C.update({ token_hash: await sha256(token), link_expires_at: iso(now() + LINK_DAYS * 86400_000) }).eq("id", c.id);
      return ctx.json({ token });
    }
    case "hire_extend": {
      const hours = Math.max(1, Math.min(72, Number(body.hours) || 24));
      const { data: c } = await C.select("id,deadline_at").eq("id", body.candidate_id).maybeSingle();
      if (!c?.deadline_at) return ctx.fail("They haven't accepted the brief yet.");
      await C.update({ deadline_at: iso(Math.max(now(), new Date(c.deadline_at).getTime()) + hours * 3600_000) }).eq("id", c.id);
      return ctx.json({ ok: true });
    }
    case "hire_files": {
      const { data: c } = await C.select("id,cv_path,takehome").eq("id", body.candidate_id).maybeSingle();
      if (!c) return ctx.fail("Candidate not found.", 404);
      const { data: caps } = await ctx.admin.from("candidate_captures").select("*").eq("candidate_id", c.id).order("id");
      const paths = [c.cv_path, ...(c.takehome?.files || []).map((f: { path: string }) => f.path), ...(caps || []).map((x) => x.path)].filter(Boolean) as string[];
      const urls: Record<string, string> = {};
      for (let i = 0; i < paths.length; i += 100) {
        const { data } = await ctx.admin.storage.from(BUCKET).createSignedUrls(paths.slice(i, i + 100), 3600);
        (data || []).forEach((d) => { if (d.signedUrl && d.path) urls[d.path] = d.signedUrl; });
      }
      return ctx.json({ urls, captures: caps || [] });
    }
    case "hire_review": {
      const r = body.review || {};
      const decision = ["hire", "second_round", "rejected"].includes(r.decision) ? r.decision : null;
      const review = {
        scores: Object.fromEntries(Object.entries(r.scores || {}).filter(([, v]) => Number.isFinite(v as number)).map(([k, v]) => [k.slice(0, 20), Math.max(0, Math.min(10, Number(v)))])),
        notes: Object.fromEntries(Object.entries(r.notes || {}).map(([k, v]) => [k.slice(0, 20), String(v).slice(0, 3000)])),
        flags: (Array.isArray(r.flags) ? r.flags : []).map((x: unknown) => Number(x)).filter(Number.isInteger).slice(0, 40),
        followups: Object.fromEntries(Object.entries(r.followups || {}).map(([k, v]) => [k.slice(0, 10), String(v).slice(0, 3000)])),
        summary: String(r.summary || "").slice(0, 4000), decision, reviewed_by: me.email, reviewed_at: iso(now()),
      };
      const { data: cur } = await C.select("status").eq("id", body.candidate_id).maybeSingle();
      if (!cur) return ctx.fail("Candidate not found.", 404);
      await C.update({ review, ...(decision ? { status: decision } : {}) }).eq("id", body.candidate_id);
      return ctx.json({ ok: true });
    }
    case "hire_purge_captures":
    case "hire_delete": {
      const id = String(body.candidate_id || "");
      const { data: c } = await C.select("id").eq("id", id).maybeSingle();
      if (!c) return ctx.fail("Candidate not found.", 404);
      const folders = body.action === "hire_delete" ? ["captures", "submissions", "cv"] : ["captures"];
      for (const f of folders) {
        const { data } = await ctx.admin.storage.from(BUCKET).list(`${f}/${id}`, { limit: 1000 });
        const paths = (data || []).map((o) => `${f}/${id}/${o.name}`);
        if (paths.length) await ctx.admin.storage.from(BUCKET).remove(paths);
      }
      await ctx.admin.from("candidate_captures").delete().eq("candidate_id", id);
      if (body.action === "hire_delete") await C.delete().eq("id", id);
      return ctx.json({ ok: true });
    }
  }
  return ctx.fail("Unknown action.");
}

export async function hiringAction(req: Request, ctx: Ctx, body: Record<string, any>) {
  const a = String(body.action || "");
  if (a.startsWith("cand_")) return await candidateAction(req, ctx, body);
  if (a.startsWith("hire_")) return await managerAction(ctx, body);
  return null;
}
