import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { SandboxAccount } from '../types/sandbox';
import { fetchUserAccounts } from '../lib/supabase/accountService';
import { User } from '@supabase/supabase-js';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  isUnauthorized: boolean;
  accounts: SandboxAccount[];
  activeAccount: SandboxAccount | null;
  setActiveAccountId: (id: string) => void;
  refreshAccounts: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isUnauthorized, setIsUnauthorized] = useState(false);
  const [accounts, setAccounts] = useState<SandboxAccount[]>([]);
  const [activeAccount, setActiveAccount] = useState<SandboxAccount | null>(null);

  const loadAccounts = async (userId?: string) => {
    const targetUserId = userId !== undefined ? userId : user?.id || '';
    const { accounts: fetched, isUnauthorized: unauth } = await fetchUserAccounts(targetUserId);
    setIsUnauthorized(unauth);

    if (fetched && fetched.length > 0) {
      setAccounts(fetched);

      const savedActiveId = localStorage.getItem('optmapay_active_account_id');
      const matched = fetched.find((a) => a.id === savedActiveId);

      setActiveAccount((prev) => {
        if (savedActiveId && matched) return { ...matched };
        if (prev) {
          const stillExists = fetched.find((a) => a.id === prev.id);
          if (stillExists) return { ...stillExists };
        }
        return matched ? { ...matched } : { ...fetched[0] };
      });
    }
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      const currentUser = session?.user || null;
      setUser(currentUser);
      loadAccounts(currentUser?.id).finally(() => setLoading(false));
    });

    const { data: authListener } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const currentUser = session?.user || null;
      setUser(currentUser);
      await loadAccounts(currentUser?.id);
    });

    // Supabase Realtime Listener on accounts and transactions tables
    const realtimeChannel = supabase
      .channel('optmapay_global_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'accounts' },
        (payload) => {
          if (payload.new && (payload.new as any).id) {
            const updated = payload.new as SandboxAccount;
            setAccounts((prev) =>
              prev.map((acc) => (acc.id === updated.id ? { ...acc, ...updated } : acc))
            );
            setActiveAccount((prev) => {
              if (prev && prev.id === updated.id) {
                return { ...prev, ...updated };
              }
              return prev;
            });
          }
          loadAccounts(user?.id);
          window.dispatchEvent(new CustomEvent('optmapay:realtime_update', { detail: payload }));
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'transactions' },
        (payload) => {
          loadAccounts(user?.id);
          window.dispatchEvent(new CustomEvent('optmapay:realtime_update', { detail: payload }));
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'boletos' },
        (payload) => {
          loadAccounts(user?.id);
          window.dispatchEvent(new CustomEvent('optmapay:realtime_update', { detail: payload }));
        }
      )
      .subscribe();

    return () => {
      authListener.subscription.unsubscribe();
      supabase.removeChannel(realtimeChannel);
    };
  }, [user?.id]);

  const setActiveAccountId = (id: string) => {
    const matched = accounts.find((a) => a.id === id);
    if (matched) {
      setActiveAccount({ ...matched });
      localStorage.setItem('optmapay_active_account_id', id);
    }
  };

  const refreshAccounts = async () => {
    await loadAccounts(user?.id);
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isUnauthorized,
        accounts,
        activeAccount,
        setActiveAccountId,
        refreshAccounts,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
