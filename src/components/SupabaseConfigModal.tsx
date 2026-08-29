import React, { useState } from 'react';
import { getStoredAnonKey, resetSupabaseClient } from '../lib/supabase/client';
import { Key, ShieldAlert, Check, X } from 'lucide-react';

interface SupabaseConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export const SupabaseConfigModal: React.FC<SupabaseConfigModalProps> = ({
  isOpen,
  onClose,
  onSaved,
}) => {
  const [anonKey, setAnonKey] = useState(getStoredAnonKey());
  const [savedSuccess, setSavedSuccess] = useState(false);

  if (!isOpen) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!anonKey.trim()) return;

    resetSupabaseClient(anonKey.trim());
    setSavedSuccess(true);
    setTimeout(() => {
      setSavedSuccess(false);
      onSaved();
      onClose();
    }, 1200);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-800 rounded-3xl max-w-lg w-full p-6 sm:p-8 space-y-6 shadow-2xl border border-slate-200 dark:border-slate-700 relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3">
          <div className="p-3 rounded-2xl bg-teal-100 dark:bg-teal-950 text-teal-600 dark:text-teal-400">
            <Key className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">
              Configurar Chave API do Supabase (`anon`)
            </h3>
            <p className="text-xs text-slate-500">
              Projeto: <code className="text-teal-600 dark:text-teal-400 font-mono">https://wertmoquxdrucdbobuie.supabase.co</code>
            </p>
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-900 dark:text-amber-200 space-y-1">
          <p className="font-bold flex items-center gap-1.5">
            <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" />
            Onde encontrar sua chave `anon`?
          </p>
          <p className="text-[11px] text-amber-800/80 dark:text-amber-300">
            No painel do seu Supabase, acesse <strong>Project Settings → API</strong> e copie o token da opção <strong>`anon` `public`</strong>.
          </p>
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Chave Supabase Anon API Key
            </label>
            <textarea
              rows={3}
              value={anonKey}
              onChange={(e) => setAnonKey(e.target.value)}
              placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
              className="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-mono font-medium focus:ring-2 focus:ring-teal-500 outline-none text-slate-900 dark:text-slate-100 break-all"
              required
            />
          </div>

          <button
            type="submit"
            className="w-full py-3 bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs rounded-xl transition shadow-lg shadow-teal-900/20 flex items-center justify-center gap-2"
          >
            {savedSuccess ? (
              <>
                <Check className="w-4 h-4 text-white" />
                <span>Chave Salva com Sucesso!</span>
              </>
            ) : (
              <span>Salvar Chave Anon e Conectar Supabase</span>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};
