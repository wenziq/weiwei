import { createContext, ReactNode, useContext, useState } from 'react';
import { usePersistentState } from '@/lib/usePersistentState';

interface AppContextValue {
  theme: 'dark' | 'light';
  toggleTheme: () => void;
  fontScale: 'standard' | 'large' | 'xlarge';
  setFontScale: (scale: 'standard' | 'large' | 'xlarge') => void;
  notify: (message: string) => void;
}
const AppContext = createContext<AppContextValue | null>(null);

export function AppProviders({ children }: { children: ReactNode }) {
  const [theme, setTheme] = usePersistentState<'dark' | 'light'>('weiwei-theme', 'dark');
  const [fontScale, setFontScale] = usePersistentState<'standard' | 'large' | 'xlarge'>('weiwei-font-scale', 'large');
  const [toast, setToast] = useState('');
  const value = {
    theme,
    fontScale,
    setFontScale,
    toggleTheme: () => setTheme(current => current === 'dark' ? 'light' : 'dark'),
    notify: (message: string) => {
      setToast(message);
      window.setTimeout(() => setToast(''), 2200);
    },
  };
  return <AppContext.Provider value={value}>
    <div className={`app-root ${theme === 'light' ? 'light' : ''} font-${fontScale}`}>{children}</div>
    {toast && <div className="toast" role="status">{toast}</div>}
  </AppContext.Provider>;
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used inside AppProviders');
  return context;
}
