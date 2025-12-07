/**
 * Instant Tender Alerts Job
 *
 * Scheduled function that runs every 2-4 hours to check for new tenders
 * matching user criteria and send immediate email alerts via Brevo.
 */

import { onSchedule } from "firebase-functions/v2/scheduler";
import { profilesCol } from "../lib/firestore.extras";
import { tedSearch, scoreTenderForProfile } from "../lib/ted";
import { sendEmail } from "../lib/brevo";
import type { UserProfile } from "../lib/models";
import { db, serverTimestamp } from "../lib/firestore";

const APP_PUBLIC_URL = process.env.APP_PUBLIC_URL || "https://bandifinder.it";

/**
 * Check if we've already sent an alert for this tender to this user
 */
async function hasAlertBeenSent(
  userId: string,
  tenderId: string,
  hoursBack: number
): Promise<boolean> {
  const cutoffTime = new Date(Date.now() - hoursBack * 60 * 60 * 1000);
  const alertsRef = db
    .collection("instant_alerts")
    .where("userId", "==", userId)
    .where("tenderId", "==", tenderId)
    .where("sentAt", ">=", cutoffTime);

  const snapshot = await alertsRef.get();
  return !snapshot.empty;
}

/**
 * Record that an alert was sent (for deduplication)
 */
async function recordAlertSent(
  userId: string,
  tenderId: string,
  email: string
): Promise<void> {
  await db.collection("instant_alerts").add({
    userId,
    tenderId,
    email,
    sentAt: serverTimestamp(),
    createdAt: serverTimestamp(),
  });
}

/**
 * Format tender for email display
 */
function formatTenderForEmail(
  tender: Record<string, unknown>,
  index: number
): string {
  const noticeTitle = tender["notice-title"] as
    | { ita?: string; eng?: string }
    | undefined;
  const buyerName = tender["buyer-name"] as
    | { ita?: string[]; eng?: string[] }
    | undefined;
  const title = noticeTitle?.ita ?? noticeTitle?.eng ?? "Bando senza titolo";
  const buyer =
    buyerName?.ita?.[0] ?? buyerName?.eng?.[0] ?? "Ente sconosciuto";

  const publicationNumber = String(tender["publication-number"] ?? "");
  const noticeId =
    String(tender["notice-identifier"] ?? "") || publicationNumber;

  const deadlineValue = tender["deadline-date-lot"];
  const deadline =
    (Array.isArray(deadlineValue) ? deadlineValue[0] : deadlineValue) || null;
  const deadlineStr = deadline
    ? new Date(String(deadline)).toLocaleDateString("it-IT")
    : "Non specificata";

  const estimatedValue = tender["estimated-value-glo"] as number | undefined;
  const valueStr = estimatedValue
    ? `€ ${estimatedValue.toLocaleString("it-IT")}`
    : "Non specificato";

  const url = `https://ted.europa.eu/it/notice/-/detail/${encodeURIComponent(
    noticeId
  )}`;
  const appUrl = `${APP_PUBLIC_URL}?tender=${encodeURIComponent(noticeId)}`;

  return `
    <div style="margin-bottom: 24px; padding: 16px; background: #f8f9fa; border-radius: 8px; border-left: 4px solid #3b82f6;">
      <h3 style="margin: 0 0 8px 0; font-size: 16px; font-weight: 600; color: #1f2937;">
        ${index + 1}. ${title}
      </h3>
      <div style="font-size: 14px; color: #4b5563; line-height: 1.6;">
        <p style="margin: 4px 0;"><strong>Ente:</strong> ${buyer}</p>
        <p style="margin: 4px 0;"><strong>Valore:</strong> ${valueStr}</p>
        <p style="margin: 4px 0;"><strong>Scadenza:</strong> ${deadlineStr}</p>
        <p style="margin: 12px 0 0 0;">
          <a href="${url}" target="_blank" style="color: #3b82f6; text-decoration: none; font-weight: 500;">
            Vedi su TED →
          </a>
          <span style="margin: 0 8px; color: #d1d5db;">|</span>
          <a href="${appUrl}" target="_blank" style="color: #3b82f6; text-decoration: none; font-weight: 500;">
            Apri su BandiFinder →
          </a>
        </p>
      </div>
    </div>
  `;
}

/**
 * Generate email HTML content
 */
function generateEmailHTML(
  tenders: Array<{ tender: Record<string, unknown>; score: number }>,
  userName?: string
): string {
  const greeting = userName ? `Ciao ${userName},` : "Ciao,";
  const tenderCount = tenders.length;
  const tenderText = tenderCount === 1 ? "bando" : "bandi";

  const tenderRows = tenders
    .map(({ tender }, index) => formatTenderForEmail(tender, index))
    .join("");

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1f2937; background: #ffffff; margin: 0; padding: 0;">
        <div style="max-width: 600px; margin: 0 auto; padding: 24px;">
          <div style="margin-bottom: 24px;">
            <h1 style="margin: 0 0 8px 0; font-size: 24px; font-weight: 700; color: #111827;">
              🎯 Nuovo${tenderCount > 1 ? "i" : ""} ${tenderText} per te!
            </h1>
            <p style="margin: 0; font-size: 16px; color: #4b5563;">
              ${greeting} Abbiamo trovato ${tenderCount} ${tenderText} che corrispondono ai tuoi criteri.
            </p>
          </div>

          ${tenderRows}

          <div style="margin-top: 32px; padding: 16px; background: #eff6ff; border-radius: 8px; border: 1px solid #bfdbfe;">
            <p style="margin: 0 0 12px 0; font-size: 14px; font-weight: 600; color: #1e40af;">
              💡 Suggerimento
            </p>
            <p style="margin: 0; font-size: 14px; color: #1e3a8a; line-height: 1.6;">
              Non perdere tempo! I bandi migliori ricevono molte candidature. 
              <a href="${APP_PUBLIC_URL}/dashboard" style="color: #3b82f6; font-weight: 500; text-decoration: none;">
                Vai alla tua Dashboard →
              </a>
            </p>
          </div>

          <div style="margin-top: 32px; padding-top: 24px; border-top: 1px solid #e5e7eb;">
            <p style="margin: 0 0 8px 0; font-size: 12px; color: #6b7280;">
              Ricevi questa email perché hai attivato le notifiche immediate.
            </p>
            <p style="margin: 0; font-size: 12px; color: #6b7280;">
              <a href="${APP_PUBLIC_URL}/profilo-aziendale" style="color: #3b82f6; text-decoration: none;">
                Gestisci le tue preferenze →
              </a>
            </p>
          </div>
        </div>
      </body>
    </html>
  `;
}

/**
 * Scheduled function: Instant Tender Alerts
 *
 * Runs every 3 hours to check for new tenders matching user criteria
 * and send immediate email alerts.
 */
export const instantAlerts = onSchedule(
  {
    schedule: "every 3 hours",
    timeZone: "Europe/Rome",
    region: "europe-west1",
    timeoutSeconds: 540, // 9 minutes
    memory: "512MiB",
  },
  async () => {
    console.log("[Instant Alerts] Starting job at", new Date().toISOString());

    try {
      // Get all users with instant notifications enabled
      const profilesSnapshot = await profilesCol()
        .where("notifyInstant", "==", true)
        .get();

      if (profilesSnapshot.empty) {
        console.log(
          "[Instant Alerts] No users with instant notifications enabled"
        );
        return;
      }

      console.log(
        `[Instant Alerts] Found ${profilesSnapshot.size} users with instant notifications`
      );

      let totalSent = 0;
      let totalErrors = 0;

      // Process each user
      for (const doc of profilesSnapshot.docs) {
        const profileData = doc.data() as Partial<UserProfile> & {
          email?: string;
        };
        const userId = doc.id;
        const email = profileData.email;

        if (!email) {
          console.warn(
            `[Instant Alerts] User ${userId} has no email, skipping`
          );
          continue;
        }

        try {
          // Build query for last 3 hours (matching the schedule)
          const country = "ITA";
          const date = (d: number) => `today(${d === 0 ? "" : `-${d}`})`;
          const hoursBack = 3;
          const daysBack = Math.ceil(hoursBack / 24) || 1; // At least 1 day

          const queryParts = [
            `(place-of-performance-country-proc IN (${country}))`,
            `(publication-date >= ${date(
              daysBack
            )} AND publication-date <= today())`,
          ];

          // Add CPV filter if user has CPV codes
          if (Array.isArray(profileData.cpv) && profileData.cpv.length > 0) {
            queryParts.push(
              `(${profileData.cpv
                .map((c: string) => `classification-cpv = "${c}"`)
                .join(" OR ")})`
            );
          }

          // Add region filter if user has regions
          if (
            Array.isArray(profileData.regions) &&
            profileData.regions.length > 0
          ) {
            // Note: TED API uses city names, not region names
            // For now, we'll skip region filtering in the query
            // and filter in post-processing if needed
          }

          const query = queryParts.join(" AND ");
          console.log(`[Instant Alerts] Query for user ${userId}:`, query);

          // Search for tenders
          const notices = await tedSearch({ q: query, limit: 50 });

          if (!Array.isArray(notices) || notices.length === 0) {
            console.log(`[Instant Alerts] No new tenders for user ${userId}`);
            continue;
          }

          // Build user profile for scoring
          const profile: UserProfile = {
            uid: userId,
            regions: profileData.regions || [],
            cpv: profileData.cpv || [],
            daysBack: profileData.daysBack || 7,
            minValueEUR: profileData.minValueEUR || null,
            notifyMorning: profileData.notifyMorning || false,
            createdAt: profileData.createdAt || new Date(),
            updatedAt: profileData.updatedAt || new Date(),
          };

          // Score and filter tenders
          const typedNotices = notices as Array<Record<string, unknown>>;
          const scoredTenders = typedNotices
            .map((notice) => ({
              tender: notice,
              score: scoreTenderForProfile(notice, profile),
            }))
            .filter(({ score }) => score > 0.3) // Only tenders with decent match
            .sort((a, b) => b.score - a.score)
            .slice(0, 5); // Top 5 tenders

          if (scoredTenders.length === 0) {
            console.log(
              `[Instant Alerts] No matching tenders (score > 0.3) for user ${userId}`
            );
            continue;
          }

          // Check for duplicates (already sent alerts)
          const newTenders = [];
          for (const { tender } of scoredTenders) {
            const tenderId =
              String(tender["notice-identifier"] ?? "") ||
              String(tender["publication-number"] ?? "");

            if (!tenderId) continue;

            const alreadySent = await hasAlertBeenSent(
              userId,
              tenderId,
              hoursBack
            );
            if (!alreadySent) {
              newTenders.push({
                tender,
                score: scoreTenderForProfile(tender, profile),
              });
            }
          }

          if (newTenders.length === 0) {
            console.log(
              `[Instant Alerts] All tenders already sent to user ${userId}`
            );
            continue;
          }

          // Generate and send email
          const emailHTML = generateEmailHTML(newTenders);
          const result = await sendEmail({
            to: email,
            subject: `🎯 ${newTenders.length} nuovo${
              newTenders.length > 1 ? "i" : ""
            } ${
              newTenders.length === 1 ? "bando" : "bandi"
            } corrisponde ai tuoi criteri`,
            htmlContent: emailHTML,
            tags: ["instant-alert", `user-${userId}`],
          });

          if (result.success) {
            // Record all sent alerts
            for (const { tender } of newTenders) {
              const tenderId =
                String(tender["notice-identifier"] ?? "") ||
                String(tender["publication-number"] ?? "");
              if (tenderId) {
                await recordAlertSent(userId, tenderId, email);
              }
            }

            totalSent++;
            console.log(
              `[Instant Alerts] Sent alert to ${email} (${newTenders.length} tenders)`
            );
          } else {
            totalErrors++;
            console.error(
              `[Instant Alerts] Failed to send email to ${email}:`,
              result.error
            );
          }
        } catch (error) {
          totalErrors++;
          console.error(
            `[Instant Alerts] Error processing user ${userId}:`,
            error instanceof Error ? error.message : String(error)
          );
        }
      }

      console.log(
        `[Instant Alerts] Job completed. Sent: ${totalSent}, Errors: ${totalErrors}`
      );
    } catch (error) {
      console.error("[Instant Alerts] Fatal error:", error);
      throw error;
    }
  }
);
