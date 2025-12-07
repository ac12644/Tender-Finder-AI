/**
 * CORS utility functions for Firebase Functions.
 */
export function setCors(res: {
  set: (key: string, value: string) => void;
}): void {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.set(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, x-user-id"
  );
}
