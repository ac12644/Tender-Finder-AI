import { onRequest } from "firebase-functions/v2/https";
import { profilesCol } from "./lib/firestore.extras";
import { tedSearch, scoreTenderForProfile } from "./lib/ted";
import type { UserProfile } from "./lib/models";

const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
const FROM_EMAIL = process.env.DIGEST_FROM_EMAIL || "digest@your-app.tld";

function setCors(res: { set: (key: string, value: string) => void }) {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

async function sendEmail(to: string, subject: string, html: string) {
  if (!SENDGRID_API_KEY) {
    console.log(
      "✉️ (preview) To:",
      to,
      "Subject:",
      subject,
      "HTML:",
      html.slice(0, 500)
    );
    return;
  }
  await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SENDGRID_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: FROM_EMAIL, name: "Tender Agent" },
      subject,
      content: [{ type: "text/html", value: html }],
    }),
  });
}

export const digestDaily = onRequest(
  { region: "europe-west1", cors: true, timeoutSeconds: 180, memory: "512MiB" },
  async (req, res): Promise<void> => {
    setCors(res);
    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }

    try {
      const snap = await profilesCol().where("notifyMorning", "==", true).get();
      let sent = 0;

      for (const doc of snap.docs) {
        const p = doc.data() as Partial<UserProfile> & { email?: string };
        const email = p.email; // salva email nel profilo lato FE quando login Google
        if (!email) continue;

        const country = "ITA";
        const date = (d: number) => `today(${d === 0 ? "" : `-${d}`})`;
        const parts = [
          `(place-of-performance IN (${country}))`,
          `(publication-date >= ${date(
            p.daysBack ?? 3
          )} AND publication-date <= today())`,
        ];
        if (Array.isArray(p.cpv) && p.cpv.length) {
          parts.push(
            `(${p.cpv
              .map((c: string) => `classification-cpv = "${c}"`)
              .join(" OR ")})`
          );
        }
        const q = parts.join(" AND ");
        const notices = await tedSearch({ q, limit: 20 });

        const profile: UserProfile = {
          uid: doc.id,
          regions: p.regions || [],
          cpv: p.cpv || [],
          daysBack: p.daysBack || 3,
          minValueEUR: p.minValueEUR || null,
          notifyMorning: p.notifyMorning || false,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        const ranked = notices
          .map((n) => ({ n, score: scoreTenderForProfile(n, profile) }))
          .sort((a, b) => b.score - a.score)
          .slice(0, 8);

        if (!ranked.length) continue;

        const rows = ranked
          .map(({ n }) => {
            const title =
              n["notice-title"]?.ita ?? n["notice-title"]?.eng ?? "";
            const buyer =
              n["buyer-name"]?.ita?.[0] ?? n["buyer-name"]?.eng?.[0] ?? "";
            const id = n["publication-number"];
            const deadline =
              (Array.isArray(n["deadline-date-lot"])
                ? n["deadline-date-lot"][0]
                : n["deadline-date-lot"]) || "";
            const dShort = String(deadline).slice(0, 10);
            const url = `https://ted.europa.eu/it/notice/-/detail/${encodeURIComponent(
              id
            )}`;
            return `<li><a href="${url}" target="_blank">${title}</a> — <em>${buyer}</em> — Scad.: ${
              dShort || "—"
            }</li>`;
          })
          .join("");

        const html = `
        <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto">
          <p><strong>Buongiorno!</strong> Ecco i bandi selezionati per te.</p>
          <ul>${rows}</ul>
          <p style="margin-top:16px">
            <a href="${
              process.env.APP_PUBLIC_URL ?? "#"
            }">Apri la tua pagina “Per te”</a> |
            <a href="${
              process.env.APP_PUBLIC_URL ?? "#"
            }?prefs=1">Aggiorna preferenze</a>
          </p>
          <p style="color:#7a7a7a">Ricevi questa email perché hai attivato il riepilogo mattutino.</p>
        </div>`;
        await sendEmail(email, "Bandi selezionati per te", html);
        sent++;
      }

      res.json({ sent });
    } catch (e: unknown) {
      console.error(e);
      res
        .status(500)
        .json({ error: e instanceof Error ? e.message : "Digest error" });
    }
  }
);
