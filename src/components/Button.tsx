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
  const baseStyles =
    'pill-btn inline-flex items-center gap-2 px-6 py-3 rounded-full font-semibold text-xs transition-all duration-200 border-2 shadow-sm active:transform active:scale-95 uppercase tracking-wider';

  const variants = {
    primary:
      'bg-[#233dff] text-white border-[#233dff] hover:bg-[#1a2b99] hover:border-[#1a2b99] hover:shadow-[0_4px_12px_rgba(35,61,255,0.3)]',
    outline:
      'bg-white text-[#233dff] border-[#233dff] hover:bg-[#f0f4ff] hover:shadow-[0_4px_12px_rgba(35,61,255,0.15)]',
    ghost:
      'bg-transparent border-transparent text-gray-500 hover:text-black shadow-none border-none p-0',
  };

  const dotColor = variant === 'primary' ? 'bg-white' : 'bg-[#233dff]';

  return (
    <button
      className={`${variant !== 'ghost' ? baseStyles : ''} ${variants[variant]} ${className}`}
      {...props}
    >
      {showDot && variant !== 'ghost' && (
        <span className={`w-1.5 h-1.5 rounded-full ${dotColor} ${dotClassName}`} />
      )}
      {children}
    </button>
  );
};
