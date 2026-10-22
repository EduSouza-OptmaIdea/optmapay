import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAppMode } from '../context/AppModeContext';
import { useAuth } from '../context/AuthContext';
import {
  LayoutDashboard,
  QrCode,
  FileText,
  FileCheck2,
  CreditCard,
  User,
  GraduationCap,
  PiggyBank,
  Banknote,
  Crown,
} from 'lucide-react';

export const BottomNav: React.FC = () => {
  const { mode } = useAppMode();
  const { isSuperAdmin } = useAuth();

  const devMobileNavItems = [
    { to: '/dashboard', label: 'Início', icon: LayoutDashboard },
    { to: '/pix', label: 'Pix', icon: QrCode },
    { to: '/comprovantes', label: 'Recibos', icon: FileCheck2 },
    { to: '/boletos', label: 'Boletos', icon: FileText },
    { to: '/cartoes', label: 'Cartões', icon: CreditCard },
    ...(isSuperAdmin ? [{ to: '/master-admin/usuarios', label: 'Admin', icon: Crown }] : []),
    { to: '/meus-dados', label: 'Perfil', icon: User },
  ];

  const eduMobileNavItems = [
    { to: '/edu-dashboard', label: 'Learn', icon: GraduationCap },
    { to: '/comprovantes', label: 'Recibos', icon: FileCheck2 },
    { to: '/contas-a-pagar', label: 'Contas', icon: FileText },
    { to: '/investimentos', label: 'Poupança', icon: PiggyBank },
    { to: '/emprestimos', label: 'Crédito', icon: Banknote },
    { to: '/meus-dados', label: 'Perfil', icon: User },
  ];

  const items = mode === 'edu' ? eduMobileNavItems : devMobileNavItems;

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-[#0F172A]/95 backdrop-blur-lg border-t border-slate-200 dark:border-slate-800 px-1 py-1.5 flex items-center justify-around gap-0.5 shadow-lg">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex min-w-0 flex-1 flex-col items-center gap-1 py-1 px-1 rounded-xl transition text-[10px] font-semibold ${
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
