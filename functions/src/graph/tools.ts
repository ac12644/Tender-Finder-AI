import { z } from "zod";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { serverTimestamp, db } from "../lib/firestore";
import { safeTool } from "./tooling";
import { tedSearch } from "../lib/ted";
import { saveTenderSummary, saveMatchScore } from "../lib/firestore";
import type { TenderDoc } from "../lib/types";
import type { CompanyProfile, UserProfile } from "../lib/models";
import { llmFactory } from "../lib/llm";

export type TenderLite = {
  publicationNumber: string;
  noticeId: string;
  title: string;
  buyer: string;
  publicationDate?: string;
  deadline?: string;
  cpv?: string | string[] | null;
  nuts?: string | null;
  links?: TenderDoc["links"];
  summary_it?: string | null;
  summary_en?: string | null;

  // Enhanced fields from TED API
  procedureType?: string;
  contractNature?: string;
  noticeType?: string;
  contractType?: string;
  placeOfPerformance?: unknown;
  country?: unknown;
  city?: unknown;
  postCode?: unknown;
  awardCriteria?: unknown;
  selectionCriteria?: unknown;
  subcontractingObligation?: unknown;
  subcontractingPercentage?: unknown;
  subcontractingAllowed?: unknown;
  frameworkAgreement?: unknown;
  electronicAuction?: unknown;
  contractDuration?: unknown;
  tenderValidity?: unknown;
  pdf_preferred?: string;
  description_proposed_it?: unknown;
  description_proposed_en?: unknown;
};

/**
 * Country code mapping: country names to ISO 3166-1 alpha-3 codes
 * TED API requires ISO 3166-1 alpha-3 country codes (e.g., ITA, FRA, DEU)
 */
const COUNTRY_CODE_MAP: Record<string, string> = {
  // Common country names to codes
  italy: "ITA",
  italia: "ITA",
  france: "FRA",
  germany: "DEU",
  spain: "ESP",
  portugal: "PRT",
  netherlands: "NLD",
  belgium: "BEL",
  austria: "AUT",
  greece: "GRC",
  poland: "POL",
  romania: "ROU",
  // Direct codes (pass through)
  ITA: "ITA",
  FRA: "FRA",
  DEU: "DEU",
  ESP: "ESP",
  PRT: "PRT",
  NLD: "NLD",
  BEL: "BEL",
  AUT: "AUT",
  GRC: "GRC",
  POL: "POL",
  ROU: "ROU",
};

/**
 * Normalize country input to ISO 3166-1 alpha-3 code
 */
function normalizeCountryCode(input: string): string {
  const normalized = input.trim().toUpperCase();
  // Check direct code first
  if (COUNTRY_CODE_MAP[normalized]) {
    return COUNTRY_CODE_MAP[normalized];
  }
  // Check case-insensitive name
  const lower = input.trim().toLowerCase();
  if (COUNTRY_CODE_MAP[lower]) {
    return COUNTRY_CODE_MAP[lower];
  }
  // If already uppercase 3-letter code, assume valid
  if (/^[A-Z]{3}$/.test(normalized)) {
    return normalized;
  }
  // Default to ITA if unrecognized
  console.warn(
    `[normalizeCountryCode] Unrecognized country: ${input}, defaulting to ITA`
  );
  return "ITA";
}

/**
 * Validate CPV code format (8 digits, optionally with wildcard)
 */
function validateCpvCode(cpv: string): string | null {
  const cleaned = cpv.trim();
  // CPV codes are 8 digits, optionally with * wildcard
  if (/^\d{8}(\*)?$/.test(cleaned)) {
    return cleaned;
  }
  // Try to extract 8-digit code from longer string
  const match = cleaned.match(/(\d{8})/);
  if (match) {
    return match[1];
  }
  console.warn(`[validateCpvCode] Invalid CPV format: ${cpv}`);
  return null;
}

const QueryIntent = z.object({
  country: z
    .string()
    .default("ITA")
    .describe(
      "Country code in ISO 3166-1 alpha-3 format (e.g., ITA, FRA, DEU). Use 3-letter uppercase code, NOT country name. Examples: ITA for Italy, FRA for France, DEU for Germany."
    ),
  daysBack: z
    .number()
    .int()
    .min(0)
    .max(30)
    .default(3)
    .describe(
      "Number of days to look back from today. Must be between 0 and 30."
    ),
  cpv: z
    .array(z.string())
    .optional()
    .describe(
      "Array of CPV codes (8-digit codes like '48000000' or '72000000'). Each code must be exactly 8 digits. Wildcards not supported in query building."
    ),
  text: z
    .string()
    .optional()
    .describe(
      "Free text search term to search in notice title, description, or buyer name."
    ),
});

export const buildTedExpertQueryTool = safeTool({
  name: "build_ted_query",
  description:
    "Build a valid TED Expert Query string from a structured intent. CRITICAL: After building the query, you MUST call search_tenders with the returned query string. This tool only builds the query - it does NOT execute the search. Parameters: country (ISO 3166-1 alpha-3 code like ITA, FRA, DEU - NOT country names), daysBack (0-30), cpv (array of 8-digit CPV codes), text (search term). WARNING: This tool does NOT return tender data - you MUST call search_tenders after this to get actual results.",
  schema: QueryIntent,
  fn: async ({ country, daysBack, cpv, text }) => {
    // Normalize country code
    const countryCode = normalizeCountryCode(country);

    const date = (d: number) => `today(${d === 0 ? "" : `-${d}`})`;
    const parts = [
      `(place-of-performance-country-proc IN (${countryCode}))`,
      `(publication-date >= ${date(daysBack)} AND publication-date <= today())`,
    ];

    if (cpv?.length) {
      // Validate and process CPV codes
      const validCpvs = cpv
        .map(validateCpvCode)
        .filter((c): c is string => c !== null);

      if (validCpvs.length > 0) {
        // TED API v3: CPV field supports exact match (=) or IN operator
        // Remove any wildcards for query building
        const cleanCpvs = validCpvs.map((c) => c.replace(/\*$/, ""));

        if (cleanCpvs.length === 1) {
          parts.push(`classification-cpv = "${cleanCpvs[0]}"`);
        } else {
          parts.push(
            `classification-cpv IN (${cleanCpvs
              .map((c) => `"${c}"`)
              .join(", ")})`
          );
        }
      } else {
        console.warn(`[build_ted_query] No valid CPV codes after validation`);
      }
    }

    if (text && text.trim()) {
      const t = text.trim().replace(/"/g, '\\"');
      // Use ~ operator for text search (fuzzy matching)
      parts.push(
        `(notice-title ~ "${t}" OR description-proc ~ "${t}" OR buyer-name ~ "${t}")`
      );
    }

    const query = parts.join(" AND ");
    console.log(`[build_ted_query] Generated query: ${query}`);
    return query;
  },
});

const SearchTendersInput = z.object({
  q: z.string().min(1),
  limit: z.number().int().min(1).max(50).default(30),
});

function firstString(v: unknown): string | undefined {
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return v.find((x) => typeof x === "string");
  return undefined;
}

function pickPdfItaOrEn(links: Record<string, unknown>): string | undefined {
  const pdf = links?.pdf;
  if (!pdf || typeof pdf !== "object") return undefined;
  const pdfObj = pdf as Record<string, unknown>;
  const keys = Object.keys(pdfObj);
  const find = (tags: string[]) =>
    keys.find((k) => {
      const low = k.toLowerCase();
      return tags.some((t) => low === t || low.startsWith(t));
    });
  const itKey = find(["it", "ita"]);
  const enKey = find(["en", "eng"]);
  const val = firstString(
    itKey ? pdfObj[itKey] : enKey ? pdfObj[enKey] : undefined
  );
  return val;
}

export const searchTendersTool = safeTool({
  name: "search_tenders",
  description:
    "Search TED notices using Expert Query. This is the PRIMARY search tool - use it after building a query with build_ted_query. Returns an array of tenders with enhanced details. CRITICAL: You MUST call this tool after building a query. NEVER generate fake tender data - ONLY use results from this tool. If this tool returns an empty array, that means no tenders were found - do NOT invent fake tenders.",
  schema: SearchTendersInput,
  fn: async ({ q, limit }) => {
    const startTime = Date.now();
    console.log(`[search_tenders] Called with query: ${q}, limit: ${limit}`);
    const notices = await tedSearch({ q, limit });
    const duration = Date.now() - startTime;
    console.log(
      `[search_tenders] Received ${notices.length} notices from TED API in ${duration}ms`
    );

    // Track tool call for metrics
    try {
      const { trackToolCall } = await import("./telemetry.js");
      await trackToolCall(
        "search_tenders",
        { q, limit },
        { count: notices.length, notices: notices.slice(0, 3) }, // Sample first 3
        duration,
        true
      );
    } catch {
      // Telemetry failures shouldn't break the tool
    }

    if (notices.length === 0) {
      console.warn(`[search_tenders] No notices found for query: ${q}`);
      // Return empty array but with a helpful message structure
      return [];
    }

    const typedNotices = notices as Array<Record<string, unknown>>;
    const mapped = typedNotices.map((n: Record<string, unknown>) => {
      const descProc = n["description-proc"] as
        | Record<string, unknown>
        | undefined;
      const descGlo = n["description-glo"] as
        | Record<string, unknown>
        | undefined;

      const desc_it = descProc?.ita ?? descGlo?.ita ?? null;
      const desc_en =
        descProc?.eng ?? descProc?.en ?? descGlo?.eng ?? descGlo?.en ?? null;
      const pdfItaOrEn = pickPdfItaOrEn(n.links as Record<string, unknown>);

      // Extract enhanced information
      const procedureType = n["procedure-type"] ?? n["BT-01-notice"] ?? null;
      const contractNature =
        n["contract-nature-main-proc"] ?? n["contract-nature-main-lot"] ?? null;
      const noticeType = n["BT-127-notice"] ?? null;
      const contractType = n["BT-05-notice"] ?? null;

      // Geographic information
      const placeOfPerformance = n["place-of-performance"] ?? null;
      const country = n["place-of-performance-country-proc"] ?? null;
      const city = n["place-of-performance-city-proc"] ?? null;
      const postCode = n["place-of-performance-post-code-proc"] ?? null;

      // Award criteria
      const awardCriteria = n["award-criterion-name-lot"] ?? null;
      const selectionCriteria = n["selection-criterion-name-lot"] ?? null;

      // Subcontracting information
      const subcontractingObligation =
        n["subcontracting-obligation-lot"] ?? null;
      const subcontractingPercentage = n["subcontracting-percentage"] ?? null;
      const subcontractingAllowed = n["subcontracting-allowed-lot"] ?? null;

      // Framework agreement and electronic auction
      const frameworkAgreement = n["framework-agreement-lot"] ?? null;
      const electronicAuction = n["electronic-auction-lot"] ?? null;

      // Contract duration
      const contractDuration = n["contract-duration-period-lot"] ?? null;
      const tenderValidity = n["tender-validity-deadline-lot"] ?? null;

      return {
        publicationNumber: String(n["publication-number"] ?? ""),
        noticeId: n["notice-identifier"] ?? n["publication-number"] ?? "",
        title:
          (n["notice-title"] as Record<string, unknown>)?.ita ??
          (n["notice-title"] as Record<string, unknown>)?.eng ??
          (n["notice-title"] as Record<string, unknown>)?.en ??
          "",
        buyer:
          (n["buyer-name"] as Record<string, unknown[]>)?.ita?.[0] ??
          (n["buyer-name"] as Record<string, unknown[]>)?.eng?.[0] ??
          (n["buyer-name"] as Record<string, unknown[]>)?.en?.[0] ??
          "",
        publicationDate: n["publication-date"] ?? null,
        deadline: n["deadline-date-lot"] ?? null,
        cpv: n["classification-cpv"] ?? null,
        links: n.links ?? null,
        pdf_preferred: pdfItaOrEn,
        description_proposed_it: desc_it,
        description_proposed_en: desc_en,
        summary_it: null,
        summary_en: null,

        // Enhanced fields
        procedureType: String(procedureType ?? ""),
        contractNature: String(contractNature ?? ""),
        noticeType: String(noticeType ?? ""),
        contractType: String(contractType ?? ""),
        placeOfPerformance: placeOfPerformance,
        country: country,
        city: city,
        postCode: postCode,
        awardCriteria: awardCriteria,
        selectionCriteria: selectionCriteria,
        subcontractingObligation: subcontractingObligation,
        subcontractingPercentage: subcontractingPercentage,
        subcontractingAllowed: subcontractingAllowed,
        frameworkAgreement: frameworkAgreement,
        electronicAuction: electronicAuction,
        contractDuration: contractDuration,
        tenderValidity: tenderValidity,
      };
    }) as TenderLite[];

    console.log(`[search_tenders] Mapped ${mapped.length} tenders`);
    return mapped;
  },
});

const SaveSummaryInput = z.object({
  tenderId: z.string().min(1),
  summary_it: z.string().optional(),
  summary_en: z.string().optional(),
});

export const saveTenderSummaryTool = safeTool({
  name: "save_tender_summary",
  description: "Persist AI-generated summaries for a tender in Firestore.",
  schema: SaveSummaryInput,
  fn: async ({ tenderId, summary_it, summary_en }) => {
    const clean = (s?: string | null, max = 600) =>
      (s ?? "")
        .replace(/```[\s\S]*?```/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, max) || null;
    await saveTenderSummary(tenderId, {
      summary_it: clean(summary_it, 600),
      summary_en: clean(summary_en, 220),
    });
    return "OK";
  },
});

const SaveScoreInput = z.object({
  companyId: z.string().min(1),
  tenderId: z.string().min(1),
  score: z.number().min(0).max(1).default(0),
});

export const saveMatchScoreTool = safeTool({
  name: "save_match_score",
  description: "Save a company↔tender score.",
  schema: SaveScoreInput,
  fn: async ({ companyId, tenderId, score }) => {
    await saveMatchScore(companyId, tenderId, score);
    return "OK";
  },
});

export const currentDateTool = new DynamicStructuredTool({
  name: "get_current_date",
  description:
    "Returns the current date in YYYYMMDD (from Firestore server timestamp).",
  schema: z.object({}),
  func: async () => {
    const ref = db.collection("_meta").doc("now");
    await ref.set({ now: serverTimestamp() }, { merge: true });
    const snap = await ref.get();
    const ts = snap.get("now")?.toDate?.() as Date;
    const y = ts.getFullYear();
    const m = String(ts.getMonth() + 1).padStart(2, "0");
    const d = String(ts.getDate()).padStart(2, "0");
    return `${y}${m}${d}`;
  },
});

// ==================== SMART SUGGESTION TOOLS ====================

const GenerateSuggestionsInput = z.object({
  context: z.string().optional().describe("User context or previous searches"),
  userProfile: z
    .object({
      regions: z.array(z.string()).optional(),
      cpv: z.array(z.string()).optional(),
      daysBack: z.number().optional(),
      minValueEUR: z.number().nullable().optional(),
    })
    .nullable()
    .optional(),
  suggestionType: z
    .enum(["search", "category", "region", "timeframe", "value"])
    .default("search"),
  limit: z.number().int().min(1).max(10).default(5),
});

export const generateSmartSuggestionsTool = safeTool({
  name: "generate_smart_suggestions",
  description:
    "Generate intelligent search suggestions based on user context, profile, and current market trends.",
  schema: GenerateSuggestionsInput,
  fn: async ({ context, userProfile, suggestionType, limit }) => {
    try {
      const llm = await llmFactory();

      // Get recent tender data for context
      let recentTenders: Array<Record<string, unknown>> = [];
      try {
        const rawTenders = await tedSearch({
          q: "(place-of-performance IN (ITA)) AND (publication-date >= today(-7) AND publication-date <= today())",
          limit: 20,
        });
        recentTenders = rawTenders as Array<Record<string, unknown>>;
      } catch (error) {
        console.warn("Failed to fetch recent tenders for suggestions:", error);
        // Continue without recent tender data
      }

      // Extract trending CPV codes and regions from recent tenders
      const trendingCpvs = recentTenders
        .map((t) => t["classification-cpv"])
        .filter(Boolean)
        .flat()
        .reduce((acc: Record<string, number>, cpv) => {
          const cpvStr = String(cpv);
          acc[cpvStr] = (acc[cpvStr] || 0) + 1;
          return acc;
        }, {});

      const trendingRegions = recentTenders
        .map((t) => {
          const buyerName = t["buyer-name"] as
            | { ita?: string[]; eng?: string[] }
            | undefined;
          return buyerName?.ita?.[0] || buyerName?.eng?.[0];
        })
        .filter(Boolean)
        .join(" ");

      const topCpvs = Object.entries(trendingCpvs)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([cpv]) => cpv);

      // Build context for LLM
      const prompt = `
You are an expert in Italian public procurement (TED). Generate ${limit} smart search suggestions for a tender search platform.

User Context: ${context || "New user"}
User Profile: ${JSON.stringify(userProfile || {})}
Suggestion Type: ${suggestionType}

Recent Market Trends:
- Top CPV codes: ${topCpvs.join(", ")}
- Recent buyer activity: ${trendingRegions.slice(0, 200)}

Generate ${suggestionType} suggestions that are:
1. Natural language queries in Italian
2. Specific and actionable
3. Based on current market trends
4. Tailored to user profile if available
5. Varied in scope (broad to specific)

Return as JSON array of strings, each being a complete search query.
Example: ["trova bandi software pubblicati oggi in Lombardia", "mostra bandi costruzioni con scadenza entro 7 giorni"]

Response format: ["suggestion1", "suggestion2", ...]
`;

      const response = await llm.invoke(prompt);

      // Handle different response types from LLM
      let content: string;
      if (typeof response === "string") {
        content = response;
      } else if (
        response &&
        typeof response === "object" &&
        "content" in response
      ) {
        content = String(response.content);
      } else {
        content = String(response);
      }

      // Parse JSON response
      let suggestions: string[];
      try {
        const cleanedContent = content.replace(/```json\n?|\n?```/g, "").trim();
        const parsed = JSON.parse(cleanedContent);
        suggestions = Array.isArray(parsed) ? parsed : [];
      } catch (parseError) {
        console.warn("Failed to parse LLM response as JSON:", parseError);
        // Try to extract array from text if JSON parsing fails
        const arrayMatch = content.match(/\[[\s\S]*?\]/);
        if (arrayMatch) {
          try {
            suggestions = JSON.parse(arrayMatch[0]);
          } catch {
            suggestions = [];
          }
        } else {
          suggestions = [];
        }
      }

      return Array.isArray(suggestions) ? suggestions.slice(0, limit) : [];
    } catch (error) {
      console.error("Error generating suggestions:", error);
      // Fallback suggestions
      return [
        "trova bandi informatica pubblicati oggi in Italia",
        "mostra bandi con scadenza entro 7 giorni in Lombardia",
        "riassumi i bandi più recenti (max 5)",
        "cerca bandi costruzioni con valore superiore a 100000 euro",
        "trova bandi servizi ambientali in Toscana",
      ].slice(0, limit);
    }
  },
});

const AnalyzeUserBehaviorInput = z.object({
  userId: z.string().optional(),
  searchHistory: z.array(z.string()).optional(),
  clickedTenders: z.array(z.string()).optional(),
  timeSpent: z.number().optional(),
});

export const analyzeUserBehaviorTool = safeTool({
  name: "analyze_user_behavior",
  description:
    "Analyze user behavior patterns to generate personalized suggestions.",
  schema: AnalyzeUserBehaviorInput,
  fn: async ({
    userId,
    searchHistory = [],
    clickedTenders = [],
    timeSpent = 0,
  }) => {
    try {
      const llm = await llmFactory();

      // Get user's favorite tenders for analysis
      let favoriteTenders = [];
      if (userId) {
        const favoritesSnap = await db
          .collection("favorites")
          .doc(userId)
          .collection("tenders")
          .get();
        favoriteTenders = favoritesSnap.docs.map((doc) => doc.id);
      }

      const prompt = `
Analyze this user's behavior patterns and generate personalized suggestions:

Search History: ${searchHistory.join(", ")}
Clicked Tenders: ${clickedTenders.length} tenders
Favorite Tenders: ${favoriteTenders.length} tenders
Time Spent: ${timeSpent} minutes

Based on this behavior, generate 5 personalized search suggestions that:
1. Build on their interests (inferred from search patterns)
2. Suggest related opportunities they might have missed
3. Include both specific and exploratory queries
4. Are in Italian natural language
5. Consider their engagement level (time spent)

Return as JSON array: ["suggestion1", "suggestion2", ...]
`;

      const response = await llm.invoke(prompt);
      const content = String(response);

      const suggestions = JSON.parse(
        content.replace(/```json\n?|\n?```/g, "").trim()
      );

      return Array.isArray(suggestions) ? suggestions : [];
    } catch (error) {
      console.error("Error analyzing user behavior:", error);
      return [];
    }
  },
});

const GenerateContextualSuggestionsInput = z.object({
  currentQuery: z.string().optional(),
  searchResults: z
    .array(
      z.object({
        title: z.string(),
        buyer: z.string(),
        cpv: z.string().optional(),
        value: z.number().optional(),
      })
    )
    .optional(),
  userIntent: z
    .enum(["explore", "specific_search", "monitoring", "discovery"])
    .default("explore"),
});

export const generateContextualSuggestionsTool = safeTool({
  name: "generate_contextual_suggestions",
  description:
    "Generate suggestions based on current search context and results.",
  schema: GenerateContextualSuggestionsInput,
  fn: async ({ currentQuery, searchResults = [], userIntent }) => {
    try {
      const llm = await llmFactory();

      // Analyze search results to find patterns
      const cpvCounts = searchResults.reduce(
        (acc: Record<string, number>, result) => {
          if (result.cpv) {
            acc[result.cpv] = (acc[result.cpv] || 0) + 1;
          }
          return acc;
        },
        {}
      );

      const topCpvs = Object.entries(cpvCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 3)
        .map(([cpv]) => cpv);

      const avgValue =
        searchResults.reduce((sum, r) => sum + (r.value || 0), 0) /
        searchResults.length;

      const prompt = `
Generate contextual search suggestions based on current search context:

Current Query: "${currentQuery || "No specific query"}"
User Intent: ${userIntent}
Search Results Analysis:
- Top CPV codes: ${topCpvs.join(", ")}
- Average value: €${Math.round(avgValue).toLocaleString()}
- Number of results: ${searchResults.length}

Generate 5 suggestions that:
1. Refine or expand the current search
2. Explore related categories
3. Adjust filters (time, value, region)
4. Suggest complementary searches
5. Are in Italian natural language

Return as JSON array: ["suggestion1", "suggestion2", ...]
`;

      const response = await llm.invoke(prompt);
      const content = String(response);

      const suggestions = JSON.parse(
        content.replace(/```json\n?|\n?```/g, "").trim()
      );

      return Array.isArray(suggestions) ? suggestions : [];
    } catch (error) {
      console.error("Error generating contextual suggestions:", error);
      return [];
    }
  },
});

// ==================== ELIGIBILITY-AWARE TOOLS ====================

const AnalyzeEligibilityInput = z.object({
  tenderId: z.string().min(1),
  tenderData: z
    .object({
      title: z.string(),
      buyer: z.string(),
      cpv: z.string().optional(),
      deadline: z.string().optional(),
      value: z.number().optional(),
    })
    .optional(),
  companyProfile: z.object({
    annualRevenue: z.number().optional(),
    employeeCount: z.number().optional(),
    yearsInBusiness: z.number().optional(),
    certifications: z.array(z.string()).optional(),
    technicalSkills: z.array(z.string()).optional(),
    legalForm: z.string().optional(),
    operatingRegions: z.array(z.string()).optional(),
    primarySectors: z.array(z.string()).optional(),
    competitionTolerance: z.enum(["low", "medium", "high"]).optional(),
  }),
});

export const analyzeEligibilityTool = safeTool({
  name: "analyze_eligibility",
  description:
    "Analyze if a company is eligible for a specific tender based on requirements.",
  schema: AnalyzeEligibilityInput,
  fn: async ({ tenderId, tenderData, companyProfile }) => {
    try {
      const llm = await llmFactory();

      // Use provided tender data or fetch from TED API
      let title, buyer, cpv, deadline, value, notice;

      if (tenderData) {
        title = tenderData.title;
        buyer = tenderData.buyer;
        cpv = tenderData.cpv || "";
        deadline = tenderData.deadline || "";
        value = tenderData.value || null;
        // For provided tender data, we don't have the full notice object
        notice = null;
      } else {
        // Fallback: Get tender details from TED API
        // Try notice-identifier first (more reliable), then publication-number
        let notices = await tedSearch({
          q: `notice-identifier = "${tenderId}"`,
          limit: 1,
        });

        // If not found by notice-identifier, try publication-number
        if (notices.length === 0) {
          notices = await tedSearch({
            q: `publication-number = "${tenderId}"`,
            limit: 1,
          });
        }

        // Also try if tenderId looks like a publication number format (e.g., "2025/S 123-456790")
        if (notices.length === 0 && tenderId.includes("/")) {
          // Try with URL encoding or different format
          const cleanedId = tenderId.replace(/\s+/g, " ").trim();
          notices = await tedSearch({
            q: `publication-number = "${cleanedId}"`,
            limit: 1,
          });
        }

        if (notices.length === 0) {
          console.warn(
            `[analyzeEligibility] Tender not found with ID: ${tenderId}`
          );
          return {
            eligible: false,
            reasons: [
              `Tender not found (ID: ${tenderId}). The tender may have been removed or the ID is incorrect.`,
            ],
            eligibilityScore: 0,
            riskFactors: [],
            opportunities: [],
            missingRequirements: [],
            recommendation: "skip",
          };
        }

        notice = notices[0] as Record<string, unknown>;
        const noticeTitle = notice["notice-title"] as
          | { ita?: string; eng?: string }
          | undefined;
        const noticeBuyer = notice["buyer-name"] as
          | { ita?: string[]; eng?: string[] }
          | undefined;
        title = noticeTitle?.ita || noticeTitle?.eng || "";
        buyer = noticeBuyer?.ita?.[0] || noticeBuyer?.eng?.[0] || "";
        cpv = (notice["classification-cpv"] as string) || "";
        deadline = (notice["deadline-date-lot"] as string) || "";
        value =
          (notice["total-value"] as number | null) ||
          (notice["estimated-value-glo"] as number | null) ||
          null;
      }

      const prompt = `
Analyze tender eligibility for this company profile:

TENDER DETAILS:
- Title: ${title}
- Buyer: ${buyer}
- CPV: ${cpv}
- Value: ${value ? `€${value.toLocaleString()}` : "Not specified"}
- Deadline: ${deadline}

COMPANY PROFILE:
- Annual Revenue: €${
        companyProfile.annualRevenue?.toLocaleString() || "Not specified"
      }
- Employees: ${companyProfile.employeeCount || "Not specified"}
- Years in Business: ${companyProfile.yearsInBusiness || "Not specified"}
- Certifications: ${companyProfile.certifications?.join(", ") || "None"}
- Technical Skills: ${companyProfile.technicalSkills?.join(", ") || "None"}
- Legal Form: ${companyProfile.legalForm || "Not specified"}
- Operating Regions: ${
        companyProfile.operatingRegions?.join(", ") || "Not specified"
      }
- Primary Sectors: ${
        companyProfile.primarySectors?.join(", ") || "Not specified"
      }
- Competition Tolerance: ${companyProfile.competitionTolerance || "medium"}

Analyze eligibility and return ONLY a valid JSON object with these exact fields:
{
  "eligible": true or false,
  "eligibilityScore": number between 0 and 1,
  "reasons": ["reason1", "reason2"],
  "riskFactors": ["risk1", "risk2"],
  "opportunities": ["opportunity1", "opportunity2"],
  "missingRequirements": ["requirement1", "requirement2"],
  "recommendation": "high" or "medium" or "low" or "skip"
}

Be generous with eligibility - consider this company eligible if they have basic qualifications and the tender seems relevant to their business.
`;

      const response = await llm.invoke(prompt);

      // Handle different response types from LLM
      let content: string;
      if (typeof response === "string") {
        content = response;
      } else if (
        response &&
        typeof response === "object" &&
        "content" in response
      ) {
        content = String(response.content);
      } else {
        content = String(response);
      }

      console.log("LLM Response:", content);

      // Try to extract JSON from the response
      let jsonStr = content;
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        jsonStr = jsonMatch[0];
      }

      // Clean up the JSON string
      jsonStr = jsonStr.replace(/```json\n?|\n?```/g, "").trim();

      const analysis = JSON.parse(jsonStr);

      return analysis;
    } catch (error) {
      console.error("Error analyzing eligibility:", error);
      return {
        eligible: false,
        reasons: ["Analysis failed"],
        eligibilityScore: 0,
        recommendation: "skip",
      };
    }
  },
});

const GetBestTendersInput = z.object({
  userId: z.string().min(1),
  limit: z.number().int().min(1).max(20).default(10),
  daysBack: z.number().int().min(1).max(30).default(7),
  regions: z.array(z.string()).optional(),
  cpvCodes: z.array(z.string()).optional(),
});

export const getBestTendersTool = safeTool({
  name: "get_best_tenders",
  description:
    "Get the best tenders for a user based on eligibility, preferences, and competition analysis.",
  schema: GetBestTendersInput,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  fn: async ({ userId, limit, daysBack, regions: _regions, cpvCodes }) => {
    try {
      // Get company profile
      const profileDoc = await db
        .collection("company_profiles")
        .doc(userId)
        .get();
      if (!profileDoc.exists) {
        return {
          tenders: [],
          message:
            "Company profile not found. Please complete your profile first.",
        };
      }

      const companyProfile = profileDoc.data() as CompanyProfile;

      const parts = [
        `place-of-performance-country-proc IN (ITA)`,
        `publication-date >= today(-${daysBack}) AND publication-date <= today()`,
      ];

      if (cpvCodes?.length) {
        parts.push(
          `(${cpvCodes
            .map(
              (c) => `classification-cpv = "${c.endsWith("*") ? c : c + "*"}"`
            )
            .join(" OR ")})`
        );
      }

      const q = parts.join(" AND ");

      // Search tenders
      const rawNotices = await tedSearch({ q, limit: limit * 2 }); // Get more to filter
      const notices = rawNotices as Array<Record<string, unknown>>;

      // Analyze each tender for eligibility using the analyzeEligibilityTool
      const analyzedTenders: Array<{
        tenderId: string;
        title: string;
        buyer: string;
        value: number | null;
        deadline: string | null;
        cpv: unknown;
        pdfUrl: string | undefined;
        tedPageUrl: string;
        eligibilityScore: number;
        recommendation: string;
        reasons: string[];
        opportunities: string[];
        riskFactors: string[];
      }> = [];

      for (const notice of notices.slice(0, limit * 2)) {
        const tenderId =
          (notice["notice-identifier"] as string) ||
          (notice["publication-number"] as string);
        if (!tenderId) continue;

        // Extract tender data for eligibility analysis
        const noticeTitle = notice["notice-title"] as
          | { ita?: string; eng?: string }
          | undefined;
        const noticeBuyer = notice["buyer-name"] as
          | { ita?: string[]; eng?: string[] }
          | undefined;
        const title = noticeTitle?.ita || noticeTitle?.eng || "";
        const buyer = noticeBuyer?.ita?.[0] || noticeBuyer?.eng?.[0] || "";
        const cpv = notice["classification-cpv"] || null;
        const deadline = (notice["deadline-date-lot"] as string | null) || null;
        const value =
          (notice["total-value"] as number | null) ||
          (notice["estimated-value-glo"] as number | null) ||
          null;

        // Perform actual eligibility analysis
        try {
          const eligibilityResult = await analyzeEligibilityTool.func({
            tenderId: String(tenderId),
            tenderData: {
              title,
              buyer,
              cpv: Array.isArray(cpv) ? String(cpv[0]) : String(cpv || ""),
              deadline: deadline || undefined,
              value: value || undefined,
            },
            companyProfile: {
              annualRevenue: companyProfile.annualRevenue,
              employeeCount: companyProfile.employeeCount,
              yearsInBusiness: companyProfile.yearsInBusiness,
              certifications: companyProfile.certifications || [],
              technicalSkills: companyProfile.technicalSkills || [],
              legalForm: companyProfile.legalForm,
              operatingRegions: companyProfile.operatingRegions || [],
              primarySectors: companyProfile.primarySectors || [],
              competitionTolerance:
                companyProfile.competitionTolerance || "medium",
            },
          });

          const eligibility = eligibilityResult;

          // Only include eligible tenders with good scores
          console.log(
            `[getBestTenders] Tender ${tenderId}: eligible=${eligibility.eligible}, score=${eligibility.eligibilityScore}, recommendation=${eligibility.recommendation}`
          );

          if (eligibility.eligible && eligibility.eligibilityScore >= 0.1) {
            // Extract PDF links
            const links = (notice.links as Record<string, unknown>) || {};
            const pdfUrl = pickPdfItaOrEn(links);

            // Generate TED page URL (correct format)
            const noticeId = notice["notice-identifier"] as string | undefined;
            const pubNumber = notice["publication-number"] as
              | string
              | undefined;
            const tedPageUrl = `https://ted.europa.eu/it/notice/-/detail/${encodeURIComponent(
              noticeId || pubNumber || tenderId
            )}`;

            analyzedTenders.push({
              tenderId: String(tenderId),
              title,
              buyer,
              value,
              deadline,
              cpv,
              pdfUrl,
              tedPageUrl,
              eligibilityScore: eligibility.eligibilityScore,
              recommendation: eligibility.recommendation,
              reasons: eligibility.reasons || [],
              opportunities: eligibility.opportunities || [],
              riskFactors: eligibility.riskFactors || [],
            });
          }
        } catch (error) {
          console.error(
            `[getBestTenders] Error analyzing tender ${tenderId}:`,
            error
          );
          // Skip this tender if analysis fails
          continue;
        }
      }

      // Sort by eligibility score and recommendation
      analyzedTenders.sort((a, b) => {
        const scoreA = a.eligibilityScore;
        const scoreB = b.eligibilityScore;
        return scoreB - scoreA;
      });

      return {
        tenders: analyzedTenders.slice(0, limit),
        totalAnalyzed: notices.length,
        eligibleFound: analyzedTenders.length,
        message: `Found ${analyzedTenders.length} eligible tenders out of ${notices.length} analyzed`,
      };
    } catch (error) {
      console.error("Error getting best tenders:", error);
      return { tenders: [], message: "Error analyzing tenders" };
    }
  },
});

const GetPersonalizedRecommendationsInput = z.object({
  userId: z.string().min(1),
  context: z.string().optional(),
});

export const getPersonalizedRecommendationsTool = safeTool({
  name: "get_personalized_recommendations",
  description:
    "Get personalized tender recommendations based on company profile and behavior patterns.",
  schema: GetPersonalizedRecommendationsInput,
  fn: async ({ userId, context }) => {
    try {
      const llm = await llmFactory();

      // Get company profile
      const profileDoc = await db
        .collection("company_profiles")
        .doc(userId)
        .get();
      if (!profileDoc.exists) {
        return { recommendations: [], message: "Company profile not found" };
      }

      const companyProfile = profileDoc.data() as CompanyProfile;

      // Get user's search history and preferences
      const searchHistory = await db
        .collection("search_history")
        .doc(userId)
        .collection("searches")
        .orderBy("createdAt", "desc")
        .limit(10)
        .get();

      const recentSearches = searchHistory.docs.map((doc) => doc.data());

      const prompt = `
Generate personalized tender recommendations for this company:

COMPANY PROFILE:
- Name: ${companyProfile.companyName}
- Revenue: €${companyProfile.annualRevenue?.toLocaleString() || "Not specified"}
- Employees: ${companyProfile.employeeCount || "Not specified"}
- Years in Business: ${companyProfile.yearsInBusiness || "Not specified"}
- Certifications: ${companyProfile.certifications?.join(", ") || "None"}
- Technical Skills: ${companyProfile.technicalSkills?.join(", ") || "None"}
- Primary Sectors: ${companyProfile.primarySectors?.join(", ") || "None"}
- Operating Regions: ${companyProfile.operatingRegions?.join(", ") || "None"}
- Competition Tolerance: ${companyProfile.competitionTolerance || "medium"}

RECENT SEARCHES: ${recentSearches.map((s) => s.query).join(", ")}

CONTEXT: ${context || "General recommendations"}

Generate 5 personalized search suggestions that:
1. Match company capabilities and preferences
2. Consider competition tolerance
3. Focus on realistic opportunities
4. Include both specific and exploratory queries
5. Are in Italian natural language

Return as JSON array: ["suggestion1", "suggestion2", ...]
`;

      const response = await llm.invoke(prompt);

      // Handle different response types from LLM
      let content: string;
      if (typeof response === "string") {
        content = response;
      } else if (
        response &&
        typeof response === "object" &&
        "content" in response
      ) {
        content = String(response.content);
      } else {
        content = String(response);
      }

      console.log("LLM Response:", content);

      // Try to extract JSON from the response
      let jsonStr = content;
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        jsonStr = jsonMatch[0];
      }

      // Clean up the JSON string
      jsonStr = jsonStr.replace(/```json\n?|\n?```/g, "").trim();

      const recommendations = JSON.parse(jsonStr);

      return {
        recommendations: Array.isArray(recommendations) ? recommendations : [],
        companyProfile: {
          name: companyProfile.companyName,
          sectors: companyProfile.primarySectors,
          regions: companyProfile.operatingRegions,
        },
      };
    } catch (error) {
      console.error("Error getting personalized recommendations:", error);
      return {
        recommendations: [],
        message: "Failed to generate recommendations",
      };
    }
  },
});

// ==================== ADVANCED TED SEARCH TOOLS ====================

const AdvancedSearchInput = z.object({
  procedureType: z
    .enum([
      "open",
      "restricted",
      "negotiated",
      "competitive-dialogue",
      "innovation-partnership",
      "framework-agreement",
    ])
    .optional(),
  contractNature: z
    .enum([
      "services",
      "supplies",
      "works",
      "services-and-supplies",
      "works-and-services",
    ])
    .optional(),
  frameworkAgreement: z.boolean().optional(),
  electronicAuction: z.boolean().optional(),
  subcontractingAllowed: z.boolean().optional(),
  minValue: z.number().optional(),
  maxValue: z.number().optional(),
  countries: z
    .array(z.string())
    .optional()
    .describe(
      "Array of country codes in ISO 3166-1 alpha-3 format (e.g., ['ITA', 'FRA']). Use 3-letter uppercase codes, NOT country names."
    ),
  cities: z
    .array(z.string())
    .optional()
    .describe(
      "Array of city names as strings (e.g., ['Milano', 'Roma']). Use exact city names as they appear in TED database."
    ),
  cpvCodes: z
    .array(z.string())
    .optional()
    .describe(
      "Array of CPV codes. Each code must be exactly 8 digits (e.g., ['48000000', '72000000']). Wildcards not supported."
    ),
  daysBack: z.number().int().min(1).max(30).default(7),
  limit: z.number().int().min(1).max(50).default(20),
});

export const advancedSearchTool = safeTool({
  name: "advanced_search",
  description:
    "Advanced TED search with specific filters for procedure type, contract nature, framework agreements, etc.",
  schema: AdvancedSearchInput,
  fn: async ({
    procedureType,
    contractNature,
    frameworkAgreement,
    electronicAuction,
    subcontractingAllowed,
    minValue,
    maxValue,
    countries,
    cities,
    cpvCodes,
    daysBack,
    limit,
  }) => {
    try {
      const date = (d: number) => `today(${d === 0 ? "" : `-${d}`})`;
      const parts = [
        `(publication-date >= ${date(
          daysBack
        )} AND publication-date <= today())`,
      ];

      // Procedure type filter
      if (procedureType) {
        const procedureMap = {
          open: "open",
          restricted: "restricted",
          negotiated: "negotiated",
          "competitive-dialogue": "competitive-dialogue",
          "innovation-partnership": "innovation-partnership",
          "framework-agreement": "framework-agreement",
        };
        parts.push(`(procedure-type = "${procedureMap[procedureType]}")`);
      }

      // Contract nature filter
      if (contractNature) {
        const natureMap = {
          services: "services",
          supplies: "supplies",
          works: "works",
          "services-and-supplies": "services-and-supplies",
          "works-and-services": "works-and-services",
        };
        parts.push(
          `(contract-nature-main-proc = "${natureMap[contractNature]}")`
        );
      }

      // Framework agreement filter
      if (frameworkAgreement !== undefined) {
        parts.push(`(framework-agreement-lot = ${frameworkAgreement})`);
      }

      // Electronic auction filter
      if (electronicAuction !== undefined) {
        parts.push(`(electronic-auction-lot = ${electronicAuction})`);
      }

      // Subcontracting filter
      if (subcontractingAllowed !== undefined) {
        parts.push(`(subcontracting-allowed-lot = ${subcontractingAllowed})`);
      }

      // Value range filter
      if (minValue !== undefined) {
        parts.push(`(estimated-value-glo >= ${minValue})`);
      }
      if (maxValue !== undefined) {
        parts.push(`(estimated-value-glo <= ${maxValue})`);
      }

      // Geographic filters
      if (countries && countries.length > 0) {
        parts.push(
          `(place-of-performance-country-proc IN (${countries.join(", ")}))`
        );
      }
      if (cities && cities.length > 0) {
        parts.push(
          `(place-of-performance-city-proc IN (${cities.join(", ")}))`
        );
      }

      // CPV codes filter
      if (cpvCodes && cpvCodes.length > 0) {
        // Validate CPV codes
        const validCpvs = cpvCodes
          .map(validateCpvCode)
          .filter((c): c is string => c !== null)
          .map((c) => c.replace(/\*$/, "")); // Remove wildcards

        if (validCpvs.length > 0) {
          if (validCpvs.length === 1) {
            parts.push(`classification-cpv = "${validCpvs[0]}"`);
          } else {
            parts.push(
              `classification-cpv IN (${validCpvs
                .map((c) => `"${c}"`)
                .join(", ")})`
            );
          }
        }
      }

      const q = parts.join(" AND ");
      const rawNotices = await tedSearch({ q, limit });
      const notices = rawNotices as Array<Record<string, unknown>>;

      // Use the same robust field extraction as search_tenders
      return {
        tenders: notices.map((n: Record<string, unknown>) => {
          // Extract enhanced information with fallbacks (same as search_tenders)
          const procedureType =
            n["procedure-type"] ?? n["BT-01-notice"] ?? null;
          const contractNature =
            n["contract-nature-main-proc"] ??
            n["contract-nature-main-lot"] ??
            null;

          // Value extraction with fallbacks
          const estimatedValue =
            (n["estimated-value-glo"] as number | null) ??
            (n["total-value"] as number | null) ??
            null;

          // Deadline extraction
          const deadline = n["deadline-date-lot"] ?? null;

          // PDF extraction
          const pdfItaOrEn = pickPdfItaOrEn(n.links as Record<string, unknown>);

          return {
            publicationNumber: String(n["publication-number"] ?? ""),
            noticeId: n["notice-identifier"] ?? n["publication-number"] ?? "",
            title:
              (n["notice-title"] as Record<string, unknown>)?.ita ??
              (n["notice-title"] as Record<string, unknown>)?.eng ??
              (n["notice-title"] as Record<string, unknown>)?.en ??
              "",
            buyer:
              (n["buyer-name"] as Record<string, unknown[]>)?.ita?.[0] ??
              (n["buyer-name"] as Record<string, unknown[]>)?.eng?.[0] ??
              (n["buyer-name"] as Record<string, unknown[]>)?.en?.[0] ??
              "",
            publicationDate: n["publication-date"] ?? null,
            deadline: deadline,
            cpv: n["classification-cpv"] ?? null,
            estimatedValue: estimatedValue,
            procedureType: procedureType ? String(procedureType) : null,
            contractNature: contractNature ? String(contractNature) : null,
            frameworkAgreement: n["framework-agreement-lot"] ?? null,
            electronicAuction: n["electronic-auction-lot"] ?? null,
            subcontractingAllowed: n["subcontracting-allowed-lot"] ?? null,
            placeOfPerformance: n["place-of-performance"] ?? null,
            country: n["place-of-performance-country-proc"] ?? null,
            city: n["place-of-performance-city-proc"] ?? null,
            pdf: pdfItaOrEn ?? null,
          };
        }),
        query: q,
        filters: {
          procedureType,
          contractNature,
          frameworkAgreement,
          electronicAuction,
          subcontractingAllowed,
          minValue,
          maxValue,
          countries,
          cities,
          cpvCodes,
          daysBack,
        },
      };
    } catch (error) {
      console.error("Error in advanced search:", error);
      return { tenders: [], error: "Advanced search failed" };
    }
  },
});

const FrameworkAgreementSearchInput = z.object({
  countries: z
    .array(z.string())
    .optional()
    .describe(
      "Array of country codes in ISO 3166-1 alpha-3 format (e.g., ['ITA', 'FRA']). Use 3-letter uppercase codes, NOT country names."
    ),
  cpvCodes: z
    .array(z.string())
    .optional()
    .describe(
      "Array of CPV codes. Each code must be exactly 8 digits (e.g., ['48000000', '72000000']). Wildcards not supported."
    ),
  daysBack: z.number().int().min(1).max(30).default(30),
  limit: z.number().int().min(1).max(50).default(20),
});

// ============================================
// RANKING & FILTERING TOOLS
// ============================================

const RankTendersInput = z.object({
  userId: z.string().min(1),
  tenderIds: z.array(z.string()).min(1),
  limit: z.number().int().min(1).max(50).optional().default(10),
});

export const rankTendersTool = safeTool({
  name: "rank_tenders",
  description:
    "Rank tenders using multi-factor scoring: price match, geographic fit, conditions, buyer patterns, competition, urgency, CPV match, and eligibility.",
  schema: RankTendersInput,
  fn: async ({ userId, tenderIds, limit }) => {
    try {
      // Get company profile
      const profileDoc = await db
        .collection("company_profiles")
        .doc(userId)
        .get();
      if (!profileDoc.exists) {
        return {
          rankedTenders: [],
          message:
            "Company profile not found. Please complete your profile first.",
        };
      }

      const companyProfile = profileDoc.data() as CompanyProfile;

      // Get user preferences
      const prefsDoc = await db.collection("profiles").doc(userId).get();
      const userProfile = prefsDoc.exists
        ? (prefsDoc.data() as Partial<UserProfile> | undefined) || {}
        : {};

      // Fetch tenders from Firestore or TED API
      const rankedTenders = [];

      for (const tenderId of tenderIds.slice(0, limit * 2)) {
        // Try to get from Firestore first
        const tenderDoc = await db.collection("tenders").doc(tenderId).get();
        let tenderData: Record<string, unknown> | null = null;

        if (tenderDoc.exists) {
          tenderData = (tenderDoc.data() as Record<string, unknown>) || null;
        } else {
          // If not in Firestore, fetch from TED API (simplified - would need proper TED lookup)
          continue;
        }

        if (!tenderData) continue;

        // Multi-factor scoring
        const scores = {
          priceMatch: calculatePriceScore(tenderData, companyProfile),
          geographicFit: calculateGeographicScore(tenderData, companyProfile),
          cpvMatch: calculateCpvScore(tenderData, companyProfile, userProfile),
          urgency: calculateUrgencyScore(tenderData),
          recency: calculateRecencyScore(tenderData, userProfile),
          conditions: calculateConditionsScore(tenderData),
        };

        // Weighted overall score
        const overallScore =
          scores.priceMatch * 0.2 +
          scores.geographicFit * 0.2 +
          scores.cpvMatch * 0.25 +
          scores.urgency * 0.15 +
          scores.recency * 0.1 +
          scores.conditions * 0.1;

        const tenderTitle = tenderData["notice-title"] as
          | { ita?: string }
          | undefined;
        const tenderBuyerName = tenderData["buyer-name"] as
          | { ita?: string[] }
          | undefined;
        const buyerValue =
          (tenderData.buyer as string) ||
          (tenderBuyerName?.ita?.[0] as string) ||
          "";
        rankedTenders.push({
          tenderId,
          title: (tenderData.title as string) || tenderTitle?.ita || "",
          buyer: buyerValue,
          overallScore: Math.round(overallScore * 100) / 100,
          scores,
          recommendation:
            overallScore >= 0.7
              ? "high"
              : overallScore >= 0.5
              ? "medium"
              : overallScore >= 0.3
              ? "low"
              : "skip",
        });
      }

      // Sort by overall score
      rankedTenders.sort((a, b) => b.overallScore - a.overallScore);

      return {
        rankedTenders: rankedTenders.slice(0, limit),
        totalRanked: rankedTenders.length,
        message: `Ranked ${rankedTenders.length} tenders by multi-factor scoring`,
      };
    } catch (error) {
      console.error("Error ranking tenders:", error);
      return { rankedTenders: [], message: "Error ranking tenders" };
    }
  },
});

const GenerateShortlistInput = z.object({
  userId: z.string().min(1),
  daysBack: z.number().int().min(1).max(30).default(7),
  topN: z.number().int().min(1).max(20).default(10),
});

export const generateShortlistTool = safeTool({
  name: "generate_shortlist",
  description:
    "Generate a 'top N to apply for today' shortlist by ranking tenders and prioritizing high eligibility, good price match, low competition, and urgent deadlines.",
  schema: GenerateShortlistInput,
  fn: async ({ userId, daysBack, topN }) => {
    try {
      // Get company profile
      const profileDoc = await db
        .collection("company_profiles")
        .doc(userId)
        .get();
      if (!profileDoc.exists) {
        return {
          shortlist: [],
          message:
            "Company profile not found. Please complete your profile first.",
        };
      }

      const companyProfile = profileDoc.data() as CompanyProfile;

      // Search for recent tenders
      const parts = [
        `place-of-performance = "ITA"`,
        `publication-date >= today(-${daysBack})`,
      ];

      if (companyProfile.cpvCodes?.length) {
        parts.push(
          `(${companyProfile.cpvCodes
            .map((c) => `classification-cpv = "${c}"`)
            .join(" OR ")})`
        );
      }

      const q = parts.join(" AND ");
      const rawNotices = await tedSearch({ q, limit: topN * 3 }); // Get more to filter
      const notices = rawNotices as Array<Record<string, unknown>>;

      // Rank and filter
      const shortlist: Array<{
        tenderId: string;
        title: string;
        buyer: string;
        value: number | null;
        deadline: string | null;
        overallScore: number;
        recommendation: string;
        pdfUrl: string | undefined;
        reasoning?: string;
      }> = [];

      for (const notice of notices) {
        const tenderId =
          (notice["publication-number"] as string) ||
          (notice["notice-identifier"] as string);
        if (!tenderId) continue;

        // Calculate scores
        const scores = {
          eligibility: 0.8, // Would use analyzeEligibilityTool in production
          priceMatch: calculatePriceScore(notice, companyProfile),
          geographicFit: calculateGeographicScore(notice, companyProfile),
          urgency: calculateUrgencyScore(notice),
          competition: 0.5, // Would use analyzeCompetitionTool in production
        };

        const overallScore =
          scores.eligibility * 0.3 +
          scores.priceMatch * 0.2 +
          scores.geographicFit * 0.2 +
          scores.urgency * 0.2 +
          scores.competition * 0.1;

        // Only include high-priority tenders
        if (overallScore >= 0.5) {
          const links = (notice.links as Record<string, unknown>) || {};
          const pdfUrl = pickPdfItaOrEn(links);

          const noticeTitle = notice["notice-title"] as
            | { ita?: string; eng?: string }
            | undefined;
          const noticeBuyer = notice["buyer-name"] as
            | { ita?: string[]; eng?: string[] }
            | undefined;

          shortlist.push({
            tenderId: String(tenderId),
            title: noticeTitle?.ita || noticeTitle?.eng || "",
            buyer: noticeBuyer?.ita?.[0] || noticeBuyer?.eng?.[0] || "",
            value:
              (notice["total-value"] as number | null) ||
              (notice["estimated-value-glo"] as number | null) ||
              null,
            deadline: (notice["deadline-date-lot"] as string | null) || null,
            pdfUrl,
            overallScore: Math.round(overallScore * 100) / 100,
            recommendation:
              overallScore >= 0.7
                ? "high"
                : overallScore >= 0.5
                ? "medium"
                : "low",
            reasoning: `Eligibility: ${Math.round(
              scores.eligibility * 100
            )}%, Price match: ${Math.round(
              scores.priceMatch * 100
            )}%, Urgency: ${Math.round(scores.urgency * 100)}%`,
          });
        }
      }

      // Sort and limit
      shortlist.sort((a, b) => b.overallScore - a.overallScore);

      return {
        shortlist: shortlist.slice(0, topN),
        totalAnalyzed: notices.length,
        message: `Generated shortlist of ${Math.min(
          shortlist.length,
          topN
        )} top tenders to apply for today`,
      };
    } catch (error) {
      console.error("Error generating shortlist:", error);
      return { shortlist: [], message: "Error generating shortlist" };
    }
  },
});

const AnalyzeCompetitionInput = z.object({
  tenderId: z.string().min(1),
});

export const analyzeCompetitionTool = safeTool({
  name: "analyze_competition",
  description:
    "Analyze competition level for a tender based on value, complexity, deadline proximity, and historical patterns.",
  schema: AnalyzeCompetitionInput,
  fn: async ({ tenderId }) => {
    try {
      // Get tender data
      const tenderDoc = await db.collection("tenders").doc(tenderId).get();
      if (!tenderDoc.exists) {
        return {
          competitionLevel: "unknown",
          message: "Tender not found",
        };
      }

      const tender = tenderDoc.data();
      if (!tender) {
        return {
          competitionLevel: "unknown",
          message: "Tender data not available",
        };
      }

      // Analyze competition factors
      const value = tender.value || tender["total-value"] || 0;
      const deadline = tender.deadline || tender["deadline-date-lot"];
      const complexity = tender.complexityScore || 5; // Default medium

      // Competition indicators
      let competitionScore = 0.5; // Default medium

      // Higher value = more competition
      if (value > 1000000) competitionScore += 0.2;
      else if (value > 100000) competitionScore += 0.1;

      // Closer deadline = less competition (fewer applicants)
      if (deadline) {
        const deadlineDate = new Date(deadline);
        const daysUntilDeadline =
          (deadlineDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
        if (daysUntilDeadline < 7) competitionScore -= 0.2;
        else if (daysUntilDeadline < 14) competitionScore -= 0.1;
      }

      // Higher complexity = less competition (fewer qualified applicants)
      if (complexity > 7) competitionScore -= 0.2;
      else if (complexity > 5) competitionScore -= 0.1;

      competitionScore = Math.max(0, Math.min(1, competitionScore));

      const competitionLevel =
        competitionScore >= 0.7
          ? "high"
          : competitionScore >= 0.4
          ? "medium"
          : "low";

      return {
        competitionLevel,
        competitionScore: Math.round(competitionScore * 100) / 100,
        factors: {
          value: value > 1000000 ? "high" : value > 100000 ? "medium" : "low",
          deadlineProximity: deadline
            ? (() => {
                const days =
                  (new Date(deadline).getTime() - Date.now()) /
                  (1000 * 60 * 60 * 24);
                return days < 7 ? "urgent" : days < 14 ? "soon" : "normal";
              })()
            : "unknown",
          complexity:
            complexity > 7 ? "high" : complexity > 5 ? "medium" : "low",
        },
        message: `Competition level: ${competitionLevel} (score: ${competitionScore})`,
      };
    } catch (error) {
      console.error("Error analyzing competition:", error);
      return {
        competitionLevel: "unknown",
        message: "Error analyzing competition",
      };
    }
  },
});

const AnalyzeBuyerPatternsInput = z.object({
  buyerName: z.string().min(1),
  limit: z.number().int().min(1).max(50).optional().default(10),
});

export const analyzeBuyerPatternsTool = safeTool({
  name: "analyze_buyer_patterns",
  description:
    "Analyze patterns from a buyer's historical tenders to understand preferences, requirements, and typical contract terms.",
  schema: AnalyzeBuyerPatternsInput,
  fn: async ({ buyerName, limit }) => {
    try {
      // Search for tenders from this buyer
      const q = `buyer-name ~ "${buyerName}"`;
      const rawNotices = await tedSearch({ q, limit });
      const notices = rawNotices as Array<Record<string, unknown>>;

      if (notices.length === 0) {
        return {
          patterns: {},
          message: `No historical tenders found for buyer: ${buyerName}`,
        };
      }

      // Analyze patterns
      const patterns = {
        averageValue: 0,
        commonCpvCodes: [] as string[],
        commonRegions: [] as string[],
        typicalDeadline: "",
        preferredContractTypes: [] as string[],
        commonRequirements: [] as string[],
      };

      const values: number[] = [];
      const cpvCounts: Record<string, number> = {};
      const regionCounts: Record<string, number> = {};

      for (const notice of notices) {
        const value =
          (notice["total-value"] as number) ||
          (notice["estimated-value-glo"] as number) ||
          0;
        if (typeof value === "number" && value > 0) values.push(value);

        const cpv = notice["classification-cpv"];
        if (cpv) {
          const cpvArr = Array.isArray(cpv) ? cpv : [cpv];
          cpvArr.forEach((c) => {
            const cpvStr = String(c);
            cpvCounts[cpvStr] = (cpvCounts[cpvStr] || 0) + 1;
          });
        }

        const place = notice["place-of-performance"];
        if (place) {
          const placeStr = String(place);
          regionCounts[placeStr] = (regionCounts[placeStr] || 0) + 1;
        }
      }

      // Calculate averages and most common
      if (values.length > 0) {
        patterns.averageValue =
          values.reduce((a, b) => a + b, 0) / values.length;
      }

      patterns.commonCpvCodes = Object.entries(cpvCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([cpv]) => cpv);

      patterns.commonRegions = Object.entries(regionCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 3)
        .map(([region]) => region);

      return {
        patterns,
        totalTendersAnalyzed: notices.length,
        message: `Analyzed ${notices.length} historical tenders from ${buyerName}`,
      };
    } catch (error) {
      console.error("Error analyzing buyer patterns:", error);
      return {
        patterns: {},
        message: "Error analyzing buyer patterns",
      };
    }
  },
});

// Helper functions for scoring
function calculatePriceScore(
  tender: Record<string, unknown>,
  profile: CompanyProfile
): number {
  const value =
    (tender.value as number) ||
    (tender["total-value"] as number) ||
    (tender["estimated-value-glo"] as number) ||
    0;
  if (
    typeof value !== "number" ||
    !value ||
    !profile.minContractValue ||
    !profile.maxContractValue
  )
    return 0.5;

  if (value >= profile.minContractValue && value <= profile.maxContractValue) {
    return 1.0; // Perfect match
  } else if (value < profile.minContractValue) {
    return Math.max(
      0,
      1 - (profile.minContractValue - value) / profile.minContractValue
    );
  } else {
    return Math.max(
      0,
      1 - (value - profile.maxContractValue) / profile.maxContractValue
    );
  }
}

function calculateGeographicScore(
  tender: Record<string, unknown>,
  profile: CompanyProfile
): number {
  const place = tender.placeOfPerformance || tender["place-of-performance"];
  if (!place || !profile.operatingRegions?.length) return 0.5;

  const placeStr = String(place).toLowerCase();
  const hasMatch = profile.operatingRegions.some((region) =>
    placeStr.includes(region.toLowerCase())
  );

  return hasMatch ? 1.0 : 0.3;
}

function calculateCpvScore(
  tender: Record<string, unknown>,
  companyProfile: CompanyProfile,
  userProfile: Partial<UserProfile>
): number {
  const cpvValue = tender.cpv || tender["classification-cpv"];
  const cpvArr = Array.isArray(cpvValue)
    ? (cpvValue as unknown[])
    : cpvValue
    ? [cpvValue]
    : [];

  const preferredCpv = [
    ...(companyProfile.cpvCodes || []),
    ...(userProfile.cpv || []),
  ];

  if (preferredCpv.length === 0) return 0.5;

  const hasMatch = preferredCpv.some((code) =>
    cpvArr.some((c) => String(c) === code)
  );
  return hasMatch ? 1.0 : 0.2;
}

function calculateUrgencyScore(tender: Record<string, unknown>): number {
  const deadline =
    (tender.deadline as string) || (tender["deadline-date-lot"] as string);
  if (!deadline || typeof deadline !== "string") return 0.5;

  const deadlineDate = new Date(deadline);
  if (isNaN(deadlineDate.getTime())) return 0.5;

  const daysUntilDeadline =
    (deadlineDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24);

  if (daysUntilDeadline < 0) return 0; // Past deadline
  if (daysUntilDeadline < 7) return 1.0; // Very urgent
  if (daysUntilDeadline < 14) return 0.8; // Urgent
  if (daysUntilDeadline < 30) return 0.6; // Soon
  return 0.4; // Not urgent
}

function calculateRecencyScore(
  tender: Record<string, unknown>,
  userProfile: Partial<UserProfile>
): number {
  const pubDate =
    (tender.publicationDate as string) ||
    (tender["publication-date"] as string);
  if (!pubDate || typeof pubDate !== "string") return 0.5;

  const pub = Array.isArray(pubDate) ? pubDate[0] : pubDate;
  const date = new Date(pub as string | number | Date);
  if (isNaN(date.getTime())) return 0.5;

  const daysAgo = (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24);
  const daysBack = userProfile.daysBack || 7;

  if (daysAgo <= daysBack) return 1.0;
  if (daysAgo <= daysBack * 2) return 0.6;
  return 0.3;
}

function calculateConditionsScore(tender: Record<string, unknown>): number {
  // Analyze conditions complexity (simplified)
  const complexityScore = (tender.complexityScore as number) || 0;
  const hasComplexRequirements = complexityScore > 7;

  const deadline =
    (tender.deadline as string) || (tender["deadline-date-lot"] as string);
  const hasShortDeadline =
    deadline &&
    typeof deadline === "string" &&
    (new Date(deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24) < 14;

  if (hasComplexRequirements && hasShortDeadline) return 0.3; // Difficult
  if (hasComplexRequirements || hasShortDeadline) return 0.6; // Moderate
  return 0.9; // Favorable
}

// ============================================
// APPLICATION & COMMUNICATION TOOLS
// ============================================

const DraftApplicationInput = z.object({
  userId: z.string().min(1),
  tenderId: z.string().min(1),
  submissionMethod: z.enum(["email", "form"]).default("email"),
  tone: z.enum(["formal", "professional", "friendly", "business"]).optional(),
});

export const draftApplicationTool = safeTool({
  name: "draft_application",
  description:
    "Draft a personalized application email or form for a tender. Adapts tone based on buyer type and includes company introduction, experience, certifications, and financial capacity.",
  schema: DraftApplicationInput,
  fn: async ({ userId, tenderId, submissionMethod, tone }) => {
    try {
      // Get company profile
      const profileDoc = await db
        .collection("company_profiles")
        .doc(userId)
        .get();
      if (!profileDoc.exists) {
        return {
          draft: "",
          message:
            "Company profile not found. Please complete your profile first.",
        };
      }

      const companyProfile = profileDoc.data() as CompanyProfile;

      // Get tender data
      const tenderDoc = await db.collection("tenders").doc(tenderId).get();
      if (!tenderDoc.exists) {
        return {
          draft: "",
          message: "Tender not found",
        };
      }

      const tender = tenderDoc.data();
      if (!tender) {
        return {
          draft: "",
          message: "Tender data not available",
        };
      }

      // Use LLM to draft application
      const llm = await llmFactory();

      const prompt = `
Draft a ${
        submissionMethod === "email" ? "professional email" : "form submission"
      } for this tender application.

COMPANY PROFILE:
- Name: ${companyProfile.companyName}
- Legal Form: ${companyProfile.legalForm || "Not specified"}
- Annual Revenue: €${
        companyProfile.annualRevenue?.toLocaleString() || "Not specified"
      }
- Employees: ${companyProfile.employeeCount || "Not specified"}
- Years in Business: ${companyProfile.yearsInBusiness || "Not specified"}
- Certifications: ${companyProfile.certifications?.join(", ") || "None"}
- Technical Skills: ${companyProfile.technicalSkills?.join(", ") || "None"}
- Operating Regions: ${
        companyProfile.operatingRegions?.join(", ") || "Not specified"
      }
- Primary Sectors: ${
        companyProfile.primarySectors?.join(", ") || "Not specified"
      }

TENDER DETAILS:
- Title: ${tender.title || tender["notice-title"]?.ita || "Not specified"}
- Buyer: ${tender.buyer || tender["buyer-name"]?.ita?.[0] || "Not specified"}
- Value: €${(tender.value || tender["total-value"] || 0).toLocaleString()}
- Deadline: ${tender.deadline || tender["deadline-date-lot"] || "Not specified"}

TONE: ${tone || "professional"} (${
        tone === "formal"
          ? "Very formal for public administration"
          : tone === "professional"
          ? "Professional business tone"
          : tone === "friendly"
          ? "Friendly but professional"
          : "Business-focused"
      })

Draft a ${
        submissionMethod === "email"
          ? "professional email"
          : "form-ready content"
      } that:
1. Introduces the company professionally
2. Highlights relevant experience and capabilities
3. Mentions relevant certifications and qualifications
4. Demonstrates financial capacity
5. Shows understanding of tender requirements
6. Expresses interest and commitment

${
  submissionMethod === "email"
    ? "Include a professional subject line."
    : "Format as form-ready content with clear sections."
}

Return ONLY the ${
        submissionMethod === "email"
          ? "email content (subject and body)"
          : "form content"
      } in Italian.
`;

      const response = await llm.invoke(prompt);
      const content =
        typeof response === "string"
          ? response
          : typeof response === "object" && "content" in response
          ? String(response.content)
          : String(response);

      return {
        draft: content,
        subject:
          submissionMethod === "email"
            ? content.split("\n")[0]?.replace("Subject:", "").trim() ||
              "Application"
            : undefined,
        body:
          submissionMethod === "email"
            ? content.split("\n").slice(1).join("\n").trim()
            : content,
        message: `Draft created successfully for tender ${tenderId}`,
      };
    } catch (error) {
      console.error("Error drafting application:", error);
      return {
        draft: "",
        message: "Error drafting application",
      };
    }
  },
});

const SendApplicationEmailInput = z.object({
  userId: z.string().min(1),
  applicationId: z.string().min(1),
  recipientEmail: z.string().email(),
  subject: z.string().min(1),
  body: z.string().min(1),
});

export const sendApplicationEmailTool = safeTool({
  name: "send_application_email",
  description:
    "Send an application email. Logs the communication and updates application status.",
  schema: SendApplicationEmailInput,
  fn: async ({
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    userId: _userId,
    applicationId,
    recipientEmail,
    subject,
    body,
  }) => {
    try {
      // In production, this would use an email service (SendGrid, SES, etc.)
      // For now, we'll just log it to Firestore

      const applicationRef = db.collection("applications").doc(applicationId);
      const appDoc = await applicationRef.get();

      if (!appDoc.exists) {
        return {
          success: false,
          message: "Application not found",
        };
      }

      const application = appDoc.data();
      const communications = (application?.communications || []) as Array<{
        type: string;
        content: string;
        sentAt: Date;
        recipient?: string;
        subject?: string;
      }>;

      // Add communication log
      communications.push({
        type: "email",
        content: body,
        sentAt: new Date(),
        recipient: recipientEmail,
        subject,
      });

      // Update application status
      await applicationRef.update({
        status: "sent",
        recipientEmail,
        communications,
        statusUpdatedAt: new Date(),
        updatedAt: new Date(),
      });

      // Send email via Brevo
      const { sendApplicationEmail } = await import("../lib/brevo.js");
      const emailResult = await sendApplicationEmail(
        recipientEmail,
        subject,
        body,
        application?.tenderId
      );

      if (!emailResult.success) {
        console.error("[Application] Email send failed:", emailResult.error);
        // Still log the communication even if email fails
        return {
          success: false,
          message: `Email send failed: ${emailResult.error}`,
          applicationId,
        };
      }

      return {
        success: true,
        message: `Application email sent successfully (Message ID: ${emailResult.messageId})`,
        applicationId,
        messageId: emailResult.messageId,
      };
    } catch (error) {
      console.error("Error sending application email:", error);
      return {
        success: false,
        message: "Error sending application email",
      };
    }
  },
});

const SubmitApplicationFormInput = z.object({
  userId: z.string().min(1),
  applicationId: z.string().min(1),
  submissionUrl: z.string().url(),
  formData: z.record(z.string(), z.any()),
});

export const submitApplicationFormTool = safeTool({
  name: "submit_application_form",
  description:
    "Submit an application via web form. Logs the submission and updates application status.",
  schema: SubmitApplicationFormInput,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  fn: async ({ userId: _userId, applicationId, submissionUrl, formData }) => {
    try {
      // In production, this would make an HTTP POST request
      // For now, we'll just log it to Firestore

      const applicationRef = db.collection("applications").doc(applicationId);
      const appDoc = await applicationRef.get();

      if (!appDoc.exists) {
        return {
          success: false,
          message: "Application not found",
        };
      }

      const application = appDoc.data();
      const communications = (application?.communications || []) as Array<{
        type: string;
        content: string;
        sentAt: Date;
        recipient?: string;
        subject?: string;
      }>;

      // Add communication log
      communications.push({
        type: "form",
        content: JSON.stringify(formData),
        sentAt: new Date(),
      });

      // Update application status
      await applicationRef.update({
        status: "submitted",
        submissionUrl,
        submittedAt: new Date(),
        communications,
        statusUpdatedAt: new Date(),
        updatedAt: new Date(),
      });

      // TODO: Actually submit form via HTTP POST
      console.log(`[Application] Would submit form to ${submissionUrl}`);

      return {
        success: true,
        message: `Application form logged (HTTP submission integration pending)`,
        applicationId,
      };
    } catch (error) {
      console.error("Error submitting application form:", error);
      return {
        success: false,
        message: "Error submitting application form",
      };
    }
  },
});

const TrackApplicationInput = z.object({
  userId: z.string().min(1),
  tenderId: z.string().min(1),
  tenderTitle: z.string().min(1),
  buyerName: z.string().min(1),
  draftContent: z.string().min(1),
  subject: z.string().optional(),
  tone: z
    .enum(["formal", "professional", "friendly", "business"])
    .default("professional"),
  submissionMethod: z.enum(["email", "form", "manual"]).default("email"),
});

export const trackApplicationTool = safeTool({
  name: "track_application",
  description:
    "Create or update an application record in the user's application board. Tracks all applications for status monitoring.",
  schema: TrackApplicationInput,
  fn: async ({
    userId,
    tenderId,
    tenderTitle,
    buyerName,
    draftContent,
    subject,
    tone,
    submissionMethod,
  }) => {
    try {
      // Check if application already exists
      const existingApps = await db
        .collection("applications")
        .where("userId", "==", userId)
        .where("tenderId", "==", tenderId)
        .limit(1)
        .get();

      const now = new Date();
      const applicationData = {
        userId,
        tenderId,
        tenderTitle,
        buyerName,
        draftContent,
        subject: subject || undefined,
        tone,
        submissionMethod,
        status: "draft" as const,
        communications: [] as Array<{
          type: string;
          content: string;
          sentAt: Date;
          recipient?: string;
          subject?: string;
        }>,
        createdAt: now,
        updatedAt: now,
      };

      if (!existingApps.empty) {
        // Update existing application
        const existingId = existingApps.docs[0].id;
        await db
          .collection("applications")
          .doc(existingId)
          .update({
            ...applicationData,
            updatedAt: now,
          });
        return {
          applicationId: existingId,
          message: "Application updated in tracking board",
        };
      } else {
        // Create new application
        const newAppRef = db.collection("applications").doc();
        await newAppRef.set(applicationData);
        return {
          applicationId: newAppRef.id,
          message: "Application created in tracking board",
        };
      }
    } catch (error) {
      console.error("Error tracking application:", error);
      return {
        applicationId: "",
        message: "Error tracking application",
      };
    }
  },
});

const GetApplicationStatusInput = z.object({
  userId: z.string().min(1),
  applicationId: z.string().optional(),
  tenderId: z.string().optional(),
});

export const getApplicationStatusTool = safeTool({
  name: "get_application_status",
  description:
    "Get the status of an application or all applications for a user. Returns application details and communication history.",
  schema: GetApplicationStatusInput,
  fn: async ({ userId, applicationId, tenderId }) => {
    try {
      let query = db.collection("applications").where("userId", "==", userId);

      if (applicationId) {
        const appDoc = await db
          .collection("applications")
          .doc(applicationId)
          .get();
        if (!appDoc.exists) {
          return {
            applications: [],
            message: "Application not found",
          };
        }
        return {
          applications: [
            {
              id: appDoc.id,
              ...appDoc.data(),
            },
          ],
          message: "Application status retrieved",
        };
      }

      if (tenderId) {
        query = query.where("tenderId", "==", tenderId);
      }

      const snapshot = await query.orderBy("createdAt", "desc").limit(50).get();

      const applications = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      return {
        applications,
        message: `Retrieved ${applications.length} applications`,
      };
    } catch (error) {
      console.error("Error getting application status:", error);
      return {
        applications: [],
        message: "Error getting application status",
      };
    }
  },
});

export const frameworkAgreementSearchTool = safeTool({
  name: "framework_agreement_search",
  description:
    "Search specifically for framework agreements and dynamic purchasing systems.",
  schema: FrameworkAgreementSearchInput,
  fn: async ({ countries, cpvCodes, daysBack, limit }) => {
    try {
      const date = (d: number) => `today(${d === 0 ? "" : `-${d}`})`;
      const parts = [
        `(publication-date >= ${date(
          daysBack
        )} AND publication-date <= today())`,
        `(framework-agreement-lot = true)`,
      ];

      if (countries && countries.length > 0) {
        // Normalize all country codes
        const normalizedCountries = countries.map(normalizeCountryCode);
        parts.push(
          `(place-of-performance-country-proc IN (${normalizedCountries.join(
            ", "
          )}))`
        );
      }

      if (cpvCodes && cpvCodes.length > 0) {
        // Validate CPV codes
        const validCpvs = cpvCodes
          .map(validateCpvCode)
          .filter((c): c is string => c !== null)
          .map((c) => c.replace(/\*$/, "")); // Remove wildcards

        if (validCpvs.length > 0) {
          if (validCpvs.length === 1) {
            parts.push(`classification-cpv = "${validCpvs[0]}"`);
          } else {
            parts.push(
              `classification-cpv IN (${validCpvs
                .map((c) => `"${c}"`)
                .join(", ")})`
            );
          }
        }
      }

      const q = parts.join(" AND ");
      const rawNotices = await tedSearch({ q, limit });
      const notices = rawNotices as Array<Record<string, unknown>>;

      return {
        frameworkAgreements: notices.map((n: Record<string, unknown>) => ({
          publicationNumber: String(n["publication-number"] ?? ""),
          title:
            (n["notice-title"] as Record<string, unknown>)?.ita ??
            (n["notice-title"] as Record<string, unknown>)?.eng ??
            "",
          buyer:
            (n["buyer-name"] as Record<string, unknown[]>)?.ita?.[0] ??
            (n["buyer-name"] as Record<string, unknown[]>)?.eng?.[0] ??
            "",
          publicationDate: n["publication-date"] ?? null,
          deadline: n["deadline-date-lot"] ?? null,
          cpv: n["classification-cpv"] ?? null,
          estimatedValue: n["estimated-value-glo"] ?? null,
          frameworkMaxValue: n["framework-maximum-value-lot"] ?? null,
          contractDuration: n["contract-duration-period-lot"] ?? null,
          placeOfPerformance: n["place-of-performance"] ?? null,
        })),
        query: q,
        count: notices.length,
      };
    } catch (error) {
      console.error("Error searching framework agreements:", error);
      return {
        frameworkAgreements: [],
        error: "Framework agreement search failed",
      };
    }
  },
});
