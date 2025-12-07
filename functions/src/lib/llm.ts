/**
 * LLM (Large Language Model) Factory
 *
 * Provides a factory function for creating language model instances using
 * OpenRouter as the API gateway. Supports multiple LLM providers through
 * a unified interface.
 */

import { ChatOpenAI } from "@langchain/openai";
import type { LanguageModelLike } from "@langchain/core/language_models/base";
import { defineSecret } from "firebase-functions/params";

/** Firebase secret for OpenRouter API key */
export const OPENROUTER_API_KEY = defineSecret("OPENROUTER_API_KEY");

/**
 * Creates and returns a configured language model instance.
 *
 * Uses OpenRouter as the API gateway, which provides access to multiple
 * LLM providers (OpenAI, Anthropic, etc.) through a single interface.
 *
 * @returns A configured language model instance
 * @throws Error if OpenRouter API key is not configured
 */
export async function llmFactory(): Promise<LanguageModelLike> {
  const apiKey = OPENROUTER_API_KEY.value();
  if (!apiKey) {
    throw new Error(
      "OpenRouter API key not configured. Set OPENROUTER_API_KEY as a " +
        "Firebase Secret or environment variable."
    );
  }

  return new ChatOpenAI({
    apiKey,
    configuration: {
      baseURL: "https://openrouter.ai/api/v1",
    },
    modelName: "openai/gpt-oss-120b",
    temperature: 0.7,
  });
}
