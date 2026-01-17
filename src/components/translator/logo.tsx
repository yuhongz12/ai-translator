import Link from 'next/link';
import { Outfit } from 'next/font/google';

const logoFont = Outfit({ subsets: ['latin'], weight: ['500', '700'] });

interface LogoProps {
  className?: string;
  variant?: 'default' | 'gradient' | 'minimal';
}

const ProlingualLogo = ({ className = 'text-2xl', variant = 'default' }: LogoProps) => {
  // Added 'text-2xl' as a default above ^, but it can now be overridden
  
  const baseStyles = `flex items-center gap-1 no-underline ${logoFont.className} ${className}`;

  if (variant === 'gradient') {
    return (
      <Link href="/" className={baseStyles}>
        {/* Removed 'text-2xl' here so it inherits from baseStyles */}
        <span className="font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-teal-500 tracking-tight">
          Prolingual
        </span>
      </Link>
    );
  }

  if (variant === 'minimal') {
    return (
      <Link href="/" className={baseStyles}>
        {/* Removed 'text-2xl' here */}
        <span className="font-bold text-gray-900 dark:text-white tracking-tighter">
          prolingual
          <span className="text-blue-600">.</span>
        </span>
      </Link>
    );
  }

  return (
    <Link href="/" className={baseStyles} aria-label="Prolingual Home">
      <div className="flex flex-col leading-none">
        {/* Removed 'text-2xl' here */}
        <span className="font-bold text-slate-900 dark:text-white tracking-tight">
          Pro
          <span className="font-medium text-slate-500 dark:text-slate-400">lingual</span>
        </span>
      </div>
    </Link>
  );
};

export default ProlingualLogo;