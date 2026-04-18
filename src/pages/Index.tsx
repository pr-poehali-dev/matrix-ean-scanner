import { useState, useCallback, useEffect, useRef } from 'react';
import Icon from '@/components/ui/icon';
import ScannerView from '@/components/ScannerView';
import HistoryView, { ScanRecord } from '@/components/HistoryView';
import SettingsView, { AppSettings } from '@/components/SettingsView';
import DashboardView from '@/components/DashboardView';
import {
  saveRecords, loadRecords,
  saveSettings, loadSettings,
  useAutoRetry,
} from '@/hooks/useOfflineStorage';

type Tab = 'dashboard' | 'scanner' | 'history' | 'settings';

const SYNC_URL = 'https://functions.poehali.dev/a967ae54-28a7-4f88-899c-130e8ffda498';

const defaultSettings: AppSettings = {
  serverIp: '',
  serverPort: '8080',
  apiPath: '/api/v1/scan',
  wifiName: '',
  autoSync: true,
  syncInterval: 15,
  beepOnScan: true,
  beepVolume: 0.7,
  vibrate: true,
  scanDelay: 500,
};

const tabs: { id: Tab; label: string; icon: string }[] = [
  { id: 'dashboard', label: 'Обзор', icon: 'LayoutDashboard' },
  { id: 'scanner', label: 'Сканер', icon: 'ScanLine' },
  { id: 'history', label: 'История', icon: 'History' },
  { id: 'settings', label: 'Настройки', icon: 'Settings2' },
];

const idCounter = 1;

export default function Index() {
  const [activeTab, setActiveTab] = useState<Tab>('scanner');
  const [records, setRecords] = useState<ScanRecord[]>(() => loadRecords());
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings(defaultSettings));
  const [isScanning, setIsScanning] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'disconnected' | 'checking'>('disconnected');
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const idRef = useRef(idCounter);

  useEffect(() => {
    const on = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  // Сохраняем записи при каждом изменении
  useEffect(() => { saveRecords(records); }, [records]);

  // Сохраняем настройки при каждом изменении
  useEffect(() => { saveSettings(settings); }, [settings]);

  const sendToServer = useCallback(async (code: string): Promise<'confirmed' | 'rejected'> => {
    if (!settings.serverIp || !navigator.onLine) return 'rejected';
    try {
      const res = await fetch(SYNC_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          codes: [{ id: String(idRef.current), code }],
          server_ip: settings.serverIp,
          server_port: settings.serverPort,
          api_path: settings.apiPath,
        }),
      });
      const data = await res.json();
      return data.ok ? 'confirmed' : 'rejected';
    } catch {
      return 'rejected';
    }
  }, [settings]);

  const handleCodeDetected = useCallback(async (code: string): Promise<'confirmed' | 'rejected'> => {
    const recordId = String(idRef.current++);
    const newRecord: ScanRecord = {
      id: recordId,
      code,
      timestamp: new Date(),
      status: 'pending',
      type: 'barcode',
    };
    setRecords(prev => [newRecord, ...prev]);

    if (!navigator.onLine || !settings.serverIp) {
      setRecords(prev => prev.map(r => r.id === recordId ? { ...r, status: 'error' } : r));
      return 'rejected';
    }

    const result = await sendToServer(code);
    setRecords(prev =>
      prev.map(r => r.id === recordId
        ? { ...r, status: result === 'confirmed' ? 'synced' : 'error' }
        : r
      )
    );
    return result;
  }, [sendToServer, settings.serverIp]);

  const handleRetrySync = useCallback(async (id: string) => {
    const record = records.find(r => r.id === id);
    if (!record) return;
    setRecords(prev => prev.map(r => r.id === id ? { ...r, status: 'pending' } : r));
    const result = await sendToServer(record.code);
    setRecords(prev =>
      prev.map(r => r.id === id
        ? { ...r, status: result === 'confirmed' ? 'synced' : 'error' }
        : r
      )
    );
  }, [records, sendToServer]);

  // Автоповтор при восстановлении сети
  useAutoRetry(records, handleRetrySync, settings.autoSync);

  const handleTestConnection = useCallback(async () => {
    if (!settings.serverIp) { setConnectionStatus('disconnected'); return; }
    setConnectionStatus('checking');
    try {
      const res = await fetch(
        `${SYNC_URL}?server_ip=${encodeURIComponent(settings.serverIp)}&server_port=${settings.serverPort}&api_path=/api/v1/ping`
      );
      const data = await res.json();
      setConnectionStatus(data.ok ? 'connected' : 'disconnected');
    } catch {
      setConnectionStatus('disconnected');
    }
  }, [settings.serverIp, settings.serverPort]);

  const handleExport = useCallback(() => {
    const lines = ['Код;Время;Статус', ...records.map(r =>
      `${r.code};${r.timestamp.toLocaleString('ru-RU')};${r.status}`
    )];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `scan_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [records]);

  const handleClear = useCallback(() => setRecords([]), []);
  const serverReady = !!settings.serverIp;

  const pendingCount = records.filter(r => r.status === 'pending' || r.status === 'error').length;

  return (
    <div className="min-h-screen bg-background flex flex-col max-w-lg mx-auto relative">
      <header className="flex items-center justify-between px-5 pt-6 pb-4 flex-shrink-0">
        <div>
          <h1 className="text-lg font-semibold text-foreground tracking-tight">ScanPro</h1>
          <p className="text-xs text-muted-foreground">Инвентаризация · 1С</p>
        </div>
        <div className="flex items-center gap-2">
          {!isOnline && (
            <div className="flex items-center gap-1.5 bg-[hsl(var(--scan-amber)/0.15)] border border-[hsl(var(--scan-amber)/0.3)] rounded-full px-3 py-1.5 animate-fade-in">
              <Icon name="WifiOff" size={12} className="text-[hsl(var(--scan-amber))]" />
              <span className="text-xs text-[hsl(var(--scan-amber))] font-medium">
                Офлайн{pendingCount > 0 ? ` · ${pendingCount} в очереди` : ''}
              </span>
            </div>
          )}
          {isOnline && (
            <div className="flex items-center gap-2 bg-card border border-border rounded-full px-3 py-1.5">
              <span className={`status-dot ${
                connectionStatus === 'connected' ? 'online'
                : connectionStatus === 'checking' ? 'syncing'
                : 'offline'
              }`} />
              <span className="text-xs text-muted-foreground">
                {connectionStatus === 'connected' ? '1С онлайн'
                : connectionStatus === 'checking' ? 'Проверка...'
                : 'Нет 1С'}
              </span>
            </div>
          )}
        </div>
      </header>

      {activeTab === 'scanner' && (
        <div className="px-5 mb-3">
          <button
            onClick={() => setIsScanning(s => !s)}
            className={`w-full flex items-center justify-center gap-2.5 py-3.5 rounded-xl font-medium text-sm transition-all active:scale-95 ${
              isScanning
                ? 'bg-[hsl(var(--scan-red)/0.15)] text-[hsl(var(--scan-red))] border border-[hsl(var(--scan-red)/0.35)] hover:bg-[hsl(var(--scan-red)/0.2)]'
                : 'bg-[hsl(var(--scan-green))] text-[hsl(220,16%,8%)] hover:opacity-90 shadow-[0_0_20px_hsl(var(--scan-green)/0.3)]'
            }`}
          >
            <Icon name={isScanning ? 'Square' : 'ScanLine'} size={18} />
            {isScanning ? 'Остановить сканирование' : 'Начать сканирование'}
          </button>
        </div>
      )}

      <main className="flex-1 overflow-y-auto px-5 pb-24">
        <div className="animate-fade-in">
          {activeTab === 'dashboard' && (
            <DashboardView
              records={records}
              connectionStatus={connectionStatus}
              serverIp={settings.serverIp ? `${settings.serverIp}:${settings.serverPort}` : 'Не настроено'}
              isScanning={isScanning}
              onStartScan={() => { setIsScanning(true); setActiveTab('scanner'); }}
              onStopScan={() => setIsScanning(false)}
              onExport={handleExport}
            />
          )}
          {activeTab === 'scanner' && (
            <ScannerView
              onCodeDetected={handleCodeDetected}
              isActive={isScanning}
              serverReady={serverReady}
              beepEnabled={settings.beepOnScan}
              beepVolume={settings.beepVolume}
              vibrateEnabled={settings.vibrate}
            />
          )}
          {activeTab === 'history' && (
            <HistoryView
              records={records}
              onExport={handleExport}
              onClear={handleClear}
              onRetrySync={handleRetrySync}
            />
          )}
          {activeTab === 'settings' && (
            <SettingsView
              settings={settings}
              onChange={setSettings}
              connectionStatus={connectionStatus}
              onTestConnection={handleTestConnection}
            />
          )}
        </div>
      </main>

      <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-lg border-t border-border bg-card/90 backdrop-blur-sm">
        <div className="flex">
          {tabs.map(tab => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  if (tab.id !== 'scanner') setIsScanning(false);
                  setActiveTab(tab.id);
                }}
                className={`flex-1 flex flex-col items-center gap-1 py-3 transition-all relative ${
                  isActive
                    ? 'text-[hsl(var(--scan-green))]'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {isActive && (
                  <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full bg-[hsl(var(--scan-green))]" />
                )}
                <Icon name={tab.icon} fallback="Circle" size={20} />
                <span className="text-[10px] font-medium">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
