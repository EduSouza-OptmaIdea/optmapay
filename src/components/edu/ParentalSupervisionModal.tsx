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
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const acknowledgementReady = parentalConsent && guardianName.trim().length >= 2;

  if (!isOpen) return null;

  const handleGrantMesada = async (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(mesadaAmount);
    if (submitting) return;
    setErrorMsg(null);
    setSuccessMsg(null);
    if (!Number.isFinite(val) || val <= 0) {
      setErrorMsg('Informe um valor fictício válido.');
      return;
    }
    setSubmitting(true);
    try {
      const confirmed = await grantMesada(val, mesadaReason);
      if (!confirmed) throw new Error('Não foi possível confirmar a mesada simulada.');
      setSuccessMsg(`Mesada fictícia de R$ ${val.toFixed(2)} confirmada no extrato de simulação.`);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Falha ao registrar a mesada fictícia.');
    } finally {
      setSubmitting(false);
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
                Piloto familiar: acompanhamento do adulto e mesada exclusivamente fictícia
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
              O OptmaPay é um <strong>simulador educacional</strong>: saldos, cartões, Pix e mesadas não representam dinheiro real. Para o piloto familiar, utilize uma <strong>conta criada e operada pelo adulto</strong>. Não informe documentos, números de cartões reais, senhas bancárias ou dados pessoais de crianças nos campos da simulação.
            </p>
          </div>

          {/* Aviso local. NÃO substitui autenticação, vínculo ou consentimento legal verificável. */}
          <div className="space-y-3 bg-slate-50 dark:bg-slate-900/60 p-4 rounded-2xl border border-slate-200 dark:border-slate-800">
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={parentalConsent}
                onChange={(e) => setParentalConsent(e.target.checked)}
                className="mt-0.5 rounded text-[#19A999] focus:ring-[#19A999] w-4 h-4"
              />
              <span className="text-[11px] text-slate-700 dark:text-slate-300 leading-snug">
                <strong>Confirmação local de acompanhamento:</strong> Estou usando uma conta sob minha responsabilidade e acompanharei a atividade didática. Esta confirmação fica somente neste navegador e <strong>não verifica minha identidade nem cria vínculo legal de responsável</strong>.
              </span>
            </label>

            <div>
              <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                Apelido do adulto supervisor (sem nome completo)
              </label>
              <input
                type="text"
                value={guardianName}
                onChange={(e) => setGuardianName(e.target.value)}
                placeholder="Ex.: Mãe / Pai / Prof. responsável"
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
                disabled={!isJuniorAccount && !acknowledgementReady}
                className={`px-3 py-1 rounded-full font-bold text-[11px] transition disabled:opacity-40 disabled:cursor-not-allowed ${
                  isJuniorAccount
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                }`}
              >
                {isJuniorAccount ? 'Ativado (Conta Júnior)' : 'Desativado'}
              </button>
            </div>
          </div>

          {!acknowledgementReady && <p role="status" className="text-amber-700 dark:text-amber-200">Informe um apelido do adulto e marque a confirmação local para liberar o modo de demonstração júnior.</p>}

          {/* Aporte de Mesada Didática */}
          <form onSubmit={handleGrantMesada} className="space-y-3 bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700">
            <h4 className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
              <Coins className="w-4 h-4 text-amber-500" />
              Registrar mesada fictícia na conta familiar de teste
            </h4>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-semibold text-slate-600 dark:text-slate-400 block mb-1">
                  Valor da Mesada (R$)
                </label>
                <input
                  type="number"
                  step="0.01"
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

            <p className="text-[11px] text-slate-500 dark:text-slate-300">A operação segue as regras e possíveis tarifas fictícias do simulador. É registrada atomicamente no extrato; nenhuma transferência real será feita.</p>
            {errorMsg && <p role="alert" className="rounded-lg bg-rose-100 p-2 text-rose-800">{errorMsg}</p>}
            <button
              type="submit"
              disabled={submitting || !isJuniorAccount || !acknowledgementReady}
              className="w-full py-2.5 bg-gradient-to-r from-teal-600 to-[#19A999] hover:opacity-95 text-white font-bold rounded-xl shadow-md transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {submitting ? 'Confirmando mesada fictícia...' : 'Registrar mesada fictícia no saldo'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
