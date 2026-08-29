import React from 'react';

interface LogoProps {
  className?: string;
  showBadge?: boolean;
}

export const Logo: React.FC<LogoProps> = ({ className = 'h-8', showBadge = true }) => {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      {/* OptmaIdea Geometric Icon */}
      <div className="relative flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-teal-600 via-teal-700 to-slate-900 shadow-md shadow-teal-900/20 text-white font-bold text-lg tracking-wider">
        <svg className="w-5 h-5 text-teal-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
        </svg>
      </div>

      <div className="flex flex-col">
        <div className="flex items-center gap-1.5 leading-none">
          <span className="font-extrabold tracking-tight text-xl text-slate-900 dark:text-white">
            Optma<span className="text-teal-600 dark:text-teal-400">Pay</span>
          </span>
          {showBadge && (
            <span className="px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-teal-100 dark:bg-teal-950/80 text-teal-700 dark:text-teal-300 border border-teal-300 dark:border-teal-800 rounded">
              Sandbox
            </span>
          )}
        </div>
        <span className="text-[10px] text-slate-400 dark:text-slate-500 tracking-wider uppercase font-semibold mt-0.5">
          OptmaIdea Ecosystem
        </span>
      </div>
    </div>
  );
};
