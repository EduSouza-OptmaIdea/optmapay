import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { SandboxBoleto } from '../types/sandbox';
import { triggerWebhookEvents } from '../lib/webhookEngine';
import { FileText, Plus, CheckCircle, Clock, Copy, Check } from 'lucide-react';

export const BoletosArea: React.FC = () => {
  const { activeAccount, accounts, refreshAccounts } = useAuth();
  const [boletos, setBoletos] = useState<SandboxBoleto[]>([]);
  const [loading, setLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Form State
  const [amount, setAmount] = useState('250.00');
  const [dueDate, setDueDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().split('T')[0];
  });
  const [payerName, setPayerName] = useState('Carlos Eduardo Silva');
  const [payerCpf, setPayerCpf] = useState('123.456.789-00');
  const [externalRef, setExternalRef] = useState('DUP-2026-881');

  // Settle State
  const [settlingId, setSettlingId] = useState<string | null>(null);
  const [settlePayerId, setSettlePayerId] = useState<string>('');

  const fetchBoletos = async () => {
    if (!activeAccount) return;
    setLoading(true);
    const { data } = await supabase
      .from('boletos')
      .select('*')
      .eq('account_id', activeAccount.id)
      .order('created_at', { ascending: false });

    setBoletos((data || []) as SandboxBoleto[]);
    setLoading(false);
  };

  useEffect(() => {
    fetchBoletos();
  }, [activeAccount]);

  const handleCreateBoleto = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeAccount) return;
    const val = parseFloat(amount);
    if (isNaN(val) || val <= 0) return;

    const barcode = `23793${Math.floor(100000000000000000000000000000000 + Math.random() * 900000000000000000000000000000000)}`;
    const linha = `${barcode.slice(0, 5)}.${barcode.slice(5, 10)} ${barcode.slice(10, 15)}.${barcode.slice(15, 21)} ${barcode.slice(21, 26)}.${barcode.slice(26, 32)} ${barcode.slice(32, 33)} ${barcode.slice(33)}`;

    await supabase.from('boletos').insert({
      user_id: activeAccount.user_id || null,
      account_id: activeAccount.id,
      amount: val,
      due_date: dueDate,
      barcode,
      linha_digitavel: linha,
      status: 'pending',
      payer_name: payerName,
      payer_cpf: payerCpf,
      external_reference: externalRef,
    });

    setIsModalOpen(false);
    await fetchBoletos();
  };

  const handleSettleBoleto = async (boleto: SandboxBoleto) => {
    if (!activeAccount) return;
    if (!settlePayerId) {
      alert('Selecione qual conta de cliente efetuará o pagamento do boleto.');
      return;
    }

    setSettlingId(boleto.id);
    try {
      const { data, error } = await supabase.rpc('settle_boleto', {
        p_boleto_id: boleto.id,
        p_payer_account_id: settlePayerId,
      });

      if (error) throw new Error(error.message);

      // Trigger Webhooks
      await triggerWebhookEvents({
        userId: activeAccount.user_id,
        accountId: activeAccount.id,
        event: 'boleto.paid',
        payloadData: {
          boletoId: boleto.id,
          barcode: boleto.barcode,
          externalReference: boleto.external_reference,
          amount: boleto.amount,
          status: 'paid',
          payerName: boleto.payer_name,
          realMoney: false,
          environment: 'sandbox',
        },
      });

      await refreshAccounts();
      await fetchBoletos();
      alert('✅ Boleto quitado com sucesso e Webhooks disparados!');
    } catch (err: any) {
      alert(`❌ Erro ao quitar boleto: ${err.message}`);
    } finally {
      setSettlingId(null);
    }
  };

  const copyLinha = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  if (!activeAccount) return null;

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <FileText className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            Cobrança por Boleto Bancário (Fictício)
          </h1>
          <p className="text-xs text-slate-500">
            Gerenciador de boletos simulados com linha digitável e liquidação automatizada
          </p>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="py-2 px-4 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl transition flex items-center gap-1.5 shadow-md shadow-blue-900/20"
        >
          <Plus className="w-4 h-4" />
          <span>Emitir Novo Boleto</span>
        </button>
      </div>

      {/* Lista de Boletos */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-5 space-y-4 shadow-sm">
        {boletos.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-xs border border-dashed border-slate-200 dark:border-slate-700 rounded-xl">
            Nenhum boleto emitido nesta conta ainda. Clique em "Emitir Novo Boleto" acima!
          </div>
        ) : (
          <div className="space-y-3">
            {boletos.map((bol) => {
              const isPaid = bol.status === 'paid';
              return (
                <div
                  key={bol.id}
                  className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-700 space-y-3"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-slate-800 dark:text-slate-100">
                          {bol.payer_name}
                        </span>
                        <span
                          className={`px-2 py-0.5 text-[10px] font-bold rounded-full uppercase ${
                            isPaid
                              ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                              : 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300'
                          }`}
                        >
                          {isPaid ? 'PAGO' : 'PENDENTE'}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500">
                        CPF/CNPJ: {bol.payer_cpf} • Vencimento: {new Date(bol.due_date).toLocaleDateString('pt-BR')} • Ref: {bol.external_reference || 'N/A'}
                      </p>
                    </div>

                    <div className="text-right">
                      <p className="text-base font-extrabold text-slate-900 dark:text-slate-100">
                        R$ {bol.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-2 font-mono text-[11px] text-slate-600 dark:text-slate-400 bg-white dark:bg-slate-800 p-2 rounded-lg border border-slate-200 dark:border-slate-700 w-full sm:w-auto overflow-x-auto">
                      <span className="truncate">{bol.linha_digitavel}</span>
                      <button
                        onClick={() => copyLinha(bol.id, bol.linha_digitavel)}
                        className="text-slate-400 hover:text-teal-600 shrink-0 ml-1"
                        title="Copiar linha digitável"
                      >
                        {copiedId === bol.id ? <Check className="w-3.5 h-3.5 text-teal-600" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>

                    {!isPaid && (
                      <div className="flex items-center gap-2 w-full sm:w-auto">
                        <select
                          value={settlePayerId}
                          onChange={(e) => setSettlePayerId(e.target.value)}
                          className="px-2 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs"
                        >
                          <option value="">Selecione o pagador...</option>
                          {accounts.map((acc) => (
                            <option key={acc.id} value={acc.id}>
                              {acc.name} (R$ {acc.balance.toFixed(2)})
                            </option>
                          ))}
                        </select>

                        <button
                          onClick={() => handleSettleBoleto(bol)}
                          disabled={settlingId === bol.id}
                          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg transition text-xs shrink-0 shadow-sm"
                        >
                          {settlingId === bol.id ? 'Quitando...' : 'Quitar Boleto'}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal Emitir Boleto */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-slate-200 dark:border-slate-700">
            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">
              Emitir Novo Boleto Fictício
            </h3>

            <form onSubmit={handleCreateBoleto} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  Nome do Pagador
                </label>
                <input
                  type="text"
                  value={payerName}
                  onChange={(e) => setPayerName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  CPF / CNPJ do Pagador
                </label>
                <input
                  type="text"
                  value={payerCpf}
                  onChange={(e) => setPayerCpf(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-mono"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                    Valor (R$)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-mono font-bold"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                    Vencimento
                  </label>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  Referência Externa / Duplicata ID
                </label>
                <input
                  type="text"
                  value={externalRef}
                  onChange={(e) => setExternalRef(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-mono"
                  required
                />
              </div>

              <div className="flex gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 py-2 rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold hover:bg-slate-200 transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold hover:bg-blue-500 transition shadow-md shadow-blue-900/20"
                >
                  Emitir Boleto
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
