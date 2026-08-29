import React from 'react';
import { Link } from 'react-router-dom';
import { Logo } from '../components/Logo';
import { ShieldCheck, Lock, ArrowLeft, EyeOff, Trash2, Download, Cookie } from 'lucide-react';

export const PrivacyPolicy: React.FC = () => {
  return (
    <div className="min-h-screen bg-[#F8F6F2] dark:bg-[#0F172A] text-slate-900 dark:text-slate-100 flex flex-col selection:bg-[#F1613A] selection:text-white">
      {/* Top Header */}
      <header className="border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-[#0F172A]/80 backdrop-blur-md sticky top-0 z-30 px-4 py-3">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <Link to="/">
            <Logo heightClass="h-8 sm:h-9" />
          </Link>
          <Link
            to="/"
            className="text-xs text-[#19A999] hover:underline font-bold flex items-center gap-1"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Voltar ao Início</span>
          </Link>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 py-10 space-y-8 flex-1">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs font-bold uppercase tracking-wider">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Conformidade com a LGPD (Lei nº 13.709/2018)</span>
          </div>
          <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
            Política de Privacidade e Gestão de Cookies
          </h1>
          <p className="text-xs text-slate-500">
            Última atualização: 29 de Agosto de 2026 • Versão 1.0.0
          </p>
        </div>

        {/* Commitment Highlight Alert */}
        <div className="p-5 rounded-2xl bg-teal-500/10 border border-teal-500/30 text-teal-900 dark:text-teal-200 text-xs space-y-2">
          <p className="font-bold text-sm text-[#19A999] flex items-center gap-2">
            <Lock className="w-5 h-5 shrink-0" />
            NOSSO COMPROMISSO COM A PRIVACIDADE DOS SEUS DADOS
          </p>
          <p className="leading-relaxed text-slate-700 dark:text-slate-300">
            A <strong>OptmaIdea</strong> preza pela transparência absoluta. No <strong>OptmaPay Sandbox</strong>:
            <br />
            1. <strong>NÃO comercializamos, NÃO compartilhamos e NÃO monetizamos</strong> quaisquer dados cadastrais, e-mails ou históricos de testes com terceiros.
            <br />
            2. Os dados de contas, chaves e transações são preenchidos voluntariamente pelo próprio usuário para simulação de desenvolvimento.
            <br />
            3. Você tem controle total: pode baixar o backup integral dos seus dados em JSON ou solicitar a exclusão imediata e definitiva a qualquer momento.
          </p>
        </div>

        <div className="space-y-6 text-xs sm:text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
          {/* Section 1 */}
          <section className="space-y-2 bg-white dark:bg-slate-800/60 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <EyeOff className="w-4 h-4 text-[#19A999]" />
              1. Coleta e Finalidade dos Dados
            </h2>
            <p>
              1.1. <strong>Dados de Autenticação:</strong> Coletamos apenas o endereço de e-mail e credenciais criptografadas via Supabase Auth com a finalidade exclusiva de autenticação de sessão e envio de e-mails transacionais (confirmação, redefinição de senha e avisos de retenção).
            </p>
            <p>
              1.2. <strong>Dados de Sandbox:</strong> Nomes empresariais, CPFs/CNPJs fictícios, valores e descrições criados no painel são armazenados em ambiente isolado no banco de dados PostgreSQL do Supabase, exclusivamente para renderização das telas e resposta das APIs de teste.
            </p>
          </section>

          {/* Section 2 */}
          <section className="space-y-2 bg-white dark:bg-slate-800/60 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Cookie className="w-4 h-4 text-[#FAA832]" />
              2. Política de Cookies e Armazenamento Local (localStorage)
            </h2>
            <p>
              2.1. O OptmaPay Sandbox utiliza cookies estritamente necessários e armazenamento local (<code>localStorage</code>) para:
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Manter a sessão do operador autenticado ativa (token JWT seguro).</li>
              <li>Salvar a preferência visual do usuário (Tema Claro, Escuro ou Sistema).</li>
              <li>Armazenar a chave pública <code>anonKey</code> informada para testes de sandbox.</li>
              <li>Registrar a conta sandbox ativa selecionada no seletor do topo.</li>
            </ul>
            <p>
              2.2. Não utilizamos cookies de rastreamento publicitário de terceiros.
            </p>
          </section>

          {/* Section 3 */}
          <section className="space-y-2 bg-white dark:bg-slate-800/60 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Download className="w-4 h-4 text-[#F1613A]" />
              3. Direitos do Titular (LGPD) — Portabilidade e Acesso
            </h2>
            <p>
              3.1. Em conformidade com o Artigo 18 da LGPD, o usuário pode exercer o direito de <strong>Portabilidade de Dados</strong> a qualquer momento, baixando um arquivo estruturado em JSON contendo o extrato completo de suas contas, transações, boletos e logs de webhooks.
            </p>
          </section>

          {/* Section 4 */}
          <section className="space-y-2 bg-white dark:bg-slate-800/60 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Trash2 className="w-4 h-4 text-rose-500" />
              4. Direito ao Esquecimento e Exclusão Definitiva
            </h2>
            <p>
              4.1. O usuário pode solicitar a qualquer momento a <strong>exclusão integral de suas contas e dados</strong> diretamente pelo painel através da RPC <code>delete_sandbox_account</code>.
            </p>
            <p>
              4.2. A exclusão elimina em cascata todos os registros vinculados, sem qualquer retenção residual de dados.
            </p>
          </section>

          {/* Section 5 */}
          <section className="space-y-2 bg-white dark:bg-slate-800/60 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-[#19A999]" />
              5. Contato do Encarregado de Dados (DPO)
            </h2>
            <p>
              Para esclarecer qualquer dúvida sobre privacidade, tratamento de dados ou exercer direitos previstos na LGPD, entre em contato através do e-mail:
              <br />
              <strong className="text-[#19A999] font-mono">optmapay.faleconosco@optmaidea.com.br</strong>
            </p>
          </section>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 dark:border-slate-800 py-6 px-4 text-center text-xs text-slate-500">
        <p>OptmaPay Sandbox • Ecossistema OptmaIdea © 2026 • Todos os direitos reservados.</p>
      </footer>
    </div>
  );
};
