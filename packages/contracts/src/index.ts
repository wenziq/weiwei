export type ISODateTime = string;
export type MarketCode = 'SH' | 'SZ' | 'BJ' | 'HK' | 'US' | 'CSI';
export type Currency = 'CNY' | 'HKD' | 'USD' | 'CNH';
export type DataStatus = 'snapshot' | 'cached' | 'unavailable';
export type ResearchStatus = '未研究' | '待研究' | '已完成' | '已放弃';

export interface SparklinePoint { values: number[] }
export interface DataProvenance {
  dataSource: string;
  dataStatus: DataStatus;
  quoteTime: string | null;
}
export interface IndexQuote extends DataProvenance {
  id: string;
  name: string;
  code: string;
  group: string;
  point: number | null;
  changePct: number | null;
  amount: number | null;
  deltaPct: number | null;
  marketState: string;
  spark: number[];
}
export interface Sector extends DataProvenance {
  id: string;
  name: string;
  type: '行业' | '概念' | '自定义';
  changePct: number | null;
  amount: number | null;
  deltaPct: number | null;
  up: number | null;
  down: number | null;
  leader: string;
  leaderChangePct: number | null;
  flow: number | null;
  etf: string;
  spark: number[];
}
export interface BreadthBucket {
  label: string;
  range: string;
  count: number;
  side: 'negative' | 'zero' | 'positive';
}
export interface TurnoverComparison {
  total: number | null;
  deltaPct: number | null;
  today: number[];
  previous: (number | null)[];
}
export interface DashboardData extends DataProvenance {
  indices: IndexQuote[];
  sectors: Sector[];
  breadth: BreadthBucket[];
  turnover: TurnoverComparison;
}
export interface Instrument extends DataProvenance {
  id: string;
  name: string;
  code: string;
  market: MarketCode;
  price: number | null;
  currency: Currency;
  changePct: number | null;
  amount: number | null;
  deltaPct: number | null;
  turnover: number | null;
  sincePct: number;
  industry: string;
  status: ResearchStatus;
  tags: string[];
  spark: number[];
  cap: number | null;
  dividend: number | null;
  roe: number | null;
  net: number | null;
  debt: number | null;
  financialSource: string | null;
  financialReport: string | null;
}
export interface WatchlistData { stocks: Instrument[]; tags: string[]; quotesRefreshing: boolean }
export interface TagUpdate { tags: string[] }
export interface MacroIndicator {
  id: string;
  name: string;
  category: string;
  region: string;
  unit: string;
  frequency: string;
  latest: number | null;
  previous: number | null;
  change: number | null;
  time: number | null;
  points: number;
  source: string;
  sourceUrl: string | null;
  custom: boolean;
  refreshing: boolean;
  error: string | null;
}
export interface MacroPoint { time: number; date: string; value: number }
export interface MacroSeries {
  id: string;
  name: string;
  unit: string;
  category: string;
  region: string;
  source: string;
  sourceUrl: string | null;
  points: MacroPoint[];
  refreshing: boolean;
  error: string | null;
}
export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  amount?: number | null;
}
export interface CandleSeries {
  instrumentId: string;
  period: string;
  adjustment: 'none' | 'qfq' | 'hfq';
  source: string;
  status: DataStatus;
  servedBy: 'database' | 'network' | 'demo';
  fetchedAt: string | null;
  refreshing: boolean;
  partial: boolean;
  message: string | null;
  candles: Candle[];
}
export interface MarketHistoryStats { instruments: number; withHistory: number; rows: number }
export interface HistoryStats { instruments: number; candles: number; databaseBytes: number; markets: Record<string, MarketHistoryStats> }
export interface HistoryStatus {
  runId: number | null;
  running: boolean;
  markets: string[];
  period: string;
  total: number;
  completed: number;
  failed: number;
  rowsCollected: number;
  currentId: string | null;
  error: string | null;
  startedAt: string | null;
  updatedAt: string | null;
  finishedAt: string | null;
  runStatus: 'idle' | 'running' | 'paused' | 'complete' | 'failed' | 'interrupted';
  stats: HistoryStats;
}
export interface ResearchDocument {
  id: string;
  instrumentId: string;
  title: string;
  status: ResearchStatus;
  attitude: string;
  tags: string[];
  contentMarkdown: string;
  completedAt: string | null;
  reviewAt: string | null;
  updatedAt: ISODateTime;
  history?: ResearchVersion[];
}
export interface ResearchVersion {
  updatedAt: ISODateTime;
  contentMarkdown: string;
  tags: string[];
  status: ResearchStatus;
  attitude: string;
  completedAt: string | null;
  reviewAt: string | null;
}
export interface ResearchUpdate {
  contentMarkdown: string;
  tags: string[];
  status: ResearchStatus;
  attitude: string;
}
export interface ResearchMetadataUpdate {
  status: ResearchStatus;
  attitude: string;
  tags: string[];
  completedAt: string | null;
  reviewAt: string | null;
}
export interface ScreenerCondition {
  field: 'dividend' | 'cap' | 'roe' | 'net' | 'debt' | 'industry' | 'concept' | 'price' | 'changePct' | 'amount' | 'turnover';
  operator: 'gte' | 'lte' | 'between' | 'include' | 'exclude';
  value: number | string | number[];
}
export interface ScreenerRequest { conditions: ScreenerCondition[]; limit?: number; market?: 'all' | 'CN' | 'HK' | 'US' }
export interface ScreenerResult { stocks: Instrument[]; count: number; elapsedMs: number; universeSize: number; market: string; partial: boolean }
export interface ScreenerCoverage {
  universeSize: number;
  markets: Record<'CN' | 'HK' | 'US', { total: number; withFinancials: number }>;
  boards: { total: number; covered: number };
  running: boolean;
  stage: string;
  error: string | null;
  updatedAt: number | null;
}
export type AccountType = '实盘账户' | '汇总账户' | '模拟盘';
export interface Account {
  id: string;
  name: string;
  type: AccountType;
  currency: Currency;
  description: string;
  start: string;
  initial: number;
  commission: number;
  minFee: number;
  stamp: number;
  fill: string;
  members: string[];
  records: number;
}
export interface AccountPosition {
  instrumentId: string;
  name: string;
  code: string;
  market: string;
  currency: Currency;
  quantity: number;
  costPrice: number;
  price: number | null;
  marketValue: number | null;
  weight: number | null;
  unrealizedPnl: number | null;
  realizedPnl: number;
  returnPct: number | null;
}
export interface AccountEquityPoint { date: string; value: number }
export interface AccountSummary {
  accountId: string;
  currency: Currency;
  totalAssets: number | null;
  cash: number | null;
  marketValue: number | null;
  dayPnl: number | null;
  totalPnl: number | null;
  totalReturn: number | null;
  unrealizedPnl: number | null;
  realizedPnl: number | null;
  positions: AccountPosition[];
  curve: AccountEquityPoint[];
  warnings: string[];
}
export interface AccountInput {
  name: string;
  type: AccountType;
  currency: Currency;
  description: string;
  initial: number;
  members: string[];
}
export interface ApiHealth { status: string; provider: string; version: string; time: ISODateTime }
export interface AIStatus {
  provider: string;
  baseUrl: string;
  model: string;
  configured: boolean;
  keySource: 'keychain' | 'environment' | null;
}
export interface TransactionInput {
  type: 'buy' | 'sell' | 'deposit' | 'withdraw';
  instrumentId?: string;
  quantity?: number;
  price?: number;
  amount?: number;
  fee?: number;
  date: string;
  note?: string;
}
export interface Transaction extends TransactionInput {
  id: string;
  accountId: string;
  amount: number;
  createdAt: ISODateTime;
}
export interface TransactionImportResult { imported: number; transactionIds: string[] }
