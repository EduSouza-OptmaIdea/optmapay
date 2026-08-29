import React from 'react';
import { Link } from 'react-router-dom';
import { Logo } from '../components/Logo';
import { ShieldCheck, AlertTriangle, ArrowLeft, FileText, Lock, ExternalLink } from 'lucide-react';

export const TermsOfUse: React.FC = () => {
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
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-teal-500/10 text-[#19A999] text-xs font-bold uppercase tracking-wider">
            <FileText className="w-3.5 h-3.5" />
            <span>Documento Jurídico Oficial</span>
          </div>
          <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
            Termos de Uso e Condições Gerais
          </h1>
          <p className="text-xs text-slate-500">
            Última atualização: 29 de Agosto de 2026 • Versão 1.0.0
          </p>
        </div>

        {/* Golden Rule Highlight Alert */}
        <div className="p-5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-900 dark:text-amber-200 text-xs space-y-2">
          <p className="font-bold text-sm text-amber-800 dark:text-amber-300 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0" />
            REGRA FUNDAMENTAL: AMBIENTE DE TESTES SIMULADO (SANDBOX)
          </p>
          <p className="leading-relaxed text-amber-800/90 dark:text-amber-200/90">
            O <strong>OptmaPay Sandbox</strong> é uma ferramenta exclusivamente desenvolvida para simulação técnica, homologação de software, testes de APIs, disparo de webhooks e integração de fluxos de checkout e liquidação de vendas. <strong>Nenhuma operação realizada nesta plataforma possui valor monetário real, eficácia cambial, direito creditório ou transação bancária externa.</strong>
          </p>
        </div>

        <div className="space-y-6 text-xs sm:text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
          {/* Section 1 */}
          <section className="space-y-2 bg-white dark:bg-slate-800/60 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
            <h2 className="text-base font-bold text-slate-900 dark:text-white">1. Objeto e Natureza do Serviço</h2>
            <p>
              1.1. O OptmaPay Sandbox disponibiliza uma infraestrutura de Internet Banking fictícia e APIs simuladas para desenvolvedores, empresas e parceiros do ecossistema <strong>OptmaIdea</strong> testarem soluções de pagamento (Pix, Boletos, Cartões Virtuais e Baixa de Duplicatas).
            </p>
            <p>
              1.2. Todas as respostas de API e payloads de webhooks retornam obrigatoriamente os atributos <code>"realMoney": false</code> e <code>"environment": "sandbox"</code>.
            </p>
          </section>

          {/* Section 2 */}
          <section className="space-y-2 bg-white dark:bg-slate-800/60 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
            <h2 className="text-base font-bold text-slate-900 dark:text-white">2. Dados Inseridos e Responsabilidade do Usuário</h2>
            <p>
              2.1. O usuário é o único responsável pelos dados cadastrais, nomes, números de documentos (CPFs/CNPJs fictícios), chaves Pix e valores informados durante as sessões de teste.
            </p>
            <p>
              2.2. Recomendamos expressamente o uso de dados não sensíveis ou fictícios para fins de teste.
            </p>
            <p>
              2.3. É expressamente vedado utilizar o serviço para atividades fraudulentas, engenharia social, phishing, tentativa de simulação de comprovantes reais para induzir terceiros a erro, ou qualquer atividade ilícita.
            </p>
          </section>

          {/* Section 3 */}
          <section className="space-y-2 bg-white dark:bg-slate-800/60 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
            <h2 className="text-base font-bold text-slate-900 dark:text-white">3. Política de Retenção de Dados e Expiração (60 Dias)</h2>
            <p>
              3.1. No modelo gratuito, as contas de teste, extratos e registros de sandbox são mantidos em banco de dados pelo período padrão de <strong>60 (sessenta) dias</strong>.
            </p>
            <p>
              3.2. Avisos automáticos de expiração serão encaminhados para o e-mail de autenticação cadastrado com antecedência de 7, 2 e 1 dia antes da purga periódica.
            </p>
            <p>
              3.3. O usuário pode, a qualquer momento antes da expiração, realizar o download do <strong>Backup Completo em formato JSON</strong> na seção Meus Dados.
            </p>
          </section>

          {/* Section 4 */}
          <section className="space-y-2 bg-white dark:bg-slate-800/60 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
            <h2 className="text-base font-bold text-slate-900 dark:text-white">4. Exclusão e Portabilidade de Dados</h2>
            <p>
              4.1. O usuário tem o direito inalienável de excluir suas contas e todos os registros associados imediatamente através do painel de controle. A exclusão é atômica, irreversível e definitiva.
            </p>
          </section>

          {/* Section 5 */}
          <section className="space-y-2 bg-white dark:bg-slate-800/60 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
            <h2 className="text-base font-bold text-slate-900 dark:text-white">5. Limitação de Responsabilidade</h2>
            <p>
              5.1. A OptmaIdea não se responsabiliza por prejuízos decorrentes de indisponibilidade temporária de ambiente de teste, alterações em APIs ou perda de dados de testes decorrentes do ciclo de retenção.
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
