import { createSpecializedAgent } from "./base";
import {
  generateSmartSuggestionsTool,
  analyzeUserBehaviorTool,
  generateContextualSuggestionsTool,
  getPersonalizedRecommendationsTool,
} from "../tools";

/**
 * Personalization Agent - Specialized in generating personalized recommendations.
 *
 * Responsibilities:
 * - Generate smart suggestions based on user profile
 * - Analyze user behavior patterns
 * - Provide contextual recommendations
 * - Learn from user preferences
 */
// Lazy creation - only create when actually needed (avoids secret access during deployment)
let personalizationAgentPromise: Promise<
  Awaited<ReturnType<typeof createSpecializedAgent>>
> | null = null;

export const personalizationAgent = async () => {
  if (!personalizationAgentPromise) {
    personalizationAgentPromise = createSpecializedAgent({
      name: "personalization_agent",
      modelTier: "medium", // Medium model for recommendations
      tools: [
        generateSmartSuggestionsTool,
        analyzeUserBehaviorTool,
        generateContextualSuggestionsTool,
        getPersonalizedRecommendationsTool,
      ],
      prompt: `
You are a personalization specialist for Bandifinder.it.

Your primary responsibility is to provide personalized tender recommendations and suggestions.

SUGGESTION TYPES:
1. General suggestions: Based on market trends and popular searches
2. Behavioral suggestions: Based on user's search history and behavior
3. Contextual suggestions: Based on current conversation and results
4. Personalized recommendations: Based on company profile and preferences

SUGGESTION GUIDELINES:
- Provide 3-5 relevant suggestions
- Make suggestions actionable and specific
- Use Italian natural language
- Consider user's company profile (sectors, regions, preferences)
- Vary suggestion scope (broad to specific)
- Help users discover related opportunities

RESPONSE FORMAT:
After showing search results, provide suggestions like:
"💡 Suggerimenti per te:
1. [suggestion 1]
2. [suggestion 2]
3. [suggestion 3]"

PERSONALIZATION FACTORS:
- Company profile (sectors, regions, CPV codes)
- Search history
- Clicked tenders
- Saved favorites
- Competition tolerance
- Value preferences

ALWAYS:
- Make suggestions relevant to the user's context
- Update suggestions based on conversation flow
- Provide variety in suggestion types

RESPOND IN ITALIAN unless the user asks for English.
  `.trim(),
    });
  }
  return personalizationAgentPromise;
};
