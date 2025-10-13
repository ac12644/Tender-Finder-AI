import { initializeApp, getApps } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInAnonymously,
  signOut,
  onAuthStateChanged,
  User,
  setPersistence,
  browserLocalPersistence,
} from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

export const app = getApps().length
  ? getApps()[0]
  : initializeApp(firebaseConfig);

export const auth = getAuth(app);

// Set persistence to local storage
setPersistence(auth, browserLocalPersistence).catch((error) => {
  console.error("Error setting auth persistence:", error);
});

export const db = getFirestore(app);

export const provider = new GoogleAuthProvider();

export async function ensureSignedIn(): Promise<User> {
  const a = getAuth();
  if (a.currentUser) return a.currentUser;
  const cred = await signInAnonymously(a);
  return cred.user;
}

export async function signInWithGoogle(): Promise<User> {
  const a = getAuth();
  try {
    const cred = await signInWithPopup(a, provider);
    return cred.user;
  } catch (error) {
    console.error("Error signing in with Google:", error);
    throw error;
  }
}

export async function signOutUser(): Promise<void> {
  const a = getAuth();
  await signOut(a);
}

export function watchUser(cb: (u: User | null) => void) {
  return onAuthStateChanged(auth, cb);
}
