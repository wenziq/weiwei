import type { Currency } from '@weiwei/contracts';

export function signed(value: number | null | undefined, digits = 2) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return `${value >= 0 ? '+' : '−'}${Math.abs(value).toFixed(digits)}%`;
}
export function direction(value: number | null | undefined) { return value === null || value === undefined ? 'neutral' : value >= 0 ? 'up' : 'down'; }
export function amount(value: number | null | undefined) {
  if (!value || value <= 0) return '—';
  return value >= 10000 ? `${(value / 10000).toFixed(2)} 万亿` : `${value.toFixed(1)} 亿`;
}
export function money(value: number | null | undefined, currency: Currency = 'CNY') {
  if (value === null || value === undefined) return '—';
  const prefix = { CNY: '¥ ', HKD: 'HK$ ', USD: '$ ', CNH: 'CN¥ ' }[currency];
  return `${prefix}${value.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
export function dateTime(value: string) { return new Date(value).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }); }
export function compactNumber(value: number | null | undefined) { return value === null || value === undefined ? '—' : value.toLocaleString('zh-CN'); }
export function csvCell(value: unknown) {
  const text = String(value ?? '');
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}
export function downloadText(filename: string, content: string, type = 'text/plain;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
