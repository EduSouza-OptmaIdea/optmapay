import React from 'react';
import { useTheme } from '../context/ThemeContext';

interface LogoProps {
  className?: string;
  variant?: 'light' | 'dark' | 'auto';
  heightClass?: string;
}

export const Logo: React.FC<LogoProps> = ({
  className = '',
  variant = 'auto',
  heightClass = 'h-8 sm:h-9',
}) => {
  const { resolvedTheme } = useTheme();

  const isDark = variant === 'dark' ? true : variant === 'light' ? false : resolvedTheme === 'dark';

  const logoSrc = isDark
    ? '/optmapay-logo-tema-escuro.webp'
    : '/optmapay-logo-tema-claro.webp';

  return (
    <div className={`flex items-center select-none ${className}`}>
      <img
        src={logoSrc}
        alt="OptmaPay Sandbox Dev Bank"
        className={`${heightClass} w-auto object-contain transition-opacity duration-200`}
        loading="eager"
      />
    </div>
  );
};
