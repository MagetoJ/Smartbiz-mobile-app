import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency: 'KES',
  }).format(amount);
}

export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat('en-KE', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date));
}

export function formatShortDate(date: string | Date): string {
  return new Intl.DateTimeFormat('en-KE', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(date));
}

/**
 * Parse a date string from the backend as UTC
 * Backend stores timestamps without timezone suffix, so we need to treat them as UTC
 */
export function parseAsUTC(date: string | Date): Date {
  if (date instanceof Date) return date;
  // If the string doesn't have timezone info (Z or +/-), append Z to treat as UTC
  if (!date.endsWith('Z') && !date.match(/[+-]\d{2}:\d{2}$/)) {
    return new Date(date + 'Z');
  }
  return new Date(date);
}

/**
 * Format date in tenant's timezone
 * @param date - Date string or Date object (UTC from backend)
 * @param timezone - Tenant timezone (e.g., "Africa/Nairobi")
 * @param options - Intl.DateTimeFormat options
 */
export function formatDateInTimezone(
  date: string | Date,
  timezone: string = 'Africa/Nairobi',
  options?: Intl.DateTimeFormatOptions
): string {
  const defaultOptions: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: timezone,
  };

  return new Intl.DateTimeFormat('en-US', options || defaultOptions).format(parseAsUTC(date));
}
