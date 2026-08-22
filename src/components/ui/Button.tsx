import React from 'react';
import { cn } from '../../lib/utils';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'brand' | 'danger' | 'purpleLight';
  size?: 'sm' | 'md' | 'lg' | 'icon';
  isLoading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', isLoading, children, disabled, ...props }, ref) => {
    const baseStyles = "inline-flex items-center justify-center font-medium rounded-lg transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed select-none";

    const variants = {
      primary: "bg-slate-900 text-white hover:bg-slate-800 focus:ring-slate-900 shadow-sm active:scale-[0.99]",
      secondary: "bg-slate-100 text-slate-700 hover:bg-slate-200 focus:ring-slate-400 active:scale-[0.99]",
      outline: "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-300 focus:ring-slate-400 shadow-sm",
      ghost: "text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus:ring-slate-300",
      brand: "bg-brand-600 text-white hover:bg-brand-700 focus:ring-brand-500 shadow-sm active:scale-[0.99]",
      purpleLight: "bg-brand-50 text-brand-700 border border-brand-200/60 hover:bg-brand-100/70 focus:ring-brand-400",
      danger: "bg-red-600 text-white hover:bg-red-700 focus:ring-red-500 shadow-sm active:scale-[0.99]"
    };

    const sizes = {
      sm: "text-xs px-2.5 py-1.5 gap-1.5",
      md: "text-sm px-3.5 py-2 gap-2",
      lg: "text-base px-4.5 py-2.5 gap-2.5",
      icon: "p-2 aspect-square"
    };

    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={cn(baseStyles, variants[variant], sizes[size], className)}
        {...props}
      >
        {isLoading && (
          <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-current" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
        )}
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';
