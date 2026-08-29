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
    const targetUserId = userId || user?.id || '';
    const { accounts: fetched, isUnauthorized: unauth } = await fetchUserAccounts(targetUserId);
    setIsUnauthorized(unauth);

    setAccounts(fetched);

    const savedActiveId = localStorage.getItem('optmapay_active_account_id');
    const matched = fetched.find((a) => a.id === savedActiveId);
    setActiveAccount(matched || fetched[0] || null);
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

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  const setActiveAccountId = (id: string) => {
    const matched = accounts.find((a) => a.id === id);
    if (matched) {
      setActiveAccount(matched);
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
