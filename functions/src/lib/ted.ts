/**
 * TED (Tenders Electronic Daily) API Integration
 *
 * Provides functions for searching and retrieving public tender notices from
 * the European Union's TED database. Supports expert query syntax and handles
 * various response formats and error conditions.
 */

import type { UserProfile } from "./models";

/**
 * Response structure from TED API search endpoint
 */
interface TedSearchResponse {
  notices?: unknown[];
  totalNoticeCount?: number;
  iterationNextToken?: string | null;
  timedOut?: boolean;
  errors?: unknown;
  parseError?: string;
  raw?: string;
}

/** TED API v3 search endpoint URL */
const TED_URL = "https://api.ted.europa.eu/v3/notices/search";

/** Default fields to request from TED API */
const DEFAULT_FIELDS = [
  "publication-number",
  "notice-identifier",
  "notice-title",
  "buyer-name",
  "publication-date",
  "deadline-date-lot",
  "deadline-receipt-tender-date-lot", // Additional deadline field
  "classification-cpv",
  "estimated-value-glo",
  "total-value",
  "links",
  // Enhanced fields for better tender information
  "procedure-type",
  "BT-01-notice", // Fallback for procedure type
  "contract-nature-main-proc",
  "contract-nature-main-lot", // Fallback for contract nature
  "framework-agreement-lot",
  "electronic-auction-lot",
  "subcontracting-allowed-lot",
  "place-of-performance",
  "place-of-performance-country-proc",
  "place-of-performance-city-proc",
  "place-of-performance-city-lot", // Additional city field
  "BT-127-notice", // Notice type
  "BT-05-notice", // Contract type
  "description-proc", // Procedure description (i18n)
  "description-glo", // Global description (i18n)
  "sme-part", // SME participation indicator
];

/**
 * Fetches JSON data from the TED API with proper error handling.
 *
 * Handles various response formats including HTML error pages and malformed JSON,
 * providing detailed error information for debugging.
 *
 * @param input - URL to fetch from
 * @param init - Fetch request options
 * @returns Parsed JSON response or error information
 * @throws Error if the HTTP request fails
 */
async function fetchJson(
  input: string | URL,
  init: RequestInit
): Promise<Record<string, unknown>> {
  const res = await fetch(input, {
    ...init,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });

  const text = await res.text();
  let json: Record<string, unknown> = {};

  try {
    json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch (e) {
    json = { parseError: String(e), raw: text };
  }

  if (!res.ok) {
    throw new Error(
      `TED API ${res.status} ${res.statusText}: ${
        json?.message || json?.error || text
      }`
    );
  }

  return json;
}

/**
 * Searches the TED API using Expert Query syntax.
 *
 * Performs a search against the TED v3 API with robust error handling and
 * logging. Returns an empty array if the API is unavailable or returns errors.
 *
 * @param params - Search parameters
 * @param params.q - Expert Query string (e.g., "place-of-performance IN (ITA)")
 * @param params.limit - Maximum number of results to return (default: 10)
 * @returns Array of tender notices, or empty array on error
 */
export async function tedSearch({
  q,
  limit = 10,
}: {
  q: string;
  limit?: number;
}): Promise<unknown[]> {
  const body = {
    query: q,
    paginationMode: "PAGE_NUMBER",
    page: 1,
    limit,
    onlyLatestVersions: true,
    fields: DEFAULT_FIELDS,
  };

  try {
    console.log("[TED API] Request:", JSON.stringify(body, null, 2));

    const json = (await fetchJson(TED_URL, {
      method: "POST",
      body: JSON.stringify(body),
    })) as TedSearchResponse;

    console.log("[TED API] Response status:", {
      hasNotices: Array.isArray(json.notices),
      noticeCount: Array.isArray(json.notices) ? json.notices.length : 0,
      totalCount: json.totalNoticeCount,
      hasErrors: !!json.errors,
      errors: json.errors,
      parseError: json.parseError,
      timedOut: json.timedOut,
    });

    if (json.parseError || json.raw?.includes("<html>")) {
      console.warn(
        "[TED API] Received HTML response instead of JSON, API may be unavailable"
      );
      return [];
    }

    if (json.errors) {
      console.error("[TED API] Errors in response:", json.errors);
    }

    const notices = Array.isArray(json.notices) ? json.notices : [];
    console.log(`[TED API] Returning ${notices.length} notices`);
    return notices;
  } catch (error) {
    console.error("[TED API] Request failed:", error);
    if (error instanceof Error) {
      console.error("[TED API] Error details:", {
        message: error.message,
        stack: error.stack,
      });
    }
    return [];
  }
}

/**
 * Fetches the full XML document for a specific tender notice.
 *
 * @param publicationNumber - The TED publication number of the notice
 * @returns The XML content of the notice
 * @throws Error if the fetch fails
 */
export async function tedFetchXML(publicationNumber: string): Promise<string> {
  const url = `https://ted.europa.eu/en/notice/${encodeURIComponent(
    publicationNumber
  )}/xml`;
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(
      `Failed to fetch XML for publication ${publicationNumber}: ${res.status} ${res.statusText}`
    );
  }

  return await res.text();
}

/**
 * Scores a tender notice based on how well it matches a user profile.
 *
 * Uses a weighted scoring system that considers:
 * - CPV code matches (45% weight)
 * - Geographic region matches (20% weight)
 * - Minimum value requirements (15% weight)
 * - Publication recency (20% weight)
 *
 * @param notice - The tender notice data from TED API
 * @param profile - User profile with preferences and filters
 * @returns Score between 0 and 1 indicating match quality
 */
export function scoreTenderForProfile(
  notice: Record<string, unknown>,
  profile: UserProfile
): number {
  let score = 0;

  // CPV code match (highest weight: 45%)
  const cpvArray = Array.isArray(notice["classification-cpv"])
    ? notice["classification-cpv"]
    : notice["classification-cpv"]
    ? [notice["classification-cpv"]]
    : [];
  const hasCpvMatch = profile.cpv.some((code) => cpvArray.includes(code));
  score += hasCpvMatch ? 0.45 : 0;

  // Geographic region match (20% weight)
  // Checks for region mentions in buyer name or notice title
  const buyerName = notice["buyer-name"] as { ita?: string[] } | undefined;
  const noticeTitle = notice["notice-title"] as
    | { ita?: string; eng?: string }
    | undefined;
  const searchText = [
    buyerName?.ita?.join(" ") || "",
    noticeTitle?.ita || noticeTitle?.eng || "",
  ]
    .join(" ")
    .toLowerCase();
  const hasRegion = profile.regions.some((r) =>
    searchText.includes(r.toLowerCase())
  );
  score += hasRegion ? 0.2 : 0;

  // Minimum value requirement (15% weight)
  const value =
    typeof notice["total-value"] === "number"
      ? notice["total-value"]
      : typeof notice["estimated-value-glo"] === "number"
      ? notice["estimated-value-glo"]
      : null;
  if (profile.minValueEUR && value != null) {
    if (value >= profile.minValueEUR) {
      score += 0.15;
    }
  }

  // Publication recency (20% weight)
  const publicationDate = Array.isArray(notice["publication-date"])
    ? notice["publication-date"][0]
    : notice["publication-date"];
  const pubDate = publicationDate ? new Date(publicationDate) : null;
  if (pubDate) {
    const daysBack = profile.daysBack ?? 3;
    const daysSincePublication =
      (Date.now() - pubDate.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSincePublication <= daysBack + 0.5) {
      score += 0.2;
    }
  }

  return Math.max(0, Math.min(1, score));
}
