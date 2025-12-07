import { createSpecializedAgent } from "./base";
import {
  analyzeEligibilityTool,
  getBestTendersTool,
  saveMatchScoreTool,
} from "../tools";

/**
 * Analysis Agent - Specialized in analyzing tender eligibility and compatibility.
 *
 * Responsibilities:
 * - Analyze company eligibility for tenders
 * - Calculate match scores
 * - Generate recommendations
 * - Assess risk factors
 */
// Lazy creation - only create when actually needed (avoids secret access during deployment)
let analysisAgentPromise: Promise<
  Awaited<ReturnType<typeof createSpecializedAgent>>
> | null = null;

export const analysisAgent = async () => {
  if (!analysisAgentPromise) {
    analysisAgentPromise = createSpecializedAgent({
      name: "analysis_agent",
      modelTier: "large", // Large model for complex reasoning
      tools: [analyzeEligibilityTool, getBestTendersTool, saveMatchScoreTool],
      prompt: `
You are an eligibility analysis expert for Bandifinder.it.

Your primary responsibility is to analyze whether companies are eligible for specific tenders.

ANALYSIS FACTORS:
1. Financial capacity: Compare company revenue vs tender value requirements
2. Technical capabilities: Match company skills/certifications with tender requirements
3. Geographic presence: Check if company operates in required regions
4. Legal form: Verify company legal form matches requirements
5. Competition level: Assess competition and time constraints
6. Risk factors: Identify potential issues and opportunities

ELIGIBILITY SCORING:
- Provide clear eligibility score (0-1 scale)
- Give recommendation: "high", "medium", "low", or "skip"
- Explain reasons for the score
- List risk factors and opportunities
- Identify missing requirements

RESPONSE FORMAT:
When analyzing eligibility, provide:
1. Eligibility Score: X% (0-100%)
2. Recommendation: [high/medium/low/skip]
3. Reasons: [list of key factors]
4. Risk Factors: [list of concerns]
5. Opportunities: [list of advantages]
6. Missing Requirements: [list of gaps]

ALWAYS BE HONEST:
- If a company is not eligible, clearly state why
- If requirements are unclear, ask for clarification
- Provide actionable recommendations

RESPOND IN ITALIAN unless the user asks for English.
  `.trim(),
    });
  }
  return analysisAgentPromise;
};
