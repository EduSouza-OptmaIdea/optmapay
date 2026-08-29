import React, { useState } from 'react';
import { Logo } from './Logo';
import { ActiveAccountSelector } from './ActiveAccountSelector';
import { SupabaseConfigModal } from './SupabaseConfigModal';
import { useAuth } from '../context/AuthContext';
import { useTheme, ThemeMode } from '../context/ThemeContext';
import { useNavigate, Link } from 'react-router-dom';
import {
  Sun,
  Moon,
  Monitor,
  PlusCircle,
  Key,
  LogOut,
  User,
  ChevronDown,
  ExternalLink,
} from 'lucide-react';

export const Header: React.FC = () => {
  const navigate = useNavigate();
  const { user, signOut, refreshAccounts } = useAuth();
  const { theme, setTheme } = useTheme();
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [isThemeMenuOpen, setIsThemeMenuOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);

  const handleThemeChange = (mode: ThemeMode) => {
    setTheme(mode);
    setIsThemeMenuOpen(false);
  };

  const handleLogout = async () => {
    await signOut();
    navigate('/login');
  };

  return (
    <>
      <header className="sticky top-0 z-30 bg-white/95 dark:bg-[#0F172A]/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 px-4 py-2.5 flex items-center justify-between gap-3 shadow-sm">
        <Link to="/" className="flex items-center gap-2">
          <Logo heightClass="h-8 sm:h-9" />
        </Link>

        <div className="flex items-center gap-2 sm:gap-3">
          {/* Seletor de Conta Ativa (se autenticado) */}
          {user && <ActiveAccountSelector />}

          {/* Abrir Nova Conta */}
          {user && (
            <button
              onClick={() => navigate('/onboarding')}
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#F1613A] hover:bg-[#d94f2a] text-white font-bold text-xs shadow-sm transition"
              title="Abrir Nova Conta Digital Fictícia"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>+ Abrir Conta</span>
            </button>
          )}

          {/* Configuração Supabase Anon Key */}
          <button
            onClick={() => setIsConfigOpen(true)}
            className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-[#19A999] transition"
            title="Configurar Chave Supabase"
          >
            <Key className="w-4 h-4" />
          </button>

          {/* Seletor de Tema: Claro / Escuro / Sistema */}
          <div className="relative">
            <button
              onClick={() => setIsThemeMenuOpen(!isThemeMenuOpen)}
              className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition flex items-center gap-1"
              title={`Tema atual: ${theme}`}
            >
              {theme === 'light' ? (
                <Sun className="w-4 h-4 text-amber-500" />
              ) : theme === 'dark' ? (
                <Moon className="w-4 h-4 text-teal-400" />
              ) : (
                <Monitor className="w-4 h-4 text-slate-400" />
              )}
            </button>

            {isThemeMenuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setIsThemeMenuOpen(false)} />
                <div className="absolute right-0 mt-2 w-36 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 z-50 py-1 text-xs">
                  <button
                    onClick={() => handleThemeChange('light')}
                    className={`w-full px-3 py-2 text-left flex items-center gap-2 hover:bg-slate-50 dark:hover:bg-slate-700 ${theme === 'light' ? 'font-bold text-[#F1613A]' : ''}`}
                  >
                    <Sun className="w-3.5 h-3.5 text-amber-500" />
                    <span>Claro</span>
                  </button>
                  <button
                    onClick={() => handleThemeChange('dark')}
                    className={`w-full px-3 py-2 text-left flex items-center gap-2 hover:bg-slate-50 dark:hover:bg-slate-700 ${theme === 'dark' ? 'font-bold text-[#19A999]' : ''}`}
                  >
                    <Moon className="w-3.5 h-3.5 text-teal-400" />
                    <span>Escuro</span>
                  </button>
                  <button
                    onClick={() => handleThemeChange('system')}
                    className={`w-full px-3 py-2 text-left flex items-center gap-2 hover:bg-slate-50 dark:hover:bg-slate-700 ${theme === 'system' ? 'font-bold text-blue-500' : ''}`}
                  >
                    <Monitor className="w-3.5 h-3.5 text-slate-400" />
                    <span>Sistema</span>
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Menu do Usuário Logado */}
          {user ? (
            <div className="relative">
              <button
                onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                className="flex items-center gap-1.5 p-1.5 sm:px-2.5 sm:py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-200 transition"
              >
                <div className="w-6 h-6 rounded-full bg-[#19A999]/20 text-[#19A999] flex items-center justify-center font-bold text-xs">
                  {user.email?.charAt(0).toUpperCase() || 'U'}
                </div>
                <span className="hidden sm:inline max-w-[120px] truncate text-slate-700 dark:text-slate-300">
                  {user.email}
                </span>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              </button>

              {isUserMenuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setIsUserMenuOpen(false)} />
                  <div className="absolute right-0 mt-2 w-52 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 z-50 py-1.5 text-xs divide-y divide-slate-100 dark:divide-slate-700">
                    <div className="px-3 py-2">
                      <p className="font-semibold text-slate-800 dark:text-slate-100 truncate">{user.email}</p>
                      <p className="text-[10px] text-slate-400 font-mono mt-0.5">Operador Autenticado</p>
                    </div>

                    <div className="py-1">
                      <Link
                        to="/meus-dados"
                        onClick={() => setIsUserMenuOpen(false)}
                        className="w-full px-3 py-2 flex items-center gap-2 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200"
                      >
                        <User className="w-3.5 h-3.5 text-[#19A999]" />
                        <span>Meus Dados</span>
                      </Link>
                      <Link
                        to="/"
                        onClick={() => setIsUserMenuOpen(false)}
                        className="w-full px-3 py-2 flex items-center gap-2 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200"
                      >
                        <ExternalLink className="w-3.5 h-3.5 text-[#F1613A]" />
                        <span>Página Pública</span>
                      </Link>
                    </div>

                    <div className="pt-1">
                      <button
                        onClick={handleLogout}
                        className="w-full px-3 py-2 flex items-center gap-2 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-rose-600 dark:text-rose-400 font-bold"
                      >
                        <LogOut className="w-3.5 h-3.5" />
                        <span>Sair da Conta</span>
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          ) : (
            <button
              onClick={() => navigate('/login')}
              className="px-3.5 py-1.5 rounded-xl bg-[#F1613A] hover:bg-[#d94f2a] text-white font-bold text-xs transition shadow-sm"
            >
              Entrar
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
