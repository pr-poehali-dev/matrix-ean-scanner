import { useEffect, useCallback } from 'react';
import { ScanRecord } from '@/components/HistoryView';

const STORAGE_KEY = 'scanpro_records';
const SETTINGS_KEY = 'scanpro_settings';

export function saveRecords(records: ScanRecord[]) {
  try {
    const serialized = records.map(r => ({ ...r, timestamp: r.timestamp.toISOString() }));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(serialized));
  } catch (e) {
    console.warn('saveRecords failed', e);
  }
}

export function loadRecords(): ScanRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return parsed.map((r: ScanRecord & { timestamp: string }) => ({
      ...r,
      timestamp: new Date(r.timestamp),
    }));
  } catch {
    return [];
  }
}

export function saveSettings(settings: object) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch (e) {
    console.warn('saveSettings failed', e);
  }
}

export function loadSettings<T>(defaults: T): T {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return defaults;
    return { ...defaults, ...JSON.parse(raw) };
  } catch {
    return defaults;
  }
}

export function useAutoRetry(
  records: ScanRecord[],
  syncFn: (id: string) => Promise<void>,
  enabled: boolean
) {
  const retry = useCallback(async () => {
    if (!navigator.onLine || !enabled) return;
    const pending = records.filter(r => r.status === 'pending' || r.status === 'error');
    for (const r of pending) {
      await syncFn(r.id);
    }
  }, [records, syncFn, enabled]);

  useEffect(() => {
    const handler = () => setTimeout(retry, 1000);
    window.addEventListener('online', handler);
    return () => window.removeEventListener('online', handler);
  }, [retry]);
}
