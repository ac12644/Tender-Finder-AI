import { db } from "./firestore";

export const profilesCol = () => db.collection("profiles");
export const savedSearchesCol = (uid: string) =>
  db.collection("saved_searches").doc(uid).collection("items");
export const favoritesCol = (uid: string) =>
  db.collection("favorites").doc(uid).collection("tenders");
