"use client";

import { ReactNode, createContext, useContext, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { LoginResponse } from "@/lib/types";
import {
  clearAuthCookies,
  readSessionFromBrowserCookies,
  setAuthCookies,
} from "@/lib/auth/cookies";

interface AuthContextValue {
  token: string | null;
  user: LoginResponse["user"] | null;
  isAuthenticated: boolean;
  applyLogin: (payload: LoginResponse) => void;
  logout: () => void;
  refreshFromCookies: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [session, setSession] = useState(() => readSessionFromBrowserCookies());

  const value = useMemo<AuthContextValue>(
    () => ({
      token: session?.token ?? null,
      user: session?.user ?? null,
      isAuthenticated: Boolean(session?.token),
      applyLogin: (payload: LoginResponse) => {
        setAuthCookies(payload);
        setSession({
          token: payload.token,
          user: payload.user,
        });
      },
      logout: () => {
        clearAuthCookies();
        setSession(null);
        router.replace("/login");
        router.refresh();
      },
      refreshFromCookies: () => {
        setSession(readSessionFromBrowserCookies());
      },
    }),
    [router, session],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuthContext(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuthContext must be used inside AuthProvider");
  }
  return context;
}
