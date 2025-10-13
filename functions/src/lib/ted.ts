import type { UserProfile } from "./models";

type TedSearchResponse = {
  notices?: any[];
  totalNoticeCount?: number;
  iterationNextToken?: string | null;
  timedOut?: boolean;
  errors?: any;
};

const TED_URL = "https://ted.europa.eu/api/v3/notices/search";
const DEFAULT_FIELDS = [
  "publication-number",
  "notice-title",
  "buyer-name",
  "publication-date",
  "deadline-date-lot",
  "classification-cpv",
  "estimated-value-glo",
  "total-value",
  "links",
];

async function fetchJson(input: string | URL, init: RequestInit) {
  const res = await fetch(input, {
    ...init,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  let json: any = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch (e) {
    // keep raw text for debugging
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
 * Robust TED v3 search using Expert Query.
 * Accepts { q, limit } and sends both "q" and "query" to be compatible with
 * older/newer docs/implementations.
 */
export async function tedSearch({
  q,
  limit = 10,
}: {
  q: string;
  limit?: number;
}) {
  const body = {
    query: q,
    paginationMode: "PAGE_NUMBER",
    page: 1,
    limit,
    onlyLatestVersions: true,
    fields: DEFAULT_FIELDS,
  };

  const json = (await fetchJson(TED_URL, {
    method: "POST",
    body: JSON.stringify(body),
  })) as TedSearchResponse;

  // Occasionally the API returns nothing due to strict dates.
  // We'll just return an array (possibly empty) and let caller decide fallbacks.
  return Array.isArray(json.notices) ? (json.notices as any[]) : [];
}

export async function tedFetchXML(publicationNumber: string) {
  const url = `https://ted.europa.eu/en/notice/${encodeURIComponent(
    publicationNumber
  )}/xml`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch XML ${publicationNumber}`);
  return await res.text();
}

export function scoreTenderForProfile(n: any, profile: UserProfile): number {
  let score = 0;

  // CPV match (peso alto)
  const cpvArr = Array.isArray(n["classification-cpv"])
    ? n["classification-cpv"]
    : n["classification-cpv"]
    ? [n["classification-cpv"]]
    : [];
  const hasCpvMatch = profile.cpv.some((code) => cpvArr.includes(code));
  score += hasCpvMatch ? 0.45 : 0;

  // Region (greedy per semplice demo: cerca occorrenza regione in buyer-name/title)
  const text = [
    n["buyer-name"]?.ita?.join(" ") || "",
    n["notice-title"]?.ita || n["notice-title"]?.eng || "",
  ]
    .join(" ")
    .toLowerCase();
  const hasRegion = profile.regions.some((r) => text.includes(r.toLowerCase()));
  score += hasRegion ? 0.2 : 0;

  // Valore minimo
  const value =
    typeof n["total-value"] === "number"
      ? n["total-value"]
      : typeof n["estimated-value-glo"] === "number"
      ? n["estimated-value-glo"]
      : null;
  if (profile.minValueEUR && value != null) {
    if (value >= profile.minValueEUR) score += 0.15;
  }

  // Recency (publication-date entro daysBack)
  const pub = Array.isArray(n["publication-date"])
    ? n["publication-date"][0]
    : n["publication-date"];
  const pubDate = pub ? new Date(pub) : null;
  if (pubDate) {
    const days = profile.daysBack ?? 3;
    const diff = (Date.now() - pubDate.getTime()) / 86400000;
    if (diff <= days + 0.5) score += 0.2;
  }

  return Math.max(0, Math.min(1, score));
}
