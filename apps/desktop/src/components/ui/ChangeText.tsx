import { direction, signed } from '@/lib/format';

export function ChangeText({ value, className = '', suffix = '' }: { value: number | null | undefined; className?: string; suffix?: string }) {
  return <span className={`${direction(value)} ${className}`}>{signed(value)}{value === null || value === undefined ? '' : suffix}</span>;
}
