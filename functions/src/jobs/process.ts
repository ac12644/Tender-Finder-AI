/**
 * Background Job: Tender Processing
 *
 * Processes unprocessed tender notices by generating AI-powered summaries
 * in both Italian and English. Processes tenders in batches with configurable
 * concurrency to optimize API usage and performance.
 */

import { onRequest } from "firebase-functions/v2/https";
import { tendersCol, serverTimestamp, db } from "../lib/firestore";
import { llmFactory } from "../lib/llm";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import { StringOutputParser } from "@langchain/core/output_parsers";

/** Number of tenders to process concurrently */
const CONCURRENCY = 5;

/** Maximum number of tenders to process per invocation */
const BATCH_SIZE = 10;

/**
 * HTTP endpoint for processing unprocessed tender notices.
 *
 * Fetches up to 10 unprocessed tenders, generates summaries using an LLM,
 * and updates the Firestore records. Processes tenders in concurrent batches
 * to optimize performance.
 */
export const tendersProcess = onRequest(
  {
    region: "europe-west1",
    cors: true,
    timeoutSeconds: 180,
    memory: "512MiB",
  },
  async (_req, res): Promise<void> => {
    const snapshot = await tendersCol()
      .where("processed", "==", false)
      .orderBy("createdAt", "asc")
      .limit(BATCH_SIZE)
      .get();

    if (snapshot.empty) {
      res.json({ processed: 0 });
      return;
    }

    const llm = await llmFactory();
    const chain = llm.pipe(new StringOutputParser());

    const tenders = snapshot.docs.map((doc) => {
      const data = doc.data() as Record<string, unknown>;
      return {
        id: doc.id,
        title: data.title as string | undefined,
        buyer: data.buyer as string | undefined,
        publicationDate: data.publicationDate as string | undefined,
        deadline: data.deadline as string | undefined,
      };
    });

    // Split into concurrent batches
    const batches: (typeof tenders)[] = [];
    for (let i = 0; i < tenders.length; i += CONCURRENCY) {
      batches.push(tenders.slice(i, i + CONCURRENCY));
    }

    let processedCount = 0;

    for (const batch of batches) {
      const results = await Promise.allSettled(
        batch.map(async (tender) => {
          const systemPrompt =
            "Riassumi per un imprenditore italiano: titolo, stazione appaltante, " +
            "scadenza, CPV se noto, valore se presente. Includi una riga in inglese " +
            "brevissima prefissata con 'EN: '. Risposta breve, senza formattazioni speciali.";

          const content = `Titolo: ${tender.title}
Buyer: ${tender.buyer}
Pubblicazione: ${tender.publicationDate ?? "N/D"}
Scadenza: ${tender.deadline ?? "N/D"}`;

          const response = (
            await chain.invoke([
              new SystemMessage(systemPrompt),
              new HumanMessage(content),
            ])
          ).trim();

          // Split Italian and English summaries
          let summary_it = response;
          let summary_en = "";
          const englishIndex = response.indexOf("EN:");
          if (englishIndex >= 0) {
            summary_it = response.slice(0, englishIndex).trim();
            summary_en = response.slice(englishIndex + 3).trim();
          }

          return { id: tender.id, summary_it, summary_en };
        })
      );

      // Update Firestore with results
      const firestoreBatch = db.batch();
      for (const result of results) {
        if (result.status === "fulfilled") {
          const { id, summary_it, summary_en } = result.value;
          firestoreBatch.set(
            tendersCol().doc(id),
            {
              summary_it,
              summary_en,
              processed: true,
              updatedAt: serverTimestamp(),
            },
            { merge: true }
          );
          processedCount += 1;
        } else {
          console.error("Failed to process tender:", result.reason);
        }
      }
      await firestoreBatch.commit();
    }

    res.json({ processed: processedCount });
  }
);
