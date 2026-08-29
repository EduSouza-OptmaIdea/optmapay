import React, { useState } from 'react';
import { Logo } from './Logo';
import { ActiveAccountSelector } from './ActiveAccountSelector';
import { SupabaseConfigModal } from './SupabaseConfigModal';
import { Sun, Moon, PlusCircle, Key, LogIn, LogOut } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export const Header: React.FC = () => {
  const navigate = useNavigate();
  const { user, signOut, refreshAccounts } = useAuth();
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [isDark, setIsDark] = useState(() => {
    return document.documentElement.classList.contains('dark');
  });

  const toggleDarkMode = () => {
    if (isDark) {
      document.documentElement.classList.remove('dark');
      setIsDark(false);
    } else {
      document.documentElement.classList.add('dark');
      setIsDark(true);
    }
  };

  return (
    <>
      <header className="sticky top-0 z-30 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 px-4 py-3 flex items-center justify-between gap-4">
        <Logo />

        <div className="flex items-center gap-2 sm:gap-3">
          <ActiveAccountSelector />

          {/* Abrir Nova Conta */}
          <button
            onClick={() => navigate('/onboarding')}
            className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs shadow-sm transition"
            title="Abrir Nova Conta Digital Fictícia"
          >
            <PlusCircle className="w-3.5 h-3.5" />
            <span>+ Abrir Conta</span>
          </button>

          {/* Key config modal button */}
          <button
            onClick={() => setIsConfigOpen(true)}
            className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-teal-600 dark:text-teal-400 transition"
            title="Configurar Chave Anon Supabase"
          >
            <Key className="w-4 h-4" />
          </button>

          {/* Dark mode toggle */}
          <button
            onClick={toggleDarkMode}
            className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition"
            title="Alternar Tema"
          >
            {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>

          {/* Login / Logout Operador */}
          {user ? (
            <button
              onClick={signOut}
              className="p-2 rounded-lg bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 text-rose-600 dark:text-rose-400 transition"
              title="Sair da Sessão (Logout Operador)"
            >
              <LogOut className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={() => navigate('/login')}
              className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition"
              title="Login de Operador (Supabase Auth)"
            >
              <LogIn className="w-4 h-4" />
            </button>
          )}
        </div>
      </header>

      <SupabaseConfigModal
        isOpen={isConfigOpen}
        onClose={() => setIsConfigOpen(false)}
        onSaved={refreshAccounts}
      />
    </>
  );
};
