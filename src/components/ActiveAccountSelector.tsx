import React from 'react';
import { useAuth } from '../context/AuthContext';
import { Building2, User, ChevronDown, Check } from 'lucide-react';

export const ActiveAccountSelector: React.FC = () => {
  const { accounts, activeAccount, setActiveAccountId } = useAuth();
  const [isOpen, setIsOpen] = React.useState(false);

  if (!accounts || accounts.length === 0) return null;

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-750 transition text-xs text-left"
      >
        <div className={`p-1.5 rounded-md ${activeAccount?.type === 'merchant' ? 'bg-teal-600 text-white' : 'bg-blue-600 text-white'}`}>
          {activeAccount?.type === 'merchant' ? <Building2 className="w-3.5 h-3.5" /> : <User className="w-3.5 h-3.5" />}
        </div>
        <div className="flex flex-col max-w-[150px] sm:max-w-[200px]">
          <span className="font-semibold truncate text-slate-800 dark:text-slate-200">
            {activeAccount?.name}
          </span>
          <span className="text-[10px] text-slate-500 dark:text-slate-400 capitalize">
            Conta {activeAccount?.type === 'merchant' ? 'Empresa (Merchant)' : 'Cliente (Customer)'}
          </span>
        </div>
        <ChevronDown className="w-3.5 h-3.5 text-slate-400 ml-1" />
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setIsOpen(false)} />
          <div className="absolute right-0 mt-2 w-72 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 z-30 overflow-hidden py-1">
            <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-700 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Alternar Conta Ativa (Simulador)
            </div>
            {accounts.map((acc) => {
              const isSelected = acc.id === activeAccount?.id;
              return (
                <button
                  key={acc.id}
                  onClick={() => {
                    setActiveAccountId(acc.id);
                    setIsOpen(false);
                  }}
                  className={`w-full px-3 py-2.5 flex items-center justify-between text-left hover:bg-slate-50 dark:hover:bg-slate-700/60 transition ${
                    isSelected ? 'bg-teal-50/60 dark:bg-teal-950/40' : ''
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <div className={`p-1.5 rounded-md ${acc.type === 'merchant' ? 'bg-teal-600 text-white' : 'bg-blue-600 text-white'}`}>
                      {acc.type === 'merchant' ? <Building2 className="w-3.5 h-3.5" /> : <User className="w-3.5 h-3.5" />}
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 leading-tight">
                        {acc.name}
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        {acc.cpf_cnpj} • R$ {acc.balance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </p>
                    </div>
                  </div>
                  {isSelected && <Check className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0" />}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};
