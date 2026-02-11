import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'outline' | 'ghost';
  dotClassName?: string;
  showDot?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  className = '',
  dotClassName = '',
  showDot = true,
  ...props
}) => {
  // Base styles — font-normal text-base leading-[1.2] per design spec
  const baseStyles =
    'pill-btn inline-flex items-center gap-2.5 px-6 py-3 rounded-full font-normal text-base leading-[1.2] transition-all duration-200 active:transform active:scale-95';

  const variants = {
    primary:
      'bg-[#233dff] text-white border border-[#233dff] hover:bg-[#1a2b99] hover:shadow-[0_4px_16px_rgba(35,61,255,0.35)]',
    outline:
      'bg-white text-[#1a1a1a] border border-[#0f0f0f] hover:bg-gray-50 hover:shadow-[0_4px_12px_rgba(0,0,0,0.1)]',
    ghost:
      'bg-transparent border-transparent text-gray-500 hover:text-black shadow-none border-none p-0',
  };

  // White dot for primary, #0f0f0f dot for outline (per design spec)
  const dotColor = variant === 'primary' ? 'bg-white' : 'bg-[#0f0f0f]';

  return (
    <button
      className={`${variant !== 'ghost' ? baseStyles : ''} ${variants[variant]} ${className}`}
      {...props}
    >
      {showDot && variant !== 'ghost' && (
        <span className={`w-2 h-2 rounded-full ${dotColor} ${dotClassName}`} />
      )}
      {children}
    </button>
  );
};
