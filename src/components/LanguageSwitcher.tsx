import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, Globe2 } from 'lucide-react';

/**
 * O português brasileiro é o único idioma com catálogo revisado nesta etapa.
 * EN e ES aparecem na navegação, mas NÃO fingem que o aplicativo está traduzido.
 * Quando seus catálogos forem homologados, o seletor poderá ativá-los de verdade.
 */
const languages = [
  { code: 'PT', flag: '🇧🇷', name: 'Português (Brasil)', available: true },
  { code: 'EN', flag: '🇺🇸', name: 'Inglês (em preparação)', available: false },
  { code: 'ES', flag: '🇪🇸', name: 'Espanhol (em preparação)', available: false },
] as const;

export const LanguageSwitcher: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
        setNotice('');
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        setNotice('');
      }
    };
    document.addEventListener('mousedown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, []);

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        aria-label="Selecionar idioma do aplicativo"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => { setOpen(value => !value); setNotice(''); }}
        className="flex min-h-10 items-center gap-1.5 rounded-xl border border-slate-200 bg-white/90 px-2.5 py-2 text-xs font-bold text-slate-800 shadow-sm transition hover:border-teal-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
        title="Idioma: Português (Brasil)"
      >
        <span className="text-base" role="img" aria-label="Bandeira do Brasil">🇧🇷</span>
        <span>PT</span>
        {!compact && <Globe2 size={13} className="hidden sm:inline opacity-70" />}
        <ChevronDown size={13} aria-hidden="true" />
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Opções de idioma"
          className="absolute right-0 top-full z-[90] mt-2 w-60 overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 shadow-xl dark:border-slate-700 dark:bg-slate-900"
        >
          {languages.map(language => (
            <button
              type="button"
              role="menuitem"
              key={language.code}
              aria-current={language.available ? 'true' : undefined}
              onClick={() => {
                if (language.available) {
                  document.documentElement.lang = 'pt-BR';
                  setNotice('');
                  setOpen(false);
                  return;
                }
                setNotice('Tradução em preparação. A interface continuará em português do Brasil.');
              }}
              className={'w-full flex items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm transition hover:bg-slate-100 dark:hover:bg-slate-800 ' +
                (language.available ? 'font-bold text-teal-700 dark:text-teal-300' : 'text-slate-600 dark:text-slate-300')}
            >
              <span className="text-lg" role="img" aria-label={'Bandeira: ' + language.code}>{language.flag}</span>
              <span className="flex-1">{language.code}</span>
              <span className="text-[11px]">{language.available ? 'Ativo' : 'Em breve'}</span>
            </button>
          ))}
          {notice && <p role="status" className="m-1 rounded-lg bg-amber-50 p-2 text-xs leading-5 text-amber-900 dark:bg-amber-950 dark:text-amber-100">{notice}</p>}
        </div>
      )}
    </div>
  );
};
