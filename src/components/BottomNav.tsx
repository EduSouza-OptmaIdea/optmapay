import React from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, QrCode, FileText, CreditCard, User } from 'lucide-react';

const mobileNavItems = [
  { to: '/dashboard', label: 'Início', icon: LayoutDashboard },
  { to: '/pix', label: 'Pix', icon: QrCode },
  { to: '/boletos', label: 'Boletos', icon: FileText },
  { to: '/cartoes', label: 'Cartões', icon: CreditCard },
  { to: '/meus-dados', label: 'Perfil', icon: User },
];

export const BottomNav: React.FC = () => {
  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-[#0F172A]/95 backdrop-blur-lg border-t border-slate-200 dark:border-slate-800 px-2 py-1.5 flex items-center justify-around shadow-lg">
      {mobileNavItems.map((item) => {
        const Icon = item.icon;
        return (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex flex-col items-center gap-1 py-1 px-3 rounded-xl transition text-[10px] font-semibold ${
                isActive
                  ? 'text-[#19A999] dark:text-[#19A999] font-bold'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`
            }
          >
            <Icon className="w-5 h-5" />
            <span>{item.label}</span>
          </NavLink>
        );
      })}
    </nav>
  );
};
