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
      // Se o usuário está autenticado e válido, auto-cria a conta se existirem metadados do cadastro
      const authUser = currentUser || user;
      if (authUser && authUser.id) {
        const meta = authUser.user_metadata || {};
        if (meta.account_name && meta.cpf_cnpj) {
          try {
            const initialBal = typeof meta.initial_balance === 'number' ? meta.initial_balance : 1000.00;
            const created = await createBankAccount(authUser.id, {
              name: meta.account_name,
              type: meta.account_type || 'merchant',
              cpf_cnpj: meta.cpf_cnpj,
              phone: meta.phone || '(11) 98877-6655',
              initialBalance: initialBal,
              pixKey: meta.pix_key || authUser.email || `pix.${Date.now()}@optmapay.fake`,
            });

            if (created) {
              setAccounts([created]);
              setActiveAccount(created);
              return;
            }
          } catch (err: any) {
            // Se o usuário não existe mais no auth.users (foreign key error 23503), limpa a sessão zumbi
            if (err?.code === '23503' || err?.message?.includes('violates foreign key constraint') || err?.message?.includes('accounts_user_id_fkey')) {
              console.warn('Sessão zumbi detectada (usuário deletado do Auth). Limpando sessão local...');
              await supabase.auth.signOut();
              setUser(null);
              setAccounts([]);
              setActiveAccount(null);
              return;
            }
            console.warn('Não foi possível auto-provisionar conta bancária:', err.message);
          }
        }
      }

      setAccounts([]);
      setActiveAccount(null);
    }
  };

  useEffect(() => {
    // Validação real contra o servidor do Supabase para evitar sessões zumbis
    supabase.auth.getUser().then(({ data: { user: currentUser }, error }) => {
      if (error || !currentUser) {
        // Sessão inválida ou usuário excluído no backend
        supabase.auth.signOut().catch(() => {});
        setUser(null);
        setAccounts([]);
        setActiveAccount(null);
        setLoading(false);
      } else {
        setUser(currentUser);
        loadAccounts(currentUser.id, currentUser).finally(() => setLoading(false));
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
  }, []);

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
