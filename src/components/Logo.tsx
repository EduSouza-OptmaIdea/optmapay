import React from 'react';

interface LogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  showBadge?: boolean;
}

export const Logo: React.FC<LogoProps> = ({ className = '', size = 'md' }) => {
  const iconHeight = size === 'sm' ? 32 : size === 'lg' ? 48 : 40;
  const iconWidth = Math.round(iconHeight * 1.05);

  return (
    <div className={`flex items-center gap-2.5 select-none ${className}`}>
      {/* Icon: Double Coin Stacks + Upward Growth Arrow */}
      <svg
        width={iconWidth}
        height={iconHeight}
        viewBox="0 0 110 100"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="shrink-0"
      >
        {/* Growth Arrow Chart */}
        <path
          d="M32 38L52 14L74 34L94 10"
          stroke="#26c6da"
          strokeWidth="8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M74 10H94V30"
          stroke="#26c6da"
          strokeWidth="8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Left Coin Stack */}
        <g stroke="#26c6da" strokeWidth="6" fill="none">
          {/* Top Coin */}
          <ellipse cx="28" cy="46" rx="20" ry="8" fill="#e0f7fa" className="dark:fill-slate-900" />
          {/* Middle Coin Rim */}
          <path d="M8 56C8 60.4 17 64 28 64C39 64 48 60.4 48 56" />
          {/* Bottom Coin Rim */}
          <path d="M8 66C8 70.4 17 74 28 74C39 74 48 70.4 48 66" />
          {/* Base Rim */}
          <path d="M8 76C8 80.4 17 84 28 84C39 84 48 80.4 48 76" />
          {/* Left/Right Vertical edges */}
          <line x1="8" y1="46" x2="8" y2="76" strokeLinecap="round" />
          <line x1="48" y1="46" x2="48" y2="76" strokeLinecap="round" />
        </g>

        {/* Right Coin Stack */}
        <g stroke="#26c6da" strokeWidth="6" fill="none">
          {/* Top Coin */}
          <ellipse cx="64" cy="52" rx="20" ry="8" fill="#e0f7fa" className="dark:fill-slate-900" />
          {/* Middle Coin Rim */}
          <path d="M44 62C44 66.4 53 70 64 70C75 70 84 66.4 84 62" />
          {/* Bottom Coin Rim */}
          <path d="M44 72C44 76.4 53 80 64 80C75 80 84 76.4 84 72" />
          {/* Base Rim */}
          <path d="M44 82C44 86.4 53 90 64 90C75 90 84 86.4 84 82" />
          {/* Left/Right Vertical edges */}
          <line x1="44" y1="52" x2="44" y2="82" strokeLinecap="round" />
          <line x1="84" y1="52" x2="84" y2="82" strokeLinecap="round" />
        </g>
      </svg>

      {/* Typography: OPTMA + Pay + SANDBOX DEV BANK */}
      <div className="flex flex-col leading-none">
        <div className="flex items-baseline gap-1">
          <span className="font-extrabold tracking-wide text-slate-800 dark:text-white text-lg sm:text-xl font-sans">
            OPTMA
          </span>
          <span className="font-black text-xl sm:text-2xl text-[#f36c3d] tracking-tight">
            Pay
          </span>
        </div>
        <span className="text-[8.5px] sm:text-[9.5px] font-bold text-slate-600 dark:text-slate-400 tracking-[0.22em] uppercase mt-0.5 font-sans">
          SANDBOX DEV BANK
        </span>
      </div>
    </div>
  );
};
