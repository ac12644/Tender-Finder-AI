import { onRequest } from "firebase-functions/v2/https";
import { db } from "../../lib/firestore";
import { tedSearch } from "../../lib/ted";

type Prefs = {
  regions?: string[];
  cpv?: string[];
  daysBack?: number;
  minValue?: number | null;
};

type TedNotice = Record<string, unknown> & {
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
  "classification-cpv"?: string | string[];
  "publication-date"?: string | string[];
  "deadline-date-lot"?: string | string[];
  "total-value"?: number;
  "estimated-value-glo"?: number;
  links?: {
    pdf?: {
      it?: string;
      ITA?: string;
      en?: string;
      ENG?: string;
    };
  };
};

type EventData = {
  tenderId?: string;
  type?: string;
  metadata?: {
    value?: boolean;
  };
};

function qpFromPrefs(p: Prefs) {
  const parts: string[] = [];
  parts.push(`place-of-performance = "ITA"`);
  parts.push(
    `publication-date >= today(-${Math.min(Math.max(p.daysBack ?? 7, 1), 30)})`
  );
  if (p.cpv && p.cpv.length) {
    parts.push(
      `(${p.cpv.map((c) => `classification-cpv = "${c}"`).join(" OR ")})`
    );
  }
  return parts.join(" AND ");
}

function freshnessBonus(published?: string | string[]) {
  const raw = Array.isArray(published) ? published[0] : published;
  if (!raw) return 0;
  const t = Date.now();
  const d = new Date(String(raw)).getTime();
  if (isNaN(d)) return 0;
  const diffH = (t - d) / 3_600_000;
  if (diffH <= 24) return 1.0;
  if (diffH <= 48) return 0.7;
  if (diffH <= 96) return 0.4;
  return 0.2;
}

export const feed = onRequest(
  { region: "europe-west1", cors: true },
  async (req, res): Promise<void> => {
    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }
    try {
      const uid = (req.headers["x-user-id"] as string) || "anon";
      const prof = await db.collection("profiles").doc(uid).get();
      const prefs = ((prof.exists ? prof.data() : {}) ?? {}) as Prefs;
      const q = qpFromPrefs(prefs);
      const API_CAP = 250;
      const asked = Number(req.query.limit ?? 60);
      const limit = Number.isFinite(asked)
        ? Math.min(Math.max(asked, 1), API_CAP)
        : 60;
      const notices = await tedSearch({ q, limit });
      const since = new Date(Date.now() - 14 * 24 * 3600 * 1000);
      const evSnap = await db
        .collection("events")
        .where("createdAt", ">=", since)
        .get();
      const clicks = new Map<
        string,
        { ted: number; pdf: number; detail: number; fav: number }
      >();
      evSnap.forEach((d) => {
        const e = (d.data() || {}) as EventData;
        const id = String(e.tenderId || "");
        if (!id) return;
        const cur = clicks.get(id) ?? { ted: 0, pdf: 0, detail: 0, fav: 0 };
        if (e.type === "open_ted") cur.ted++;
        if (e.type === "open_pdf") cur.pdf++;
        if (e.type === "open_detail") cur.detail++;
        if (e.type === "favorite_toggle" && e.metadata?.value === true)
          cur.fav++;
        clicks.set(id, cur);
      });
      const rows = (notices as TedNotice[]).map((n) => {
        const pubno = String(n["publication-number"] ?? "");
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
        const cpv =
          Array.isArray(n["classification-cpv"]) && n["classification-cpv"][0]
            ? String(n["classification-cpv"][0])
            : n["classification-cpv"]
            ? String(n["classification-cpv"])
            : "";
        const popularity = clicks.get(pubno) ?? {
          ted: 0,
          pdf: 0,
          detail: 0,
          fav: 0,
        };
        const popScore =
          0.6 * popularity.detail +
          0.4 * popularity.pdf +
          0.3 * popularity.ted +
          0.8 * popularity.fav;
        let prefScore = 0;
        if (prefs.cpv?.length && cpv)
          prefScore += prefs.cpv.includes(cpv) ? 1 : 0;
        if (prefs.regions?.length) {
          const txt = `${title} ${buyer}`.toLowerCase();
          if (prefs.regions.some((r) => txt.includes(r.toLowerCase())))
            prefScore += 0.5;
        }
        const fresh = freshnessBonus(n["publication-date"]);
        const score =
          1.2 * prefScore + 0.8 * fresh + 0.3 * Math.log1p(popScore);
        const pdf =
          n.links?.pdf?.it ??
          n.links?.pdf?.ITA ??
          n.links?.pdf?.en ??
          n.links?.pdf?.ENG ??
          null;
        return {
          pubno,
          noticeId: pubno,
          buyer,
          title,
          published:
            (Array.isArray(n["publication-date"])
              ? n["publication-date"][0]
              : n["publication-date"]) ?? null,
          deadline:
            (Array.isArray(n["deadline-date-lot"])
              ? n["deadline-date-lot"][0]
              : n["deadline-date-lot"]) ?? null,
          cpv: cpv || null,
          value:
            typeof n["total-value"] === "number"
              ? n["total-value"]
              : typeof n["estimated-value-glo"] === "number"
              ? n["estimated-value-glo"]
              : null,
          pdf,
          score,
        };
      });
      const filtered =
        prefs.minValue != null
          ? rows.filter((r) => (r.value ?? 0) >= (prefs.minValue as number))
          : rows;
      filtered.sort((a, b) => b.score - a.score);
      res.json({ rows: filtered });
    } catch (e: unknown) {
      console.error(e);
      res.status(500).json({
        error: e instanceof Error ? e.message : "Feed error",
      });
    }
  }
);
