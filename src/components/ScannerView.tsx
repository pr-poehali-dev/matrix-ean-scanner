import { useRef, useEffect, useState, useCallback } from 'react';
import Icon from '@/components/ui/icon';
import { useBeep } from '@/hooks/useBeep';

interface ScanResult {
  code: string;
  status: 'confirmed' | 'rejected' | 'sending' | null;
}

interface ScannerViewProps {
  onCodeDetected: (code: string) => Promise<'confirmed' | 'rejected'>;
  isActive: boolean;
  serverReady: boolean;
  beepEnabled: boolean;
  beepVolume: number;
  vibrateEnabled: boolean;
}

// Набор уже обработанных кодов с таймаутом повторного считывания
class CodeCooldownSet {
  private map = new Map<string, number>();
  private ttl: number;
  constructor(ttl = 3000) { this.ttl = ttl; }
  has(code: string) {
    const ts = this.map.get(code);
    if (!ts) return false;
    if (Date.now() - ts > this.ttl) { this.map.delete(code); return false; }
    return true;
  }
  add(code: string) { this.map.set(code, Date.now()); }
}

declare global {
  interface Window {
    BarcodeDetector: new (opts: { formats: string[] }) => {
      detect: (source: HTMLVideoElement | ImageBitmap) => Promise<{ rawValue: string }[]>;
    };
  }
}

export default function ScannerView({ onCodeDetected, isActive, serverReady, beepEnabled, beepVolume, vibrateEnabled }: ScannerViewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);
  const cooldown = useRef(new CodeCooldownSet(3000));
  const processingSet = useRef(new Set<string>());

  const [cameraError, setCameraError] = useState<string | null>(null);
  const [recentScans, setRecentScans] = useState<ScanResult[]>([]);
  const [frameCount, setFrameCount] = useState(0);
  const { beep } = useBeep();

  const handleCode = useCallback(async (code: string) => {
    if (cooldown.current.has(code)) return;
    if (processingSet.current.has(code)) return;
    cooldown.current.add(code);
    processingSet.current.add(code);

    // Добавляем в список со статусом sending
    setRecentScans(prev => [{ code, status: 'sending' }, ...prev.slice(0, 4)]);
    if (vibrateEnabled && navigator.vibrate) navigator.vibrate(40);

    try {
      const result = await onCodeDetected(code);
      setRecentScans(prev =>
        prev.map(r => r.code === code && r.status === 'sending'
          ? { code, status: result }
          : r
        )
      );
      if (beepEnabled) beep(result, beepVolume);
      if (vibrateEnabled && navigator.vibrate) {
        navigator.vibrate(result === 'confirmed' ? [60] : [80, 60, 80]);
      }
    } finally {
      processingSet.current.delete(code);
    }
  }, [onCodeDetected, beepEnabled, beepVolume, vibrateEnabled, beep]);

  useEffect(() => {
    if (!isActive) {
      cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach(t => t.stop());
      streamRef.current = null;
      return;
    }

    let detector: InstanceType<typeof window.BarcodeDetector> | null = null;
    let active = true;

    const FORMATS = [
      'ean_13', 'ean_8', 'code_128', 'code_39', 'code_93',
      'qr_code', 'data_matrix', 'upc_a', 'upc_e', 'itf',
    ];

    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'environment',
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
        });
        if (!active) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        // Пробуем нативный BarcodeDetector (Android Chrome 83+)
        if ('BarcodeDetector' in window) {
          detector = new window.BarcodeDetector({ formats: FORMATS });
        }

        scanLoop();
      } catch {
        setCameraError('Нет доступа к камере');
      }
    };

    const scanLoop = async () => {
      if (!active || !videoRef.current) return;
      const video = videoRef.current;

      if (video.readyState >= 2) {
        try {
          if (detector) {
            // Нативный детектор — несколько кодов за раз
            const results = await detector.detect(video);
            results.forEach(r => { if (r.rawValue) handleCode(r.rawValue); });
            setFrameCount(n => n + 1);
          } else {
            // Fallback: canvas + ZXing для одного кода
            await fallbackScan(video);
          }
        } catch {
          // Пропускаем ошибки детекции
        }
      }

      rafRef.current = requestAnimationFrame(scanLoop);
    };

    startCamera();

    return () => {
      active = false;
      cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    };
  }, [isActive, handleCode]);

  const fallbackScan = async (video: HTMLVideoElement) => {
    const { BrowserMultiFormatReader } = await import('@zxing/library');
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const reader = new BrowserMultiFormatReader();
    try {
      const result = reader.decodeFromImageData ? 
        await (reader as unknown as { decodeFromCanvas: (c: HTMLCanvasElement) => { getText(): string } }).decodeFromCanvas(canvas) :
        null;
      if (result) handleCode(result.getText());
    } catch {
      // Код не найден в кадре — нормально
    }
  };

  const nativeSupported = typeof window !== 'undefined' && 'BarcodeDetector' in window;

  return (
    <div className="flex flex-col gap-3">
      <div className="relative bg-black rounded-2xl overflow-hidden" style={{ aspectRatio: '4/3', minHeight: 260 }}>
        {isActive && !cameraError ? (
          <>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
            />
            {/* Прицельная рамка — полная ширина для захвата нескольких кодов */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="relative w-[85%] h-[55%]">
                {[
                  'top-0 left-0 border-t-2 border-l-2',
                  'top-0 right-0 border-t-2 border-r-2',
                  'bottom-0 left-0 border-b-2 border-l-2',
                  'bottom-0 right-0 border-b-2 border-r-2',
                ].map((cls, i) => (
                  <span key={i} className={`absolute w-7 h-7 border-[hsl(var(--scan-green))] ${cls}`} />
                ))}
                <div className="scan-line" />
              </div>
            </div>
          </>
        ) : cameraError ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-muted-foreground">
            <Icon name="CameraOff" size={40} />
            <p className="text-sm">{cameraError}</p>
            <p className="text-xs text-center px-6 opacity-60">Разрешите доступ к камере в настройках браузера</p>
          </div>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-muted-foreground">
            <Icon name="Camera" size={40} />
            <p className="text-sm text-white/50">Нажмите «Начать сканирование»</p>
          </div>
        )}

        {/* Статус */}
        <div className="absolute top-3 left-3 flex items-center gap-2 bg-black/60 rounded-lg px-3 py-1.5 backdrop-blur-sm">
          <span className={`status-dot ${isActive && !cameraError ? 'online' : 'offline'}`} />
          <span className="text-xs text-white/80">
            {isActive && !cameraError
              ? nativeSupported ? 'Мульти-скан' : 'Сканирование'
              : 'Остановлено'}
          </span>
        </div>

        {/* Счётчик кадров — показывает что скан активен */}
        {isActive && !cameraError && nativeSupported && (
          <div className="absolute top-3 right-3 bg-black/60 rounded-lg px-2.5 py-1.5 backdrop-blur-sm">
            <span className="text-xs text-white/50 font-mono">{frameCount % 1000}</span>
          </div>
        )}

        {!serverReady && isActive && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-[hsl(var(--scan-amber)/0.9)] rounded-lg px-3 py-1.5 backdrop-blur-sm whitespace-nowrap">
            <span className="text-xs text-black font-medium">Настройте IP сервера 1С</span>
          </div>
        )}
      </div>

      {/* Список последних отсканированных */}
      {recentScans.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground px-1">Отсканированные коды</p>
          {recentScans.map((scan, i) => (
            <div
              key={`${scan.code}-${i}`}
              className={`flex items-center gap-3 rounded-xl px-4 py-2.5 border animate-fade-in ${
                scan.status === 'confirmed'
                  ? 'bg-[hsl(var(--scan-green)/0.08)] border-[hsl(var(--scan-green)/0.25)]'
                  : scan.status === 'rejected'
                  ? 'bg-[hsl(var(--scan-red)/0.08)] border-[hsl(var(--scan-red)/0.25)]'
                  : 'bg-muted/50 border-border'
              }`}
            >
              <StatusSquare status={scan.status} size="sm" />
              <p className="font-mono text-sm text-foreground flex-1 truncate">{scan.code}</p>
              <span className={`text-xs flex-shrink-0 ${
                scan.status === 'confirmed' ? 'text-[hsl(var(--scan-green))]'
                : scan.status === 'rejected' ? 'text-[hsl(var(--scan-red))]'
                : 'text-muted-foreground'
              }`}>
                {scan.status === 'confirmed' && '✓ OK'}
                {scan.status === 'rejected' && '✗ Нет'}
                {scan.status === 'sending' && '...'}
              </span>
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-center text-muted-foreground">
        {nativeSupported
          ? 'Несколько кодов в кадре считываются одновременно'
          : 'Наведите камеру на штрихкод'}
      </p>
    </div>
  );
}

function StatusSquare({ status, size = 'md' }: { status: ScanResult['status']; size?: 'sm' | 'md' }) {
  const sz = size === 'sm' ? 'w-7 h-7' : 'w-10 h-10';
  const iconSz = size === 'sm' ? 14 : 20;

  if (status === 'sending') {
    return (
      <div className={`${sz} rounded-lg bg-muted flex items-center justify-center flex-shrink-0`}>
        <div className="w-3 h-3 rounded-sm border-2 border-muted-foreground border-t-transparent animate-spin" />
      </div>
    );
  }
  if (status === 'confirmed') {
    return (
      <div className={`${sz} rounded-lg bg-[hsl(var(--scan-green))] flex items-center justify-center flex-shrink-0 shadow-[0_0_12px_hsl(var(--scan-green)/0.4)]`}>
        <Icon name="Check" size={iconSz} className="text-black" />
      </div>
    );
  }
  if (status === 'rejected') {
    return (
      <div className={`${sz} rounded-lg bg-[hsl(var(--scan-red))] flex items-center justify-center flex-shrink-0 shadow-[0_0_12px_hsl(var(--scan-red)/0.4)]`}>
        <Icon name="X" size={iconSz} className="text-white" />
      </div>
    );
  }
  return null;
}
