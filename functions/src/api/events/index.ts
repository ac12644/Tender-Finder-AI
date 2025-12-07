import { onRequest } from "firebase-functions/v2/https";
import { db, serverTimestamp } from "../../lib/firestore";

export const events = onRequest(
  { region: "europe-west1", cors: true },
  async (req, res): Promise<void> => {
    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }
    try {
      const auth = req.headers.authorization || "";
      const uid = (req.headers["x-user-id"] as string) || null; // opzionale; lato FE inviamo uid
      const body = typeof req.body === "object" ? req.body : {};
      const {
        type, // 'open_ted' | 'open_pdf' | 'favorite_toggle' | 'open_detail'
        tenderId, // string | null
        metadata = {}, // {referrer?: 'per-te'|'chat'|...}
      } = body;

      if (!type) {
        res.status(400).json({ error: "Missing event type" });
        return;
      }

      await db.collection("events").add({
        type: String(type),
        tenderId: tenderId ? String(tenderId) : null,
        uid: uid ?? null,
        authHeader: auth ? true : false, // per debug, non salviamo token
        metadata: metadata || {},
        createdAt: serverTimestamp(),
      });

      res.json({ ok: true });
    } catch (e: unknown) {
      console.error(e);
      res.status(500).json({
        error: e instanceof Error ? e.message : "Event log failed",
      });
    }
  }
);
