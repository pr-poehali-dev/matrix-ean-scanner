import Icon from '@/components/ui/icon';

export interface ScanRecord {
  id: string;
  code: string;
  timestamp: Date;
  status: 'synced' | 'pending' | 'error';
  type: string;
}

interface HistoryViewProps {
  records: ScanRecord[];
  onExport: () => void;
  onClear: () => void;
  onRetrySync: (id: string) => void;
}

const statusConfig = {
  synced: { label: 'Синхронизировано', color: 'text-[hsl(var(--scan-green))]', dot: 'online', icon: 'CheckCircle' as const },
  pending: { label: 'Ожидание', color: 'text-[hsl(var(--scan-amber))]', dot: 'syncing', icon: 'Clock' as const },
  error: { label: 'Ошибка', color: 'text-[hsl(var(--scan-red))]', dot: 'offline', icon: 'AlertCircle' as const },
};

function formatTime(date: Date) {
  return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatDate(date: Date) {
  const today = new Date();
  const isToday = date.toDateString() === today.toDateString();
  if (isToday) return 'Сегодня';
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

export default function HistoryView({ records, onExport, onClear, onRetrySync }: HistoryViewProps) {
  const syncedCount = records.filter(r => r.status === 'synced').length;
  const pendingCount = records.filter(r => r.status === 'pending').length;
  const errorCount = records.filter(r => r.status === 'error').length;

  return (
    <div className="flex flex-col gap-4 h-full">
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: 'Синхр.', value: syncedCount, color: 'text-[hsl(var(--scan-green))]' },
          { label: 'Ожидание', value: pendingCount, color: 'text-[hsl(var(--scan-amber))]' },
          { label: 'Ошибки', value: errorCount, color: 'text-[hsl(var(--scan-red))]' },
        ].map(stat => (
          <div key={stat.label} className="bg-card border border-border rounded-lg px-3 py-2.5 text-center">
            <p className={`text-xl font-semibold font-mono ${stat.color}`}>{stat.value}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{stat.label}</p>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={onExport}
          className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground hover:border-primary/40 transition-all"
        >
          <Icon name="Download" size={14} />
          Экспорт
        </button>
        <button
          onClick={onClear}
          className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:text-destructive hover:border-destructive/40 transition-all ml-auto"
        >
          <Icon name="Trash2" size={14} />
          Очистить
        </button>
      </div>

      {records.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-muted-foreground py-12">
          <Icon name="ScanLine" size={40} />
          <p className="text-sm">История пуста</p>
          <p className="text-xs text-center">Отсканируйте первый штрихкод,<br />чтобы он появился здесь</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
          {records.map((record, index) => {
            const cfg = statusConfig[record.status];
            return (
              <div
                key={record.id}
                className="flex items-center gap-3 bg-card border border-border rounded-lg px-4 py-3 animate-fade-in hover:border-border/80 transition-all"
                style={{ animationDelay: `${index * 0.03}s` }}
              >
                <span className={`status-dot ${cfg.dot} flex-shrink-0`} />
                <div className="flex-1 min-w-0">
                  <p className="font-mono text-sm text-foreground truncate">{record.code}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-muted-foreground">{formatDate(record.timestamp)} · {formatTime(record.timestamp)}</span>
                    <span className={`text-xs ${cfg.color}`}>{cfg.label}</span>
                  </div>
                </div>
                {record.status === 'error' && (
                  <button
                    onClick={() => onRetrySync(record.id)}
                    className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                    title="Повторить"
                  >
                    <Icon name="RefreshCw" size={13} />
                  </button>
                )}
                {record.status === 'synced' && (
                  <Icon name="CheckCircle" size={14} className="text-[hsl(var(--scan-green))] flex-shrink-0" />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
