import React from 'react';
import { useAuth } from '../context/AuthContext';
import { Building2, User } from 'lucide-react';

export const ActiveAccountSelector: React.FC = () => {
  const { activeAccount } = useAuth();

  if (!activeAccount) return null;

  return (
    <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs">
      <div className={`p-1.5 rounded-lg ${activeAccount.type === 'merchant' ? 'bg-[#19A999] text-white' : 'bg-blue-600 text-white'}`}>
        {activeAccount.type === 'merchant' ? <Building2 className="w-3.5 h-3.5" /> : <User className="w-3.5 h-3.5" />}
      </div>
      <div className="flex flex-col max-w-[140px] sm:max-w-[200px]">
        <span className="font-bold truncate text-slate-800 dark:text-slate-100">
          {activeAccount.name}
        </span>
        <span className="text-[10px] text-slate-500 dark:text-slate-400">
          {activeAccount.type === 'merchant' ? 'Pessoa Jurídica (PJ)' : 'Pessoa Física (PF)'}
        </span>
      </div>
    </div>
  );
};
