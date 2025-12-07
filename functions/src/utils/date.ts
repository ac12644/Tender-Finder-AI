/**
 * Date Utilities
 *
 * Provides functions for working with server-side timestamps and date formatting.
 * Uses Firestore server timestamps to ensure consistency across distributed systems.
 */

import { db, serverTimestamp } from "../lib/firestore";

/**
 * Retrieves the current server date in ISO format (YYYY-MM-DD).
 *
 * Uses Firestore server timestamp to ensure consistency across different
 * function instances and time zones. This is particularly important for
 * date-based queries and filtering.
 *
 * @returns Promise resolving to date string in YYYY-MM-DD format
 */
export async function getServerDateISO(): Promise<string> {
  const ref = db.collection("_meta").doc("now");
  await ref.set({ now: serverTimestamp() }, { merge: true });
  const snapshot = await ref.get();
  const timestamp = snapshot.get("now") as
    | { toDate?: () => Date }
    | null
    | undefined;
  const date =
    typeof timestamp?.toDate === "function" ? timestamp.toDate() : new Date();
  return date.toISOString().slice(0, 10);
}
