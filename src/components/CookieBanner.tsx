import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Cookie, ShieldCheck, Check } from 'lucide-react';

export const CookieBanner: React.FC = () => {
  const [accepted, setAccepted] = useState(true);

  useEffect(() => {
    const isAccepted = localStorage.getItem('optmapay_cookie_consent');
    if (!isAccepted) {
      setAccepted(false);
    }
  }, []);

  const handleAccept = () => {
    localStorage.setItem('optmapay_cookie_consent', 'true');
    setAccepted(true);
  };

  if (accepted) return null;

  return (
    <div className="fixed bottom-3 left-3 right-3 sm:left-auto sm:right-6 sm:max-w-md z-50 p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-3 animate-fadeIn">
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-xl bg-orange-500/10 text-[#F1613A] shrink-0 mt-0.5">
          <Cookie className="w-5 h-5" />
        </div>
        <div className="space-y-1">
          <p className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
            <span>Privacidade & Cookies (LGPD)</span>
            <ShieldCheck className="w-3.5 h-3.5 text-[#19A999]" />
          </p>
          <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
            Utilizamos apenas cookies essenciais para autenticação de sessão e preferências locais. Não vendemos nem compartilhamos seus dados com terceiros.
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-100 dark:border-slate-800 text-xs">
        <Link
          to="/politica-de-privacidade"
          className="text-[11px] text-[#19A999] hover:underline font-semibold"
        >
          Ler Política de Privacidade
        </Link>
        <button
          onClick={handleAccept}
          className="py-1.5 px-3.5 rounded-xl bg-[#F1613A] hover:bg-[#d94f2a] text-white font-bold text-xs transition flex items-center gap-1 shadow-sm"
        >
          <Check className="w-3.5 h-3.5" />
          <span>Entendi e Aceito</span>
        </button>
      </div>
    </div>
  );
};
