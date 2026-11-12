export const marketEndpoints = {
  dashboard: '/market/dashboard',
  sectors: '/market/sectors',
  candles: (instrumentId: string, period: string) => `/market/instruments/${instrumentId}/candles?period=${period}`,
} as const;
