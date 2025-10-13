"use client";
import * as React from "react";
import type { User } from "firebase/auth";
import { signInWithGoogle, signOutUser, watchUser } from "@/lib/firebaseClient";

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  isAnon: boolean;
  uid: string | null;
  idToken: string | null;
  signInGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshToken: () => Promise<void>;
};

const AuthContext = React.createContext<AuthContextValue | undefined>(
  undefined
);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<User | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [idToken, setIdToken] = React.useState<string | null>(null);

  React.useEffect(() => {
    // Set up auth state listener
    const unsub = watchUser(async (u) => {
      setUser(u);
      setLoading(false);
      if (u) {
        try {
          const token = await u.getIdToken();
          setIdToken(token);
        } catch (error) {
          console.error("Error getting ID token:", error);
          setIdToken(null);
        }
      } else {
        setIdToken(null);
      }
    });

    return () => unsub && unsub();
  }, []);

  const refreshToken = React.useCallback(async () => {
    if (!user) return;
    try {
      const token = await user.getIdToken(true);
      setIdToken(token);
    } catch (error) {
      console.error("Error refreshing token:", error);
      setIdToken(null);
    }
  }, [user]);

  // Auto-refresh token every 50 minutes (tokens expire after 1 hour)
  React.useEffect(() => {
    if (!user) return;

    const interval = setInterval(() => {
      refreshToken();
    }, 50 * 60 * 1000); // 50 minutes

    return () => clearInterval(interval);
  }, [user, refreshToken]);

  const value = React.useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      isAnon: !!user?.isAnonymous,
      uid: user?.uid ?? null,
      idToken,
      signInGoogle: async () => {
        await signInWithGoogle();
      },
      signOut: async () => {
        await signOutUser();
      },
      refreshToken,
    }),
    [user, loading, idToken, refreshToken]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
