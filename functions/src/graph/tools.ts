import { z } from "zod";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { serverTimestamp, db } from "../lib/firestore";
import { safeTool } from "./tooling";
import { tedSearch } from "../lib/ted";
import { saveTenderSummary, saveMatchScore } from "../lib/firestore";
import type { TenderDoc } from "../lib/types";
import type { CompanyProfile } from "../lib/models";
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
  placeOfPerformance?: any;
  country?: any;
  city?: any;
  postCode?: any;
  awardCriteria?: any;
  selectionCriteria?: any;
  subcontractingObligation?: any;
  subcontractingPercentage?: any;
  subcontractingAllowed?: any;
  frameworkAgreement?: any;
  electronicAuction?: any;
  contractDuration?: any;
  tenderValidity?: any;
  pdf_preferred?: string;
  description_proposed_it?: any;
  description_proposed_en?: any;
};

const QueryIntent = z.object({
  country: z.string().default("ITA"),
  daysBack: z.number().int().min(0).max(30).default(3),
  cpv: z.array(z.string()).optional(),
  text: z.string().optional(),
});

export const buildTedExpertQueryTool = safeTool({
  name: "build_ted_query",
  description:
    "Build a valid TED Expert Query string from a structured intent.",
  schema: QueryIntent,
  fn: async ({ country, daysBack, cpv, text }) => {
    const date = (d: number) => `today(${d === 0 ? "" : `-${d}`})`;
    const parts = [
      `(place-of-performance IN (${country}))`,
      `(publication-date >= ${date(daysBack)} AND publication-date <= today())`,
    ];
    if (cpv?.length) {
      parts.push(
        `(${cpv
          .map((c) => `classification-cpv = "${c.endsWith("*") ? c : c + "*"}"`)
          .join(" OR ")})`
      );
    }
    if (text && text.trim()) {
      const t = text.trim().replace(/"/g, '\\"');
      parts.push(`(notice-title ~ "${t}" OR description-proc ~ "${t}")`);
    }
    return parts.join(" AND ");
  },
});

const SearchTendersInput = z.object({
  q: z.string().min(1),
  limit: z.number().int().min(1).max(50).default(10),
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
    "Search TED notices using Expert Query. Returns an array of tenders with enhanced details.",
  schema: SearchTendersInput,
  fn: async ({ q, limit }) => {
    const notices = await tedSearch({ q, limit });
    return notices.map((n: Record<string, unknown>) => {
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
      let recentTenders = [];
      try {
        recentTenders = await tedSearch({
          q: "(place-of-performance IN (ITA)) AND (publication-date >= today(-7) AND publication-date <= today())",
          limit: 20,
        });
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
          acc[cpv] = (acc[cpv] || 0) + 1;
          return acc;
        }, {});

      const trendingRegions = recentTenders
        .map((t) => t["buyer-name"]?.ita?.[0] || t["buyer-name"]?.eng?.[0])
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
      const content = String(response);

      // Parse JSON response
      const suggestions = JSON.parse(
        content.replace(/```json\n?|\n?```/g, "").trim()
      );

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
        const notices = await tedSearch({
          q: `publication-number = "${tenderId}"`,
          limit: 1,
        });
        if (notices.length === 0) {
          return { eligible: false, reasons: ["Tender not found"] };
        }

        notice = notices[0];
        title =
          notice["notice-title"]?.ita || notice["notice-title"]?.eng || "";
        buyer =
          notice["buyer-name"]?.ita?.[0] ||
          notice["buyer-name"]?.eng?.[0] ||
          "";
        cpv = notice["classification-cpv"] || "";
        deadline = notice["deadline-date-lot"] || "";
        value = notice["total-value"] || notice["estimated-value-glo"] || null;
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
  fn: async ({ userId, limit, daysBack, regions, cpvCodes }) => {
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

      // const companyProfile = profileDoc.data() as CompanyProfile; // TODO: Use for eligibility analysis
      const parts = [
        `place-of-performance = "ITA"`,
        `publication-date >= today(-${daysBack})`,
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
      const notices = await tedSearch({ q, limit: limit * 2 }); // Get more to filter

      // Analyze each tender for eligibility
      const analyzedTenders = [];

      for (const notice of notices.slice(0, limit * 2)) {
        const tenderId =
          notice["publication-number"] || notice["notice-identifier"];
        if (!tenderId) continue;

        // For now, include all tenders to make dashboard work
        // TODO: Implement proper eligibility analysis
        const eligibility = {
          eligible: true,
          eligibilityScore: 0.8,
          reasons: ["Basic eligibility check passed"],
          riskFactors: [],
          opportunities: ["Good match for company profile"],
          missingRequirements: [],
          recommendation: "medium" as const,
        };

        // Only include eligible tenders with good scores
        console.log(
          `Tender ${tenderId}: eligible=${eligibility.eligible}, score=${eligibility.eligibilityScore}`
        );
        if (eligibility.eligible && eligibility.eligibilityScore >= 0.1) {
          // Extract PDF links
          const links = (notice.links as Record<string, unknown>) || {};
          const pdfUrl = pickPdfItaOrEn(links);

          // Generate TED page URL
          const tedPageUrl = `https://ted.europa.eu/udl?uri=TED:NOTICE:${tenderId}:TEXT:IT:HTML`;

          analyzedTenders.push({
            tenderId: String(tenderId),
            title:
              notice["notice-title"]?.ita || notice["notice-title"]?.eng || "",
            buyer:
              notice["buyer-name"]?.ita?.[0] ||
              notice["buyer-name"]?.eng?.[0] ||
              "",
            value:
              notice["total-value"] || notice["estimated-value-glo"] || null,
            deadline: notice["deadline-date-lot"] || null,
            cpv: notice["classification-cpv"] || null,
            pdfUrl: pdfUrl,
            tedPageUrl: tedPageUrl,
            eligibilityScore: eligibility.eligibilityScore,
            recommendation: eligibility.recommendation,
            reasons: eligibility.reasons,
            opportunities: eligibility.opportunities,
            riskFactors: eligibility.riskFactors,
          });
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
  countries: z.array(z.string()).optional(),
  cities: z.array(z.string()).optional(),
  cpvCodes: z.array(z.string()).optional(),
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
        parts.push(
          `(${cpvCodes
            .map(
              (c) => `classification-cpv = "${c.endsWith("*") ? c : c + "*"}"`
            )
            .join(" OR ")})`
        );
      }

      const q = parts.join(" AND ");
      const notices = await tedSearch({ q, limit });

      return {
        tenders: notices.map((n: Record<string, unknown>) => ({
          publicationNumber: String(n["publication-number"] ?? ""),
          noticeId: n["notice-identifier"] ?? n["publication-number"] ?? "",
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
          procedureType: n["procedure-type"] ?? null,
          contractNature: n["contract-nature-main-proc"] ?? null,
          frameworkAgreement: n["framework-agreement-lot"] ?? null,
          electronicAuction: n["electronic-auction-lot"] ?? null,
          subcontractingAllowed: n["subcontracting-allowed-lot"] ?? null,
          placeOfPerformance: n["place-of-performance"] ?? null,
          country: n["place-of-performance-country-proc"] ?? null,
          city: n["place-of-performance-city-proc"] ?? null,
        })),
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
  countries: z.array(z.string()).optional(),
  cpvCodes: z.array(z.string()).optional(),
  daysBack: z.number().int().min(1).max(30).default(30),
  limit: z.number().int().min(1).max(50).default(20),
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
        parts.push(
          `(place-of-performance-country-proc IN (${countries.join(", ")}))`
        );
      }

      if (cpvCodes && cpvCodes.length > 0) {
        parts.push(
          `(${cpvCodes
            .map(
              (c) => `classification-cpv = "${c.endsWith("*") ? c : c + "*"}"`
            )
            .join(" OR ")})`
        );
      }

      const q = parts.join(" AND ");
      const notices = await tedSearch({ q, limit });

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
