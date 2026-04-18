import Icon from '@/components/ui/icon';
import type { ScanRecord } from './HistoryView';

interface DashboardViewProps {
  records: ScanRecord[];
  connectionStatus: 'connected' | 'disconnected' | 'checking';
  serverIp: string;
  isScanning: boolean;
  onStartScan: () => void;
  onStopScan: () => void;
  onExport: () => void;
}

export default function DashboardView({
  records,
  connectionStatus,
  serverIp,
  isScanning,
  onStartScan,
  onStopScan,
  onExport,
}: DashboardViewProps) {
  const total = records.length;
  const synced = records.filter(r => r.status === 'synced').length;
  const pending = records.filter(r => r.status === 'pending').length;
  const errors = records.filter(r => r.status === 'error').length;
  const syncRate = total > 0 ? Math.round((synced / total) * 100) : 0;

  const recentRecords = [...records].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()).slice(0, 5);

  const statusMap = {
    connected: { label: 'Подключено', color: 'text-[hsl(var(--scan-green))]', dot: 'online' as const },
    disconnected: { label: 'Отключено', color: 'text-[hsl(var(--scan-red))]', dot: 'offline' as const },
    checking: { label: 'Проверка...', color: 'text-[hsl(var(--scan-amber))]', dot: 'syncing' as const },
  };
  const status = statusMap[connectionStatus];

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-card border border-border rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Статус системы</h3>
          <div className="flex items-center gap-2">
            <span className={`status-dot ${status.dot}`} />
            <span className={`text-xs font-medium ${status.color}`}>{status.label}</span>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
              <Icon name="Server" size={14} className="text-muted-foreground" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Сервер 1С</p>
              <p className="text-xs font-mono text-foreground truncate">{serverIp || 'Не настроено'}</p>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
              <Icon name="Wifi" size={14} className="text-muted-foreground" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Wi-Fi</p>
              <p className="text-xs text-foreground">Подключён</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {[
          { label: 'Всего кодов', value: total, icon: 'ScanLine', color: 'text-[hsl(var(--scan-blue))]' },
          { label: 'Синхр. %', value: `${syncRate}%`, icon: 'RefreshCw', color: 'text-[hsl(var(--scan-green))]' },
          { label: 'Ожидание', value: pending, icon: 'Clock', color: 'text-[hsl(var(--scan-amber))]' },
          { label: 'Ошибки', value: errors, icon: 'AlertCircle', color: 'text-[hsl(var(--scan-red))]' },
        ].map(stat => (
          <div key={stat.label} className="bg-card border border-border rounded-xl p-4 animate-fade-in">
            <div className="flex items-center justify-between mb-2">
              <Icon name={stat.icon} fallback="Circle" size={16} className={stat.color} />
            </div>
            <p className={`text-2xl font-semibold font-mono ${stat.color}`}>{stat.value}</p>
            <p className="text-xs text-muted-foreground mt-1">{stat.label}</p>
          </div>
        ))}
      </div>

      <div className="bg-card border border-border rounded-xl p-4">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">Инвентаризация</h3>
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-sm text-foreground">Прогресс синхронизации</span>
            <span className="text-sm font-mono text-[hsl(var(--scan-green))]">{synced}/{total}</span>
          </div>
          <div className="w-full bg-muted rounded-full h-2">
            <div
              className="h-2 rounded-full bg-[hsl(var(--scan-green))] transition-all duration-500"
              style={{ width: `${syncRate}%` }}
            />
          </div>
        </div>
      </div>

      <div className="flex gap-2">
        <button
          onClick={isScanning ? onStopScan : onStartScan}
          className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-medium transition-all active:scale-95
            ${isScanning
              ? 'bg-[hsl(var(--scan-red)/0.15)] text-[hsl(var(--scan-red))] border border-[hsl(var(--scan-red)/0.3)] hover:bg-[hsl(var(--scan-red)/0.2)]'
              : 'bg-[hsl(var(--scan-green))] text-[hsl(var(--primary-foreground))] hover:opacity-90'
            }`}
        >
          <Icon name={isScanning ? "Square" : "Camera"} size={16} />
          {isScanning ? 'Остановить' : 'Начать сканирование'}
        </button>
        <button
          onClick={onExport}
          className="px-4 py-3 rounded-xl border border-border text-sm text-muted-foreground hover:text-foreground hover:border-border/80 transition-all"
        >
          <Icon name="Download" size={16} />
        </button>
      </div>

      {recentRecords.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">Последние сканы</h3>
          <div className="space-y-2">
            {recentRecords.map(r => (
              <div key={r.id} className="flex items-center gap-3">
                <span className={`status-dot ${r.status === 'synced' ? 'online' : r.status === 'pending' ? 'syncing' : 'offline'}`} />
                <span className="font-mono text-xs text-foreground flex-1 truncate">{r.code}</span>
                <span className="text-xs text-muted-foreground">
                  {r.timestamp.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}