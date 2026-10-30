import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'outline' | 'ghost';
  dotClassName?: string;
  showDot?: boolean;
  /** Renders a real link with the same look. A button nested in an anchor is invalid
      HTML and iOS Safari does not reliably follow it. */
  href?: string;
  target?: string;
  rel?: string;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  className = '',
  dotClassName = '',
  showDot = true,
  href,
  target,
  rel,
  ...props
}) => {
  // Base styles, font-normal text-base leading-[1.2] per design spec
  const baseStyles =
    'pill-btn inline-flex items-center gap-2.5 px-6 py-3 rounded-full font-normal text-base leading-[1.2] transition-all duration-200 active:transform active:scale-95';

  // Matches the main site button exactly: #2333df fill, 1px #0f0f0f border.
  // The hover is the label roll-up (see .pill-btn in index.css), not a colour
  // or shadow change, so these read the same as the buttons on healthmatters.clinic.
  const variants = {
    primary:
      'bg-[#2333df] text-white border border-solid border-[#0f0f0f]',
    outline:
      'bg-white text-[#1a1a1a] border border-solid border-[#0f0f0f]',
    ghost:
      'bg-transparent border-transparent text-gray-500 hover:text-black shadow-none border-none p-0',
  };

  // 6px dot, white on primary and #0f0f0f on outline, matching the site spec
  const dotColor = variant === 'primary' ? 'bg-white' : 'bg-[#0f0f0f]';

  const classes = `${variant !== 'ghost' ? baseStyles : ''} ${variants[variant]} ${className}`;
  const inner = (
    <>
      {showDot && variant !== 'ghost' && (
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColor} ${dotClassName}`} />
      )}
      {variant === 'ghost' ? children : (
        <span className="pill-clip">
          <span className="pill-label">{children}</span>
          {/* Second copy is the one that rolls up into view; hidden from AT so the
              label is not announced twice. */}
          <span className="pill-label pill-label-alt" aria-hidden="true">{children}</span>
        </span>
      )}
    </>
  );

  if (href) {
    return (
      <a
        href={href}
        target={target}
        rel={rel}
        className={classes}
        onClick={props.onClick as unknown as React.MouseEventHandler<HTMLAnchorElement>}
      >
        {inner}
      </a>
    );
  }

  return (
    <button className={classes} {...props}>
      {inner}
    </button>
  );
};
