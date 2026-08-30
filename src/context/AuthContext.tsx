import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { SandboxAccount } from '../types/sandbox';
import { fetchUserAccounts, createBankAccount } from '../lib/supabase/accountService';
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

  const loadAccounts = async (userId?: string, currentUser?: User | null) => {
    const targetUserId = userId !== undefined ? userId : user?.id || '';
    if (!targetUserId) {
      setAccounts([]);
      setActiveAccount(null);
      return;
    }

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
    } else {
      // Se o usuário está autenticado mas não tem conta no banco ainda:
      // Tenta provisionar a conta com base nos metadados preenchidos no cadastro
      const authUser = currentUser || user;
      if (authUser && authUser.id) {
        const meta = authUser.user_metadata || {};
        if (meta.account_name || authUser.email) {
          try {
            const initialBal = typeof meta.initial_balance === 'number' ? meta.initial_balance : 1000.00;
            const created = await createBankAccount(authUser.id, {
              name: meta.account_name || 'Conta Sandbox',
              type: meta.account_type || 'merchant',
              cpf_cnpj: meta.cpf_cnpj || '45.892.102/0001-90',
              initialBalance: initialBal,
              pixKey: meta.pix_key || authUser.email || 'pix@optmapay.fake',
            });

            if (created) {
              setAccounts([created]);
              setActiveAccount(created);
              return;
            }
          } catch (err) {
            console.warn('Auto-provisioning de conta inicial falhou:', err);
          }
        }
      }

      setAccounts([]);
      setActiveAccount(null);
    }
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      const currentUser = session?.user || null;
      setUser(currentUser);
      if (currentUser) {
        loadAccounts(currentUser.id, currentUser).finally(() => setLoading(false));
      } else {
        setAccounts([]);
        setActiveAccount(null);
        setLoading(false);
      }
    });

    const { data: authListener } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const currentUser = session?.user || null;
      setUser(currentUser);
      if (currentUser) {
        await loadAccounts(currentUser.id, currentUser);
      } else {
        setAccounts([]);
        setActiveAccount(null);
      }
    });

    // Supabase Realtime Listener
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
          if (user?.id) {
            loadAccounts(user.id, user);
          }
          window.dispatchEvent(new CustomEvent('optmapay:realtime_update', { detail: payload }));
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'transactions' },
        (payload) => {
          if (user?.id) {
            loadAccounts(user.id, user);
          }
          window.dispatchEvent(new CustomEvent('optmapay:realtime_update', { detail: payload }));
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'boletos' },
        (payload) => {
          if (user?.id) {
            loadAccounts(user.id, user);
          }
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
    if (user?.id) {
      await loadAccounts(user.id, user);
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setAccounts([]);
    setActiveAccount(null);
    localStorage.removeItem('optmapay_active_account_id');
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
