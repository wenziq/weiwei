import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';

interface CachedResponse { data: unknown; updatedAt: number }
const responseCache = new Map<string, CachedResponse>();
const pendingRequests = new Map<string, Promise<unknown>>();

function cachedResponse<T>(path: string | null) {
  return (path ? responseCache.get(path) : undefined) as { data: T; updatedAt: number } | undefined;
}

function loadResponse<T>(path: string): Promise<T> {
  const pending = pendingRequests.get(path) as Promise<T> | undefined;
  if (pending) return pending;
  const request = api.get<T>(path).then(result => {
    responseCache.set(path, { data: result, updatedAt: Date.now() });
    return result;
  }).finally(() => {
    if (pendingRequests.get(path) === request) pendingRequests.delete(path);
  });
  pendingRequests.set(path, request);
  return request;
}

export function prefetchApi(paths: string[]) {
  for (const path of paths) {
    if (!responseCache.has(path)) void loadResponse(path).catch(() => undefined);
  }
}

export function useApi<T>(path: string | null, dependencies: readonly unknown[] = [], options: { refetchIntervalMs?: number; keepPreviousData?: boolean; mergeData?: (incoming: T, current: T | null) => T } = {}) {
  const cached = cachedResponse<T>(path);
  const [data, setData] = useState<T | null>(() => cached?.data ?? null);
  const [dataPath, setDataPath] = useState<string | null>(() => cached ? path : null);
  const [loading, setLoading] = useState(Boolean(path) && !cached);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(() => cached?.updatedAt ?? null);
  const [version, setVersion] = useState(0);
  const hasData = useRef(Boolean(cached));
  const inFlight = useRef(false);
  const previousPath = useRef<string | null>(path);
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
      const cached = cachedResponse<T>(path);
      if (cached) {
        hasData.current = true;
        setData(cached.data);
        setDataPath(path);
        setUpdatedAt(cached.updatedAt);
      } else if (!options.keepPreviousData) {
        hasData.current = false;
        setData(null);
      }
    }
    const controller = new AbortController();
    inFlight.current = true;
    setLoading(!hasData.current);
    setRefreshing(hasData.current);
    setError(null);
    loadResponse<T>(path)
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
        if (controller.signal.aborted) return;
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
    if (data !== null && dataPath && updatedAt) responseCache.set(dataPath, { data, updatedAt });
  }, [data, dataPath, updatedAt]);

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
