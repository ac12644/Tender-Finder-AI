import { createReactAgent } from "@langchain/langgraph/prebuilt";
import type { LanguageModelLike } from "@langchain/core/language_models/base";
import type { StructuredToolInterface } from "@langchain/core/tools";
import { getModelByTier, type ModelTier } from "../../lib/llmTiered";

/**
 * Base LLM provider factory.
 * Defaults to medium tier for backward compatibility.
 */
export async function createLLM(
  tier: ModelTier = "medium"
): Promise<LanguageModelLike> {
  return await getModelByTier(tier);
}

/**
 * Base agent configuration.
 */
export interface AgentConfig {
  name: string;
  tools: StructuredToolInterface[];
  prompt: string;
  verbose?: boolean;
  modelTier?: ModelTier; // Model tier for cost optimization
}

/**
 * Create a specialized agent with consistent configuration.
 */
export async function createSpecializedAgent(config: AgentConfig) {
  const tier = config.modelTier || "medium"; // Default to medium
  return createReactAgent({
    llm: await createLLM(tier),
    tools: config.tools,
    name: config.name,
    prompt: config.prompt,
  });
}
