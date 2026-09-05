import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import {
  Building2,
  User,
  Crown,
  ChevronDown,
  Check,
  ShieldCheck,
  Landmark,
  Layers,
  Sparkles,
} from 'lucide-react';

export const ActiveAccountSelector: React.FC = () => {
  const { activeAccount, accounts, allAccounts, setActiveAccountId, isSuperAdmin } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const navigate = useNavigate();

  if (!activeAccount) return null;

  const accountList = isSuperAdmin && allAccounts.length > 0 ? allAccounts : accounts;

  return (
    <div className="relative">
      {/* Botão de Exibição da Conta Ativa com Destaque Super Admin */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-2.5 px-3 py-1.5 rounded-2xl border text-xs transition shadow-sm ${
          isSuperAdmin
            ? 'bg-gradient-to-r from-amber-500/10 via-slate-100 to-amber-500/5 dark:from-amber-950/30 dark:via-slate-800 dark:to-amber-950/20 border-amber-500/40 hover:border-amber-500/70 text-slate-800 dark:text-slate-100'
            : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200'
        }`}
        title="Alternar entre contas ou acessar Console do Super Admin"
      >
        <div
          className={`p-1.5 rounded-xl ${
            isSuperAdmin
              ? 'bg-gradient-to-tr from-amber-500 to-orange-500 text-white shadow-sm'
              : activeAccount.type === 'merchant'
              ? 'bg-[#19A999] text-white'
              : 'bg-blue-600 text-white'
          }`}
        >
          {isSuperAdmin ? (
            <Crown className="w-3.5 h-3.5" />
          ) : activeAccount.type === 'merchant' ? (
            <Building2 className="w-3.5 h-3.5" />
          ) : (
            <User className="w-3.5 h-3.5" />
          )}
        </div>

        <div className="flex flex-col text-left max-w-[130px] sm:max-w-[190px]">
          <div className="flex items-center gap-1.5">
            <span className="font-bold truncate text-slate-900 dark:text-white">
              {activeAccount.name}
            </span>
            {isSuperAdmin && (
              <span className="hidden lg:inline-flex items-center text-[9px] font-black px-1.5 py-0.2 rounded-full bg-amber-500 text-white uppercase tracking-wider">
                Root
              </span>
            )}
          </div>
          <span className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
            {activeAccount.type === 'merchant' ? 'PJ • Estabelecimento' : 'PF • Cliente Pagador'}
          </span>
        </div>

        <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0 ml-1" />
      </button>

      {/* Dropdown de Contas & Console Super Admin */}
      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute right-0 mt-2 w-72 sm:w-80 bg-white dark:bg-slate-800 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-700 z-50 p-2 text-xs divide-y divide-slate-100 dark:divide-slate-700 animate-fadeIn">
            {/* Cabeçalho do Super Admin */}
            {isSuperAdmin && (
              <div className="p-2 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase tracking-wider text-amber-600 dark:text-amber-400 flex items-center gap-1">
                    <Crown className="w-3 h-3" />
                    <span>Super Admin Master</span>
                  </span>
                  <span className="text-[9px] font-mono text-slate-400">Acesso Irrestrito</span>
                </div>

                <div className="grid grid-cols-2 gap-1.5 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setIsOpen(false);
                      navigate('/master-admin');
                    }}
                    className="p-2 rounded-xl bg-gradient-to-br from-amber-500/10 to-orange-500/10 hover:from-amber-500/20 hover:to-orange-500/20 text-amber-900 dark:text-amber-200 font-bold border border-amber-500/20 text-left flex items-center gap-1.5 transition"
                  >
                    <Layers className="w-3.5 h-3.5 text-amber-500" />
                    <span>Console Master</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setIsOpen(false);
                      navigate('/config-banco');
                    }}
                    className="p-2 rounded-xl bg-gradient-to-br from-[#1367A2]/10 to-teal-500/10 hover:from-[#1367A2]/20 hover:to-teal-500/20 text-[#1367A2] dark:text-sky-300 font-bold border border-[#1367A2]/20 text-left flex items-center gap-1.5 transition"
                  >
                    <Landmark className="w-3.5 h-3.5 text-[#1367A2]" />
                    <span>Taxas do Banco</span>
                  </button>
                </div>
              </div>
            )}

            {/* Lista de Contas Cadastradas no Sistema */}
            <div className="p-2 space-y-1 max-h-64 overflow-y-auto">
              <p className="text-[10px] font-bold text-slate-400 px-2 uppercase tracking-wider">
                {isSuperAdmin ? 'Alternar / Impersonate Contas:' : 'Minhas Contas:'}
              </p>

              {accountList.map((acc) => {
                const isCurrent = acc.id === activeAccount.id;
                return (
                  <button
                    key={acc.id}
                    type="button"
                    onClick={() => {
                      setActiveAccountId(acc.id);
                      setIsOpen(false);
                    }}
                    className={`w-full p-2.5 rounded-2xl text-left flex items-center justify-between transition ${
                      isCurrent
                        ? 'bg-slate-100 dark:bg-slate-700/80 font-bold'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-700/40 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 truncate">
                      <div
                        className={`p-1.5 rounded-lg shrink-0 ${
                          acc.type === 'merchant'
                            ? 'bg-[#19A999]/20 text-[#19A999]'
                            : 'bg-blue-500/20 text-blue-500'
                        }`}
                      >
                        {acc.type === 'merchant' ? (
                          <Building2 className="w-3.5 h-3.5" />
                        ) : (
                          <User className="w-3.5 h-3.5" />
                        )}
                      </div>
                      <div className="truncate">
                        <p className="font-bold truncate text-xs text-slate-800 dark:text-slate-100">
                          {acc.name}
                        </p>
                        <p className="text-[10px] text-slate-400 font-mono">
                          Saldo: R$ {Number(acc.balance || 0).toFixed(2)}
                        </p>
                      </div>
                    </div>

                    {isCurrent && (
                      <Check className="w-4 h-4 text-emerald-500 shrink-0 ml-2" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
