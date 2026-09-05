import React, { useState } from 'react';
import {
  FileCheck,
  X,
  Building2,
  HeartPulse,
  GraduationCap,
  Trees,
  Shield,
  HelpCircle,
  CheckCircle2,
  DollarSign,
} from 'lucide-react';

interface IrpfEduModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const IrpfEduModal: React.FC<IrpfEduModalProps> = ({ isOpen, onClose }) => {
  const [rendimentos, setRendimentos] = useState<number>(3600); // R$ 3.600 anual didático
  const [deducoes, setDeducoes] = useState<number>(600); // R$ 600 em material e cursos
  const [isDeclared, setIsDeclared] = useState<boolean>(false);

  if (!isOpen) return null;

  // Regra IRPF didática simplificada:
  // Base de Cálculo = Rendimentos - Deduções
  const baseCalculo = Math.max(0, rendimentos - deducoes);
  const limiteIsencao = 2500;
  const isento = baseCalculo <= limiteIsencao;
  const impostoDevido = isento ? 0 : Math.round((baseCalculo - limiteIsencao) * 0.075 * 100) / 100;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white dark:bg-[#0F172A] w-full max-w-lg rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#29324E] via-[#1E293B] to-[#7B2D8E] p-6 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-500/20 text-amber-300 rounded-2xl border border-amber-500/30">
              <FileCheck className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-base">Declaração de IRPF Mirim</h3>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-teal-500/20 text-teal-300 border border-teal-500/30">
                  Didático Fictício
                </span>
              </div>
              <p className="text-xs text-slate-300">
                Aprenda para que servem os tributos e como funciona a declaração de renda
              </p>
            </div>
          </div>

          <button onClick={onClose} className="p-2 rounded-xl text-slate-300 hover:text-white hover:bg-white/10">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5 overflow-y-auto max-h-[75vh] text-xs">
          {isDeclared ? (
            /* Tela de Recibo */
            <div className="text-center py-6 space-y-4">
              <div className="w-16 h-16 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-10 h-10" />
              </div>

              <div>
                <h4 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  Declaração IRPF Mirim Entregue com Sucesso!
                </h4>
                <p className="text-slate-500 mt-1">
                  Recibo nº <strong className="font-mono text-slate-800 dark:text-slate-200">IRPF-2026-{Math.floor(100000 + Math.random() * 900000)}</strong>
                </p>
              </div>

              <div className="bg-slate-50 dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 text-left font-mono space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-slate-500">Rendimento Anual Declarado:</span>
                  <span>R$ {rendimentos.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Deduções de Material/Cursos:</span>
                  <span>- R$ {deducoes.toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-bold text-slate-800 dark:text-slate-100 border-t border-slate-200 dark:border-slate-700 pt-1">
                  <span>Situação Tributária:</span>
                  <span className={isento ? 'text-emerald-600' : 'text-purple-600'}>
                    {isento ? 'ISENTO DE IMPOSTO' : `IMPOSTO DEVIDO: R$ ${impostoDevido.toFixed(2)}`}
                  </span>
                </div>
              </div>

              <button
                onClick={() => setIsDeclared(false)}
                className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold rounded-xl"
              >
                Voltar à Simulação
              </button>
            </div>
          ) : (
            /* Formulário Didático */
            <>
              <div className="space-y-3">
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Total de Rendimentos do Ano (Mesada + Trabalhos Escolares)
                  </label>
                  <input
                    type="number"
                    step="100"
                    value={rendimentos}
                    onChange={(e) => setRendimentos(Math.max(0, Number(e.target.value)))}
                    className="w-full p-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Deduções Permitidas (Cursos, Livros e Materiais)
                  </label>
                  <input
                    type="number"
                    step="50"
                    value={deducoes}
                    onChange={(e) => setDeducoes(Math.max(0, Number(e.target.value)))}
                    className="w-full p-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              {/* Resultado do Cálculo */}
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 space-y-2">
                <div className="flex justify-between">
                  <span className="text-slate-500">Base de Cálculo:</span>
                  <span className="font-mono font-bold">R$ {baseCalculo.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Faixa de Isenção Didática:</span>
                  <span className="font-mono text-emerald-600 font-bold">Até R$ {limiteIsencao.toFixed(2)}</span>
                </div>
                <div className="flex justify-between border-t border-slate-200 dark:border-slate-700 pt-2 font-bold text-sm">
                  <span>Resultado da Declaração:</span>
                  <span className={isento ? 'text-emerald-600' : 'text-purple-600'}>
                    {isento ? 'Isento (Sem Imposto a Pagar)' : `R$ ${impostoDevido.toFixed(2)} a Recolher`}
                  </span>
                </div>
              </div>

              {/* Para onde vão os tributos? */}
              <div className="space-y-2 pt-1">
                <h4 className="font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider text-[11px]">
                  Para onde vão os tributos recolhidos na sociedade?
                </h4>

                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div className="p-2.5 bg-emerald-50 dark:bg-emerald-950/40 rounded-xl border border-emerald-200 dark:border-emerald-800 flex items-center gap-2">
                    <HeartPulse className="w-4 h-4 text-emerald-500 shrink-0" />
                    <span>Hospitais & Postos de Saúde (SUS)</span>
                  </div>
                  <div className="p-2.5 bg-blue-50 dark:bg-blue-950/40 rounded-xl border border-blue-200 dark:border-blue-800 flex items-center gap-2">
                    <GraduationCap className="w-4 h-4 text-blue-500 shrink-0" />
                    <span>Escolas e Faculdades Públicas</span>
                  </div>
                  <div className="p-2.5 bg-amber-50 dark:bg-amber-950/40 rounded-xl border border-amber-200 dark:border-amber-800 flex items-center gap-2">
                    <Trees className="w-4 h-4 text-amber-500 shrink-0" />
                    <span>Parques e Limpeza Urbana</span>
                  </div>
                  <div className="p-2.5 bg-purple-50 dark:bg-purple-950/40 rounded-xl border border-purple-200 dark:border-purple-800 flex items-center gap-2">
                    <Shield className="w-4 h-4 text-purple-500 shrink-0" />
                    <span>Iluminação e Segurança</span>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsDeclared(true)}
                className="w-full py-3 bg-[#7B2D8E] hover:bg-[#682479] text-white font-bold rounded-2xl shadow-lg shadow-purple-900/20 transition"
              >
                Transmitir Declaração Fictícia
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
