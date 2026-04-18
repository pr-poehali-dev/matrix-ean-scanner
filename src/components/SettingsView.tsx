import { useState } from 'react';
import Icon from '@/components/ui/icon';

export interface AppSettings {
  serverIp: string;
  serverPort: string;
  apiPath: string;
  wifiName: string;
  autoSync: boolean;
  syncInterval: number;
  beepOnScan: boolean;
  beepVolume: number;
  vibrate: boolean;
  scanDelay: number;
}

interface SettingsViewProps {
  settings: AppSettings;
  onChange: (settings: AppSettings) => void;
  connectionStatus: 'connected' | 'disconnected' | 'checking';
  onTestConnection: () => void;
}

export default function SettingsView({ settings, onChange, connectionStatus, onTestConnection }: SettingsViewProps) {
  const [showApiPath, setShowApiPath] = useState(false);

  const update = (key: keyof AppSettings, value: string | boolean | number) => {
    onChange({ ...settings, [key]: value });
  };

  const statusMap = {
    connected: { label: '1С доступна', color: 'text-[hsl(var(--scan-green))]', dot: 'online' },
    disconnected: { label: 'Нет соединения', color: 'text-[hsl(var(--scan-red))]', dot: 'offline' },
    checking: { label: 'Проверка...', color: 'text-[hsl(var(--scan-amber))]', dot: 'syncing' },
  };
  const status = statusMap[connectionStatus];

  return (
    <div className="flex flex-col gap-5">
      <section className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Сервер 1С</h3>
        <div className="bg-card border border-border rounded-xl overflow-hidden divide-y divide-border">
          <div className="px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className={`status-dot ${status.dot}`} />
              <span className="text-sm text-foreground">Статус соединения</span>
            </div>
            <span className={`text-xs font-medium ${status.color}`}>{status.label}</span>
          </div>

          <div className="px-4 py-3">
            <label className="text-xs text-muted-foreground mb-1.5 block">IP адрес сервера</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={settings.serverIp}
                onChange={e => update('serverIp', e.target.value)}
                placeholder="192.168.1.100"
                className="flex-1 bg-muted border border-border rounded-lg px-3 py-2 text-sm font-mono text-foreground placeholder-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <input
                type="text"
                value={settings.serverPort}
                onChange={e => update('serverPort', e.target.value)}
                placeholder="8080"
                className="w-20 bg-muted border border-border rounded-lg px-3 py-2 text-sm font-mono text-foreground placeholder-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>

          <div className="px-4 py-3">
            <button
              className="text-xs text-muted-foreground flex items-center gap-1.5"
              onClick={() => setShowApiPath(!showApiPath)}
            >
              <Icon name={showApiPath ? "ChevronDown" : "ChevronRight"} size={12} />
              Дополнительно
            </button>
            {showApiPath && (
              <div className="mt-2 animate-fade-in">
                <label className="text-xs text-muted-foreground mb-1.5 block">Путь API</label>
                <input
                  type="text"
                  value={settings.apiPath}
                  onChange={e => update('apiPath', e.target.value)}
                  placeholder="/api/scan"
                  className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm font-mono text-foreground placeholder-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            )}
          </div>

          <div className="px-4 py-3">
            <button
              onClick={onTestConnection}
              disabled={connectionStatus === 'checking'}
              className="w-full py-2 rounded-lg border border-primary/40 text-sm text-primary hover:bg-primary/10 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {connectionStatus === 'checking' ? 'Проверяю...' : 'Проверить соединение'}
            </button>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Синхронизация</h3>
        <div className="bg-card border border-border rounded-xl overflow-hidden divide-y divide-border">
          <ToggleRow
            label="Авто-синхронизация"
            description="Отправлять коды сразу после сканирования"
            value={settings.autoSync}
            onChange={v => update('autoSync', v)}
          />
          <div className="px-4 py-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-foreground">Интервал повтора</span>
              <span className="text-xs font-mono text-muted-foreground">{settings.syncInterval}с</span>
            </div>
            <input
              type="range"
              min={5} max={60} step={5}
              value={settings.syncInterval}
              onChange={e => update('syncInterval', Number(e.target.value))}
              className="w-full accent-[hsl(var(--scan-green))]"
            />
            <div className="flex justify-between mt-1">
              <span className="text-xs text-muted-foreground">5с</span>
              <span className="text-xs text-muted-foreground">60с</span>
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Параметры сканирования</h3>
        <div className="bg-card border border-border rounded-xl overflow-hidden divide-y divide-border">
          <ToggleRow label="Звук при сканировании" value={settings.beepOnScan} onChange={v => update('beepOnScan', v)} />
          {settings.beepOnScan && (
            <div className="px-4 py-3 animate-fade-in">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Icon name={settings.beepVolume === 0 ? 'VolumeX' : settings.beepVolume < 0.5 ? 'Volume1' : 'Volume2'} size={14} className="text-muted-foreground" />
                  <span className="text-sm text-foreground">Громкость звука</span>
                </div>
                <span className="text-xs font-mono text-muted-foreground">{Math.round(settings.beepVolume * 100)}%</span>
              </div>
              <input
                type="range"
                min={0} max={1} step={0.05}
                value={settings.beepVolume}
                onChange={e => update('beepVolume', Number(e.target.value))}
                className="w-full accent-[hsl(var(--scan-green))]"
              />
              <div className="flex justify-between mt-1">
                <span className="text-xs text-muted-foreground">Выкл</span>
                <span className="text-xs text-muted-foreground">Макс</span>
              </div>
            </div>
          )}
          <ToggleRow label="Вибрация" value={settings.vibrate} onChange={v => update('vibrate', v)} />
          <div className="px-4 py-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-foreground">Задержка между сканами</span>
              <span className="text-xs font-mono text-muted-foreground">{settings.scanDelay}мс</span>
            </div>
            <input
              type="range"
              min={200} max={2000} step={100}
              value={settings.scanDelay}
              onChange={e => update('scanDelay', Number(e.target.value))}
              className="w-full accent-[hsl(var(--scan-green))]"
            />
          </div>
        </div>
      </section>
    </div>
  );
}

function ToggleRow({
  label,
  description,
  value,
  onChange,
}: {
  label: string;
  description?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="px-4 py-3 flex items-center justify-between gap-4">
      <div>
        <p className="text-sm text-foreground">{label}</p>
        {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
      </div>
      <button
        onClick={() => onChange(!value)}
        className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${value ? 'bg-[hsl(var(--scan-green))]' : 'bg-muted'}`}
      >
        <span
          className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform ${value ? 'translate-x-5' : 'translate-x-0.5'}`}
        />
      </button>
    </div>
  );
}