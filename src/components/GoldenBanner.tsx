import React, { useState } from 'react';
import { ShieldAlert, Terminal, Key } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { SupabaseConfigModal } from './SupabaseConfigModal';

export const GoldenBanner: React.FC = () => {
  const { isUnauthorized, refreshAccounts } = useAuth();
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <>
      {isUnauthorized ? (
        <div className="bg-rose-600 text-white px-4 py-2 text-xs font-medium flex items-center justify-between gap-2 shadow-md">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-white shrink-0 animate-bounce" />
            <span>
              <strong>ATENÇÃO (SUPABASE 401):</strong> Chave API `anon` do Supabase não configurada ou inválida.
            </span>
          </div>
          <button
            onClick={() => setIsModalOpen(true)}
            className="px-3 py-1 rounded-lg bg-white text-rose-700 font-bold text-xs hover:bg-slate-100 transition shrink-0 flex items-center gap-1 shadow-sm"
          >
            <Key className="w-3.5 h-3.5" />
            <span>Cole sua Chave Anon Supabase</span>
          </button>
        </div>
      ) : (
        <div className="bg-amber-500/10 dark:bg-amber-500/20 border-b border-amber-500/20 text-amber-900 dark:text-amber-200 px-4 py-2 text-xs font-medium flex items-center justify-between gap-2 overflow-x-auto">
          <div className="flex items-center gap-2 shrink-0">
            <ShieldAlert className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <span>
              <strong className="font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300">
                ATENÇÃO:
              </strong>{' '}
              Este é um banco sandbox usado apenas para testes de api e webhook em sites, apps etc.. As transações e dados aqui visualizados são todos fictícios.
            </span>
          </div>
          <div className="hidden md:flex items-center gap-1.5 text-[11px] font-mono text-amber-700 dark:text-amber-400 shrink-0">
            <Terminal className="w-3.5 h-3.5" />
            <span>API /api/sandbox/v1</span>
          </div>
        </div>

      )}

      <SupabaseConfigModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSaved={refreshAccounts}
      />
    </>
  );
};
