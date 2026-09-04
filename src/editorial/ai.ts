import { FLUX_STYLE_RULE, MODELS } from "./policy";

export interface AiEnv {
  AI: Ai;
}

export interface TextGenerationOptions {
  maxTokens?: number;
  temperature?: number;
}

const gateway = { gateway: { id: "default" } } as const;

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
  if (result && typeof result === "object") return extractText(result);
  return "";
}

export function parseJsonObject<T>(text: string): T {
  const trimmed = text.trim();
  try { return JSON.parse(trimmed) as T; } catch { /* continue */ }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) return JSON.parse(fenced[1].trim()) as T;

  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first >= 0 && last > first) return JSON.parse(trimmed.slice(first, last + 1)) as T;
  throw new Error("model_returned_invalid_json");
}

async function runTextModel(
  env: AiEnv,
  model: string,
  system: string,
  user: string,
  options: TextGenerationOptions = {}
): Promise<string> {
  const response = await (env.AI.run as any)(
    model,
    {
      messages: [
        { role: "system", content: system },
        { role: "user", content: user }
      ],
      max_tokens: options.maxTokens ?? 1800,
      temperature: options.temperature ?? 0.2
    },
    gateway
  );
  const text = extractText(response);
  if (!text) throw new Error(`empty_model_response:${model}`);
  return text;
}

export async function runDeskModel(
  env: AiEnv,
  system: string,
  user: string,
  options?: TextGenerationOptions
): Promise<string> {
  return runTextModel(env, MODELS.desk, system, user, options);
}

export async function runMediaModel(
  env: AiEnv,
  system: string,
  user: string,
  options?: TextGenerationOptions
): Promise<string> {
  return runTextModel(env, MODELS.media, system, user, options);
}

export async function runTerra(
  env: AiEnv,
  instructions: string,
  input: string,
  maxOutputTokens = 4000
): Promise<string> {
  const response = await (env.AI.run as any)(
    MODELS.journalist,
    {
      input,
      instructions,
      max_output_tokens: maxOutputTokens
    },
    gateway
  );
  const text = extractText(response);
  if (!text) throw new Error("empty_model_response:terra");
  return text;
}

export async function embedTexts(env: AiEnv, texts: string[]): Promise<number[][]> {
  if (!texts.length) return [];
  const response = await (env.AI.run as any)(
    MODELS.scanEmbeddings,
    { text: texts },
    gateway
  ) as Record<string, unknown>;

  const data = response.data;
  if (Array.isArray(data)) {
    if (data.length && Array.isArray(data[0])) return data as number[][];
    const vectors = data
      .map((item) => item && typeof item === "object" ? (item as Record<string, unknown>).embedding : null)
      .filter(Array.isArray) as number[][];
    if (vectors.length) return vectors;
  }
  throw new Error("bge_m3_missing_embeddings");
}

export async function generateFluxPencilHero(env: AiEnv, subjectPrompt: string): Promise<string> {
  const response = await (env.AI.run as any)(
    MODELS.imageGeneration,
    {
      prompt: `${FLUX_STYLE_RULE} ${subjectPrompt}`,
      steps: 4
    },
    gateway
  ) as Record<string, unknown>;

  if (typeof response.image !== "string" || !response.image) {
    throw new Error("flux_missing_image");
  }
  return `data:image/jpeg;base64,${response.image}`;
}
