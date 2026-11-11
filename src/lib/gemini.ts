import { z } from "zod";
import { logger } from "@/lib/logger";

// One inexpensive model, no automatic paid-model escalation or quota retries.
export const DEFAULT_GEMINI_MODEL = "gemini-3.1-flash-lite";
export type GeminiImage = { mimeType: string; data: string };
export async function geminiJSON<T>(input: {
  operation: "invoice" | "chore";
  instructions: string;
  data: unknown;
  images?: GeminiImage[];
  jsonSchema: Record<string, unknown>;
  schema: z.ZodType<T>;
}): Promise<T | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  const model = process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL;
  if (!/^gemini-[a-z0-9.-]+$/.test(model)) return null;
  const started = Date.now();
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: input.instructions }] },
          contents: [
            {
              role: "user",
              parts: [
                { text: JSON.stringify(input.data) },
                ...(input.images || []).map((image) => ({ inlineData: image })),
              ],
            },
          ],
          generationConfig: {
            temperature: 0,
            maxOutputTokens: 600,
            responseMimeType: "application/json",
            responseSchema: input.jsonSchema,
          },
        }),
        signal: AbortSignal.timeout(25000),
        cache: "no-store",
      },
    );
    if (!response.ok) {
      // Never log Google's response body: it can echo images, prompts or keys.
      logger.warn("ai.provider_unavailable", {
        provider: "gemini",
        operation: input.operation,
        providerStatus: response.status,
        durationMs: Date.now() - started,
        outcome: "parent_review_required",
      });
      return null;
    }
    const body = await response.json();
    const candidate = body.candidates?.[0];
    if (body.promptFeedback?.blockReason || candidate?.finishReason !== "STOP")
      return null;
    const text = candidate.content?.parts
      ?.filter(
        (p: { text?: string; thought?: boolean }) =>
          !p.thought && typeof p.text === "string",
      )
      .map((p: { text: string }) => p.text)
      .join("");
    const result = input.schema.parse(JSON.parse(text || ""));
    logger.info("ai.review_completed", {
      provider: "gemini",
      operation: input.operation,
      durationMs: Date.now() - started,
      outcome: "validated",
    });
    return result;
  } catch {
    logger.warn("ai.review_unavailable", {
      provider: "gemini",
      operation: input.operation,
      durationMs: Date.now() - started,
      outcome: "parent_review_required",
    });
    return null;
  }
}
