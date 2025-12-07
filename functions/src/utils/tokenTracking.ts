import type { BaseMessage } from "@langchain/core/messages";

/**
 * Token usage information extracted from LLM responses.
 */
export interface TokenUsage {
  prompt: number;
  completion: number;
  total: number;
}

/**
 * Model pricing per 1M tokens (input/output).
 * Prices are approximate and should be updated based on actual OpenRouter pricing.
 */
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  // Small models
  "google/gemini-2.0-flash-001": {
    input: 0.075, // $0.075 per 1M input tokens
    output: 0.3, // $0.30 per 1M output tokens
  },
  // Medium models
  "anthropic/claude-3.5-sonnet": {
    input: 3.0, // $3.00 per 1M input tokens
    output: 15.0, // $15.00 per 1M output tokens
  },
  // Large models
  "openai/gpt-oss-120b": {
    input: 10.0, // $10.00 per 1M input tokens (approximate)
    output: 30.0, // $30.00 per 1M output tokens (approximate)
  },
};

/**
 * Extract token usage from LangChain messages.
 * Checks both response_metadata and usage_metadata.
 */
export function extractTokenUsage(
  messages: BaseMessage[] | undefined
): TokenUsage | null {
  if (!messages || messages.length === 0) {
    return null;
  }

  let totalPrompt = 0;
  let totalCompletion = 0;
  let totalTokens = 0;

  for (const msg of messages) {
    // Try response_metadata first (OpenAI format)
    const responseMetadata = (
      msg as { response_metadata?: Record<string, unknown> }
    ).response_metadata;
    if (responseMetadata) {
      const tokenUsage = responseMetadata.token_usage as
        | {
            prompt_tokens?: number;
            completion_tokens?: number;
            total_tokens?: number;
          }
        | undefined;

      if (tokenUsage) {
        totalPrompt += tokenUsage.prompt_tokens || 0;
        totalCompletion += tokenUsage.completion_tokens || 0;
        totalTokens += tokenUsage.total_tokens || 0;
        continue;
      }
    }

    // Try usage_metadata (standardized format)
    const usageMetadata = (msg as { usage_metadata?: Record<string, unknown> })
      .usage_metadata;
    if (usageMetadata) {
      const inputTokens = (usageMetadata.input_tokens as number) || 0;
      const outputTokens = (usageMetadata.output_tokens as number) || 0;
      const total = (usageMetadata.total_tokens as number) || 0;

      totalPrompt += inputTokens;
      totalCompletion += outputTokens;
      totalTokens += total || inputTokens + outputTokens;
    }
  }

  // If we found any tokens, return the usage
  if (totalTokens > 0 || totalPrompt > 0 || totalCompletion > 0) {
    return {
      prompt: totalPrompt,
      completion: totalCompletion,
      total: totalTokens || totalPrompt + totalCompletion,
    };
  }

  return null;
}

/**
 * Calculate cost based on model and token usage.
 */
export function calculateCost(
  modelName: string,
  tokenUsage: TokenUsage
): number {
  const pricing = MODEL_PRICING[modelName];
  if (!pricing) {
    // Default pricing if model not found (conservative estimate)
    console.warn(`No pricing found for model: ${modelName}, using default`);
    return (tokenUsage.total / 1_000_000) * 5.0; // $5 per 1M tokens default
  }

  const inputCost = (tokenUsage.prompt / 1_000_000) * pricing.input;
  const outputCost = (tokenUsage.completion / 1_000_000) * pricing.output;

  return inputCost + outputCost;
}

/**
 * Get model name from agent ID (for cost calculation).
 */
export function getModelNameForAgent(agentId: string): string {
  // Map agent IDs to their model tiers
  const agentModelMap: Record<string, string> = {
    search_agent: "anthropic/claude-3.5-sonnet", // Medium
    analysis_agent: "openai/gpt-oss-120b", // Large
    personalization_agent: "anthropic/claude-3.5-sonnet", // Medium
    ranking_agent: "anthropic/claude-3.5-sonnet", // Medium
    application_agent: "anthropic/claude-3.5-sonnet", // Medium
  };

  return agentModelMap[agentId] || "anthropic/claude-3.5-sonnet"; // Default to medium
}

/**
 * Extract token usage and calculate cost from agent result.
 */
export function extractTokenUsageAndCost(
  result: { messages?: BaseMessage[] } | undefined,
  agentId: string
): { tokenUsage: TokenUsage | null; cost: number } {
  const tokenUsage = extractTokenUsage(result?.messages);
  if (!tokenUsage) {
    return { tokenUsage: null, cost: 0 };
  }

  const modelName = getModelNameForAgent(agentId);
  const cost = calculateCost(modelName, tokenUsage);

  return { tokenUsage, cost };
}
