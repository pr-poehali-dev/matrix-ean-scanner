import { useRef, useEffect, useState, useCallback } from 'react';
import { BrowserMultiFormatReader, NotFoundException } from '@zxing/library';
import Icon from '@/components/ui/icon';

interface ScanResult {
  code: string;
  status: 'confirmed' | 'rejected' | 'sending' | null;
}

interface ScannerViewProps {
  onCodeDetected: (code: string) => Promise<'confirmed' | 'rejected'>;
  isActive: boolean;
  serverReady: boolean;
}

export default function ScannerView({ onCodeDetected, isActive, serverReady }: ScannerViewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [lastScan, setLastScan] = useState<ScanResult | null>(null);
  const [flashColor, setFlashColor] = useState<'green' | 'red' | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const lastCodeRef = useRef<string | null>(null);
  const cooldownRef = useRef(false);

  const handleDetected = useCallback(async (code: string) => {
    if (cooldownRef.current || isProcessing) return;
    if (lastCodeRef.current === code) return;
    lastCodeRef.current = code;
    cooldownRef.current = true;

    setIsProcessing(true);
    setLastScan({ code, status: 'sending' });

    try {
      const result = await onCodeDetected(code);
      setLastScan({ code, status: result });
      setFlashColor(result === 'confirmed' ? 'green' : 'red');
      setTimeout(() => setFlashColor(null), 600);
    } finally {
      setIsProcessing(false);
      setTimeout(() => {
        cooldownRef.current = false;
        lastCodeRef.current = null;
      }, 1500);
    }
  }, [isProcessing, onCodeDetected]);

  useEffect(() => {
    if (!isActive || !videoRef.current) return;

    const reader = new BrowserMultiFormatReader();
    readerRef.current = reader;

    reader.decodeFromVideoDevice(undefined, videoRef.current, (result, err) => {
      if (result) {
        handleDetected(result.getText());
      }
      if (err && !(err instanceof NotFoundException)) {
        console.warn('Scanner error:', err);
      }
    }).catch(() => {
      setCameraError('Нет доступа к камере');
    });

    return () => {
      reader.reset();
      readerRef.current = null;
    };
  }, [isActive, handleDetected]);

  const flashClass = flashColor === 'green'
    ? 'bg-[hsl(var(--scan-green)/0.25)]'
    : flashColor === 'red'
    ? 'bg-[hsl(var(--scan-red)/0.25)]'
    : '';

  return (
    <div className="flex flex-col gap-4">
      <div className="relative bg-black rounded-2xl overflow-hidden" style={{ aspectRatio: '4/3', minHeight: 260 }}>
        {flashColor && (
          <div className={`absolute inset-0 z-20 pointer-events-none transition-opacity ${flashClass}`} />
        )}

        {isActive && !cameraError ? (
          <>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div
                className="relative"
                style={{ width: 220, height: 140 }}
              >
                {[
                  'top-0 left-0 border-t-2 border-l-2',
                  'top-0 right-0 border-t-2 border-r-2',
                  'bottom-0 left-0 border-b-2 border-l-2',
                  'bottom-0 right-0 border-b-2 border-r-2',
                ].map((cls, i) => (
                  <span
                    key={i}
                    className={`absolute w-6 h-6 border-[hsl(var(--scan-green))] ${cls}`}
                  />
                ))}
                <div className="scan-line" />
              </div>
            </div>
          </>
        ) : cameraError ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-muted-foreground">
            <Icon name="CameraOff" size={40} />
            <p className="text-sm">{cameraError}</p>
          </div>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-muted-foreground">
            <Icon name="Camera" size={40} />
            <p className="text-sm text-white/50">Нажмите «Начать сканирование»</p>
          </div>
        )}

        <div className="absolute top-3 left-3 flex items-center gap-2 bg-black/60 rounded-lg px-3 py-1.5 backdrop-blur-sm">
          <span className={`status-dot ${isActive && !cameraError ? 'online' : 'offline'}`} />
          <span className="text-xs text-white/80">
            {isActive && !cameraError ? 'Ожидание кода...' : 'Остановлено'}
          </span>
        </div>

        {!serverReady && isActive && (
          <div className="absolute top-3 right-3 bg-[hsl(var(--scan-amber)/0.85)] rounded-lg px-2.5 py-1.5 backdrop-blur-sm">
            <span className="text-xs text-black font-medium">Настройте сервер 1С</span>
          </div>
        )}
      </div>

      {lastScan && (
        <div
          className={`flex items-center gap-4 rounded-xl px-4 py-3 animate-fade-in border transition-all ${
            lastScan.status === 'confirmed'
              ? 'bg-[hsl(var(--scan-green)/0.08)] border-[hsl(var(--scan-green)/0.3)]'
              : lastScan.status === 'rejected'
              ? 'bg-[hsl(var(--scan-red)/0.08)] border-[hsl(var(--scan-red)/0.3)]'
              : 'bg-muted border-border'
          }`}
        >
          <StatusSquare status={lastScan.status} />
          <div className="flex-1 min-w-0">
            <p className="font-mono text-sm text-foreground truncate">{lastScan.code}</p>
            <p className={`text-xs mt-0.5 ${
              lastScan.status === 'confirmed' ? 'text-[hsl(var(--scan-green))]'
              : lastScan.status === 'rejected' ? 'text-[hsl(var(--scan-red))]'
              : 'text-muted-foreground'
            }`}>
              {lastScan.status === 'confirmed' && '1С подтвердила'}
              {lastScan.status === 'rejected' && '1С не подтвердила'}
              {lastScan.status === 'sending' && 'Отправка в 1С...'}
              {lastScan.status === null && ''}
            </p>
          </div>
        </div>
      )}

      <p className="text-xs text-center text-muted-foreground">
        Наведите камеру на штрихкод — код отправится автоматически
      </p>
    </div>
  );
}

function StatusSquare({ status }: { status: ScanResult['status'] }) {
  if (status === 'sending') {
    return (
      <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
        <div className="w-4 h-4 rounded-sm border-2 border-muted-foreground border-t-transparent animate-spin" />
      </div>
    );
  }
  if (status === 'confirmed') {
    return (
      <div className="w-10 h-10 rounded-lg bg-[hsl(var(--scan-green))] flex items-center justify-center flex-shrink-0 shadow-[0_0_16px_hsl(var(--scan-green)/0.5)]">
        <Icon name="Check" size={20} className="text-black" />
      </div>
    );
  }
  if (status === 'rejected') {
    return (
      <div className="w-10 h-10 rounded-lg bg-[hsl(var(--scan-red))] flex items-center justify-center flex-shrink-0 shadow-[0_0_16px_hsl(var(--scan-red)/0.5)]">
        <Icon name="X" size={20} className="text-white" />
      </div>
    );
  }
  return null;
}
