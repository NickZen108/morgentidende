import { FLUX_STYLE_RULE, MODELS } from "./policy";

export interface AiCallUsage {
  model: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  neurons?: number;
}

export interface AiUsageSnapshot {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  neurons?: number;
  byModel: AiCallUsage[];
}

export class AiUsageTracker {
  private readonly rows = new Map<string, AiCallUsage>();

  record(model: string, response: unknown): void {
    const usage = extractUsage(response);
    const row = this.rows.get(model) ?? { model, calls: 0, inputTokens: 0, outputTokens: 0 };
    row.calls += 1;
    row.inputTokens += usage.inputTokens;
    row.outputTokens += usage.outputTokens;
    if (usage.neurons !== undefined) row.neurons = (row.neurons ?? 0) + usage.neurons;
    this.rows.set(model, row);
  }

  snapshot(): AiUsageSnapshot {
    const byModel = [...this.rows.values()];
    const neurons = byModel.some(r => r.neurons !== undefined)
      ? byModel.reduce((sum, r) => sum + (r.neurons ?? 0), 0)
      : undefined;
    return {
      calls: byModel.reduce((sum, r) => sum + r.calls, 0),
      inputTokens: byModel.reduce((sum, r) => sum + r.inputTokens, 0),
      outputTokens: byModel.reduce((sum, r) => sum + r.outputTokens, 0),
      ...(neurons !== undefined ? { neurons } : {}),
      byModel
    };
  }
}

export interface AiEnv {
  AI: Ai;
  AI_USAGE?: AiUsageTracker;
}

export interface TextGenerationOptions { maxTokens?: number; temperature?: number; }
const gateway = { gateway: { id: "default" } } as const;

function numberAt(obj: Record<string, unknown>, ...keys: string[]): number {
  for (const key of keys) if (typeof obj[key] === "number") return obj[key] as number;
  return 0;
}

function extractUsage(value: unknown): { inputTokens: number; outputTokens: number; neurons?: number } {
  if (!value || typeof value !== "object") return { inputTokens: 0, outputTokens: 0 };
  const obj = value as Record<string, unknown>;
  const raw = (obj.usage && typeof obj.usage === "object" ? obj.usage : obj) as Record<string, unknown>;
  const inputTokens = numberAt(raw, "input_tokens", "prompt_tokens", "inputTokens", "promptTokens");
  const outputTokens = numberAt(raw, "output_tokens", "completion_tokens", "outputTokens", "completionTokens");
  const neurons = numberAt(raw, "neurons", "neuron_count", "neuronCount");
  return { inputTokens, outputTokens, ...(neurons ? { neurons } : {}) };
}

function track(env: AiEnv, model: string, response: unknown): void { env.AI_USAGE?.record(model, response); }

function extractText(value: unknown): string {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return "";
  const obj = value as Record<string, unknown>;
  if (typeof obj.response === "string") return obj.response;
  if (typeof obj.output_text === "string") return obj.output_text;
  const choices = obj.choices;
  if (Array.isArray(choices) && choices.length) {
    const first = choices[0] as Record<string, unknown>;
    const message = first?.message as Record<string, unknown> | undefined;
    if (message && typeof message.content === "string") return message.content;
    if (typeof first?.text === "string") return first.text;
  }
  const output = obj.output;
  if (Array.isArray(output)) {
    const chunks: string[] = [];
    for (const item of output) {
      if (!item || typeof item !== "object") continue;
      const content = (item as Record<string, unknown>).content;
      if (!Array.isArray(content)) continue;
      for (const part of content) {
        if (!part || typeof part !== "object") continue;
        const text = (part as Record<string, unknown>).text;
        if (typeof text === "string") chunks.push(text);
      }
    }
    if (chunks.length) return chunks.join("\n");
  }
  const result = obj.result;
  return result && typeof result === "object" ? extractText(result) : "";
}

export function parseJsonObject<T>(text: string): T {
  const trimmed = text.trim();
  try { return JSON.parse(trimmed) as T; } catch {}
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) return JSON.parse(fenced[1].trim()) as T;
  const first = trimmed.indexOf("{"); const last = trimmed.lastIndexOf("}");
  if (first >= 0 && last > first) return JSON.parse(trimmed.slice(first, last + 1)) as T;
  throw new Error("model_returned_invalid_json");
}

async function runTextModel(env: AiEnv, model: string, system: string, user: string, options: TextGenerationOptions = {}): Promise<string> {
  const response = await (env.AI.run as any)(model, { messages: [{ role: "system", content: system }, { role: "user", content: user }], max_tokens: options.maxTokens ?? 1800, temperature: options.temperature ?? 0.2 }, gateway);
  track(env, model, response);
  const text = extractText(response); if (!text) throw new Error(`empty_model_response:${model}`); return text;
}

export const runDeskModel = (env: AiEnv, system: string, user: string, options?: TextGenerationOptions) => runTextModel(env, MODELS.desk, system, user, options);
export const runMediaModel = (env: AiEnv, system: string, user: string, options?: TextGenerationOptions) => runTextModel(env, MODELS.media, system, user, options);

export async function runTerra(env: AiEnv, instructions: string, input: string, maxOutputTokens = 4000): Promise<string> {
  const response = await (env.AI.run as any)(MODELS.journalist, { input, instructions, max_output_tokens: maxOutputTokens }, gateway);
  track(env, MODELS.journalist, response);
  const text = extractText(response); if (!text) throw new Error("empty_model_response:terra"); return text;
}

export async function embedTexts(env: AiEnv, texts: string[]): Promise<number[][]> {
  if (!texts.length) return [];
  const response = await (env.AI.run as any)(MODELS.scanEmbeddings, { text: texts }, gateway) as Record<string, unknown>;
  track(env, MODELS.scanEmbeddings, response);
  const data = response.data;
  if (Array.isArray(data)) {
    if (data.length && Array.isArray(data[0])) return data as number[][];
    const vectors = data.map(item => item && typeof item === "object" ? (item as Record<string, unknown>).embedding : null).filter(Array.isArray) as number[][];
    if (vectors.length) return vectors;
  }
  throw new Error("bge_m3_missing_embeddings");
}

export async function generateFluxPencilHero(env: AiEnv, subjectPrompt: string): Promise<string> {
  const response = await (env.AI.run as any)(MODELS.imageGeneration, { prompt: `${FLUX_STYLE_RULE} ${subjectPrompt}`, steps: 4 }, gateway) as Record<string, unknown>;
  track(env, MODELS.imageGeneration, response);
  if (typeof response.image !== "string" || !response.image) throw new Error("flux_missing_image");
  return `data:image/jpeg;base64,${response.image}`;
}
