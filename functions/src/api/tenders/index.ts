import { onRequest } from "firebase-functions/v2/https";
import { tendersCol } from "../../lib/firestore";
import { tedSearch } from "../../lib/ted";
import { saveTenderSummary } from "../../lib/firestore";
import { setCors } from "../../utils/cors";

/**
 * List latest tenders.
 */
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
    } catch (e: unknown) {
      console.error(e);
      const errorMessage = e instanceof Error ? e.message : "Server error";
      res.status(500).json({ error: errorMessage });
    }
  }
);

/**
 * Get a single tender by ID.
 */
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
    } catch (e: unknown) {
      console.error(e);
      const errorMessage = e instanceof Error ? e.message : "Server error";
      res.status(500).json({ error: errorMessage });
    }
  }
);

/**
 * Search tenders using TED API.
 */
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

      const pickPdfITorEN = (links?: {
        pdf?: {
          ITA?: string;
          it?: string;
          ENG?: string;
          en?: string;
        };
      }) => {
        const it = links?.pdf?.ITA || links?.pdf?.it;
        const en = links?.pdf?.ENG || links?.pdf?.en;
        return it || en || null;
      };

      const rawNotices = await tedSearch({
        q,
        limit: Math.min(Number(limit), 50),
      });
      const notices = rawNotices as Array<Record<string, unknown>>;

      const rows = notices.map((n: Record<string, unknown> & {
        "publication-number"?: string;
        "buyer-name"?: {
          ita?: string[];
          eng?: string[];
          en?: string[];
        };
        "notice-title"?: {
          ita?: string;
          eng?: string;
          en?: string;
        };
        "description-proc"?: {
          ita?: string;
          eng?: string;
        };
        "classification-cpv"?: string | string[];
        "publication-date"?: string | string[];
        "deadline-date-lot"?: string | string[];
        "total-value"?: number;
        "estimated-value-glo"?: number;
        links?: {
          pdf?: {
            ITA?: string;
            it?: string;
            ENG?: string;
            en?: string;
          };
        };
      }) => {
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
    } catch (e: unknown) {
      console.error(e);
      const errorMessage = e instanceof Error ? e.message : "Search failed";
      res.status(500).json({ error: errorMessage });
    }
  }
);

/**
 * Save tender summary.
 */
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
    } catch (e: unknown) {
      console.error(e);
      const errorMessage = e instanceof Error ? e.message : "Save failed";
      res.status(500).json({ error: errorMessage });
    }
  }
);

/**
 * Save match score for company-tender pair.
 */
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
      const { saveMatchScore } = await import("../../lib/firestore.js");
      await saveMatchScore(
        String(companyId),
        String(tenderId),
        Number(score ?? 0)
      );
      res.json({ ok: true });
    } catch (e: unknown) {
      console.error(e);
      const errorMessage = e instanceof Error ? e.message : "Save failed";
      res.status(500).json({ error: errorMessage });
    }
  }
);

/**
 * Save tender to favorites.
 */
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

      const { db } = await import("../../lib/firestore.js");
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
    } catch (e: unknown) {
      console.error(e);
      const errorMessage = e instanceof Error ? e.message : "Save failed";
      res.status(500).json({ error: errorMessage });
    }
  }
);
