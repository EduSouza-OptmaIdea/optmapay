import React, { createContext, useContext, useState, useEffect } from 'react';
import { useAuth } from './AuthContext';
import { supabase } from '../lib/supabase';

export type AppMode = 'dev' | 'edu';

export interface EduBill {
  id: string;
  title: string;
  category: 'energia' | 'agua' | 'internet' | 'moradia' | 'educacao' | 'outros';
  amount: number;
  dueDate: string; // YYYY-MM-DD
  status: 'pending' | 'paid' | 'overdue';
  barcode: string;
  linhaDigitavel: string;
  lateFeePercent: number; // 2%
  dailyInterestRate: number; // 0.033% ao dia (1% a.m.)
  paidAt?: string;
}

export interface CofrinhoGoal {
  id: string;
  title: string;
  category: string;
  targetAmount: number;
  currentAmount: number;
  icon: string;
  monthlyYieldPercent: number; // ex: 0.5% a.m. (poupança) ou 1.0% a.m. (CDB)
  createdAt: string;
}

export interface EduLoan {
  id: string;
  title: string;
  purpose: string;
  principalAmount: number;
  totalWithInterest: number;
  installmentsTotal: number;
  installmentsPaid: number;
  installmentAmount: number;
  monthlyInterestRate: number;
  nextDueDate: string;
  status: 'active' | 'paid' | 'overdue';
  createdAt: string;
}

export interface ScoreEvent {
  id: string;
  date: string;
  description: string;
  points: number; // +25, -50, etc.
  type: 'positive' | 'negative' | 'neutral';
}

export interface EduLifeScenario {
  id: string;
  title: string;
  category: 'imprevisto' | 'oportunidade' | 'planejamento';
  description: string;
  options: {
    label: string;
    description: string;
    impactType: 'balance' | 'cofrinho' | 'loan' | 'none';
    amountChange: number; // ex: -40, +100
    scoreChange: number; // ex: +15, -30
    lesson: string;
  }[];
  resolved?: boolean;
  selectedOptionIndex?: number;
}

interface AppModeContextType {
  mode: AppMode;
  setMode: (mode: AppMode) => void;
  toggleMode: () => void;

  // Governança e Perfil do Aluno / Menor
  isJuniorAccount: boolean;
  setIsJuniorAccount: (val: boolean) => void;
  guardianName: string;
  setGuardianName: (name: string) => void;
  parentalConsent: boolean;
  setParentalConsent: (val: boolean) => void;

  // Score & Situação Cadastral (Negativação)
  score: number;
  isNegativado: boolean;
  scoreHistory: ScoreEvent[];
  renegotiateDebt: () => void;

  // Contas a Pagar
  bills: EduBill[];
  payBill: (billId: string) => Promise<boolean>;
  addBill: (bill: Omit<EduBill, 'id' | 'status' | 'barcode' | 'linhaDigitavel' | 'lateFeePercent' | 'dailyInterestRate'>) => void;

  // Poupança & Cofrinhos
  cofrinhos: CofrinhoGoal[];
  createCofrinho: (title: string, targetAmount: number, icon?: string, monthlyYieldPercent?: number) => void;
  depositToCofrinho: (cofrinhoId: string, amount: number) => Promise<boolean>;
  withdrawFromCofrinho: (cofrinhoId: string, amount: number) => Promise<boolean>;

  // Empréstimos Conscientes
  loans: EduLoan[];
  applyForLoan: (principal: number, installments: number, rate: number, purpose: string) => Promise<boolean>;
  payLoanInstallment: (loanId: string) => Promise<boolean>;

  // Cenários do Cotidiano (Economia Mirim)
  scenarios: EduLifeScenario[];
  resolveScenario: (scenarioId: string, optionIndex: number) => Promise<void>;

  // Aporte / Mesada do Guardião
  grantMesada: (amount: number, reason: string) => Promise<boolean>;
}

const AppModeContext = createContext<AppModeContextType | undefined>(undefined);

// Contas a Pagar Didáticas Padrão
const INITIAL_BILLS: EduBill[] = [
  {
    id: 'bill-1',
    title: 'Energia Elétrica (Enel / Luz da Casa)',
    category: 'energia',
    amount: 115.40,
    dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    status: 'pending',
    barcode: '8460000000111540010901112233445566778899',
    linhaDigitavel: '84600.00000 11154.001090 11122.334455 6 67788990000',
    lateFeePercent: 2.0,
    dailyInterestRate: 0.033,
  },
  {
    id: 'bill-2',
    title: 'Internet Fibra 300MB',
    category: 'internet',
    amount: 89.90,
    dueDate: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    status: 'pending',
    barcode: '8460000000208990010902223344556677889900',
    linhaDigitavel: '84600.00000 20899.001090 22233.445566 7 78899000000',
    lateFeePercent: 2.0,
    dailyInterestRate: 0.033,
  },
  {
    id: 'bill-3',
    title: 'Água e Esgoto (Sabesp)',
    category: 'agua',
    amount: 64.20,
    dueDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // Atrasada!
    status: 'overdue',
    barcode: '8460000000306420010903334455667788990011',
    linhaDigitavel: '84600.00000 30642.001090 33344.556677 8 89900110000',
    lateFeePercent: 2.0,
    dailyInterestRate: 0.033,
  },
];

// Cofrinhos Didáticos Padrão
const INITIAL_COFRINHOS: CofrinhoGoal[] = [
  {
    id: 'cof-1',
    title: 'Reserva de Emergência',
    category: 'Segurança Financeira',
    targetAmount: 500.00,
    currentAmount: 180.00,
    icon: '🛡️',
    monthlyYieldPercent: 0.5,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'cof-2',
    title: 'Bicicleta / Patinete Novo',
    category: 'Sonho / Objetivo',
    targetAmount: 850.00,
    currentAmount: 320.00,
    icon: '🚲',
    monthlyYieldPercent: 0.7,
    createdAt: new Date().toISOString(),
  },
];

// Cenários da Vida Real Didáticos
const INITIAL_SCENARIOS: EduLifeScenario[] = [
  {
    id: 'sc-1',
    title: 'Pneu da Bicicleta Furado no Caminho da Escola',
    category: 'imprevisto',
    description: 'Você estava indo para a aula e o pneu da sua bike furou. O conserto na bicicletaria do bairro custa R$ 35,00. Como você deseja pagar?',
    options: [
      {
        label: 'Usar a Reserva do Cofrinho',
        description: 'Você tinha guardado dinheiro para emergências. Usa R$ 35 da reserva sem se endividar.',
        impactType: 'cofrinho',
        amountChange: -35,
        scoreChange: +20,
        lesson: 'Excelente! É exatamente para isso que serve uma Reserva de Emergência: imprevistos sem juros!',
      },
      {
        label: 'Pagar com o Saldo da Conta Corrente',
        description: 'Debita diretamente do saldo disponível da conta.',
        impactType: 'balance',
        amountChange: -35,
        scoreChange: +5,
        lesson: 'Bom, você pagou à vista com o seu dinheiro e não entrou em dívidas.',
      },
      {
        label: 'Pedir Empréstimo com Juros no Banco',
        description: 'Pega R$ 35 emprestado pagando juros de 5% ao mês.',
        impactType: 'loan',
        amountChange: +35,
        scoreChange: -15,
        lesson: 'Atenção! Pegar empréstimo para pequenos gastos cotidianos faz você pagar juros desnecessários.',
      },
    ],
  },
  {
    id: 'sc-2',
    title: 'Bônus por Projeto Escolar ou Ajuda na Feira',
    category: 'oportunidade',
    description: 'Você realizou um trabalho extra no fim de semana e recebeu R$ 120,00 de remuneração. O que você faz com essa quantia extra?',
    options: [
      {
        label: 'Guardar 50% no Cofrinho e 50% para Lazer',
        description: 'Aplica a Regra de Ouro: R$ 60 guardados para o futuro e R$ 60 para aproveitar o momento.',
        impactType: 'balance',
        amountChange: +120,
        scoreChange: +30,
        lesson: 'Perfeito! Equilíbrio financeiro significa saber poupar sem deixar de aproveitar a vida com consciência.',
      },
      {
        label: 'Gastar Tudo em Jogos e Lanches Hoje',
        description: 'Consome os R$ 120 no mesmo dia em guloseimas e itens cosméticos de jogos.',
        impactType: 'balance',
        amountChange: +120,
        scoreChange: -10,
        lesson: 'Cuidado com o consumo por impulso. Quando o dinheiro acaba no primeiro dia, falta para o resto do mês.',
      },
    ],
  },
];

export const AppModeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { activeAccount, refreshAccounts } = useAuth();

  // Modo: 'dev' ou 'edu'
  const [mode, setModeState] = useState<AppMode>(() => {
    return (localStorage.getItem('optmapay_app_mode') as AppMode) || 'dev';
  });

  // Governança de Menor
  const [isJuniorAccount, setIsJuniorAccountState] = useState<boolean>(() => {
    return localStorage.getItem('optmapay_is_junior') === 'true';
  });
  const [guardianName, setGuardianNameState] = useState<string>(() => {
    return localStorage.getItem('optmapay_guardian_name') || 'Prof. Responsável / Guardião';
  });
  const [parentalConsent, setParentalConsentState] = useState<boolean>(() => {
    return localStorage.getItem('optmapay_parental_consent') !== 'false';
  });

  // Score Didático (0 a 1000)
  const [score, setScore] = useState<number>(() => {
    const saved = localStorage.getItem('optmapay_edu_score');
    return saved ? parseInt(saved, 10) : 690;
  });

  const [scoreHistory, setScoreHistory] = useState<ScoreEvent[]>(() => {
    const saved = localStorage.getItem('optmapay_score_history');
    if (saved) {
      try { return JSON.parse(saved); } catch {}
    }
    return [
      { id: '1', date: new Date().toLocaleDateString('pt-BR'), description: 'Abertura de Conta Educacional Sandbox', points: +50, type: 'positive' },
    ];
  });

  // Contas a Pagar
  const [bills, setBills] = useState<EduBill[]>(() => {
    const saved = localStorage.getItem('optmapay_edu_bills');
    if (saved) {
      try { return JSON.parse(saved); } catch {}
    }
    return INITIAL_BILLS;
  });

  // Cofrinhos
  const [cofrinhos, setCofrinhos] = useState<CofrinhoGoal[]>(() => {
    const saved = localStorage.getItem('optmapay_edu_cofrinhos');
    if (saved) {
      try { return JSON.parse(saved); } catch {}
    }
    return INITIAL_COFRINHOS;
  });

  // Empréstimos
  const [loans, setLoans] = useState<EduLoan[]>(() => {
    const saved = localStorage.getItem('optmapay_edu_loans');
    if (saved) {
      try { return JSON.parse(saved); } catch {}
    }
    return [];
  });

  // Cenários
  const [scenarios, setScenarios] = useState<EduLifeScenario[]>(() => {
    const saved = localStorage.getItem('optmapay_edu_scenarios');
    if (saved) {
      try { return JSON.parse(saved); } catch {}
    }
    return INITIAL_SCENARIOS;
  });

  // Negativação automática se houver contas vencidas há mais de 7 dias ou empréstimo vencido
  const isNegativado = bills.some((b) => b.status === 'overdue') || loans.some((l) => l.status === 'overdue') || score < 400;

  // Persistência em LocalStorage
  const setMode = (m: AppMode) => {
    setModeState(m);
    localStorage.setItem('optmapay_app_mode', m);
  };

  const toggleMode = () => {
    setMode(mode === 'dev' ? 'edu' : 'dev');
  };

  const setIsJuniorAccount = (val: boolean) => {
    setIsJuniorAccountState(val);
    localStorage.setItem('optmapay_is_junior', String(val));
  };

  const setGuardianName = (name: string) => {
    setGuardianNameState(name);
    localStorage.setItem('optmapay_guardian_name', name);
  };

  const setParentalConsent = (val: boolean) => {
    setParentalConsentState(val);
    localStorage.setItem('optmapay_parental_consent', String(val));
  };

  const adjustScore = (delta: number, description: string) => {
    setScore((prev) => {
      const next = Math.max(0, Math.min(1000, prev + delta));
      localStorage.setItem('optmapay_edu_score', String(next));
      return next;
    });

    setScoreHistory((prev) => {
      const newEv: ScoreEvent = {
        id: String(Date.now()),
        date: new Date().toLocaleDateString('pt-BR'),
        description,
        points: delta,
        type: delta > 0 ? 'positive' : delta < 0 ? 'negative' : 'neutral',
      };
      const updated = [newEv, ...prev].slice(0, 50);
      localStorage.setItem('optmapay_score_history', JSON.stringify(updated));
      return updated;
    });
  };

  // Pagar Conta
  const payBill = async (billId: string): Promise<boolean> => {
    if (!activeAccount) return false;
    const bill = bills.find((b) => b.id === billId);
    if (!bill || bill.status === 'paid') return false;

    // Calcula encargos se estiver atrasada
    let finalAmount = bill.amount;
    if (bill.status === 'overdue') {
      const multa = bill.amount * (bill.lateFeePercent / 100);
      const juros = bill.amount * (bill.dailyInterestRate / 100) * 5; // 5 dias didáticos
      finalAmount = Math.round((bill.amount + multa + juros) * 100) / 100;
    }

    if (activeAccount.balance < finalAmount) {
      throw new Error(`Saldo insuficiente na conta para quitar a conta de R$ ${finalAmount.toFixed(2)}.`);
    }

    // 1. Debita saldo da conta
    await supabase
      .from('accounts')
      .update({ balance: activeAccount.balance - finalAmount })
      .eq('id', activeAccount.id);

    // 2. Insere transação no extrato
    await supabase.from('transactions').insert({
      user_id: activeAccount.user_id || null,
      account_id: activeAccount.id,
      type: 'boleto_payment',
      direction: 'out',
      amount: finalAmount,
      description: `Pagamento de Conta: ${bill.title}`,
      external_reference: bill.linhaDigitavel.slice(0, 15),
      status: 'completed',
      real_money: false,
      environment: 'sandbox',
    });

    // 3. Atualiza estado da conta
    setBills((prev) => {
      const updated = prev.map((b) =>
        b.id === billId ? { ...b, status: 'paid' as const, paidAt: new Date().toISOString() } : b
      );
      localStorage.setItem('optmapay_edu_bills', JSON.stringify(updated));
      return updated;
    });

    // 4. Bonifica ou penaliza o score
    if (bill.status === 'overdue') {
      adjustScore(+10, `Quitação de conta em atraso (${bill.title})`);
    } else {
      adjustScore(+25, `Pagamento pontual de conta (${bill.title})`);
    }

    await refreshAccounts();
    return true;
  };

  // Adicionar Conta
  const addBill = (newBillData: Omit<EduBill, 'id' | 'status' | 'barcode' | 'linhaDigitavel' | 'lateFeePercent' | 'dailyInterestRate'>) => {
    const id = `bill-${Date.now()}`;
    const barcode = `8460000000${Math.floor(1000000000000000000000000000000 + Math.random() * 9000000000000000000000000000000)}`;
    const linha = `${barcode.slice(0, 5)}.${barcode.slice(5, 10)} ${barcode.slice(10, 15)}.${barcode.slice(15, 21)} 1 23456789000`;

    const isOverdue = new Date(newBillData.dueDate) < new Date();

    const created: EduBill = {
      ...newBillData,
      id,
      status: isOverdue ? 'overdue' : 'pending',
      barcode,
      linhaDigitavel: linha,
      lateFeePercent: 2.0,
      dailyInterestRate: 0.033,
    };

    setBills((prev) => {
      const updated = [created, ...prev];
      localStorage.setItem('optmapay_edu_bills', JSON.stringify(updated));
      return updated;
    });
  };

  // Cofrinhos
  const createCofrinho = (title: string, targetAmount: number, icon = '🎯', monthlyYieldPercent = 0.6) => {
    const created: CofrinhoGoal = {
      id: `cof-${Date.now()}`,
      title,
      category: 'Objetivo Pessoal',
      targetAmount,
      currentAmount: 0,
      icon,
      monthlyYieldPercent,
      createdAt: new Date().toISOString(),
    };

    setCofrinhos((prev) => {
      const updated = [...prev, created];
      localStorage.setItem('optmapay_edu_cofrinhos', JSON.stringify(updated));
      return updated;
    });

    adjustScore(+15, `Criou a meta de poupança: "${title}"`);
  };

  const depositToCofrinho = async (cofrinhoId: string, amount: number): Promise<boolean> => {
    if (!activeAccount || amount <= 0) return false;
    if (activeAccount.balance < amount) {
      throw new Error('Saldo insuficiente em conta corrente para guardar no cofrinho.');
    }

    // Debita da conta
    await supabase
      .from('accounts')
      .update({ balance: activeAccount.balance - amount })
      .eq('id', activeAccount.id);

    // Registra transação
    await supabase.from('transactions').insert({
      user_id: activeAccount.user_id || null,
      account_id: activeAccount.id,
      type: 'transfer',
      direction: 'out',
      amount,
      description: `Aplicação no Cofrinho / Poupança Didática`,
      status: 'completed',
      real_money: false,
      environment: 'sandbox',
    });

    setCofrinhos((prev) => {
      const updated = prev.map((c) =>
        c.id === cofrinhoId ? { ...c, currentAmount: Math.round((c.currentAmount + amount) * 100) / 100 } : c
      );
      localStorage.setItem('optmapay_edu_cofrinhos', JSON.stringify(updated));
      return updated;
    });

    adjustScore(+20, `Guardou R$ ${amount.toFixed(2)} na Poupança (Hábito de Poupador)`);
    await refreshAccounts();
    return true;
  };

  const withdrawFromCofrinho = async (cofrinhoId: string, amount: number): Promise<boolean> => {
    if (!activeAccount || amount <= 0) return false;
    const cof = cofrinhos.find((c) => c.id === cofrinhoId);
    if (!cof || cof.currentAmount < amount) {
      throw new Error('Saldo insuficiente no cofrinho para resgatar.');
    }

    // Credita na conta
    await supabase
      .from('accounts')
      .update({ balance: activeAccount.balance + amount })
      .eq('id', activeAccount.id);

    await supabase.from('transactions').insert({
      user_id: activeAccount.user_id || null,
      account_id: activeAccount.id,
      type: 'transfer',
      direction: 'in',
      amount,
      description: `Resgate do Cofrinho (${cof.title}) para Conta Corrente`,
      status: 'completed',
      real_money: false,
      environment: 'sandbox',
    });

    setCofrinhos((prev) => {
      const updated = prev.map((c) =>
        c.id === cofrinhoId ? { ...c, currentAmount: Math.round((c.currentAmount - amount) * 100) / 100 } : c
      );
      localStorage.setItem('optmapay_edu_cofrinhos', JSON.stringify(updated));
      return updated;
    });

    await refreshAccounts();
    return true;
  };

  // Empréstimos
  const applyForLoan = async (principal: number, installments: number, rate: number, purpose: string): Promise<boolean> => {
    if (!activeAccount || principal <= 0) return false;
    if (isNegativado) {
      throw new Error('Crédito negado: Sua conta possui pendências cadastrais ou contas em atraso no SPC Didático. Regularize para liberar novos empréstimos.');
    }

    // Cálculo SAC / Price simplificado
    const totalWithInterest = Math.round((principal * (1 + (rate / 100) * installments)) * 100) / 100;
    const installmentAmount = Math.round((totalWithInterest / installments) * 100) / 100;

    // Credita o principal na conta
    await supabase
      .from('accounts')
      .update({ balance: activeAccount.balance + principal })
      .eq('id', activeAccount.id);

    await supabase.from('transactions').insert({
      user_id: activeAccount.user_id || null,
      account_id: activeAccount.id,
      type: 'deposit',
      direction: 'in',
      amount: principal,
      description: `Liberação de Empréstimo Consciente (${installments}x de R$ ${installmentAmount.toFixed(2)})`,
      status: 'completed',
      real_money: false,
      environment: 'sandbox',
    });

    const newLoan: EduLoan = {
      id: `loan-${Date.now()}`,
      title: `Empréstimo: ${purpose || 'Planejamento Financeiro'}`,
      purpose,
      principalAmount: principal,
      totalWithInterest,
      installmentsTotal: installments,
      installmentsPaid: 0,
      installmentAmount,
      monthlyInterestRate: rate,
      nextDueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      status: 'active',
      createdAt: new Date().toISOString(),
    };

    setLoans((prev) => {
      const updated = [newLoan, ...prev];
      localStorage.setItem('optmapay_edu_loans', JSON.stringify(updated));
      return updated;
    });

    adjustScore(-10, `Contratação de empréstimo (Comprometimento de renda)`);
    await refreshAccounts();
    return true;
  };

  const payLoanInstallment = async (loanId: string): Promise<boolean> => {
    if (!activeAccount) return false;
    const loan = loans.find((l) => l.id === loanId);
    if (!loan || loan.status === 'paid') return false;

    if (activeAccount.balance < loan.installmentAmount) {
      throw new Error(`Saldo insuficiente para quitar a parcela de R$ ${loan.installmentAmount.toFixed(2)}.`);
    }

    // Debita da conta
    await supabase
      .from('accounts')
      .update({ balance: activeAccount.balance - loan.installmentAmount })
      .eq('id', activeAccount.id);

    await supabase.from('transactions').insert({
      user_id: activeAccount.user_id || null,
      account_id: activeAccount.id,
      type: 'transfer',
      direction: 'out',
      amount: loan.installmentAmount,
      description: `Pagamento de Parcela ${loan.installmentsPaid + 1}/${loan.installmentsTotal} do Empréstimo`,
      status: 'completed',
      real_money: false,
      environment: 'sandbox',
    });

    setLoans((prev) => {
      const updated = prev.map((l) => {
        if (l.id !== loanId) return l;
        const newPaid = l.installmentsPaid + 1;
        const isFinished = newPaid >= l.installmentsTotal;
        return {
          ...l,
          installmentsPaid: newPaid,
          status: isFinished ? ('paid' as const) : ('active' as const),
          nextDueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        };
      });
      localStorage.setItem('optmapay_edu_loans', JSON.stringify(updated));
      return updated;
    });

    adjustScore(+35, `Pagamento pontual de parcela de empréstimo`);
    await refreshAccounts();
    return true;
  };

  // Renegociação de Dívidas (Limpar Nome no SPC Didático)
  const renegotiateDebt = () => {
    setBills((prev) => {
      const updated = prev.map((b) => (b.status === 'overdue' ? { ...b, status: 'pending' as const } : b));
      localStorage.setItem('optmapay_edu_bills', JSON.stringify(updated));
      return updated;
    });

    setLoans((prev) => {
      const updated = prev.map((l) => (l.status === 'overdue' ? { ...l, status: 'active' as const } : l));
      localStorage.setItem('optmapay_edu_loans', JSON.stringify(updated));
      return updated;
    });

    adjustScore(+50, 'Acordo de renegociação firmado (Recuperação de Crédito)');
  };

  // Cenários do Cotidiano
  const resolveScenario = async (scenarioId: string, optionIndex: number) => {
    const sc = scenarios.find((s) => s.id === scenarioId);
    if (!sc) return;
    const opt = sc.options[optionIndex];
    if (!opt) return;

    if (opt.amountChange !== 0 && activeAccount) {
      if (opt.amountChange > 0) {
        await supabase
          .from('accounts')
          .update({ balance: activeAccount.balance + opt.amountChange })
          .eq('id', activeAccount.id);

        await supabase.from('transactions').insert({
          user_id: activeAccount.user_id || null,
          account_id: activeAccount.id,
          type: 'deposit',
          direction: 'in',
          amount: opt.amountChange,
          description: `Desafio Didático: ${sc.title}`,
          status: 'completed',
          real_money: false,
          environment: 'sandbox',
        });
      } else {
        const debitAmount = Math.abs(opt.amountChange);
        if (activeAccount.balance >= debitAmount) {
          await supabase
            .from('accounts')
            .update({ balance: activeAccount.balance - debitAmount })
            .eq('id', activeAccount.id);

          await supabase.from('transactions').insert({
            user_id: activeAccount.user_id || null,
            account_id: activeAccount.id,
            type: 'transfer',
            direction: 'out',
            amount: debitAmount,
            description: `Desafio Didático: ${sc.title}`,
            status: 'completed',
            real_money: false,
            environment: 'sandbox',
          });
        }
      }
      await refreshAccounts();
    }

    adjustScore(opt.scoreChange, `Cenário "${sc.title}": ${opt.label}`);

    setScenarios((prev) => {
      const updated = prev.map((s) =>
        s.id === scenarioId ? { ...s, resolved: true, selectedOptionIndex: optionIndex } : s
      );
      localStorage.setItem('optmapay_edu_scenarios', JSON.stringify(updated));
      return updated;
    });
  };

  // Mesada do Guardião
  const grantMesada = async (amount: number, reason: string): Promise<boolean> => {
    if (!activeAccount || amount <= 0) return false;

    await supabase
      .from('accounts')
      .update({ balance: activeAccount.balance + amount })
      .eq('id', activeAccount.id);

    await supabase.from('transactions').insert({
      user_id: activeAccount.user_id || null,
      account_id: activeAccount.id,
      type: 'deposit',
      direction: 'in',
      amount,
      description: `Mesada Educativa / Aporte do Guardião (${reason || 'Mesada Mensal'})`,
      status: 'completed',
      real_money: false,
      environment: 'sandbox',
    });

    adjustScore(+15, `Recebeu mesada didática (${reason})`);
    await refreshAccounts();
    return true;
  };

  return (
    <AppModeContext.Provider
      value={{
        mode,
        setMode,
        toggleMode,
        isJuniorAccount,
        setIsJuniorAccount,
        guardianName,
        setGuardianName,
        parentalConsent,
        setParentalConsent,
        score,
        isNegativado,
        scoreHistory,
        renegotiateDebt,
        bills,
        payBill,
        addBill,
        cofrinhos,
        createCofrinho,
        depositToCofrinho,
        withdrawFromCofrinho,
        loans,
        applyForLoan,
        payLoanInstallment,
        scenarios,
        resolveScenario,
        grantMesada,
      }}
    >
      {children}
    </AppModeContext.Provider>
  );
};

export const useAppMode = () => {
  const context = useContext(AppModeContext);
  if (!context) {
    throw new Error('useAppMode must be used within an AppModeProvider');
  }
  return context;
};
