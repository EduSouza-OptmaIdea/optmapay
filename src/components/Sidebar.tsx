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
} from 'lucide-react';

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/pix', label: 'Área Pix', icon: QrCode },
  { to: '/boletos', label: 'Boletos', icon: FileText },
  { to: '/cartoes', label: 'Cartões Virtuais', icon: CreditCard },
  { to: '/settlement', label: 'Simulador Vendas', icon: ArrowLeftRight },
  { to: '/dev', label: 'Painel Dev & Webhooks', icon: Code2 },
  { to: '/settings', label: 'Config & Reset', icon: Settings },
];

export const Sidebar: React.FC = () => {
  return (
    <aside className="hidden md:flex flex-col w-64 shrink-0 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 min-h-[calc(100vh-61px)] p-4">
      <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider px-3 mb-3">
        Navegação Principal
      </div>
      <nav className="flex flex-col gap-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition ${
                  isActive
                    ? 'bg-teal-600 text-white shadow-sm shadow-teal-900/20'
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
    </aside>
  );
};
