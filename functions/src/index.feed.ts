import { onRequest } from "firebase-functions/v2/https";
import { db } from "./lib/firestore";
import { tedSearch } from "./lib/ted";

type Prefs = {
  regions?: string[];
  cpv?: string[];
  daysBack?: number;
  minValue?: number | null;
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
        const e = d.data() || {};
        const id = String((e as any).tenderId || "");
        if (!id) return;
        const cur = clicks.get(id) ?? { ted: 0, pdf: 0, detail: 0, fav: 0 };
        if ((e as any).type === "open_ted") cur.ted++;
        if ((e as any).type === "open_pdf") cur.pdf++;
        if ((e as any).type === "open_detail") cur.detail++;
        if (
          (e as any).type === "favorite_toggle" &&
          (e as any).metadata?.value === true
        )
          cur.fav++;
        clicks.set(id, cur);
      });
      const rows = (notices as any[]).map((n) => {
        const pubno = String((n as any)["publication-number"] ?? "");
        const buyer =
          (n as any)["buyer-name"]?.ita?.[0] ??
          (n as any)["buyer-name"]?.eng?.[0] ??
          (n as any)["buyer-name"]?.en?.[0] ??
          "";
        const title =
          (n as any)["notice-title"]?.ita ??
          (n as any)["notice-title"]?.eng ??
          (n as any)["notice-title"]?.en ??
          "";
        const cpv =
          Array.isArray((n as any)["classification-cpv"]) &&
          (n as any)["classification-cpv"][0]
            ? String((n as any)["classification-cpv"][0])
            : (n as any)["classification-cpv"]
            ? String((n as any)["classification-cpv"])
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
        const fresh = freshnessBonus((n as any)["publication-date"]);
        const score =
          1.2 * prefScore + 0.8 * fresh + 0.3 * Math.log1p(popScore);
        const pdf =
          (n as any).links?.pdf?.it ??
          (n as any).links?.pdf?.ITA ??
          (n as any).links?.pdf?.en ??
          (n as any).links?.pdf?.ENG ??
          null;
        return {
          pubno,
          noticeId: pubno,
          buyer,
          title,
          published:
            (Array.isArray((n as any)["publication-date"])
              ? (n as any)["publication-date"][0]
              : (n as any)["publication-date"]) ?? null,
          deadline:
            (Array.isArray((n as any)["deadline-date-lot"])
              ? (n as any)["deadline-date-lot"][0]
              : (n as any)["deadline-date-lot"]) ?? null,
          cpv: cpv || null,
          value:
            typeof (n as any)["total-value"] === "number"
              ? (n as any)["total-value"]
              : typeof (n as any)["estimated-value-glo"] === "number"
              ? (n as any)["estimated-value-glo"]
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
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: e?.message ?? "Feed error" });
    }
  }
);
