/**
 * Background Job: TED Tender Pull
 *
 * Fetches new tender notices from the TED API and stores them in Firestore.
 * Supports automatic fallback to wider date ranges if initial search returns no results.
 */

import { onRequest } from "firebase-functions/v2/https";
import { upsertTender } from "../lib/firestore";
import { tedSearch } from "../lib/ted";
import { TenderDoc } from "../lib/types";

/**
 * Generates a TED Expert Query for Italian tenders within a date range.
 *
 * Uses relative date syntax which is more reliable across different TED API endpoints.
 *
 * @param daysBack - Number of days to look back from today
 * @returns Expert Query string
 */
function makeQuery(daysBack: number): string {
  return `(place-of-performance IN (ITA)) AND (publication-date >= today(-${daysBack}) AND publication-date <= today())`;
}

/**
 * HTTP endpoint for pulling tender notices from TED API.
 *
 * Accepts optional query parameters:
 * - `q`: Custom Expert Query string (defaults to last 3 days of Italian tenders)
 * - `limit`: Maximum number of notices to fetch (default: 50, max: 100)
 *
 * Automatically falls back to a 7-day window if the initial search returns no results.
 */
export const tedPull = onRequest(
  {
    region: "europe-west1",
    cors: true,
    timeoutSeconds: 120,
    memory: "512MiB",
  },
  async (req, res) => {
    try {
      const query = (req.query.q as string) || makeQuery(3);
      const limit = Math.min(Number(req.query.limit ?? 50), 100);

      let notices = await tedSearch({ q: query, limit });

      // Fallback to wider date range if no results
      if (!Array.isArray(notices) || notices.length === 0) {
        const fallbackQuery = makeQuery(7);
        console.warn(
          "No results for initial query, retrying with 7-day window"
        );
        notices = await tedSearch({ q: fallbackQuery, limit });
      }

      const processedIds: string[] = [];
      const typedNotices = notices as Array<Record<string, unknown>>;

      for (const notice of typedNotices) {
        const publicationNumber = notice["publication-number"] as
          | string
          | undefined;
        if (!publicationNumber) {
          continue;
        }

        const noticeTitle = notice["notice-title"] as
          | { ita?: string; eng?: string; en?: string }
          | undefined;
        const buyerName = notice["buyer-name"] as
          | { ita?: string[]; eng?: string[]; en?: string[] }
          | undefined;

        const title =
          noticeTitle?.ita ?? noticeTitle?.eng ?? noticeTitle?.en ?? "";

        const buyer =
          buyerName?.ita?.[0] ??
          buyerName?.eng?.[0] ??
          buyerName?.en?.[0] ??
          "";

        const publicationDateValue = notice["publication-date"] as
          | string
          | null
          | undefined;
        const deadlineValue = notice["deadline-date-lot"] as
          | string
          | null
          | undefined;
        const linksValue = notice.links as
          | TenderDoc["links"]
          | null
          | undefined;

        const doc: TenderDoc = {
          id: String(publicationNumber),
          title: String(title),
          buyer: String(buyer),
          publicationDate: publicationDateValue ?? undefined,
          deadline: deadlineValue ?? undefined,
          cpv:
            (notice["classification-cpv"] as string | string[] | null) ??
            undefined,
          nuts: undefined,
          links: linksValue ?? undefined,
          processed: false,
          summary_it: null,
          summary_en: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        await upsertTender(doc);
        processedIds.push(String(publicationNumber));
      }

      res.json({ pulled: processedIds.length, notices: processedIds });
    } catch (error: unknown) {
      console.error("Error in tedPull:", error);
      const errorMessage =
        error instanceof Error ? error.message : "TED pull failed";
      res.status(500).json({ error: errorMessage });
    }
  }
);
