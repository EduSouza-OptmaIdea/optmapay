import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { SandboxAccount } from '../types/sandbox';
import { fetchUserAccounts, createBankAccount, fetchAllAccountsAsSuperAdmin } from '../lib/supabase/accountService';
import { User } from '@supabase/supabase-js';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  isUnauthorized: boolean;
  isSuperAdmin: boolean;
  accounts: SandboxAccount[];
  allAccounts: SandboxAccount[];
  activeAccount: SandboxAccount | null;
  setActiveAccountId: (id: string) => void;
  refreshAccounts: () => Promise<void>;
  signOut: () => Promise<void>;
}

export const checkIsSuperAdmin = (u: User | null): boolean => {
  if (!u || !u.email) return false;
  const email = u.email.toLowerCase().trim();
  const registeredSuperEmail = (localStorage.getItem('optmapay_super_admin_email') || '').toLowerCase().trim();

  // Super Admin se o email for explicitamente o email registrado no portal master
  if (registeredSuperEmail && email === registeredSuperEmail) {
    return true;
  }
  // Emails mestres de sistema padrão
  if (email === 'admin@optmaidea.com.br' || email === 'admin@optmapay.com.br' || email === 'master@optmapay.com.br' || email === 'root@optmapay.com.br') {
    return true;
  }
  // Ou se tiver metadados explícitos de super admin atribuídos no provisionamento mestre
  if (u.app_metadata?.role === 'super_admin' || u.user_metadata?.role === 'super_admin' || u.user_metadata?.is_super_admin === true) {
    return true;
  }
  return false;
};

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isUnauthorized, setIsUnauthorized] = useState(false);
  const [accounts, setAccounts] = useState<SandboxAccount[]>([]);
  const [allAccounts, setAllAccounts] = useState<SandboxAccount[]>([]);
  const [activeAccount, setActiveAccount] = useState<SandboxAccount | null>(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState<boolean>(false);
  const userRef = useRef<User | null>(null);
  userRef.current = user;

  const loadAccounts = async (userId?: string, currentUser?: User | null) => {
    const targetUserId = userId !== undefined ? userId : userRef.current?.id || '';
    if (!targetUserId) {
      setAccounts([]);
      setAllAccounts([]);
      setActiveAccount(null);
      setIsSuperAdmin(false);
      return;
    }

    const currentAuthUser = currentUser || userRef.current;
    const isMaster = checkIsSuperAdmin(currentAuthUser);
    setIsSuperAdmin(isMaster);

    const { accounts: fetched, isUnauthorized: unauth } = await fetchUserAccounts(targetUserId);
    setIsUnauthorized(unauth);

    // SÓ busca contas de terceiros se o usuário for estritamente o Super Admin
    let allFetched: SandboxAccount[] = [];
    if (isMaster) {
      allFetched = await fetchAllAccountsAsSuperAdmin();
    }
    setAllAccounts(allFetched);

    if (fetched && fetched.length > 0) {
      setAccounts(fetched);

      const savedActiveId = localStorage.getItem('optmapay_active_account_id');
      const pool = isMaster && allFetched.length > 0 ? allFetched : fetched;
      const matched = pool.find((a) => a.id === savedActiveId);

      setActiveAccount((prev) => {
        if (savedActiveId && matched) return { ...matched };
        if (prev) {
          const stillExists = pool.find((a) => a.id === prev.id);
          if (stillExists) return { ...stillExists };
        }
        return matched ? { ...matched } : { ...fetched[0] };
      });
    } else {
      // Se o usuário está autenticado e válido, auto-cria a conta se existirem metadados do cadastro
      const authUser = currentUser || userRef.current;
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
            if (err?.code === '23503' || err?.message?.includes('violates foreign key constraint') || err?.message?.includes('accounts_user_id_fkey')) {
              console.warn('Sessão zumbi detectada. Limpando sessão local...');
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
    // Validação real contra o servidor do Supabase
    supabase.auth.getUser().then(({ data: { user: currentUser }, error }) => {
      if (error || !currentUser) {
        supabase.auth.signOut().catch(() => {});
        setUser(null);
        setIsSuperAdmin(false);
        setAccounts([]);
        setAllAccounts([]);
        setActiveAccount(null);
        setLoading(false);
      } else {
        setUser(currentUser);
        setIsSuperAdmin(checkIsSuperAdmin(currentUser));
        loadAccounts(currentUser.id, currentUser).finally(() => setLoading(false));
      }
    });

    const { data: authListener } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const currentUser = session?.user || null;
      setUser(currentUser);
      setIsSuperAdmin(checkIsSuperAdmin(currentUser));
      if (currentUser) {
        await loadAccounts(currentUser.id, currentUser);
      } else {
        setAccounts([]);
        setAllAccounts([]);
        setActiveAccount(null);
        setIsSuperAdmin(false);
      }
    });

    // Supabase Realtime Listener Global
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
          if (userRef.current?.id) {
            loadAccounts(userRef.current.id, userRef.current);
          }
          window.dispatchEvent(new CustomEvent('optmapay:realtime_update', { detail: payload }));
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'transactions' },
        (payload) => {
          if (userRef.current?.id) {
            loadAccounts(userRef.current.id, userRef.current);
          }
          window.dispatchEvent(new CustomEvent('optmapay:realtime_update', { detail: payload }));
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'boletos' },
        (payload) => {
          if (userRef.current?.id) {
            loadAccounts(userRef.current.id, userRef.current);
          }
          window.dispatchEvent(new CustomEvent('optmapay:realtime_update', { detail: payload }));
        }
      )
      .subscribe();

    // Auto-sync ao focar na janela / mudar de aba
    const handleFocus = () => {
      if (userRef.current?.id) {
        loadAccounts(userRef.current.id, userRef.current);
        window.dispatchEvent(new CustomEvent('optmapay:realtime_update', { detail: {} }));
      }
    };

    // Heartbeat de sincronização a cada 4 segundos se a página estiver visível
    const heartbeat = setInterval(() => {
      if (document.visibilityState === 'visible' && userRef.current?.id) {
        loadAccounts(userRef.current.id, userRef.current);
      }
    }, 4000);

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleFocus);

    return () => {
      authListener.subscription.unsubscribe();
      supabase.removeChannel(realtimeChannel);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleFocus);
      clearInterval(heartbeat);
    };
  }, []);

  const setActiveAccountId = (id: string) => {
    const pool = allAccounts.length > 0 ? allAccounts : accounts;
    const matched = pool.find((a) => a.id === id) || accounts.find((a) => a.id === id);
    if (matched) {
      setActiveAccount({ ...matched });
      localStorage.setItem('optmapay_active_account_id', id);
    }
  };

  const refreshAccounts = async () => {
    if (userRef.current?.id) {
      await loadAccounts(userRef.current.id, userRef.current);
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setIsSuperAdmin(false);
    setAccounts([]);
    setAllAccounts([]);
    setActiveAccount(null);
    localStorage.removeItem('optmapay_active_account_id');
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isUnauthorized,
        isSuperAdmin,
        accounts,
        allAccounts,
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
