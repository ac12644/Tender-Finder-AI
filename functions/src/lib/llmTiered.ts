import { ChatOpenAI } from "@langchain/openai";
import type { LanguageModelLike } from "@langchain/core/language_models/base";
import { OPENROUTER_API_KEY } from "./llm";

/**
 * Model tiers for cost optimization:
 * - Small: Fast, cheap models for classification/routing
 * - Medium: Balanced models for general tasks
 * - Large: Powerful models for complex reasoning
 */

export type ModelTier = "small" | "medium" | "large";

/**
 * Get a small, fast model for classification and routing.
 * Use for: Intent classification, simple decisions, routing
 */
export async function getSmallModel(): Promise<LanguageModelLike> {
  if (!OPENROUTER_API_KEY.value()) {
    throw new Error("OPENROUTER_API_KEY not configured");
  }

  return new ChatOpenAI({
    apiKey: OPENROUTER_API_KEY.value(),
    configuration: {
      baseURL: "https://openrouter.ai/api/v1",
    },
    // Use a small, fast model
    modelName: "google/gemini-2.0-flash-001", // Fast and cheap
    temperature: 0.3, // Lower temperature for classification
  });
}

/**
 * Get a medium model for general agent tasks.
 * Use for: Search, ranking, personalization
 */
export async function getMediumModel(): Promise<LanguageModelLike> {
  if (!OPENROUTER_API_KEY.value()) {
    throw new Error("OPENROUTER_API_KEY not configured");
  }

  return new ChatOpenAI({
    apiKey: OPENROUTER_API_KEY.value(),
    configuration: {
      baseURL: "https://openrouter.ai/api/v1",
    },
    // Use a balanced model
    modelName: "anthropic/claude-3.5-sonnet", // Good balance
    temperature: 0.7,
  });
}

/**
 * Get a large, powerful model for complex reasoning.
 * Use for: Analysis, eligibility checks, complex reasoning
 */
export async function getLargeModel(): Promise<LanguageModelLike> {
  if (!OPENROUTER_API_KEY.value()) {
    throw new Error("OPENROUTER_API_KEY not configured");
  }

  return new ChatOpenAI({
    apiKey: OPENROUTER_API_KEY.value(),
    configuration: {
      baseURL: "https://openrouter.ai/api/v1",
    },
    // Use a powerful model for complex tasks
    modelName: "openai/gpt-oss-120b", // Most capable
    temperature: 0.7,
  });
}

/**
 * Get model based on tier.
 */
export async function getModelByTier(
  tier: ModelTier
): Promise<LanguageModelLike> {
  switch (tier) {
    case "small":
      return getSmallModel();
    case "medium":
      return getMediumModel();
    case "large":
      return getLargeModel();
  }
}
