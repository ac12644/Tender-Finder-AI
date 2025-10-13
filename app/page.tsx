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

/* -------------------------------------------------------
 * Config
 * ----------------------------------------------------- */
const BASE_URL = process.env.NEXT_PUBLIC_TENDER_API_BASE ?? "";

/* -------------------------------------------------------
 * Helpers
 * ----------------------------------------------------- */
type BackendMessage = {
  role?: string;
  type?: string;
  name?: string;
  content?: unknown;
  _getType?: () => string;
};

function toPlainText(content: unknown): string {
  if (typeof content === "string") return content;

  if (Array.isArray(content)) {
    return content
      .map((p: unknown) => {
        if (typeof p === "string") return p;
        if (p && typeof p === "object") {
          const obj = p as {
            text?: unknown;
            content?: unknown;
            value?: unknown;
          };
          if (typeof obj.text === "string") return obj.text;
          if (typeof obj.content === "string") return obj.content;
          if (typeof obj.value === "string") return obj.value;
        }
        return "";
      })
      .filter(Boolean)
      .join("\n")
      .trim();
  }

  if (content && typeof content === "object") {
    const obj = content as { text?: unknown; content?: unknown };
    if (typeof obj.text === "string") return obj.text;
    if (typeof obj.content === "string") return obj.content;
    try {
      return JSON.stringify(content);
    } catch {
      return String(content);
    }
  }
  return "";
}

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

function AssistantMessage({
  text,
  analyzeEligibility,
  analyzingTender,
}: {
  text: string;
  analyzeEligibility?: (tenderId: string) => Promise<unknown>;
  analyzingTender?: string | null;
}) {
  const parsed = React.useMemo(
    () => parseTendersFromMarkdownTable(text),
    [text]
  );

  if (parsed.length > 0) {
    return (
      <div className="space-y-3">
        {parsed.map((r, i) => (
          <div
            key={`${r.noticeId || r.pubno}-${i}`}
            className="bg-gray-50 border border-gray-100 rounded-xl p-4 hover:bg-gray-100 transition-colors"
          >
            {/* Header */}
            <div className="flex items-start justify-between mb-3">
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-medium text-gray-900 line-clamp-2 mb-1">
                  {r.title}
                </h4>
                <p className="text-xs text-gray-500 truncate">{r.buyer}</p>
              </div>
              {r.value && (
                <div className="text-sm font-semibold text-green-600 ml-2 flex-shrink-0">
                  {typeof r.value === "number"
                    ? `€${r.value.toLocaleString()}`
                    : r.value}
                </div>
              )}
            </div>

            {/* Details */}
            <div className="flex items-center justify-between text-xs text-gray-500">
              <div className="flex items-center gap-3">
                {r.deadline && (
                  <span>
                    Scadenza: {new Date(r.deadline).toLocaleDateString("it-IT")}
                  </span>
                )}
                {r.pubno && <span className="font-mono">{r.pubno}</span>}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2">
                {r.pdf && (
                  <a
                    href={r.pdf}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-500 hover:text-blue-600 transition-colors"
                    onClick={() => console.log("PDF link clicked:", r.pdf)}
                  >
                    PDF
                  </a>
                )}
                {analyzeEligibility && (
                  <button
                    onClick={() => {
                      console.log(
                        "Analysis button clicked for:",
                        r.noticeId || r.pubno
                      );
                      analyzeEligibility(r.noticeId || r.pubno || "");
                    }}
                    disabled={analyzingTender === (r.noticeId || r.pubno)}
                    className="text-blue-500 hover:text-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                  >
                    {analyzingTender === (r.noticeId || r.pubno) ? (
                      <>
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Analisi...
                      </>
                    ) : (
                      "Analisi"
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
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
  const [threadId] = useState(() => crypto.randomUUID());

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

  async function analyzeEligibility(tenderId: string) {
    if (!uid || uid === "anon") {
      toast.info("Devi essere loggato per analizzare l'eligibilità");
      return;
    }

    setAnalyzingTender(tenderId);
    try {
      console.log("Analyzing eligibility for tender:", tenderId);
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
        body: JSON.stringify({ tenderId }),
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
      } else {
        toast.success("Analisi completata!");
      }

      return data;
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

  useEffect(() => {
    scrollerRef.current?.scrollTo({
      top: scrollerRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, loading]);

  async function send(text?: string) {
    const content = (text ?? input).trim();
    if (!content) return;

    rememberPrompt(content);
    setSuggestions(loadSuggestions());

    setMessages((prev) => [...prev, { role: "user", content }]);
    setInput("");
    setLoading(true);

    try {
      interface AgentChatResponse {
        messages: BackendMessage[];
      }
      const headers: HeadersInit = {
        "x-user-id": uid ?? "anon",
        ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
        "Content-Type": "application/json",
      };

      const res = await fetch(`${BASE_URL}/agentChat`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          messages: [{ role: "user", content }],
          thread_id: threadId,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as AgentChatResponse;

      const assistant = pickLastAssistantMessage(data.messages);
      if (assistant && assistant.content) {
        setMessages((prev) => [...prev, assistant]);

        // Generate contextual suggestions based on the search results
        try {
          const contextualSuggestions = await fetchAISuggestions(
            uid,
            idToken,
            `User searched for: ${content}. Generate related suggestions.`
          );
          if (contextualSuggestions.length > 0) {
            setAiSuggestions(contextualSuggestions);
            saveAISuggestions(contextualSuggestions);
          }
        } catch (error) {
          console.warn("Failed to generate contextual suggestions:", error);
        }
      } else {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content:
              "Ho ricevuto la risposta dal backend, ma non c'era testo da mostrare.",
          },
        ]);
      }
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

  function pickLastAssistantMessage(
    raw: BackendMessage[]
  ): { role: "assistant"; content: string } | null {
    if (!Array.isArray(raw)) return null;
    for (let i = raw.length - 1; i >= 0; i--) {
      const m = raw[i];
      const role = m?.role ?? m?._getType?.() ?? m?.type;
      const asst =
        role === "assistant" ||
        role === "ai" ||
        role === "AIMessages" ||
        role === "tool" ||
        m?.name === "agent";
      if (asst) {
        const text = toPlainText(m?.content);
        if (text) return { role: "assistant", content: text };
      }
    }
    const joined = raw
      .map((m) => toPlainText(m?.content))
      .filter(Boolean)
      .join("\n")
      .trim();
    return joined ? { role: "assistant", content: joined } : null;
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
                    }`}
                  >
                    {m.role === "assistant" ? (
                      <AssistantMessage
                        text={m.content}
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

              {loading && (
                <div className="flex justify-start">
                  <div className="bg-gray-50 rounded-2xl px-4 py-3 text-sm inline-flex items-center gap-3 border border-gray-100">
                    <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                    <span className="text-gray-600">Sto cercando bandi…</span>
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
