/**
 * OptmaPay Sandbox - Business Days & Settlement Engine
 * Regra de Ouro: Dados fictícios para simulação de liquidação e antecipação
 * 
 * Regras implementadas:
 * 1. Liquidação D+1 e D+N ocorre sempre no dia útil seguinte a partir das 06:00 da manhã.
 * 2. Contador regressivo decrescente (D-15, D-14... até D-0 / hoje às 06:00).
 * 3. Cálculo Pro Rata do custo de antecipação com base nos dias restantes.
 */

// ==============================================================================
// 1. CALENDÁRIO DE FERIADOS NACIONAIS BRASILEIROS (ANUAL / OFICIAL)
// ==============================================================================

interface Holiday {
  month: number; // 0-indexed (0 = Jan, 11 = Dez)
  day: number;
  name: string;
}

// Feriados Nacionais Fixos no Brasil
const FIXED_HOLIDAYS: Holiday[] = [
  { month: 0, day: 1, name: 'Confraternização Universal' },
  { month: 3, day: 21, name: 'Tiradentes' },
  { month: 4, day: 1, name: 'Dia do Trabalhador' },
  { month: 8, day: 7, name: 'Independência do Brasil' },
  { month: 9, day: 12, name: 'Nossa Senhora Aparecida' },
  { month: 10, day: 2, name: 'Finados' },
  { month: 10, day: 15, name: 'Proclamação da República' },
  { month: 10, day: 20, name: 'Dia da Consciência Negra' },
  { month: 11, day: 25, name: 'Natal' },
];

/**
 * Calcula os feriados móveis baseados na data da Páscoa (Algoritmo de Meeus/Jones/Butcher)
 */
function getEasterHolidays(year: number): Holiday[] {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const easterMonth = Math.floor((h + l - 7 * m + 114) / 31) - 1; // 0-indexed
  const easterDay = ((h + l - 7 * m + 114) % 31) + 1;

  const easterDate = new Date(year, easterMonth, easterDay);

  // Carnaval: 47 dias antes da Páscoa
  const carnaval = new Date(easterDate);
  carnaval.setDate(easterDate.getDate() - 47);

  // Sexta-feira Santa (Paixão de Cristo): 2 dias antes da Páscoa
  const paixao = new Date(easterDate);
  paixao.setDate(easterDate.getDate() - 2);

  // Corpus Christi: 60 dias após a Páscoa
  const corpusChristi = new Date(easterDate);
  corpusChristi.setDate(easterDate.getDate() + 60);

  return [
    { month: carnaval.getMonth(), day: carnaval.getDate(), name: 'Carnaval' },
    { month: paixao.getMonth(), day: paixao.getDate(), name: 'Sexta-feira Santa (Paixão de Cristo)' },
    { month: corpusChristi.getMonth(), day: corpusChristi.getDate(), name: 'Corpus Christi' },
  ];
}

/**
 * Retorna se determinada data é um feriado nacional brasileiro
 */
export function isNationalHoliday(date: Date): { isHoliday: boolean; name?: string } {
  const year = date.getFullYear();
  const month = date.getMonth();
  const day = date.getDate();

  // 1. Checa feriados fixos
  const fixed = FIXED_HOLIDAYS.find((h) => h.month === month && h.day === day);
  if (fixed) return { isHoliday: true, name: fixed.name };

  // 2. Checa feriados móveis do ano
  const easterHolidays = getEasterHolidays(year);
  const movable = easterHolidays.find((h) => h.month === month && h.day === day);
  if (movable) return { isHoliday: true, name: movable.name };

  return { isHoliday: false };
}

/**
 * Retorna se determinado dia é final de semana (Sábado ou Domingo)
 */
export function isWeekend(date: Date): boolean {
  const dayOfWeek = date.getDay();
  return dayOfWeek === 0 || dayOfWeek === 6; // 0 = Domingo, 6 = Sábado
}

/**
 * Retorna se o dia é um dia útil bancário no Brasil (Segunda a Sexta, sem feriados)
 */
export function isBusinessDay(date: Date): boolean {
  if (isWeekend(date)) return false;
  return !isNationalHoliday(date).isHoliday;
}

/**
 * Encontra o próximo dia útil a partir de uma data inicial.
 * Se includeCurrentIfBusiness for false, avança pelo menos 1 dia.
 */
export function getNextBusinessDay(from: Date, includeCurrentIfBusiness = false): Date {
  const next = new Date(from);
  if (!includeCurrentIfBusiness) {
    next.setDate(next.getDate() + 1);
  }

  while (!isBusinessDay(next)) {
    next.setDate(next.getDate() + 1);
  }

  return next;
}

/**
 * Adiciona N dias úteis bancários a uma data inicial
 */
export function addBusinessDays(startDate: Date, businessDaysToAdd: number): Date {
  const result = new Date(startDate);
  let added = 0;

  while (added < businessDaysToAdd) {
    result.setDate(result.getDate() + 1);
    if (isBusinessDay(result)) {
      added++;
    }
  }

  return result;
}

// ==============================================================================
// 2. LIQUIDAÇÃO BANCÁRIA: DIA ÚTIL SEGUINTE SEMPRE ÀS 06:00 DA MANHÃ
// ==============================================================================

export type SettlementPlan = 'ontime' | 'nitro' | 'standard' | 'd1' | 'd7' | 'd15' | 'due_date';

/**
 * Calcula a data exata e horário de liquidação da venda (Sempre às 06:00 do dia útil de liberação).
 * - D+0 (Ontime/Nitro): Disponível na hora (data/hora atual).
 * - D+1 (Standard): 1 dia útil depois, às 06:00 da manhã.
 * - D+7: 7 dias úteis depois, às 06:00 da manhã.
 * - D+15: 15 dias úteis depois, às 06:00 da manhã.
 * - Due Date (Vencimento): 30 dias corridos ajustados para o próximo dia útil às 06:00.
 */
export function calculateSettlementTargetDate(
  saleDate: Date | string,
  plan: SettlementPlan | number = 'standard'
): Date {
  const baseDate = typeof saleDate === 'string' ? new Date(saleDate) : new Date(saleDate);

  // D+0: Imediato
  if (plan === 'ontime' || plan === 'nitro' || plan === 0) {
    return baseDate;
  }

  // Dias corridos do plano
  let calendarDaysToAdd = 1;
  if (plan === 'd7' || plan === 7) calendarDaysToAdd = 7;
  else if (plan === 'd15' || plan === 15) calendarDaysToAdd = 15;
  else if (plan === 'due_date' || plan === 30) calendarDaysToAdd = 30;

  // 1. Adiciona dias corridos
  const targetCalendarDate = new Date(baseDate);
  targetCalendarDate.setDate(targetCalendarDate.getDate() + calendarDaysToAdd);

  // 2. Se cair em fim de semana ou feriado nacional, projeta para o próximo dia útil disponível
  const nextBusiness = getNextBusinessDay(targetCalendarDate, true);
  // Define pontualmente às 06:00 da manhã
  nextBusiness.setHours(6, 0, 0, 0);

  return nextBusiness;
}

// ==============================================================================
// 3. BADGE DE CONTAGEM REGRESSIVA (D-15, D-14... ATÉ D-0 / 06h00)
// ==============================================================================

export interface SettlementCountdownInfo {
  targetDate: Date;
  targetDateFormatted: string;
  daysRemaining: number;
  calendarDaysRemaining: number;
  hoursRemaining: number;
  isDue: boolean; // Já passou das 06:00 do dia útil previsto
  badgeText: string;
  subText: string;
  badgeColorClass: string;
}

/**
 * Calcula a contagem regressiva em dias corridos e projeta no próximo dia útil às 06:00
 */
export function getSettlementCountdown(
  saleDate: Date | string,
  plan: SettlementPlan | number = 'standard',
  referenceDate: Date = new Date()
): SettlementCountdownInfo {
  const target = calculateSettlementTargetDate(saleDate, plan);
  const now = referenceDate;

  const diffMs = target.getTime() - now.getTime();
  const isDue = diffMs <= 0;

  // Dias corridos restantes até a data prevista de liquidação
  const totalHours = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60)));
  const calendarDaysRemaining = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));

  // Formatação em português
  const dayName = target.toLocaleDateString('pt-BR', { weekday: 'short' });
  const dateStr = target.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  const targetDateFormatted = `${dayName.toUpperCase()}, ${dateStr} às 06:00`;

  let badgeText = `D-${calendarDaysRemaining}`;
  let subText = `Previsão: ${targetDateFormatted}`;
  let badgeColorClass = 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-800';

  if (isDue) {
    badgeText = 'D-0 • Disponível';
    subText = `Liberado desde ${targetDateFormatted}`;
    badgeColorClass = 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800';
  } else if (calendarDaysRemaining === 1) {
    badgeText = 'D-1 • Próximo Dia Útil';
    subText = `Cai no próximo dia útil às 06:00 (${targetDateFormatted})`;
    badgeColorClass = 'bg-sky-100 dark:bg-sky-950/60 text-sky-800 dark:text-sky-300 border-sky-300 dark:border-sky-800';
  } else if (calendarDaysRemaining === 0) {
    badgeText = 'D-0 • Hoje às 06h';
    subText = `Previsão para hoje às 06:00`;
    badgeColorClass = 'bg-indigo-100 dark:bg-indigo-950/60 text-indigo-800 dark:text-indigo-300 border-indigo-300 dark:border-indigo-800';
  }

  return {
    targetDate: target,
    targetDateFormatted,
    daysRemaining: calendarDaysRemaining,
    calendarDaysRemaining,
    hoursRemaining: totalHours,
    isDue,
    badgeText,
    subText,
    badgeColorClass,
  };
}

// ==============================================================================
// 4. CÁLCULO PRO RATA DO CUSTO DE ANTECIPAÇÃO DE RECEBÍVEIS
// ==============================================================================

export interface AnticipationCalculationResult {
  grossAmount: number;
  daysRemaining: number;
  monthlyFeePercent: number;
  dailyFeePercent: number;
  proRataFeePercent: number;
  anticipationFeeAmount: number;
  netAnticipatedAmount: number;
  targetSettlementDateStr: string;
  summaryNote: string;
}

/**
 * Calcula a taxa pro rata e valor líquido a receber na antecipação
 * Fórmula: Custo = Valor_Bruto * (Taxa_Mensal / 30) * Dias_Restantes
 */
export function calculateAnticipationProRata(
  grossAmount: number,
  daysRemaining: number,
  monthlyFeePercent: number = 5.99, // Taxa base de antecipação: 5.99% a.m. (igual ao Crédito 1x OnTime para evitar arbitragem)
  targetSettlementDateStr: string = ''
): AnticipationCalculationResult {
  const safeGross = Math.max(0, grossAmount);
  // Mínimo de 1 dia para cálculo de antecipação se estiver dentro do mesmo dia
  const safeDays = Math.max(1, Math.min(365, daysRemaining));

  // Taxa diária equivalente
  const dailyFeePercent = monthlyFeePercent / 30;
  // Taxa pro rata aplicada aos dias restantes
  const proRataFeePercent = Math.round(dailyFeePercent * safeDays * 10000) / 10000;

  // Valor do desconto de antecipação
  const anticipationFeeAmount = Math.round((safeGross * (proRataFeePercent / 100)) * 100) / 100;
  // Valor líquido final que cai imediatamente na conta
  const netAnticipatedAmount = Math.max(0, Math.round((safeGross - anticipationFeeAmount) * 100) / 100);

  const summaryNote = `Antecipação calculada para ${safeDays} dia(s) restante(s) à taxa pro-rata de ${proRataFeePercent.toFixed(2)}% (${monthlyFeePercent}% a.m.).`;

  return {
    grossAmount: safeGross,
    daysRemaining: safeDays,
    monthlyFeePercent,
    dailyFeePercent,
    proRataFeePercent,
    anticipationFeeAmount,
    netAnticipatedAmount,
    targetSettlementDateStr,
    summaryNote,
  };
}
