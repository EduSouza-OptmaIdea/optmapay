import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Logo } from '../components/Logo';
import { useTheme } from '../context/ThemeContext';
import {
  ShieldCheck,
  Sparkles,
  QrCode,
  FileText,
  RefreshCw,
  Code2,
  ArrowRight,
  Sun,
  Moon,
  Send,
  CheckCircle2,
  ExternalLink,
  Mail,
  ChevronUp,
} from 'lucide-react';

export const PublicHome: React.FC = () => {
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();

  const [formStatus, setFormStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formSubject, setFormSubject] = useState('');
  const [formMessage, setFormMessage] = useState('');
  const [showBackToTop, setShowBackToTop] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > 250) {
        setShowBackToTop(true);
      } else {
        setShowBackToTop(false);
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: 'smooth',
    });
  };

  const handleContactSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormStatus('sending');

    try {
      const response = await fetch('https://formspree.io/f/mljrvyga', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          name: formName,
          email: formEmail,
          subject: formSubject || 'Contato via OptmaPay Sandbox',
          message: formMessage,
          to: 'optmapay.faleconosco@optmaidea.com.br',
        }),
      });

      if (response.ok) {
        setFormStatus('success');
        setFormName('');
        setFormEmail('');
        setFormSubject('');
        setFormMessage('');
      } else {
        setFormStatus('error');
      }
    } catch {
      setFormStatus('error');
    }
  };

  return (
    <div className="min-h-screen bg-[#F8F6F2] dark:bg-[#0F172A] text-slate-900 dark:text-slate-100 flex flex-col selection:bg-[#F1613A] selection:text-white relative">
      {/* Top Notification Bar */}
      <div className="bg-[#29324E] text-white px-4 py-2 text-xs font-medium flex items-center justify-between gap-2 overflow-x-auto shadow-sm">
        <div className="flex items-center gap-2 mx-auto max-w-6xl w-full justify-between">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded bg-[#F1613A] text-white text-[10px] font-bold uppercase tracking-wider">
              Sandbox
            </span>
            <span className="text-slate-200 text-[11px] sm:text-xs">
              Ambiente Fictício para Testes de APIs, Webhooks e Liquidação de Vendas Online.
            </span>
          </div>
          <a
            href="https://optmaidea.com.br"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden sm:flex items-center gap-1 text-[11px] text-teal-300 hover:text-teal-200 transition font-semibold shrink-0"
          >
            <span>Conhecer Ecossistema OptmaIdea</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>

      {/* Main Public Header */}
      <header className="sticky top-0 z-40 bg-white/90 dark:bg-[#0F172A]/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-6xl w-full mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <Link to="/" className="flex items-center">
            <Logo heightClass="h-9 sm:h-10" />
          </Link>

          <nav className="hidden md:flex items-center gap-6 text-xs font-semibold text-slate-600 dark:text-slate-300">
            <a href="#recursos" className="hover:text-[#F1613A] transition">Recursos</a>
            <a href="#banners" className="hover:text-[#F1613A] transition">Visão Geral</a>
            <a href="#contato" className="hover:text-[#F1613A] transition">Fale Conosco</a>
            <a
              href="https://optmaidea.com.br"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-[#19A999] hover:underline"
            >
              <span>OptmaIdea</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </nav>

          <div className="flex items-center gap-2 sm:gap-3">
            {/* Theme Toggle */}
            <button
              onClick={() => setTheme(theme === 'dark' ? 'light' : theme === 'light' ? 'system' : 'dark')}
              className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition"
              title="Alternar Tema"
            >
              {theme === 'light' ? <Sun className="w-4 h-4 text-amber-500" /> : <Moon className="w-4 h-4 text-teal-400" />}
            </button>

            {/* Ações Públicas: Acessar Conta & Criar Conta */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => navigate('/login')}
                className="py-2 px-3.5 rounded-xl text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 font-bold text-xs transition border border-slate-200 dark:border-slate-700"
              >
                Acessar Conta
              </button>
              <button
                onClick={() => navigate('/signup')}
                className="py-2 px-3.5 sm:px-4 rounded-xl bg-[#F1613A] hover:bg-[#d94f2a] text-white font-bold text-xs shadow-md shadow-orange-950/20 transition flex items-center gap-1.5"
              >
                <span>Criar Conta</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main className="flex-1">
        <section className="max-w-6xl mx-auto px-4 py-12 sm:py-16 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          <div className="lg:col-span-7 space-y-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal-500/10 dark:bg-teal-500/20 text-[#19A999] border border-teal-500/30 text-xs font-bold uppercase tracking-wider">
              <Sparkles className="w-4 h-4" />
              <span>Simulador Financeiro de Nova Geração</span>
            </div>

            <h1 className="text-3xl sm:text-5xl font-extrabold text-slate-900 dark:text-white tracking-tight leading-tight">
              O Banco Digital de Testes para seu Ecossistema de Vendas
            </h1>

            <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed max-w-xl">
              Teste transferências <strong>Pix com QR Code dinâmico</strong>, emissão e quitação de boletos, cartões virtuais e webhooks em tempo real sem arriscar dinheiro real.
            </p>

            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <button
                onClick={() => navigate('/signup')}
                className="py-3.5 px-6 rounded-2xl bg-[#F1613A] hover:bg-[#d94f2a] text-white font-extrabold text-sm shadow-xl shadow-orange-950/20 transition flex items-center justify-center gap-2"
              >
                <span>Criar Conta</span>
                <ArrowRight className="w-4 h-4" />
              </button>

              <button
                onClick={() => navigate('/login')}
                className="py-3.5 px-6 rounded-2xl bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 font-bold text-sm transition flex items-center justify-center gap-2 shadow-sm"
              >
                <span>Acessar Conta</span>
              </button>
            </div>

            <div className="flex items-center gap-6 pt-4 text-xs text-slate-500 dark:text-slate-400 border-t border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-[#19A999]" />
                <span>100% Simulado (realMoney: false)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <RefreshCw className="w-4 h-4 text-amber-500" />
                <span>PostgreSQL Supabase Realtime</span>
              </div>
            </div>
          </div>

          {/* Hero Banner Visual */}
          <div className="lg:col-span-5 relative" id="banners">
            <div className="rounded-3xl overflow-hidden shadow-2xl border border-slate-200 dark:border-slate-800 bg-slate-900 group">
              <img
                src="/banner1.webp"
                alt="OptmaPay Sandbox Visual"
                className="w-full h-auto object-cover group-hover:scale-105 transition duration-500"
                loading="eager"
              />
            </div>
          </div>
        </section>

        {/* Banner 2 Feature Section */}
        <section className="bg-slate-100 dark:bg-slate-900/60 py-12 border-y border-slate-200 dark:border-slate-800">
          <div className="max-w-6xl mx-auto px-4 grid grid-cols-1 md:grid-cols-12 gap-8 items-center">
            <div className="md:col-span-6 rounded-3xl overflow-hidden shadow-xl border border-slate-200 dark:border-slate-800">
              <img
                src="/banner2.webp"
                alt="OptmaPay Mobile & WebApp"
                className="w-full h-auto object-cover"
                loading="lazy"
              />
            </div>
            <div className="md:col-span-6 space-y-4">
              <span className="text-[11px] font-bold text-[#F1613A] uppercase tracking-wider">
                Microcosmos de Liquidação
              </span>
              <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white">
                Simule Compras e Baixas entre Empresas e Clientes
              </h2>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                Cada operador gerencia sua própria conta digital no Supabase: visualize transações, emita cobranças por Pix ou boletos, confira o extrato e teste disparos de webhook em tempo real.
              </p>
              <ul className="space-y-2 text-xs text-slate-700 dark:text-slate-300 pt-2">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-[#19A999]" />
                  <span>Sincronização atômica instantânea sem reload</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-[#19A999]" />
                  <span>Leitor de QR Code via câmera mobile no navegador</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-[#19A999]" />
                  <span>Disparo de Webhooks HTTPS para seus sistemas externos</span>
                </li>
              </ul>
            </div>
          </div>
        </section>

        {/* Features Grid */}
        <section id="recursos" className="max-w-6xl mx-auto px-4 py-16 space-y-12">
          <div className="text-center space-y-2 max-w-xl mx-auto">
            <span className="text-[11px] font-bold text-[#19A999] uppercase tracking-wider">
              Módulos do Sistema
            </span>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white">
              Tudo o que você precisa para testar checkout
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="p-6 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm space-y-3">
              <div className="p-3 rounded-xl bg-teal-50 dark:bg-teal-950/60 text-[#19A999] w-fit">
                <QrCode className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Área Pix</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Cobrança dinâmica com valor fixo, QR Code estático e leitor de câmera com instrução de transação OptmaPay.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm space-y-3">
              <div className="p-3 rounded-xl bg-orange-50 dark:bg-orange-950/60 text-[#F1613A] w-fit">
                <RefreshCw className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Baixa de Duplicatas</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Simulador de liquidação de faturas de e-commerce com débito e crédito cruzados em tempo real.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm space-y-3">
              <div className="p-3 rounded-xl bg-purple-50 dark:bg-purple-950/60 text-[#7B2D8E] w-fit">
                <FileText className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Boletos Bancários</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Geração de linha digitável simulada e quitação com baixa imediata no saldo da conta recebedora.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm space-y-3">
              <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-500 w-fit">
                <Code2 className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Webhooks & API</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Logs de auditoria de eventos disparados, endpoints de teste `/api/sandbox/v1` e assinaturas HMAC.
              </p>
            </div>
          </div>
        </section>

        {/* Fale Conosco Form (Formspree) */}
        <section id="contato" className="max-w-4xl mx-auto px-4 py-16">
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-3xl p-6 sm:p-10 shadow-xl space-y-6">
            <div className="text-center space-y-2">
              <div className="p-3 rounded-2xl bg-orange-500/10 text-[#F1613A] w-fit mx-auto">
                <Mail className="w-6 h-6" />
              </div>
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
                Fale com a Equipe OptmaPay
              </h2>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Dúvidas sobre integrações, webhooks ou novas funcionalidades? Envie sua mensagem diretamente para nosso time.
              </p>
              <p className="text-[11px] font-mono text-[#19A999]">
                optmapay.faleconosco@optmaidea.com.br
              </p>
            </div>

            {formStatus === 'success' ? (
              <div className="p-6 rounded-2xl bg-emerald-950/80 border border-emerald-500 text-emerald-200 text-center space-y-2 animate-fadeIn">
                <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
                <h3 className="font-bold text-base text-white">Mensagem Enviada com Sucesso!</h3>
                <p className="text-xs text-emerald-300/90">
                  Agradecemos seu contato. Nossa equipe responderá no seu e-mail em breve.
                </p>
                <button
                  type="button"
                  onClick={() => setFormStatus('idle')}
                  className="mt-3 py-2 px-4 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white font-bold text-xs"
                >
                  Enviar Nova Mensagem
                </button>
              </div>
            ) : (
              <form onSubmit={handleContactSubmit} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Seu Nome Completo
                    </label>
                    <input
                      type="text"
                      required
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                      placeholder="Ex: João da Silva"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-[#F1613A] outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Seu E-mail Corporativo ou Pessoal
                    </label>
                    <input
                      type="email"
                      required
                      value={formEmail}
                      onChange={(e) => setFormEmail(e.target.value)}
                      placeholder="seu.email@empresa.com.br"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-[#F1613A] outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Assunto
                  </label>
                  <input
                    type="text"
                    value={formSubject}
                    onChange={(e) => setFormSubject(e.target.value)}
                    placeholder="Ex: Dúvida sobre integração Webhook / Pix Sandbox"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-[#F1613A] outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Mensagem
                  </label>
                  <textarea
                    rows={4}
                    required
                    value={formMessage}
                    onChange={(e) => setFormMessage(e.target.value)}
                    placeholder="Descreva seu projeto ou dúvida em detalhes..."
                    className="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-[#F1613A] outline-none resize-none"
                  />
                </div>

                {formStatus === 'error' && (
                  <div className="p-3 rounded-xl bg-rose-950/80 border border-rose-800 text-rose-300 text-xs">
                    Ocorreu uma falha ao enviar o formulário. Tente novamente ou envie diretamente para optmapay.faleconosco@optmaidea.com.br.
                  </div>
                )}

                <button
                  type="submit"
                  disabled={formStatus === 'sending'}
                  className="w-full py-3.5 bg-[#F1613A] hover:bg-[#d94f2a] text-white font-bold text-xs rounded-xl transition shadow-lg shadow-orange-950/20 flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <Send className="w-4 h-4" />
                  <span>{formStatus === 'sending' ? 'Enviando Mensagem...' : 'Enviar Mensagem para OptmaPay'}</span>
                </button>
              </form>
            )}
          </div>
        </section>
      </main>

      {/* Botão Flutuante Voltar ao Topo */}
      {showBackToTop && (
        <button
          type="button"
          onClick={scrollToTop}
          className="fixed bottom-6 right-6 z-50 p-3 rounded-2xl bg-[#19A999] hover:bg-[#158f81] text-white shadow-xl shadow-teal-950/30 transition-all transform hover:scale-110 flex items-center justify-center animate-fadeIn"
          title="Voltar ao topo da página"
        >
          <ChevronUp className="w-5 h-5" />
        </button>
      )}

      {/* Public Footer */}
      <footer className="bg-white dark:bg-[#0B1120] border-t border-slate-200 dark:border-slate-800 py-8 px-4 text-xs text-slate-500 dark:text-slate-400">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Logo heightClass="h-7" />
            <span className="text-[11px] text-slate-400 border-l border-slate-300 dark:border-slate-700 pl-3">
              Ambiente de Testes Fictício
            </span>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3 text-center sm:text-right">
            <Link to="/termos-de-uso" className="hover:text-[#F1613A] hover:underline font-semibold">
              Termos de Uso
            </Link>
            <span>•</span>
            <Link to="/politica-de-privacidade" className="hover:text-[#19A999] hover:underline font-semibold">
              Privacidade & LGPD
            </Link>
            <span>•</span>
            <span>Copyright © 2026</span>
            <a
              href="https://optmaidea.com.br"
              target="_blank"
              rel="noopener noreferrer"
              className="font-bold text-[#F1613A] hover:underline inline-flex items-center gap-1"
            >
              <span>OptmaIdea</span>
              <ExternalLink className="w-3 h-3 text-[#19A999]" />
            </a>
            <span>• Todos os direitos reservados.</span>
          </div>
        </div>
      </footer>
    </div>
  );
};
