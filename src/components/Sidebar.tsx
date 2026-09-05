import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAppMode } from '../context/AppModeContext';
import {
  LayoutDashboard,
  QrCode,
  FileText,
  CreditCard,
  ArrowLeftRight,
  Code2,
  Settings,
  User,
  GraduationCap,
  PiggyBank,
  Banknote,
  Compass,
  CheckCircle2,
  Landmark,
  Crown,
} from 'lucide-react';

import { useAuth } from '../context/AuthContext';

export const Sidebar: React.FC = () => {
  const { mode, score, isNegativado } = useAppMode();
  const { isSuperAdmin } = useAuth();

  const devNavItems = [
    { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/pix', label: 'Área Pix', icon: QrCode },
    { to: '/boletos', label: 'Boletos', icon: FileText },
    { to: '/cartoes', label: 'Cartões Virtuais', icon: CreditCard },
    { to: '/settlement', label: 'Simulador Vendas', icon: ArrowLeftRight },
    { to: '/dev', label: 'Painel Dev & Webhooks', icon: Code2 },
    { to: '/meus-dados', label: 'Meus Dados', icon: User },
    ...(isSuperAdmin
      ? [
          { to: '/master-admin', label: 'Console Super Admin', icon: Crown },
          { to: '/config-banco', label: 'Parâmetros do Banco', icon: Landmark },
        ]
      : []),
    { to: '/settings', label: 'Config & Exclusão', icon: Settings },
  ];

  const eduNavItems = [
    { to: '/edu-dashboard', label: 'Início Educacional', icon: GraduationCap },
    { to: '/contas-a-pagar', label: 'Contas a Pagar', icon: FileText },
    { to: '/investimentos', label: 'Poupança & Cofrinhos', icon: PiggyBank },
    { to: '/emprestimos', label: 'Empréstimos Conscientes', icon: Banknote },
    { to: '/cenarios', label: 'Cenários do Cotidiano', icon: Compass },
    { to: '/cartoes', label: 'Cartões Didáticos', icon: CreditCard },
    { to: '/dashboard', label: 'Extrato & Saldo', icon: LayoutDashboard },
    { to: '/meus-dados', label: 'Meus Dados', icon: User },
    { to: '/settings', label: 'Configurações', icon: Settings },
  ];

  const currentNav = mode === 'edu' ? eduNavItems : devNavItems;

  return (
    <aside className="hidden md:flex flex-col w-64 shrink-0 bg-white dark:bg-[#0F172A] border-r border-slate-200 dark:border-slate-800 min-h-[calc(100vh-61px)] p-4">
      <div className="flex items-center justify-between px-3 mb-3">
        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider font-sans">
          {mode === 'edu' ? 'OptmaPay Educação' : 'Internet Banking Dev'}
        </span>
        {mode === 'edu' && (
          <span
            className={`text-[9px] font-extrabold px-2 py-0.5 rounded-full ${
              isNegativado
                ? 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
                : 'bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300'
            }`}
          >
            {score} pts
          </span>
        )}
      </div>

      <nav className="flex flex-col gap-1">
        {currentNav.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition ${
                  isActive
                    ? mode === 'edu'
                      ? 'bg-gradient-to-r from-[#19A999] to-teal-600 text-white shadow-sm shadow-[#19A999]/20 font-bold'
                      : 'bg-[#19A999] text-white shadow-sm shadow-[#19A999]/20 font-bold'
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
