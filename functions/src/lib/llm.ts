import { ChatOpenAI } from "@langchain/openai";
import type { LanguageModelLike } from "@langchain/core/language_models/base";
import { defineSecret } from "firebase-functions/params";

export const OPENROUTER_API_KEY = defineSecret("OPENROUTER_API_KEY");

/** Returns a ready chat model. Always await this. */
export async function llmFactory(): Promise<LanguageModelLike> {
  // Try environment variable first
  if (OPENROUTER_API_KEY.value()) {
    return new ChatOpenAI({
      apiKey: OPENROUTER_API_KEY.value(),
      configuration: {
        baseURL: "https://openrouter.ai/api/v1",
      },
      modelName: "openrouter/auto",
    });
  }

  throw new Error(
    "No OpenRouter credentials found. Set OPENROUTER_API_KEY environment variable or configure Firestore runtime config."
  );
}
