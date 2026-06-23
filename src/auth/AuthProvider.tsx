import type { Session } from '@supabase/supabase-js';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { supabase } from '@/supabase/client';

export type Role = 'admin' | 'consultant';

export interface ProfileInfo {
  id: string;
  fullName: string | null;
  role: Role;
  organizationId: string | null;
}

interface AuthState {
  initializing: boolean;
  session: Session | null;
  profile: ProfileInfo | null;
  isAdmin: boolean;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

/**
 * Deriva o perfil a partir do user_metadata do JWT — assim o papel e o nome
 * ficam disponíveis OFFLINE (sem ida ao servidor) após o primeiro login.
 * O metadata é populado no convite do usuário e replicado em profiles via trigger.
 */
function profileFromSession(session: Session | null): ProfileInfo | null {
  if (!session) return null;
  const meta = (session.user.user_metadata ?? {}) as Record<string, unknown>;
  const role: Role = meta.role === 'admin' ? 'admin' : 'consultant';
  return {
    id: session.user.id,
    fullName: (meta.full_name as string) ?? null,
    role,
    organizationId: (meta.organization_id as string) ?? null,
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [initializing, setInitializing] = useState(true);
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setInitializing(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    return { error: error?.message };
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const profile = useMemo(() => profileFromSession(session), [session]);

  const value = useMemo<AuthState>(
    () => ({
      initializing,
      session,
      profile,
      isAdmin: profile?.role === 'admin',
      signIn,
      signOut,
    }),
    [initializing, session, profile, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth deve ser usado dentro de <AuthProvider>');
  return ctx;
}
