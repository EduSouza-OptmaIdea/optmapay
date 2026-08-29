import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  QrCode,
  FileText,
  CreditCard,
  ArrowLeftRight,
  Code2,
} from 'lucide-react';

const mobileNavItems = [
  { to: '/', label: 'Início', icon: LayoutDashboard },
  { to: '/pix', label: 'Pix', icon: QrCode },
  { to: '/boletos', label: 'Boletos', icon: FileText },
  { to: '/cartoes', label: 'Cartões', icon: CreditCard },
  { to: '/settlement', label: 'Vendas', icon: ArrowLeftRight },
  { to: '/dev', label: 'Dev', icon: Code2 },
];

export const BottomNav: React.FC = () => {
  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 flex items-center justify-around px-2 py-1.5 shadow-lg">
      {mobileNavItems.map((item) => {
        const Icon = item.icon;
        return (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg text-[10px] font-medium transition ${
                isActive
                  ? 'text-teal-600 dark:text-teal-400 font-bold'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`
            }
          >
            <Icon className="w-5 h-5 shrink-0" />
            <span>{item.label}</span>
          </NavLink>
        );
      })}
    </nav>
  );
};
