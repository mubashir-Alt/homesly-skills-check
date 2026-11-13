// Claude calls: today's fresh questions, and marking of written answers.
import Anthropic from "@anthropic-ai/sdk";
import { AREAS, EMP_NAMES, type Fact, type Question } from "./engine.ts";

const MODEL = "claude-opus-5-5";
let client: Anthropic | null = null;
function getClient(): Anthropic | null {
  if (!Deno.env.get("ANTHROPIC_API_KEY")) return null;
  return (client ||= new Anthropic());
}

/** One request with structured JSON output. Server-side refusal fallback is on. */
async function askJson<T>(prompt: string, schema: Record<string, unknown>, timeoutMs: number): Promise<T | null> {
  const c = getClient();
  if (!c) return null;
  const res = await c.beta.messages.create(
    {
      model: MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: { type: "json_schema", schema } },
      messages: [{ role: "user", content: prompt }],
    } as never,
    { timeout: timeoutMs, maxRetries: 1 },
  );
  if (res.stop_reason === "refusal" || res.stop_reason === "max_tokens") return null;
  const text = res.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("");
  try { return JSON.parse(text) as T; } catch { return null; }
}

const QUESTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["questions"],
  properties: {
    questions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["type", "factId", "site", "area", "level", "prompt", "options", "answer", "explanation"],
        properties: {
          type: { type: "string", enum: ["single", "multi", "truefalse"] },
          factId: { type: "string" },
          site: { type: "string" },
          area: { type: "string", enum: AREAS },
          level: { type: "integer", enum: [1, 2, 3] },
          prompt: { type: "string" },
          options: { type: "array", items: { type: "string" } },
          answer: { type: "array", items: { type: "integer" } },
          explanation: { type: "string" },
        },
      },
    },
  },
};

export async function writeFreshQuestions(emp: string, facts: Fact[], recentPrompts: string[], count: number, date: string): Promise<Question[]> {
  if (!facts.length || count <= 0) return [];
  const recent = recentPrompts.slice(-40).map((p) => "- " + p.slice(0, 140)).join("\n") || "(none yet)";
  const prompt = `You write daily quiz questions for ${EMP_NAMES[emp]}, a junior WordPress developer at Homesly Stays, a UK hotel group. They did the work described in the facts below on their own hotel websites. Test whether they understand the work: why it was done, what would break without it, and how they would apply it to a new case. Avoid trivia such as dates or commit hashes.

FACTS (use only these; each question must be answerable from one fact plus sound WordPress knowledge):
${facts.map((f) => `[${f.id}] (${f.site}, area=${f.area}) ${f.fact}`).join("\n")}

Do not repeat or closely paraphrase these recent questions:
${recent}

Write exactly ${count} questions.
- Mostly "single" (4 options, one correct; answer = [index]). Include at least one "multi" (4 options, 2-3 correct; answer = indices) or "truefalse" (options exactly ["True","False"]; answer = [0] or [1]).
- Mix levels: 1 = recall, 2 = explain why, 3 = apply to a new scenario.
- Distractors must be things a junior might genuinely believe. Vary the position of the correct option and do not make it the longest.
- "site" is the fact's domain, "area" is the fact's area, "factId" is the fact id in brackets.
- "explanation" is one or two sentences that teach the point.`;
  const out = await askJson<{ questions: Array<Record<string, unknown>> }>(prompt, QUESTION_SCHEMA, 60_000);
  if (!out?.questions) return [];
  const factIds = new Map(facts.map((f) => [f.id, f]));
  return out.questions.slice(0, count).map((q, i) => {
    const type = q.type as Question["type"];
    const ans = (q.answer as number[]) || [];
    const fact = factIds.get(String(q.factId));
    return {
      id: `ai-${date}-${emp}-${i}`,
      site: fact?.site || String(q.site),
      area: AREAS.includes(String(q.area)) ? String(q.area) : fact?.area || "page-building",
      level: [1, 2, 3].includes(Number(q.level)) ? Number(q.level) : 2,
      type,
      prompt: String(q.prompt),
      options: type === "truefalse" ? ["True", "False"] : (q.options as string[]),
      answer: type === "multi" ? [...new Set(ans)].sort((a, b) => a - b) : ans[0],
      explanation: String(q.explanation || ""),
      source: fact ? `Knowledge base: ${fact.source || fact.id}` : "Knowledge base",
      factId: fact?.id,
      ai: true,
    } as Question;
  });
}

const MARK_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["marks"],
  properties: {
    marks: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "score", "feedback"],
        properties: { id: { type: "string" }, score: { type: "number", enum: [0, 0.25, 0.5, 0.75, 1] }, feedback: { type: "string" } },
      },
    },
  },
};

export async function markWrittenAnswers(items: { q: Question; answer: string }[]): Promise<Map<string, { score: number; feedback: string }>> {
  const result = new Map<string, { score: number; feedback: string }>();
  if (!items.length) return result;
  const prompt = `Mark these written answers from a junior WordPress developer. Compare each with the model answer and key points. Score 0, 0.25, 0.5, 0.75 or 1. Be fair but strict: a vague answer that misses the reason scores low. Give one or two sentences of feedback addressed to them as "you".

${items.map(({ q, answer }) => `ID: ${q.id}
QUESTION: ${q.prompt}
MODEL ANSWER: ${q.rubric?.model}
KEY POINTS: ${(q.rubric?.points || []).join("; ")}
THEIR ANSWER: ${answer.slice(0, 1500)}`).join("\n\n")}`;
  const out = await askJson<{ marks: { id: string; score: number; feedback: string }[] }>(prompt, MARK_SCHEMA, 60_000);
  for (const m of out?.marks || []) {
    if (typeof m.score === "number") result.set(m.id, { score: Math.max(0, Math.min(1, m.score)), feedback: m.feedback });
  }
  return result;
}
