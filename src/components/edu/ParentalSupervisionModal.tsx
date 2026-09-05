import React, { useState } from 'react';
import { useAppMode } from '../../context/AppModeContext';
import {
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  X,
  Coins,
  Lock,
  CheckCircle2,
  AlertCircle,
  Sparkles,
} from 'lucide-react';

interface ParentalSupervisionModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ParentalSupervisionModal: React.FC<ParentalSupervisionModalProps> = ({
  isOpen,
  onClose,
}) => {
  const {
    isJuniorAccount,
    setIsJuniorAccount,
    guardianName,
    setGuardianName,
    parentalConsent,
    setParentalConsent,
    grantMesada,
  } = useAppMode();

  const [mesadaAmount, setMesadaAmount] = useState('50.00');
  const [mesadaReason, setMesadaReason] = useState('Mesada do Mês');
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleGrantMesada = async (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(mesadaAmount);
    if (isNaN(val) || val <= 0) return;

    try {
      await grantMesada(val, mesadaReason);
      setSuccessMsg(`Mesada de R$ ${val.toFixed(2)} liberada com sucesso para a conta do menor!`);
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: any) {
      alert(err.message || 'Falha ao injetar mesada.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white dark:bg-[#0F172A] w-full max-w-lg rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#29324E] via-[#1E293B] to-[#19A999] p-6 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-white/10 rounded-2xl border border-white/20">
              <UserCheck className="w-6 h-6 text-teal-300" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-base">Supervisão Parental & Escolar</h3>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-teal-500/20 text-teal-300 border border-teal-500/30">
                  Proteção de Menores
                </span>
              </div>
              <p className="text-xs text-slate-300">
                Governança, consentimento de responsável e liberação de mesada simulada
              </p>
            </div>
          </div>

          <button onClick={onClose} className="p-2 rounded-xl text-slate-300 hover:text-white hover:bg-white/10">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5 overflow-y-auto max-h-[75vh] text-xs">
          {successMsg && (
            <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-800 dark:text-emerald-300 font-bold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Regras Rígidas de Proteção e Dados Fictícios */}
          <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-900 dark:text-amber-200 space-y-2">
            <p className="font-bold flex items-center gap-1.5">
              <ShieldAlert className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              Regra de Ouro para Contas de Crianças e Jovens
            </p>
            <p className="text-[11px] leading-relaxed">
              O OptmaPay Sandbox é um ambiente de testes e educação financeira. <strong>Não solicitamos nem armazenamos CPFs, senhas reais ou dados sensíveis de menores</strong>. Todos os números de cartão, chaves Pix e moedas são 100% fictícios.
            </p>
          </div>

          {/* Termo de Consentimento do Adulto */}
          <div className="space-y-3 bg-slate-50 dark:bg-slate-900/60 p-4 rounded-2xl border border-slate-200 dark:border-slate-800">
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={parentalConsent}
                onChange={(e) => setParentalConsent(e.target.checked)}
                className="mt-0.5 rounded text-[#19A999] focus:ring-[#19A999] w-4 h-4"
              />
              <span className="text-[11px] text-slate-700 dark:text-slate-300 leading-snug">
                <strong>Consentimento Formal do Responsável / Professor:</strong> Confirmo que sou o responsável legal ou educador autorizado a orientar o menor nesta plataforma para fins puramente didáticos.
              </span>
            </label>

            <div>
              <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                Nome do Responsável / Educador Vinculado
              </label>
              <input
                type="text"
                value={guardianName}
                onChange={(e) => setGuardianName(e.target.value)}
                placeholder="Ex: Prof. Carlos Eduardo / Ana Lúcia (Mãe)"
                className="w-full p-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
              />
            </div>

            <div className="flex items-center justify-between pt-1">
              <span className="font-semibold text-slate-700 dark:text-slate-300">
                Ativar Modo Conta Júnior para Menor
              </span>
              <button
                type="button"
                onClick={() => setIsJuniorAccount(!isJuniorAccount)}
                className={`px-3 py-1 rounded-full font-bold text-[11px] transition ${
                  isJuniorAccount
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                }`}
              >
                {isJuniorAccount ? 'Ativado (Conta Júnior)' : 'Desativado'}
              </button>
            </div>
          </div>

          {/* Aporte de Mesada Didática */}
          <form onSubmit={handleGrantMesada} className="space-y-3 bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700">
            <h4 className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
              <Coins className="w-4 h-4 text-amber-500" />
              Injetar Mesada / Aporte Didático na Conta do Menor
            </h4>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-semibold text-slate-600 dark:text-slate-400 block mb-1">
                  Valor da Mesada (R$)
                </label>
                <input
                  type="number"
                  step="5"
                  min="5"
                  value={mesadaAmount}
                  onChange={(e) => setMesadaAmount(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 font-mono text-slate-900 dark:text-white"
                  required
                />
              </div>

              <div>
                <label className="font-semibold text-slate-600 dark:text-slate-400 block mb-1">
                  Motivo / Tarefa
                </label>
                <input
                  type="text"
                  value={mesadaReason}
                  onChange={(e) => setMesadaReason(e.target.value)}
                  placeholder="Ex: Mesada mensal, Lição cumprida"
                  className="w-full p-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-2.5 bg-gradient-to-r from-teal-600 to-[#19A999] hover:opacity-95 text-white font-bold rounded-xl shadow-md transition"
            >
              Liberar Mesada no Saldo Disponível
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
