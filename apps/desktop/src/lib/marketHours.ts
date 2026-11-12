export type MarketRegion = 'CN' | 'HK' | 'US';

export function marketSession(region: MarketRegion, date = new Date()) {
  const zone = region === 'US' ? 'America/New_York' : 'Asia/Shanghai';
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: zone, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  if (['Sat', 'Sun'].includes(values.weekday ?? '')) return { label: '休市', open: false };
  const minutes = Number(values.hour) * 60 + Number(values.minute);
  const sessions: [number, number][] = region === 'HK' ? [[570, 720], [780, 960]] : region === 'CN' ? [[570, 690], [780, 900]] : [[570, 960]];
  if (sessions.some(([start, end]) => minutes >= start && minutes < end)) return { label: '交易中', open: true };
  if (minutes < sessions[0]![0]) return { label: '未开盘', open: false };
  if (minutes < sessions[sessions.length - 1]![1]) return { label: '午间休市', open: false };
  return { label: '已收盘', open: false };
}
