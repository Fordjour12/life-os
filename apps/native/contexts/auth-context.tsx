import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";

import { authClient } from "@/lib/auth-client";

type AuthUser = {
  id?: string;
  name?: string;
  email?: string;
  image?: string;
};

type AuthContextValue = {
  user: AuthUser | null;
  isLoading: boolean;
  error: string | null;
  hasHydrated: boolean;
  signIn: (credentials: { email: string; password: string }) => Promise<void>;
  signUp: (credentials: { name: string; email: string; password: string }) => Promise<void>;
  signOut: () => Promise<void>;
  refreshSession: () => Promise<void>;
  clearError: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasHydrated, setHasHydrated] = useState(false);

  const clearError = useCallback(() => setError(null), []);

  const refreshSession = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const session = await authClient.getSession();
      setUser((session.data?.user as AuthUser | undefined) ?? null);
    } catch {
      setUser(null);
      setError("Failed to refresh session");
    } finally {
      setIsLoading(false);
      setHasHydrated(true);
    }
  }, []);

  useEffect(() => {
    void refreshSession();
  }, [refreshSession]);

  const signIn = useCallback(
    async (credentials: { email: string; password: string }) => {
      setIsLoading(true);
      setError(null);
      try {
        const result = await authClient.signIn.email(credentials);
        if (result.error) {
          setError(result.error.message ?? "Failed to sign in");
          return;
        }
        setUser((result.data?.user as AuthUser | undefined) ?? null);
        await refreshSession();
      } catch {
        setError("Failed to sign in");
      } finally {
        setIsLoading(false);
      }
    },
    [refreshSession],
  );

  const signUp = useCallback(
    async (credentials: { name: string; email: string; password: string }) => {
      setIsLoading(true);
      setError(null);
      try {
        const result = await authClient.signUp.email(credentials);
        if (result.error) {
          setError(result.error.message ?? "Failed to sign up");
          return;
        }
        setUser((result.data?.user as AuthUser | undefined) ?? null);
        await refreshSession();
      } catch {
        setError("Failed to sign up");
      } finally {
        setIsLoading(false);
      }
    },
    [refreshSession],
  );

  const signOut = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      await authClient.signOut();
    } catch {
      setError("Failed to sign out");
    } finally {
      setUser(null);
      setIsLoading(false);
    }
  }, []);

  const value = useMemo(
    () => ({
      user,
      isLoading,
      error,
      hasHydrated,
      signIn,
      signUp,
      signOut,
      refreshSession,
      clearError,
    }),
    [clearError, error, hasHydrated, isLoading, refreshSession, signIn, signOut, signUp, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
