import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';

export function useApi<T>(path: string | null, dependencies: readonly unknown[] = [], options: { refetchIntervalMs?: number; mergeData?: (incoming: T, current: T | null) => T } = {}) {
  const [data, setData] = useState<T | null>(null);
  const [dataPath, setDataPath] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(path));
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [version, setVersion] = useState(0);
  const hasData = useRef(false);
  const inFlight = useRef(false);
  const previousPath = useRef<string | null>(null);
  const refresh = useCallback(() => setVersion(value => value + 1), []);

  useEffect(() => {
    if (!path) {
      previousPath.current = null;
      hasData.current = false;
      inFlight.current = false;
      setData(null);
      setDataPath(null);
      setLoading(false);
      setError(null);
      setWarning(null);
      return;
    }
    if (previousPath.current !== path) {
      previousPath.current = path;
      hasData.current = false;
      setData(null);
    }
    const controller = new AbortController();
    inFlight.current = true;
    setLoading(!hasData.current);
    setRefreshing(hasData.current);
    setError(null);
    api.get<T>(path, controller.signal)
      .then(result => {
        if (controller.signal.aborted) return;
        inFlight.current = false;
        hasData.current = true;
        setData(current => options.mergeData ? options.mergeData(result, current) : result);
        setDataPath(path);
        setUpdatedAt(Date.now());
        setLoading(false);
        setRefreshing(false);
        setWarning(null);
      })
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === 'AbortError') return;
        inFlight.current = false;
        const message = reason instanceof Error ? reason.message : '加载失败';
        if (hasData.current) setWarning(message);
        else setError(message);
        setLoading(false);
        setRefreshing(false);
      });
    return () => { inFlight.current = false; controller.abort(); };
  }, [path, version, ...dependencies]);

  useEffect(() => {
    if (!path || !options.refetchIntervalMs) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible' && !inFlight.current) refresh();
    }, options.refetchIntervalMs);
    return () => window.clearInterval(timer);
  }, [path, options.refetchIntervalMs, refresh]);

  return { data, dataPath, loading, refreshing, error, warning, updatedAt, refresh, setData };
}

export function useDebouncedValue<T>(value: T, delay = 250) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}
