import { useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppProviders } from './providers/AppProviders';
import { prefetchApi } from '@/lib/useApi';
import { AppShell } from '@/components/layout/AppShell';
import { AppErrorBoundary } from '@/components/layout/AppErrorBoundary';
import { DashboardPage } from '@/features/market/pages/DashboardPage';
import { SectorsPage } from '@/features/market/pages/SectorsPage';
import { WatchlistPage } from '@/features/watchlist/pages/WatchlistPage';
import { ResearchPage } from '@/features/research/pages/ResearchPage';
import { ScreenerPage } from '@/features/screener/pages/ScreenerPage';
import { AccountsPage } from '@/features/accounts/pages/AccountsPage';
import { AccountManagerPage } from '@/features/accounts/pages/AccountManagerPage';
import { MacroPage } from '@/features/macro/pages/MacroPage';

export default function App() {
  useEffect(() => {
    prefetchApi(['/watchlist', '/research', '/accounts', '/market/dashboard', '/market/sectors', '/macro/indicators']);
  }, []);
  return <AppProviders><BrowserRouter><Routes>
    <Route element={<AppErrorBoundary><AppShell /></AppErrorBoundary>}>
      <Route index element={<Navigate to="/dashboard" replace />} />
      <Route path="/dashboard" element={<DashboardPage />} />
      <Route path="/sectors" element={<SectorsPage />} />
      <Route path="/watchlist" element={<WatchlistPage />} />
      <Route path="/research" element={<ResearchPage />} />
      <Route path="/screener" element={<ScreenerPage />} />
      <Route path="/accounts" element={<AccountsPage />} />
      <Route path="/accounts/manage" element={<AccountManagerPage />} />
      <Route path="/macro" element={<MacroPage />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Route>
  </Routes></BrowserRouter></AppProviders>;
}
