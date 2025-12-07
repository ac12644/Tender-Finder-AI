import { onRequest } from "firebase-functions/v2/https";
import { tedSearch } from "../../lib/ted";

function csvEscape(s: unknown) {
  if (s == null) return "";
  const str = String(s);
  if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

export const exportCsv = onRequest(
  { region: "europe-west1", cors: true },
  async (req, res): Promise<void> => {
    if (req.method === "OPTIONS") {
      void res.status(204).send("");
      return;
    }
    try {
      const body = (typeof req.body === "object" ? req.body : {}) as {
        rows?: Array<Record<string, unknown>>;
      };
      let rows: Array<Record<string, unknown>> | null = Array.isArray(body.rows)
        ? body.rows
        : null;

      if (!rows) {
        const q = String(req.query.q ?? "");
        const limit = Math.min(Number(req.query.limit ?? 50), 200);
        if (!q) {
          res.status(400).json({ error: "Manca q o rows" });
          return;
        }
        const rawNotices = await tedSearch({ q, limit });
        const notices = rawNotices as Array<Record<string, unknown>>;
        rows = notices.map((n: Record<string, unknown>) => {
          const buyerName = n["buyer-name"] as
            | { ita?: string[]; eng?: string[]; en?: string[] }
            | undefined;
          const noticeTitle = n["notice-title"] as
            | { ita?: string; eng?: string; en?: string }
            | undefined;
          const links = n.links as
            | { pdf?: { it?: string; ITA?: string; en?: string; ENG?: string } }
            | undefined;

          return {
            PubNo: n["publication-number"],
            Buyer:
              buyerName?.ita?.[0] ??
              buyerName?.eng?.[0] ??
              buyerName?.en?.[0] ??
              "",
            Title:
              noticeTitle?.ita ?? noticeTitle?.eng ?? noticeTitle?.en ?? "",
            Published: Array.isArray(n["publication-date"])
              ? n["publication-date"][0]
              : n["publication-date"],
            Deadline: Array.isArray(n["deadline-date-lot"])
              ? n["deadline-date-lot"][0]
              : n["deadline-date-lot"],
            CPV: Array.isArray(n["classification-cpv"])
              ? n["classification-cpv"][0]
              : n["classification-cpv"] ?? "",
            Value:
              typeof n["total-value"] === "number"
                ? n["total-value"]
                : typeof n["estimated-value-glo"] === "number"
                ? n["estimated-value-glo"]
                : "",
            PDF:
              links?.pdf?.it ??
              links?.pdf?.ITA ??
              links?.pdf?.en ??
              links?.pdf?.ENG ??
              "",
          };
        });
      }

      const headers = [
        "PubNo",
        "Buyer",
        "Title",
        "Published",
        "Deadline",
        "CPV",
        "ValueEUR",
        "PDF",
      ];
      const lines = [headers.join(",")];
      if (rows) {
        for (const row of rows) {
          lines.push(
            [
              csvEscape(row.pubno ?? row.PubNo),
              csvEscape(row.buyer ?? row.Buyer),
              csvEscape(row.title ?? row.Title),
              csvEscape(row.published ?? row.Published),
              csvEscape(row.deadline ?? row.Deadline),
              csvEscape(row.cpv ?? row.CPV),
              csvEscape(row.value ?? row.Value ?? ""),
              csvEscape(row.pdf ?? row.PDF ?? ""),
            ].join(",")
          );
        }
      }
      const csv = lines.join("\n");
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="tenders.csv"`
      );
      res.send(csv);
    } catch (e: unknown) {
      console.error(e);
      res.status(500).json({
        error: e instanceof Error ? e.message : "Export fallito",
      });
    }
  }
);
