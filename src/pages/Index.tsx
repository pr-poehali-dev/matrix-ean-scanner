import { useState, useCallback } from 'react';
import Icon from '@/components/ui/icon';
import ScannerView from '@/components/ScannerView';
import HistoryView, { ScanRecord } from '@/components/HistoryView';
import SettingsView, { AppSettings } from '@/components/SettingsView';
import DashboardView from '@/components/DashboardView';

type Tab = 'dashboard' | 'scanner' | 'history' | 'settings';

const defaultSettings: AppSettings = {
  serverIp: '192.168.1.100',
  serverPort: '8080',
  apiPath: '/api/v1/scan',
  wifiName: '',
  autoSync: true,
  syncInterval: 15,
  beepOnScan: true,
  vibrate: true,
  scanDelay: 500,
};

const tabs: { id: Tab; label: string; icon: string }[] = [
  { id: 'dashboard', label: 'Обзор', icon: 'LayoutDashboard' },
  { id: 'scanner', label: 'Сканер', icon: 'ScanLine' },
  { id: 'history', label: 'История', icon: 'History' },
  { id: 'settings', label: 'Настройки', icon: 'Settings2' },
];

let idCounter = 1;

export default function Index() {
  const [activeTab, setActiveTab] = useState<Tab>('scanner');
  const [records, setRecords] = useState<ScanRecord[]>([]);
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [isScanning, setIsScanning] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'disconnected' | 'checking'>('disconnected');

  const handleCodeDetected = useCallback((code: string) => {
    const newRecord: ScanRecord = {
      id: String(idCounter++),
      code,
      timestamp: new Date(),
      status: 'pending',
      type: 'barcode',
    };
    setRecords(prev => [newRecord, ...prev]);

    if (settings.autoSync && connectionStatus === 'connected') {
      setTimeout(() => {
        setRecords(prev =>
          prev.map(r => r.id === newRecord.id ? { ...r, status: 'synced' } : r)
        );
      }, 1500);
    }
  }, [settings.autoSync, connectionStatus]);

  const handleTestConnection = useCallback(() => {
    setConnectionStatus('checking');
    setTimeout(() => {
      const success = settings.serverIp.trim().length > 0;
      setConnectionStatus(success ? 'connected' : 'disconnected');
    }, 1800);
  }, [settings.serverIp]);

  const handleRetrySync = useCallback((id: string) => {
    setRecords(prev => prev.map(r => r.id === id ? { ...r, status: 'pending' } : r));
    setTimeout(() => {
      setRecords(prev => prev.map(r => r.id === id ? { ...r, status: 'synced' } : r));
    }, 1200);
  }, []);

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

  const handleClear = useCallback(() => {
    setRecords([]);
  }, []);

  return (
    <div className="min-h-screen bg-background flex flex-col max-w-lg mx-auto relative">
      <header className="flex items-center justify-between px-5 pt-6 pb-4 flex-shrink-0">
        <div>
          <h1 className="text-lg font-semibold text-foreground tracking-tight">ScanPro</h1>
          <p className="text-xs text-muted-foreground">Инвентаризация · 1С</p>
        </div>
        <div className="flex items-center gap-2 bg-card border border-border rounded-full px-3 py-1.5">
          <span className={`status-dot ${connectionStatus === 'connected' ? 'online' : connectionStatus === 'checking' ? 'syncing' : 'offline'}`} />
          <span className="text-xs text-muted-foreground">
            {connectionStatus === 'connected' ? '1С онлайн' : connectionStatus === 'checking' ? 'Проверка...' : 'Офлайн'}
          </span>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-5 pb-24">
        <div className="animate-fade-in">
          {activeTab === 'dashboard' && (
            <DashboardView
              records={records}
              connectionStatus={connectionStatus}
              serverIp={`${settings.serverIp}:${settings.serverPort}`}
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
                  if (tab.id === 'scanner') {
                    setIsScanning(true);
                  } else {
                    setIsScanning(false);
                  }
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
