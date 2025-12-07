"use client";

import * as React from "react";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useAuth } from "@/components/AuthProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAgentStream } from "./hooks/useAgentStream";
import { useAgentState } from "./hooks/useAgentState";
import { AgentStatus } from "./components/AgentStatus";
import {
  ProgressiveTenderCard,
  type AnalysisResult,
} from "./components/ProgressiveTenderCard";
import { ContractReviewCard } from "./components/ContractReviewCard";

/* -------------------------------------------------------
 * Config
 * ----------------------------------------------------- */
import { API_BASE_URL } from "@/lib/apiConfig";
const BASE_URL = API_BASE_URL;

/* -------------------------------------------------------
 * Helpers
 * ----------------------------------------------------- */

function cleanAssistantText(s: string): string {
  if (!s) return "";
  const withoutToolBlocks = s.replace(/^```[\s\S]*?```[\r\n]*/g, "").trim();
  return withoutToolBlocks.replace(/\n{3,}/g, "\n\n");
}

/* -------- Parse tabella compatta in card bandi -------- */
type ParsedTenderRow = {
  pubno: string;
  noticeId?: string;
  buyer: string;
  title: string;
  published?: string;
  deadline?: string;
  cpv?: string;
  value?: string | number;
  pdf?: string;
  description?: string;
};

function normalizeIsoLike(d?: string): string | undefined {
  if (!d) return undefined;
  const clean = d.replace(/T\d{2}:\d{2}:\d{2}.*$/, "").replace(/\+.*/, "");
  const dt = new Date(clean);
  return isNaN(dt.getTime()) ? d : dt.toISOString().slice(0, 10);
}

function parseTendersFromMarkdownTable(md: string): ParsedTenderRow[] {
  const cleaned = md.replace(/```[\s\S]*?```/g, "").trim();
  const tableMatch = cleaned.match(
    /(^|\n)\s*\|(.+\|)\s*\n\|[-:| ]+\|\s*\n([\s\S]*?)(\n{2,}|$)/
  );
  if (!tableMatch) return [];

  const headerLine = tableMatch[2].trim();
  const rowsBlock = tableMatch[3].trim();

  const headers = headerLine
    .split("|")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);

  const col = {
    pubno: headers.findIndex(
      (h) => h.includes("pubno") || h.includes("publication")
    ),
    noticeId: headers.findIndex(
      (h) => h === "noticeid" || h === "id" || h.includes("notice")
    ),
    buyer: headers.findIndex((h) => h.includes("buyer")),
    title: headers.findIndex((h) => h.includes("title")),
    published: headers.findIndex((h) => h.includes("publish")),
    deadline: headers.findIndex(
      (h) => h.includes("deadline") || h.includes("scadenza")
    ),
    cpv: headers.findIndex((h) => h.includes("cpv")),
    value: headers.findIndex((h) =>
      ["value", "valore", "importo", "amount"].some((k) => h.includes(k))
    ),
    pdf: headers.findIndex((h) => h === "pdf"),
    description: headers.findIndex(
      (h) => h === "description" || h.includes("descr")
    ),
  };

  const get = (cols: string[], idx: number) =>
    idx >= 0 && idx < cols.length ? cols[idx].trim() : "";

  return rowsBlock
    .split("\n")
    .map((line) =>
      line
        .trim()
        .replace(/^\|/, "")
        .replace(/\|$/, "")
        .split("|")
        .map((c) => c.trim())
    )
    .filter((cols) => cols.length >= 3 && cols.some(Boolean))
    .map((cols) => ({
      pubno: get(cols, col.pubno),
      noticeId: get(cols, col.noticeId) || undefined,
      buyer: get(cols, col.buyer),
      title: get(cols, col.title),
      published: normalizeIsoLike(get(cols, col.published)) || undefined,
      deadline: normalizeIsoLike(get(cols, col.deadline)) || undefined,
      cpv: get(cols, col.cpv) || undefined,
      value: get(cols, col.value) || undefined,
      pdf: get(cols, col.pdf) || undefined,
      description: get(cols, col.description) || undefined,
    }))
    .filter((r) => r.title || r.pubno);
}

/* -------------------------------------------------------
 * AI-Powered Smart Suggestions
 * ----------------------------------------------------- */
const SUGG_KEY = "tender_last_prompts";
const AI_SUGG_KEY = "tender_ai_suggestions";

function rememberPrompt(p: string) {
  try {
    const raw = localStorage.getItem(SUGG_KEY);
    const arr = raw ? (JSON.parse(raw) as string[]) : [];
    const out = [p, ...arr.filter((x) => x !== p)].slice(0, 6);
    localStorage.setItem(SUGG_KEY, JSON.stringify(out));
  } catch {}
}

async function fetchAISuggestions(
  uid: string | null,
  idToken: string | null,
  context?: string
): Promise<string[]> {
  try {
    const headers: HeadersInit = {
      "x-user-id": uid ?? "anon",
      ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
      "Content-Type": "application/json",
    };

    const response = await fetch(`${BASE_URL}/suggestions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        context,
        suggestionType: "search",
        limit: 4,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    return data.suggestions || [];
  } catch (error) {
    console.warn("Failed to fetch AI suggestions:", error);
    return [];
  }
}

async function fetchPersonalizedSuggestions(
  uid: string | null,
  idToken: string | null,
  searchHistory: string[] = []
): Promise<string[]> {
  if (!uid || uid === "anon") return [];

  try {
    const headers: HeadersInit = {
      "x-user-id": uid,
      ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
      "Content-Type": "application/json",
    };

    const response = await fetch(`${BASE_URL}/getPersonalizedRecommendations`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        searchHistory,
        limit: 4,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    return data.suggestions || [];
  } catch (error) {
    console.warn("Failed to fetch personalized suggestions:", error);
    return [];
  }
}

function loadSuggestions(): string[] {
  try {
    const raw = localStorage.getItem(SUGG_KEY);
    const arr = raw ? (JSON.parse(raw) as string[]) : [];
    return arr;
  } catch {
    return [];
  }
}

function loadAISuggestions(): string[] {
  try {
    const raw = localStorage.getItem(AI_SUGG_KEY);
    const arr = raw ? (JSON.parse(raw) as string[]) : [];
    return arr;
  } catch {
    return [];
  }
}

function saveAISuggestions(suggestions: string[]) {
  try {
    localStorage.setItem(AI_SUGG_KEY, JSON.stringify(suggestions));
  } catch {}
}

// This function will be defined inside the HomePage component

/* -------------------------------------------------------
 * UI semplici
 * ----------------------------------------------------- */
function SuggestionChips({
  suggestions,
  onPick,
  disabled,
}: {
  suggestions: string[];
  onPick: (s: string) => void;
  disabled?: boolean;
}) {
  if (!suggestions.length) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {suggestions.map((s, i) => (
        <button
          key={s + i}
          type="button"
          aria-label={`Suggerimento ${i + 1}: ${s}`}
          className="px-4 py-2 text-sm text-gray-700 bg-white border border-gray-200 rounded-full hover:bg-gray-50 hover:border-gray-300 transition-all duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
          onClick={() => onPick(s)}
          disabled={!!disabled}
        >
          {s}
        </button>
      ))}
    </div>
  );
}

/* -------------------------------------------------------
 * Messaggi Chat
 * ----------------------------------------------------- */
type ChatMsg = { role: "user" | "assistant"; content: string };

/**
 * Extract complete JSON object from text by finding matching braces
 */
function extractCompleteJSON(text: string, startIndex: number): string | null {
  let braceCount = 0;
  let bracketCount = 0;
  let inString = false;
  let escapeNext = false;
  let start = -1;

  // Find the opening brace
  for (let i = startIndex; i < text.length; i++) {
    if (text[i] === "{") {
      start = i;
      braceCount = 1;
      break;
    }
  }

  if (start === -1) return null;

  // Find the matching closing brace
  for (let i = start + 1; i < text.length; i++) {
    const char = text[i];

    if (escapeNext) {
      escapeNext = false;
      continue;
    }

    if (char === "\\") {
      escapeNext = true;
      continue;
    }

    if (char === '"' && !escapeNext) {
      inString = !inString;
      continue;
    }

    if (!inString) {
      if (char === "{") braceCount++;
      if (char === "}") braceCount--;
      if (char === "[") bracketCount++;
      if (char === "]") bracketCount--;

      if (braceCount === 0 && bracketCount === 0) {
        return text.substring(start, i + 1);
      }
    }
  }

  return null;
}

/**
 * Parse JSON tender data from agent response
 * Handles JSON arrays embedded in text or as standalone JSON
 */
function parseTendersFromJSON(text: string): Array<Record<string, unknown>> {
  if (!text || typeof text !== "string") return [];

  try {
    // Strategy 1: Look for JSON object with "tenders" key
    const tendersKeyPattern = /"tenders"\s*:\s*\[/;
    const tendersMatch = text.search(tendersKeyPattern);
    if (tendersMatch !== -1) {
      // Find the opening brace before "tenders"
      let objectStart = -1;
      for (let i = tendersMatch; i >= 0; i--) {
        if (text[i] === "{") {
          objectStart = i;
          break;
        }
      }

      if (objectStart !== -1) {
        const jsonStr = extractCompleteJSON(text, objectStart);
        if (jsonStr) {
          try {
            const parsed = JSON.parse(jsonStr);
            if (parsed.tenders && Array.isArray(parsed.tenders)) {
              return parsed.tenders;
            }
          } catch (e) {
            console.warn(
              "[parseTendersFromJSON] Failed to parse tenders object:",
              e
            );
          }
        }
      }
    }

    // Strategy 2: Look for JSON object with "results" or "data" key
    const resultsPattern = /"(?:results|data)"\s*:\s*\[/;
    const resultsMatch = text.search(resultsPattern);
    if (resultsMatch !== -1) {
      let objectStart = -1;
      for (let i = resultsMatch; i >= 0; i--) {
        if (text[i] === "{") {
          objectStart = i;
          break;
        }
      }

      if (objectStart !== -1) {
        const jsonStr = extractCompleteJSON(text, objectStart);
        if (jsonStr) {
          try {
            const parsed = JSON.parse(jsonStr);
            if (parsed.results && Array.isArray(parsed.results)) {
              return parsed.results;
            }
            if (parsed.data && Array.isArray(parsed.data)) {
              return parsed.data;
            }
          } catch (e) {
            console.warn(
              "[parseTendersFromJSON] Failed to parse results/data object:",
              e
            );
          }
        }
      }
    }

    // Strategy 3: Look for JSON array of tender objects directly
    // Pattern: [{ "publicationNumber": ..., "title": ... }, ...]
    const arrayStartPattern =
      /\[\s*\{\s*"(?:publicationNumber|noticeId|title|buyer)"/;
    const arrayMatch = text.search(arrayStartPattern);
    if (arrayMatch !== -1) {
      let bracketCount = 0;
      let braceCount = 0;
      let inString = false;
      let escapeNext = false;
      const start = arrayMatch;

      for (let i = start; i < text.length; i++) {
        const char = text[i];

        if (escapeNext) {
          escapeNext = false;
          continue;
        }

        if (char === "\\") {
          escapeNext = true;
          continue;
        }

        if (char === '"' && !escapeNext) {
          inString = !inString;
          continue;
        }

        if (!inString) {
          if (char === "[") bracketCount++;
          if (char === "]") bracketCount--;
          if (char === "{") braceCount++;
          if (char === "}") braceCount--;

          if (bracketCount === 0 && braceCount === 0 && i > start) {
            const jsonStr = text.substring(start, i + 1);
            try {
              const parsed = JSON.parse(jsonStr);
              if (Array.isArray(parsed) && parsed.length > 0) {
                return parsed;
              }
            } catch (e) {
              console.warn("[parseTendersFromJSON] Failed to parse array:", e);
            }
            break;
          }
        }
      }
    }

    // Strategy 4: Look for individual tender objects in text (comma-separated, not in array)
    // Pattern: { "publicationNumber": ..., "title": ... }, { ... }
    // This handles cases where JSON objects are embedded in text without array wrapper
    const tenderObjectPattern =
      /\{\s*"(?:publicationNumber|noticeId|title|buyer)"\s*:/g;
    const tenderObjects: Array<Record<string, unknown>> = [];
    let match;

    // Reset regex lastIndex
    tenderObjectPattern.lastIndex = 0;
    while ((match = tenderObjectPattern.exec(text)) !== null) {
      const objectStart = match.index;
      const jsonStr = extractCompleteJSON(text, objectStart);
      if (jsonStr) {
        try {
          const parsed = JSON.parse(jsonStr);
          // Check if it looks like a tender object (has key fields)
          if (
            (parsed.publicationNumber || parsed.noticeId) &&
            parsed.title &&
            parsed.buyer
          ) {
            tenderObjects.push(parsed);
          }
        } catch {
          // Continue to next match
        }
      }
    }

    if (tenderObjects.length > 0) {
      return tenderObjects;
    }

    // Strategy 5: Look for JSON-like structures with tender fields (more lenient)
    // This handles cases where JSON is malformed or incomplete
    // Look for patterns like: "publicationNumber": "...", "title": "...", "buyer": "..."
    const tenderFieldPattern =
      /"(?:publicationNumber|noticeId)"\s*:\s*"([^"]+)"[\s\S]{0,2000}?"title"\s*:\s*"([^"]+)"[\s\S]{0,2000}?"buyer"\s*:\s*"([^"]+)"/;
    const fieldMatch = text.match(tenderFieldPattern);
    if (fieldMatch) {
      // Try to extract a complete object around this match
      const matchStart = Math.max(0, (fieldMatch.index || 0) - 100);
      const matchEnd = Math.min(text.length, (fieldMatch.index || 0) + 2000);
      const candidateText = text.substring(matchStart, matchEnd);

      // Try to find and extract JSON objects from this candidate text
      const candidateObjects: Array<Record<string, unknown>> = [];
      let objMatch;
      const objPattern =
        /\{[^{}]*"(?:publicationNumber|noticeId|title|buyer)"[^{}]*\}/g;

      while ((objMatch = objPattern.exec(candidateText)) !== null) {
        try {
          // Try to expand the match to get a complete object
          const startIdx = objMatch.index;
          let braceCount = 0;
          let inString = false;
          let escapeNext = false;
          let objStart = -1;

          // Find opening brace
          for (let i = startIdx; i >= 0; i--) {
            if (candidateText[i] === "{") {
              objStart = i;
              break;
            }
          }

          if (objStart !== -1) {
            // Find closing brace
            for (let i = objStart; i < candidateText.length; i++) {
              const char = candidateText[i];
              if (escapeNext) {
                escapeNext = false;
                continue;
              }
              if (char === "\\") {
                escapeNext = true;
                continue;
              }
              if (char === '"' && !escapeNext) {
                inString = !inString;
                continue;
              }
              if (!inString) {
                if (char === "{") braceCount++;
                if (char === "}") {
                  braceCount--;
                  if (braceCount === 0) {
                    const objStr = candidateText.substring(objStart, i + 1);
                    try {
                      const parsed = JSON.parse(objStr);
                      if (
                        (parsed.publicationNumber || parsed.noticeId) &&
                        parsed.title &&
                        parsed.buyer
                      ) {
                        candidateObjects.push(parsed);
                      }
                    } catch {
                      // Continue
                    }
                    break;
                  }
                }
              }
            }
          }
        } catch {
          // Continue
        }
      }

      if (candidateObjects.length > 0) {
        return candidateObjects;
      }
    }

    // Strategy 6: Try to parse the entire text as JSON
    try {
      const trimmed = text.trim();
      // Only try if it looks like JSON (starts with { or [)
      if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
        const fullJson = JSON.parse(trimmed);
        if (Array.isArray(fullJson)) {
          return fullJson;
        }
        if (fullJson.tenders && Array.isArray(fullJson.tenders)) {
          return fullJson.tenders;
        }
        if (fullJson.results && Array.isArray(fullJson.results)) {
          return fullJson.results;
        }
        if (fullJson.data && Array.isArray(fullJson.data)) {
          return fullJson.data;
        }
      }
    } catch {
      // Not valid JSON, continue
    }
  } catch (e) {
    console.warn("[parseTendersFromJSON] Error parsing JSON:", e);
  }

  return [];
}

function AssistantMessage({
  text,
  tenders: structuredTenders,
  contractReview: structuredContractReview,
  analyzeEligibility,
  analyzingTender,
}: {
  text: string;
  tenders?: unknown[];
  contractReview?: { contractId?: string; review?: unknown };
  analyzeEligibility?: (tenderId: string) => Promise<AnalysisResult | null>;
  analyzingTender?: string | null;
}) {
  // All hooks must be called unconditionally
  // Check if this is a contract review response
  // Priority: structured data from backend > JSON in text
  const contractReview = React.useMemo(() => {
    // First check structured data from backend
    if (structuredContractReview?.review) {
      return structuredContractReview.review as Record<string, unknown>;
    }

    // Fallback: try to extract from text
    try {
      // Try to extract contract review JSON from text
      const jsonMatch = text.match(/\{[\s\S]*"review"[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.review || parsed.contractId) {
          return parsed.review || parsed;
        }
      }
      // Also check for direct review object
      const directMatch = text.match(
        /\{[\s\S]*"summary"[\s\S]*"risks"[\s\S]*\}/
      );
      if (directMatch) {
        return JSON.parse(directMatch[0]);
      }
    } catch {
      // Not a contract review, continue
    }
    return null;
  }, [text, structuredContractReview]);

  const contractId = React.useMemo(() => {
    if (structuredContractReview?.contractId) {
      return structuredContractReview.contractId;
    }
    const idMatch = text.match(/"contractId"\s*:\s*"([^"]+)"/);
    return idMatch ? idMatch[1] : undefined;
  }, [text, structuredContractReview]);

  // Priority: structured tenders from backend > JSON in text > markdown table
  const jsonTenders = React.useMemo(() => parseTendersFromJSON(text), [text]);
  const markdownTenders = React.useMemo(
    () => parseTendersFromMarkdownTable(text),
    [text]
  );

  // If it's a contract review, display it
  if (contractReview) {
    return (
      <div className="space-y-4">
        <ContractReviewCard review={contractReview} contractId={contractId} />
        {/* Also show any text explanation */}
        {text && text.trim() && !text.includes('"review"') && (
          <div className="text-sm text-gray-600 mt-4">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {cleanAssistantText(text)}
            </ReactMarkdown>
          </div>
        )}
      </div>
    );
  }

  const tenders =
    structuredTenders && structuredTenders.length > 0
      ? structuredTenders
      : jsonTenders.length > 0
      ? jsonTenders
      : markdownTenders;

  if (tenders.length > 0) {
    return (
      <div className="space-y-3 w-full">
        {tenders.map((tender, i: number) => {
          const tenderObj = tender as Record<string, unknown>;
          // Handle both JSON format and markdown parsed format
          const normalizedTender =
            jsonTenders.length > 0
              ? {
                  // JSON format from agent
                  publicationNumber:
                    (tenderObj.publicationNumber as string) ||
                    (tenderObj.pubno as string),
                  noticeId:
                    (tenderObj.noticeId as string) ||
                    (tenderObj.publicationNumber as string),
                  title: tenderObj.title as string,
                  buyer:
                    (tenderObj.buyer as string) ||
                    (tenderObj.buyerName as string),
                  publicationDate: tenderObj.publicationDate as
                    | string
                    | undefined,
                  deadline: tenderObj.deadline as string | undefined,
                  cpv: tenderObj.cpv as string | string[] | undefined,
                  value:
                    typeof tenderObj.value === "number"
                      ? tenderObj.value
                      : typeof tenderObj.value === "string"
                      ? parseFloat(
                          (tenderObj.value as string).replace(/[€,\s\.]/g, "")
                        ) || undefined
                      : (tenderObj.estimatedValue as number | undefined) ||
                        (tenderObj.totalValue as number | undefined) ||
                        undefined,
                  // Note: valueFormatted is for display only, not stored
                  pdf:
                    (tenderObj.pdf as string | undefined) ||
                    (tenderObj.pdf_preferred as string | undefined) ||
                    ((tenderObj.links as { pdf?: string })?.pdf as
                      | string
                      | undefined),
                  description:
                    (tenderObj.description as string | undefined) ||
                    (tenderObj.description_proposed_it as string | undefined),
                  procedureType: tenderObj.procedureType as string | undefined,
                  contractNature: tenderObj.contractNature as
                    | string
                    | undefined,
                  frameworkAgreement: tenderObj.frameworkAgreement as
                    | boolean
                    | undefined,
                  electronicAuction: tenderObj.electronicAuction as
                    | boolean
                    | undefined,
                  placeOfPerformance: tenderObj.placeOfPerformance as
                    | unknown
                    | undefined,
                  country: tenderObj.country as unknown | undefined,
                  city: tenderObj.city as unknown | undefined,
                }
              : {
                  // Markdown parsed format
                  publicationNumber: tenderObj.pubno as string,
                  noticeId: tenderObj.noticeId as string | undefined,
                  title: tenderObj.title as string,
                  buyer: tenderObj.buyer as string,
                  publicationDate: tenderObj.published as string | undefined,
                  deadline: tenderObj.deadline as string | undefined,
                  cpv: tenderObj.cpv as string | string[] | undefined,
                  value:
                    typeof tenderObj.value === "number"
                      ? tenderObj.value
                      : typeof tenderObj.value === "string"
                      ? parseFloat(tenderObj.value.replace(/[€,\s]/g, "")) ||
                        undefined
                      : undefined,
                  pdf:
                    tenderObj.pdf && tenderObj.pdf !== "—"
                      ? (tenderObj.pdf as string)
                      : undefined,
                  description: tenderObj.description as string | undefined,
                };

          return (
            <ProgressiveTenderCard
              key={`${
                normalizedTender.noticeId || normalizedTender.publicationNumber
              }-${i}`}
              tender={normalizedTender}
              onAnalyzeEligibility={analyzeEligibility}
              analyzingTender={analyzingTender}
            />
          );
        })}
      </div>
    );
  }
  return (
    <div className="prose prose-sm dark:prose-invert max-w-none">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>
        {cleanAssistantText(text)}
      </ReactMarkdown>
    </div>
  );
}

/* -------------------------------------------------------
 * Pagina principale
 * ----------------------------------------------------- */
export default function HomePage() {
  const { uid, idToken, loading: authLoading } = useAuth();

  // Use streaming hook for better UX
  const {
    content: streamingContent,
    isStreaming,
    error: streamError,
    threadId: streamThreadId,
    tenders: streamingTenders,
    contractReview: streamContractReview,
    stream,
    reset: resetStream,
  } = useAgentStream();

  // Detect agent state from content
  const agentState = useAgentState(streamingContent, isStreaming);

  const [messages, setMessages] = useState<ChatMsg[]>([
    {
      role: "assistant",
      content:
        "Ciao! Sono Bandifinder.it, il tuo assistente AI per trovare i bandi pubblici più adatti alla tua azienda. Dimmi cosa cerchi (es: *software* oggi in *Lombardia*).",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  const [suggestions, setSuggestions] = useState<string[]>(loadSuggestions());
  const [aiSuggestions, setAiSuggestions] = useState<string[]>(
    loadAISuggestions()
  );
  const [personalizedSuggestions, setPersonalizedSuggestions] = useState<
    string[]
  >([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [analyzingTender, setAnalyzingTender] = useState<string | null>(null);

  async function analyzeEligibility(
    tenderId: string,
    tenderData?: {
      title?: string;
      buyer?: string;
      cpv?: string | string[];
      deadline?: string;
      value?: number;
    }
  ): Promise<AnalysisResult | null> {
    if (!uid || uid === "anon") {
      toast.info("Devi essere loggato per analizzare l'eligibilità");
      return null;
    }

    setAnalyzingTender(tenderId);
    try {
      console.log("Analyzing eligibility for tender:", tenderId, tenderData);
      toast.info("Analisi in corso...", {
        description: "Sto analizzando l'eligibilità del bando",
        duration: 2000,
      });

      const headers: HeadersInit = {
        "x-user-id": uid,
        ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
        "Content-Type": "application/json",
      };

      const response = await fetch(`${BASE_URL}/analyzeEligibility`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          tenderId,
          ...(tenderData ? { tenderData } : {}),
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      console.log("Analysis result:", data);

      if (data && data.eligible !== undefined) {
        const score = Math.round((data.eligibilityScore || 0) * 100);
        toast.success("Analisi completata!", {
          description: `Eligibilità: ${score}% - ${
            data.eligible ? "Eligibile" : "Non eligibile"
          }`,
          duration: 5000,
        });

        return {
          eligible: data.eligible ?? false,
          eligibilityScore: data.eligibilityScore ?? 0,
          reasons: data.reasons ?? [],
          riskFactors: data.riskFactors ?? [],
          opportunities: data.opportunities ?? [],
          missingRequirements: data.missingRequirements ?? [],
          recommendation: data.recommendation ?? "skip",
        };
      } else {
        toast.success("Analisi completata!");
        return null;
      }
    } catch (error) {
      console.error("Error analyzing eligibility:", error);
      toast.error("Errore durante l'analisi", {
        description: "Riprova più tardi",
        duration: 3000,
      });
      return null;
    } finally {
      setAnalyzingTender(null);
    }
  }

  // Load AI suggestions on component mount
  useEffect(() => {
    const loadAISuggestions = async () => {
      if (authLoading) return;

      setLoadingSuggestions(true);
      try {
        // Load general AI suggestions
        const generalSuggestions = await fetchAISuggestions(uid, idToken);
        if (generalSuggestions.length > 0) {
          setAiSuggestions(generalSuggestions);
          saveAISuggestions(generalSuggestions);
        }

        // Load personalized suggestions for authenticated users
        if (uid && uid !== "anon") {
          const personalizedSuggestions = await fetchPersonalizedSuggestions(
            uid,
            idToken,
            suggestions
          );
          if (personalizedSuggestions.length > 0) {
            setPersonalizedSuggestions(personalizedSuggestions);
          }
        }
      } catch (error) {
        console.warn("Failed to load AI suggestions:", error);
      } finally {
        setLoadingSuggestions(false);
      }
    };

    loadAISuggestions();
  }, [uid, idToken, authLoading, suggestions]);

  // Add streaming content to messages when streaming completes
  useEffect(() => {
    if (!isStreaming && streamingContent && streamingContent.length > 0) {
      // Check if this content is already in messages
      const lastMessage = messages[messages.length - 1];
      if (
        lastMessage?.role !== "assistant" ||
        lastMessage.content !== streamingContent
      ) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: streamingContent },
        ]);

        // Generate contextual suggestions
        const lastUserMessage = messages
          .filter((m) => m.role === "user")
          .pop()?.content;
        if (lastUserMessage) {
          fetchAISuggestions(
            uid,
            idToken,
            `User searched for: ${lastUserMessage}. Generate related suggestions.`
          )
            .then((contextualSuggestions) => {
              if (contextualSuggestions.length > 0) {
                setAiSuggestions(contextualSuggestions);
                saveAISuggestions(contextualSuggestions);
              }
            })
            .catch((error) => {
              console.warn("Failed to generate contextual suggestions:", error);
            });
        }
      }
    }
  }, [isStreaming, streamingContent, messages, uid, idToken]);

  useEffect(() => {
    scrollerRef.current?.scrollTo({
      top: scrollerRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, loading, streamingContent, isStreaming]);

  async function send(text?: string) {
    const content = (text ?? input).trim();
    if (!content) return;

    rememberPrompt(content);
    setSuggestions(loadSuggestions());

    // Add user message
    const userMessage: ChatMsg = { role: "user", content };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);
    resetStream();

    try {
      // Prepare messages for streaming
      const messagesToSend = [
        ...messages.map((m) => ({ role: m.role, content: m.content })),
        userMessage,
      ] as Array<{ role: string; content: string }>;

      // Start streaming
      await stream(messagesToSend, streamThreadId || undefined);

      // Note: streamingContent will be updated by the hook
      // We'll add it to messages when streaming completes via useEffect
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `Errore: ${message}` },
      ]);
    } finally {
      setLoading(false);
    }
  }

  const firstUserIndex = React.useMemo(
    () => messages.findIndex((m) => m.role === "user"),
    [messages]
  );

  const showSuggestions =
    firstUserIndex === -1 ||
    (messages[messages.length - 1]?.role === "assistant" &&
      input.trim() === "");

  return (
    <div className="h-[90vh] w-full bg-white">
      {/* Main Content */}
      <div className="mx-auto h-full w-full max-w-4xl px-4">
        {/* Chat Container */}
        <div className="flex h-full flex-col">
          {/* Messages Area */}
          <div ref={scrollerRef} className="flex-1 overflow-y-auto">
            <div className="space-y-3 pb-6 pt-2">
              {messages.map((m, i) => (
                <div
                  key={i}
                  className={`flex ${
                    m.role === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  <div
                    className={`max-w-[85%] px-4 py-3 text-sm ${
                      m.role === "user"
                        ? "bg-blue-500 text-white rounded-2xl rounded-br-md shadow-sm"
                        : "bg-gray-50 text-gray-800 rounded-2xl rounded-bl-md border border-gray-100"
                    } ${m.role === "assistant" ? "w-full max-w-full" : ""}`}
                  >
                    {m.role === "assistant" ? (
                      <AssistantMessage
                        text={m.content}
                        contractReview={
                          m.role === "assistant" &&
                          streamingContent === m.content
                            ? streamContractReview
                            : undefined
                        }
                        analyzeEligibility={analyzeEligibility}
                        analyzingTender={analyzingTender}
                      />
                    ) : (
                      <span className="leading-relaxed">{m.content}</span>
                    )}
                  </div>
                </div>
              ))}

              {showSuggestions && (
                <div className="space-y-6">
                  {/* All suggestions combined */}
                  {[
                    ...personalizedSuggestions,
                    ...aiSuggestions,
                    ...suggestions,
                  ].slice(0, 4).length > 0 && (
                    <div className="bg-gray-50 rounded-2xl p-6 border border-gray-100">
                      <h3 className="text-sm font-medium text-gray-700 mb-4">
                        Suggerimenti per te
                      </h3>
                      <SuggestionChips
                        suggestions={[
                          ...personalizedSuggestions,
                          ...aiSuggestions,
                          ...suggestions,
                        ].slice(0, 4)}
                        onPick={(s) => !loading && send(s)}
                        disabled={loading}
                      />
                    </div>
                  )}

                  {/* Loading state for suggestions */}
                  {loadingSuggestions && (
                    <div className="flex justify-center py-8">
                      <div className="text-sm text-gray-500 flex items-center gap-3 bg-gray-50 px-4 py-3 rounded-full border border-gray-100">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Generando suggerimenti...
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Streaming status indicator */}
              {(loading || isStreaming) && (
                <div className="flex justify-start">
                  <AgentStatus state={agentState} />
                </div>
              )}

              {/* Streaming content preview */}
              {isStreaming && streamingContent && (
                <div className="flex justify-start">
                  <div className="max-w-[85%] px-4 py-3 text-sm bg-gray-50 text-gray-800 rounded-2xl rounded-bl-md border border-gray-100">
                    <AssistantMessage
                      text={streamingContent}
                      tenders={streamingTenders}
                      contractReview={streamContractReview}
                      analyzeEligibility={analyzeEligibility}
                      analyzingTender={analyzingTender}
                    />
                    <div className="mt-2 flex items-center gap-2">
                      <Loader2 className="h-3 w-3 animate-spin text-blue-500" />
                      <span className="text-xs text-gray-500">
                        Scrivendo...
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Error display */}
              {streamError && (
                <div className="flex justify-start mb-3">
                  <div className="max-w-[85%] px-4 py-3 text-sm bg-red-50 text-red-800 rounded-2xl border border-red-200">
                    <p className="font-medium">Errore</p>
                    <p className="text-xs mt-1">{streamError}</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Input Footer - Fixed at bottom */}
          <div className="flex-shrink-0 border-t border-gray-100 bg-white px-4 py-3">
            <div className="flex items-center gap-3">
              <Input
                placeholder="Cerca bandi pubblici per la tua azienda…"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                className="flex-1 h-12 px-4 text-base border border-gray-200 rounded-full focus:border-blue-500 focus:ring-0 bg-gray-50 focus:bg-white transition-colors"
                aria-label="Messaggio per Bandifinder.it"
              />
              <Button
                onClick={() => send()}
                disabled={loading || !input.trim()}
                className="h-12 w-12 rounded-full bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 shadow-sm transition-all duration-200"
                aria-label="Invia messaggio"
              >
                {loading ? (
                  <Loader2 className="h-5 w-5 animate-spin text-white" />
                ) : (
                  <ArrowRight className="h-5 w-5 text-white" />
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
