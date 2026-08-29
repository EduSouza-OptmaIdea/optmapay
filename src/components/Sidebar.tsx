import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  QrCode,
  FileText,
  CreditCard,
  ArrowLeftRight,
  Code2,
  Settings,
  User,
} from 'lucide-react';

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/pix', label: 'Área Pix', icon: QrCode },
  { to: '/boletos', label: 'Boletos', icon: FileText },
  { to: '/cartoes', label: 'Cartões Virtuais', icon: CreditCard },
  { to: '/settlement', label: 'Simulador Vendas', icon: ArrowLeftRight },
  { to: '/dev', label: 'Painel Dev & Webhooks', icon: Code2 },
  { to: '/meus-dados', label: 'Meus Dados', icon: User },
  { to: '/settings', label: 'Config & Reset', icon: Settings },
];

export const Sidebar: React.FC = () => {
  return (
    <aside className="hidden md:flex flex-col w-64 shrink-0 bg-white dark:bg-[#0F172A] border-r border-slate-200 dark:border-slate-800 min-h-[calc(100vh-61px)] p-4">
      <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider px-3 mb-3 font-sans">
        Internet Banking Sandbox
      </div>
      <nav className="flex flex-col gap-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition ${
                  isActive
                    ? 'bg-[#19A999] text-white shadow-sm shadow-[#19A999]/20 font-bold'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
                }`
              }
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </nav>

      {/* Footer copyright */}
      <div className="mt-auto pt-6 text-[10px] text-slate-400 px-3 space-y-1">
        <p>© OptmaIdea 2026</p>
        <p className="text-[9px] text-slate-500">Direitos reservados.</p>
      </div>
    </aside>
  );
};
