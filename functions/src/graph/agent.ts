import {
  START,
  StateGraph,
  MessagesAnnotation,
  MemorySaver,
} from "@langchain/langgraph";
import { createReactAgent, withAgentName } from "@langchain/langgraph/prebuilt";
import type { LanguageModelLike } from "@langchain/core/language_models/base";
import { SystemMessage } from "@langchain/core/messages";

import { llmFactory } from "../lib/llm";
import {
  searchTendersTool,
  saveTenderSummaryTool,
  saveMatchScoreTool,
  buildTedExpertQueryTool,
  currentDateTool,
  generateSmartSuggestionsTool,
  analyzeUserBehaviorTool,
  generateContextualSuggestionsTool,
  analyzeEligibilityTool,
  getBestTendersTool,
  getPersonalizedRecommendationsTool,
  advancedSearchTool,
  frameworkAgreementSearchTool,
} from "./tools";

/**
 * LLM provider (async allowed). If Gemini, wrap to inline agent name
 * so traces are easier to inspect (no behavior change).
 */
const llmProvider = async (): Promise<LanguageModelLike> => {
  const base = await llmFactory();
  try {
    if (
      typeof (base as unknown as { getName?: () => string }).getName ===
        "function" &&
      (base as unknown as { getName: () => string }).getName() ===
        "ChatGoogleGenerativeAI"
    ) {
      return withAgentName(base, "inline");
    }
  } catch {
    /* noop */
  }
  return base;
};

const tools = [
  buildTedExpertQueryTool, // 🧭 build structured TED Expert Query
  searchTendersTool, // 🔎 call TED search
  saveTenderSummaryTool, // 📝 persist summaries
  saveMatchScoreTool, // 📈 persist match scores
  currentDateTool, // 📅 canonical server date helper
  generateSmartSuggestionsTool, // 🧠 generate AI-powered suggestions
  analyzeUserBehaviorTool, // 👤 analyze user behavior patterns
  generateContextualSuggestionsTool, // 🔍 contextual suggestions
  analyzeEligibilityTool, // ✅ analyze tender eligibility
  getBestTendersTool, // 🎯 get best tenders for user
  getPersonalizedRecommendationsTool, // 🎯 personalized recommendations
  advancedSearchTool, // 🔬 advanced TED search with filters
  frameworkAgreementSearchTool, // 📋 framework agreement search
];

/**
 * Keep prompt declarative and tool-driven.
 * We do NOT hardcode dates; `index.ts` injects Firestore date as SYSTEM,
 * and a `get_current_date` tool is also available when needed.
 */
export const agent = createReactAgent({
  llm: llmProvider,
  tools,
  name: "tender_agent",
  messageModifier: async (messages) => {
    // Force tool calls by prepending a system message
    return [
      new SystemMessage(
        "You MUST use tools to answer user requests. Call build_ted_query then search_tenders."
      ),
      ...messages,
    ];
  },
  prompt: [
    "You are a TED tender search assistant. You MUST use the available tools to search for tenders.",
    "CRITICAL: When users ask for tenders, you MUST call the tools in this exact order:",
    "1. Call build_ted_query with the user's request",
    "2. Call search_tenders with the query returned from step 1",
    "3. Format the results in a markdown table",
    "NEVER generate fake data. Always use the tools to get real tender data.",
    "If search_tenders returns empty results, say 'Nessun bando trovato' and suggest alternatives.",
    "Default country = ITA unless the user asks otherwise.",
    "When building rows:",
    " - NoticeId = `notice-identifier` if present, else `publication-number`.",
    " - Value = best available among `estimated-value-glo`, `total-value`, or lot result value, formatted like '€ 1 234 567'.",
    " - Pdf = take the *Italian* PDF URL from `links.pdf` (language key 'it' or 'ita'); if missing, fallback to English ('en' or 'eng'); if none, put '—'. Do NOT fabricate URLs.",
    " - Description = write a concise 1–2 sentence summary in Italian (max 140 chars). Prefer information returned by tools (e.g., `description_proposed_it`) when present; otherwise summarise title/buyer/context in Italian.",
    "Use date windows like `today(-N)`..`today()`; avoid absolute dates unless user asks.",
    "If you save a summary, keep it concise in Italian; include a brief English line prefixed with `EN:`.",
    "Finally, always return a concise human summary plus a compact markdown table.",
    "Include the following columns exactly in this order (use '—' if a value is unknown):",
    "| PubNo | NoticeId | Buyer | Title | Published | Deadline | CPV | Value | Pdf | Description |",
    "Never wrap tool arguments in code fences. Only pass fields defined by the tool schema.",
    "",
    "=== SMART SUGGESTIONS ===",
    "When appropriate, generate smart suggestions using:",
    "- generate_smart_suggestions: for general search suggestions based on trends and user profile",
    "- analyze_user_behavior: for personalized suggestions based on user history and preferences",
    "- generate_contextual_suggestions: for suggestions based on current search context and results",
    "Always provide 3-5 relevant suggestions in Italian natural language after showing search results.",
    "Suggestions should be actionable, specific, and help users discover related opportunities.",
    "",
    "=== ELIGIBILITY-AWARE FEATURES ===",
    "For users with company profiles, provide intelligent tender analysis:",
    "- analyze_eligibility: Check if a company is eligible for specific tenders",
    "- get_best_tenders: Get pre-filtered tenders based on eligibility and preferences",
    "- get_personalized_recommendations: Generate tailored search suggestions",
    "Always consider:",
    "1. Financial capacity requirements vs company revenue",
    "2. Technical experience and certifications",
    "3. Geographic restrictions and operating regions",
    "4. Legal form requirements",
    "5. Competition level and time constraints",
    "6. Risk factors and opportunities",
    "Provide clear eligibility scores (0-1) and recommendations (high/medium/low/skip).",
    "",
    "=== ADVANCED TED SEARCH CAPABILITIES ===",
    "Use advanced search tools for specific requirements:",
    "- advanced_search: Filter by procedure type, contract nature, framework agreements, electronic auctions, subcontracting, value ranges, geographic location",
    "- framework_agreement_search: Search specifically for framework agreements and dynamic purchasing systems",
    "Available filters:",
    "1. Procedure types: open, restricted, negotiated, competitive-dialogue, innovation-partnership, framework-agreement",
    "2. Contract nature: services, supplies, works, services-and-supplies, works-and-services",
    "3. Special features: framework agreements, electronic auctions, subcontracting allowed",
    "4. Value ranges: minimum and maximum contract values",
    "5. Geographic: countries, cities, regions",
    "6. CPV codes: specific or wildcard classifications",
    "Use these tools when users ask for specific types of tenders or have detailed requirements.",
  ].join("\n"),
});

/**
 * Single-node graph with short-term memory to maintain history across turns
 * and avoid 'coercion' issues. Thread id is supplied at call time.
 */
const checkpointer = new MemorySaver();
export const app = new StateGraph(MessagesAnnotation)
  .addNode("agent", agent)
  .addEdge(START, "agent")
  .compile({ name: "tender_graph", checkpointer });
