import React from 'react';
import { cn } from '@/lib/utils';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost';
  size?: 'default' | 'sm' | 'lg' | 'icon';
}

export function Button({
  className,
  variant = 'default',
  size = 'default',
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center rounded-lg text-sm font-medium transition-all duration-200',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2',
        'disabled:pointer-events-none disabled:opacity-50',
        'active:scale-95',
        {
          'bg-primary-600 text-white hover:bg-primary-700 shadow-sm hover:shadow': variant === 'default',
          'bg-red-600 text-white hover:bg-red-700 shadow-sm hover:shadow': variant === 'destructive',
          'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 hover:border-gray-400': variant === 'outline',
          'bg-gray-100 text-gray-900 hover:bg-gray-200': variant === 'secondary',
          'hover:bg-gray-100 hover:text-gray-900': variant === 'ghost',
        },
        {
          'h-10 px-6 py-2.5': size === 'default',
          'h-9 rounded-md px-4 text-xs': size === 'sm',
          'h-12 rounded-lg px-8 text-base': size === 'lg',
          'h-10 w-10 p-0': size === 'icon',
        },
        className
      )}
      {...props}
    />
  );
}
