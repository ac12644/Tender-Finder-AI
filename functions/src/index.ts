import { onRequest } from "firebase-functions/v2/https";
import {
  BaseMessage,
  SystemMessage,
  HumanMessage,
  AIMessage,
} from "@langchain/core/messages";
import { app as graphApp } from "./graph/agent";

import {
  tendersCol,
  db,
  serverTimestamp,
  saveTenderSummary,
  saveMatchScore,
} from "./lib/firestore";
import { tedSearch } from "./lib/ted";

import { tedPull } from "./jobs/pull";
import { tendersProcess } from "./jobs/process";
export { tedPull, tendersProcess };
export { preferences } from "./index.preferences";
export { feed } from "./index.feed";
export { exportCsv } from "./index.export";

export { digestDaily } from "./index.digest";
export { events } from "./index.events";
export { suggestions } from "./index.suggestions";
export {
  getCompanyProfile,
  upsertCompanyProfile,
  getBestTenders,
  analyzeEligibility,
  getPersonalizedRecommendations,
} from "./index.company";

/* ---------------- CORS ---------------- */
function setCors(res: any) {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

/* --------- Firestore server date (ISO YYYY-MM-DD) --------- */
async function getServerDateISO(): Promise<string> {
  const ref = db.collection("_meta").doc("now");
  await ref.set({ now: serverTimestamp() }, { merge: true });
  const snap = await ref.get();
  const ts: any = snap.get("now");
  const d: Date = typeof ts?.toDate === "function" ? ts.toDate() : new Date();
  return d.toISOString().slice(0, 10);
}

/* ---------------- Message normalization ---------------- */
type PlainMsg = {
  role: "user" | "assistant" | "system" | "developer";
  content: string;
  name?: string;
};

function toText(content: any): string {
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content))
    return content
      .map((p) =>
        typeof p === "string" ? p : p?.text ?? p?.content ?? p?.value ?? ""
      )
      .filter(Boolean)
      .join("\n")
      .trim();
  if (content && typeof content === "object") {
    if (typeof content.text === "string") return content.text.trim();
    if (typeof content.content === "string") return content.content.trim();
    try {
      return JSON.stringify(content);
    } catch {
      return String(content);
    }
  }
  return "";
}

function toLCMessages(
  msgs: Array<{ role: string; content: string; name?: string }>
): BaseMessage[] {
  const out: BaseMessage[] = [];
  for (const m of msgs) {
    const content = (m.content ?? "").trim();
    if (!content) continue;

    switch (m.role) {
      case "system":
        out.push(new SystemMessage({ content }));
        break;
      case "user":
      case "human":
        out.push(new HumanMessage({ content, name: m.name }));
        break;
      case "assistant":
      case "ai":
        out.push(new AIMessage({ content, name: m.name }));
        break;
      case "developer": // map 'developer' to system
        out.push(new SystemMessage({ content }));
        break;
      default:
        // drop anything else (incl. serialized LC blobs)
        break;
    }
  }
  return out;
}

function normalizeIncoming(raw: any[]): PlainMsg[] {
  return (Array.isArray(raw) ? raw : [])
    .map((m: any): PlainMsg | null => {
      const guess =
        (m?.role === "ai" ? "assistant" : m?.role) ??
        (typeof m?._getType === "function" ? m._getType() : undefined) ??
        m?.type ??
        "user";
      const role =
        guess === "human"
          ? "user"
          : guess === "ai"
          ? "assistant"
          : (guess as PlainMsg["role"]);
      const content = toText(m?.content);
      const out: PlainMsg = {
        role:
          role === "user" ||
          role === "assistant" ||
          role === "system" ||
          role === "developer"
            ? role
            : "user",
        content,
        name: m?.name ?? undefined,
      };
      return out.content ? out : null;
    })
    .filter(Boolean) as PlainMsg[];
}

/* ---------------- Endpoints ---------------- */

// List latest tenders
export const tendersList = onRequest(
  { region: "europe-west1", cors: true },
  async (req, res): Promise<void> => {
    setCors(res);
    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }
    try {
      const limit = Math.min(Number(req.query.limit ?? 20), 100);
      const snap = await tendersCol()
        .orderBy("updatedAt", "desc")
        .limit(limit)
        .get();
      res.json({ items: snap.docs.map((d) => ({ id: d.id, ...d.data() })) });
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: e?.message ?? "Server error" });
    }
  }
);

// Get a single tender
export const tenderGet = onRequest(
  { region: "europe-west1", cors: true },
  async (req, res): Promise<void> => {
    setCors(res);
    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }
    try {
      const id = (req.query.id as string) || "";
      if (!id) {
        res.status(400).json({ error: "Missing id" });
        return;
      }
      const doc = await tendersCol().doc(id).get();
      if (!doc.exists) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      res.json({ id: doc.id, ...doc.data() });
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: e?.message ?? "Server error" });
    }
  }
);

// Chat with the LangGraph agent
// Chat with the LangGraph agent
export const agentChat = onRequest(
  {
    region: "europe-west1",
    cors: true,
    timeoutSeconds: 180,
    memory: "512MiB",
  },
  async (req, res): Promise<void> => {
    setCors(res);
    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }

    try {
      // 1) Normalize incoming
      const cleaned = normalizeIncoming(req.body?.messages || []);

      // 2) Keep ONLY user/assistant from client (drop system/developer/tool/etc.)
      const userMsgs = cleaned.filter(
        (m) => m.role === "user" || m.role === "assistant"
      );

      if (!userMsgs.some((m) => m.role === "user" && m.content)) {
        res.status(400).json({
          error:
            "messages must include at least one user message with non-empty content",
          example: [{ role: "user", content: "Trova bandi in Italia oggi" }],
        });
        return;
      }

      // 3) Inject Firestore server date as the FIRST message (authoritative system)
      const today = await getServerDateISO();
      const withDate: PlainMsg[] = [
        {
          role: "user",

          content: `Current date (from Firestore server): ${today}`,
        },
        ...userMsgs,
      ];

      // 4) Convert to LC message classes to avoid coercion issues
      const lcMessages = toLCMessages(withDate); // BaseMessage[]

      const thread_id = String(req.body?.thread_id ?? `thread-${Date.now()}`);

      // Check if this is a tender search request and bypass agent if needed
      const lastUserMessage =
        userMsgs
          .filter((m) => m.role === "user")
          .pop()
          ?.content?.toLowerCase() || "";
      const isTenderSearch =
        lastUserMessage.includes("bando") ||
        lastUserMessage.includes("tender") ||
        lastUserMessage.includes("appalto") ||
        lastUserMessage.includes("gara") ||
        lastUserMessage.includes("software") ||
        lastUserMessage.includes("servizi") ||
        lastUserMessage.includes("forniture");

      if (isTenderSearch) {
        try {
          // Direct TED search bypass
          const searchQuery = lastUserMessage
            .replace(/trova|cerca|search|find/gi, "")
            .trim();
          const tedResults = await tedSearch({ q: searchQuery, limit: 5 });

          if (tedResults && tedResults.length > 0) {
            const formattedResults = tedResults
              .map((tender: any) => {
                const value = tender.value
                  ? `€ ${tender.value.toLocaleString()}`
                  : "—";
                const deadline = tender.deadline
                  ? new Date(tender.deadline).toLocaleDateString("it-IT")
                  : "—";
                const pdf = tender.pdf || "—";

                return `| ${tender.title || "—"} | ${
                  tender.buyer || "—"
                } | ${value} | ${deadline} | ${tender.pubno || "—"} | ${pdf} |`;
              })
              .join("\n");

            const response =
              `Ho trovato ${tedResults.length} bandi per "${searchQuery}":\n\n` +
              `| Titolo | Ente | Valore | Scadenza | Pub. No. | PDF |\n` +
              `|--------|------|--------|----------|----------|-----|\n` +
              formattedResults;

            res.json({
              messages: [
                ...withDate.map((m) => ({ role: m.role, content: m.content })),
                { role: "assistant", content: response, name: "tender_agent" },
              ],
              thread_id,
            });
            return;
          } else {
            const response = `Nessun bando trovato per "${searchQuery}". Prova con termini diversi o specifica meglio la tua ricerca.`;
            res.json({
              messages: [
                ...withDate.map((m) => ({ role: m.role, content: m.content })),
                { role: "assistant", content: response, name: "tender_agent" },
              ],
              thread_id,
            });
            return;
          }
        } catch (error) {
          console.error("Direct TED search error:", error);
          // Fall back to agent if direct search fails
        }
      }

      const out = await graphApp.invoke(
        { messages: lcMessages },
        { configurable: { thread_id } }
      );

      // ---- unchanged response simplifier ----
      const simplify = (c: any): string => {
        if (typeof c === "string") return c;
        if (Array.isArray(c))
          return c
            .map((p) =>
              typeof p === "string"
                ? p
                : p?.text ?? p?.content ?? p?.value ?? ""
            )
            .filter(Boolean)
            .join("\n")
            .trim();
        if (c && typeof c === "object") {
          if (typeof c.text === "string") return c.text;
          if (typeof c.content === "string") return c.content;
          try {
            return JSON.stringify(c);
          } catch {
            return String(c);
          }
        }
        return "";
      };

      const simplified = (out?.messages ?? []).map((m: any) => {
        const role =
          m?.role ??
          (typeof m._getType === "function" ? m._getType() : undefined) ??
          m?.type ??
          "assistant";
        return {
          role: role === "ai" ? "assistant" : role,
          content: simplify(m?.content),
          name: m?.name ?? undefined,
        };
      });

      res.json({ messages: simplified, thread_id });
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: e?.message ?? "Agent error" });
    }
  }
);

export const tendersSearch = onRequest(
  { region: "europe-west1", cors: true },
  async (req, res): Promise<void> => {
    setCors(res);
    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }
    try {
      const {
        country = "ITA",
        daysBack = 3,
        cpv = [],
        text = "",
        limit = 20,
      } = req.body ?? {};
      const date = (d: number) => `today(${d === 0 ? "" : `-${d}`})`;
      const parts = [
        `(place-of-performance IN (${country}))`,
        `(publication-date >= ${date(
          daysBack
        )} AND publication-date <= today())`,
      ];
      if (Array.isArray(cpv) && cpv.length) {
        parts.push(
          `(${cpv
            .map((c: string) => `classification-cpv = "${c}"`)
            .join(" OR ")})`
        );
      }
      if (text?.trim()) {
        const t = text.trim().replace(/"/g, '\\"');
        parts.push(`(notice-title ~ "${t}" OR description-proc ~ "${t}")`);
      }
      const q = parts.join(" AND ");

      const pickDate = (d?: string | string[]) => {
        const raw = Array.isArray(d) ? d[0] : d;
        if (!raw) return undefined;
        return raw.replace(/T\d{2}:\d{2}:\d{2}.*$/, "").replace(/\+.*/, "");
      };

      const pickPdfITorEN = (links?: any) => {
        const it = links?.pdf?.ITA || links?.pdf?.it;
        const en = links?.pdf?.ENG || links?.pdf?.en;
        return it || en || null;
      };

      const notices = await tedSearch({
        q,
        limit: Math.min(Number(limit), 50),
      });

      const rows = notices.map((n: any) => {
        const pub = String(n["publication-number"] ?? "");
        const noticeId = pub;
        const buyer =
          n["buyer-name"]?.ita?.[0] ??
          n["buyer-name"]?.eng?.[0] ??
          n["buyer-name"]?.en?.[0] ??
          "";
        const title =
          n["notice-title"]?.ita ??
          n["notice-title"]?.eng ??
          n["notice-title"]?.en ??
          "";
        const description =
          n["description-proc"]?.ita ?? n["description-proc"]?.eng ?? null;

        const cpvArr = Array.isArray(n["classification-cpv"])
          ? [...new Set(n["classification-cpv"].map(String))]
          : n["classification-cpv"]
          ? [String(n["classification-cpv"])]
          : [];
        const cpv = cpvArr[0] ?? "";

        const value =
          typeof n["total-value"] === "number"
            ? n["total-value"]
            : typeof n["estimated-value-glo"] === "number"
            ? n["estimated-value-glo"]
            : null;

        return {
          pubno: pub,
          noticeId,
          buyer,
          title,
          published: pickDate(n["publication-date"]) ?? null,
          deadline: pickDate(n["deadline-date-lot"]) ?? null,
          cpv,
          value,
          pdf: pickPdfITorEN(n.links),
          description,
        };
      });

      res.json({ rows });
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: e?.message ?? "Search failed" });
    }
  }
);

export const tenderSaveSummary = onRequest(
  { region: "europe-west1", cors: true },
  async (req, res): Promise<void> => {
    setCors(res);
    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }
    try {
      const id = (req.query.id as string) || "";
      if (!id) {
        res.status(400).json({ error: "Missing id" });
        return;
      }

      const clean = (s?: string | null, max = 600) =>
        (s ?? "")
          .replace(/```[\s\S]*?```/g, "")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, max) || null;
      await saveTenderSummary(id, {
        summary_it: clean(req.body?.summary_it, 600),
        summary_en: clean(req.body?.summary_en, 220),
      });
      res.json({ ok: true });
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: e?.message ?? "Save failed" });
    }
  }
);

export const matchSave = onRequest(
  { region: "europe-west1", cors: true },
  async (req, res): Promise<void> => {
    setCors(res);
    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }
    try {
      const { companyId, tenderId, score } = req.body ?? {};
      if (!companyId || !tenderId) {
        res.status(400).json({ error: "Missing companyId or tenderId" });
        return;
      }
      await saveMatchScore(
        String(companyId),
        String(tenderId),
        Number(score ?? 0)
      );
      res.json({ ok: true });
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: e?.message ?? "Save failed" });
    }
  }
);

export const saveFavorite = onRequest(
  { region: "europe-west1", cors: true },
  async (req, res): Promise<void> => {
    setCors(res);
    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }
    try {
      const uid = req.headers["x-user-id"] as string;
      if (!uid || uid === "anon") {
        res.status(401).json({ error: "Authentication required" });
        return;
      }

      const { tenderId } = req.body;
      if (!tenderId) {
        res.status(400).json({ error: "Missing tenderId" });
        return;
      }

      // Save to favorites collection
      await db
        .collection("favorites")
        .doc(uid)
        .collection("tenders")
        .doc(tenderId)
        .set({
          uid,
          tenderId,
          createdAt: new Date(),
        });

      res.json({ success: true, message: "Tender saved to favorites" });
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: e?.message ?? "Save failed" });
    }
  }
);
