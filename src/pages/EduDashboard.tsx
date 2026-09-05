import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useAppMode } from '../context/AppModeContext';
import { Link } from 'react-router-dom';
import { ScoreEduCard } from '../components/edu/ScoreEduCard';
import { IrpfEduModal } from '../components/edu/IrpfEduModal';
import { ParentalSupervisionModal } from '../components/edu/ParentalSupervisionModal';
import {
  GraduationCap,
  PiggyBank,
  FileText,
  Banknote,
  Compass,
  FileCheck,
  ShieldCheck,
  Sparkles,
  UserCheck,
  ArrowRight,
  TrendingUp,
  AlertTriangle,
} from 'lucide-react';

export const EduDashboard: React.FC = () => {
  const { activeAccount } = useAuth();
  const {
    isJuniorAccount,
    guardianName,
    bills,
    cofrinhos,
    loans,
    score,
    isNegativado,
  } = useAppMode();

  const [isIrpfOpen, setIsIrpfOpen] = useState(false);
  const [isParentalOpen, setIsParentalOpen] = useState(false);

  const pendingBillsCount = bills.filter((b) => b.status !== 'paid').length;
  const overdueBillsCount = bills.filter((b) => b.status === 'overdue').length;
  const totalInCofrinhos = cofrinhos.reduce((acc, c) => acc + c.currentAmount, 0);

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Top Banner de Boas-Vindas Educacional */}
      <div className="bg-gradient-to-r from-[#29324E] via-[#1E293B] to-[#1367A2] p-6 sm:p-7 rounded-3xl text-white shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-white/10 rounded-2xl backdrop-blur-sm border border-white/20">
              <GraduationCap className="w-8 h-8 text-teal-300" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-black">OptmaPay Educação Financeira</h1>
                {isJuniorAccount && (
                  <span className="text-[10px] font-extrabold px-2.5 py-0.5 rounded-full bg-teal-400/20 text-teal-300 border border-teal-400/30">
                    Conta Júnior
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                Olá, <strong>{activeAccount?.name || 'Aluno'}</strong>! Aprenda a administrar sua conta, poupar e investir com consciência.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsParentalOpen(true)}
              className="py-2.5 px-4 bg-white/10 hover:bg-white/20 text-white font-bold text-xs rounded-2xl transition border border-white/20 flex items-center gap-1.5"
            >
              <UserCheck className="w-4 h-4 text-teal-300" />
              <span>Supervisão do Adulto</span>
            </button>

            <button
              onClick={() => setIsIrpfOpen(true)}
              className="py-2.5 px-4 bg-[#7B2D8E] hover:bg-[#6b257c] text-white font-bold text-xs rounded-2xl transition shadow-md flex items-center gap-1.5"
            >
              <FileCheck className="w-4 h-4 text-amber-300" />
              <span>IRPF Mirim</span>
            </button>
          </div>
        </div>

        {/* Notificação de Guardião */}
        <div className="p-3 bg-white/5 rounded-2xl border border-white/10 text-xs text-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-[#19A999] shrink-0" />
            <span>
              Tutor Responsável: <strong>{guardianName}</strong> • Ambiente 100% didático com valores fictícios.
            </span>
          </div>
          <span className="text-[11px] text-teal-300 font-mono">
            {isNegativado ? '⚠️ Pendência de Regularização' : '✅ Hábitos Saudáveis'}
          </span>
        </div>
      </div>

      {/* Cards de Atalhos Principais com Metáforas Visuais */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Contas a Pagar */}
        <Link
          to="/contas-a-pagar"
          className="bg-white dark:bg-slate-800 p-5 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm hover:border-[#F1613A] transition group space-y-3"
        >
          <div className="flex items-center justify-between">
            <div className="p-2.5 rounded-2xl bg-amber-500/10 text-amber-500 group-hover:scale-110 transition">
              <FileText className="w-6 h-6" />
            </div>
            <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-[#F1613A] transition" />
          </div>

          <div>
            <p className="font-bold text-slate-900 dark:text-slate-100 text-sm">Contas a Pagar</p>
            <p className="text-xs text-slate-500 mt-0.5">
              {pendingBillsCount} pendente(s) {overdueBillsCount > 0 && `(${overdueBillsCount} vencida!)`}
            </p>
          </div>
        </Link>

        {/* Poupança & Cofrinhos */}
        <Link
          to="/investimentos"
          className="bg-white dark:bg-slate-800 p-5 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm hover:border-[#19A999] transition group space-y-3"
        >
          <div className="flex items-center justify-between">
            <div className="p-2.5 rounded-2xl bg-teal-500/10 text-teal-500 group-hover:scale-110 transition">
              <PiggyBank className="w-6 h-6" />
            </div>
            <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-[#19A999] transition" />
          </div>

          <div>
            <p className="font-bold text-slate-900 dark:text-slate-100 text-sm">Poupança & Cofrinhos</p>
            <p className="text-xs text-slate-500 mt-0.5">
              R$ {totalInCofrinhos.toFixed(2)} guardados em {cofrinhos.length} meta(s)
            </p>
          </div>
        </Link>

        {/* Empréstimos Conscientes */}
        <Link
          to="/emprestimos"
          className="bg-white dark:bg-slate-800 p-5 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm hover:border-[#7B2D8E] transition group space-y-3"
        >
          <div className="flex items-center justify-between">
            <div className="p-2.5 rounded-2xl bg-purple-500/10 text-purple-500 group-hover:scale-110 transition">
              <Banknote className="w-6 h-6" />
            </div>
            <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-[#7B2D8E] transition" />
          </div>

          <div>
            <p className="font-bold text-slate-900 dark:text-slate-100 text-sm">Empréstimos Conscientes</p>
            <p className="text-xs text-slate-500 mt-0.5">
              {loans.filter((l) => l.status === 'active').length} ativo(s) • Taxas e Amortização
            </p>
          </div>
        </Link>

        {/* Desafios do Dia a Dia */}
        <Link
          to="/cenarios"
          className="bg-white dark:bg-slate-800 p-5 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm hover:border-[#1367A2] transition group space-y-3"
        >
          <div className="flex items-center justify-between">
            <div className="p-2.5 rounded-2xl bg-blue-500/10 text-blue-500 group-hover:scale-110 transition">
              <Compass className="w-6 h-6" />
            </div>
            <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-[#1367A2] transition" />
          </div>

          <div>
            <p className="font-bold text-slate-900 dark:text-slate-100 text-sm">Cenários da Vida Real</p>
            <p className="text-xs text-slate-500 mt-0.5">
              Simulações e desafios de tomada de decisão
            </p>
          </div>
        </Link>
      </div>

      {/* Seção Central: Score Didático e Dicas Práticas */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7">
          <ScoreEduCard />
        </div>

        <div className="lg:col-span-5 space-y-4">
          <div className="bg-gradient-to-br from-teal-500/10 via-sky-500/5 to-transparent rounded-3xl border border-teal-500/20 p-6 space-y-3">
            <div className="flex items-center gap-2 text-teal-800 dark:text-teal-200 font-bold text-sm">
              <Sparkles className="w-5 h-5 text-teal-500" />
              <span>Pilares da Boa Educação Financeira</span>
            </div>

            <ul className="space-y-2.5 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              <li className="flex items-start gap-2">
                <span className="font-bold text-teal-500 font-mono">1.</span>
                <span><strong>Gaste menos do que ganha:</strong> viva um degrau abaixo para sempre conseguir poupar.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="font-bold text-teal-500 font-mono">2.</span>
                <span><strong>Pague suas contas antes do vencimento:</strong> evite juros de mora e proteja seu Score.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="font-bold text-teal-500 font-mono">3.</span>
                <span><strong>Crie sua Reserva de Emergência:</strong> ela é o escudo que impede você de recorrer a empréstimos caros em imprevistos.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="font-bold text-teal-500 font-mono">4.</span>
                <span><strong>Invista no longo prazo:</strong> os juros compostos multiplicam seu esforço ao longo dos anos.</span>
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* Modais */}
      <IrpfEduModal isOpen={isIrpfOpen} onClose={() => setIsIrpfOpen(false)} />
      <ParentalSupervisionModal isOpen={isParentalOpen} onClose={() => setIsParentalOpen(false)} />
    </div>
  );
};
