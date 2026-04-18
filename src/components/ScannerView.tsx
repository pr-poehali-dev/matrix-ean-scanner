import { useRef, useEffect, useState, useCallback } from 'react';
import Icon from '@/components/ui/icon';
import { useBeep } from '@/hooks/useBeep';

interface ScanResult {
  code: string;
  status: 'confirmed' | 'rejected' | 'sending' | null;
}

interface DetectedBarcode {
  rawValue: string;
  boundingBox: DOMRectReadOnly;
  cornerPoints: { x: number; y: number }[];
}

interface ScannerViewProps {
  onCodeDetected: (code: string) => Promise<'confirmed' | 'rejected'>;
  isActive: boolean;
  serverReady: boolean;
  beepEnabled: boolean;
  beepVolume: number;
  vibrateEnabled: boolean;
}

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
      detect: (source: HTMLVideoElement) => Promise<DetectedBarcode[]>;
    };
  }
}

// Цвета рамок по статусу кода
const BOX_COLORS: Record<string, string> = {};

export default function ScannerView({ onCodeDetected, isActive, serverReady, beepEnabled, beepVolume, vibrateEnabled }: ScannerViewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);
  const cooldown = useRef(new CodeCooldownSet(3000));
  const processingSet = useRef(new Set<string>());
  const lastBarcodesRef = useRef<DetectedBarcode[]>([]);

  const [cameraError, setCameraError] = useState<string | null>(null);
  const [recentScans, setRecentScans] = useState<ScanResult[]>([]);
  const [nativeSupported, setNativeSupported] = useState(false);
  const { beep } = useBeep();

  const handleCode = useCallback(async (code: string) => {
    if (cooldown.current.has(code)) return;
    if (processingSet.current.has(code)) return;
    cooldown.current.add(code);
    processingSet.current.add(code);

    BOX_COLORS[code] = '#f59e0b'; // amber пока отправляем
    setRecentScans(prev => [{ code, status: 'sending' }, ...prev.slice(0, 4)]);
    if (vibrateEnabled && navigator.vibrate) navigator.vibrate(40);

    try {
      const result = await onCodeDetected(code);
      BOX_COLORS[code] = result === 'confirmed' ? '#22c55e' : '#ef4444';
      setRecentScans(prev =>
        prev.map(r => r.code === code && r.status === 'sending' ? { code, status: result } : r)
      );
      if (beepEnabled) beep(result, beepVolume);
      if (vibrateEnabled && navigator.vibrate) {
        navigator.vibrate(result === 'confirmed' ? [60] : [80, 60, 80]);
      }
      // Через 2с убираем цвет чтобы снова можно было сканировать
      setTimeout(() => { delete BOX_COLORS[code]; }, 2000);
    } finally {
      processingSet.current.delete(code);
    }
  }, [onCodeDetected, beepEnabled, beepVolume, vibrateEnabled, beep]);

  // Рисуем рамки поверх видео на canvas
  const drawOverlay = useCallback((barcodes: DetectedBarcode[]) => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;

    const vw = video.videoWidth || video.clientWidth;
    const vh = video.videoHeight || video.clientHeight;
    const cw = canvas.clientWidth;
    const ch = canvas.clientHeight;

    canvas.width = cw;
    canvas.height = ch;

    const scaleX = cw / vw;
    const scaleY = ch / vh;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, cw, ch);

    barcodes.forEach(b => {
      const color = BOX_COLORS[b.rawValue] || '#22c55e';
      const pts = b.cornerPoints;

      if (pts && pts.length === 4) {
        // Рисуем точный полигон по угловым точкам
        ctx.beginPath();
        ctx.moveTo(pts[0].x * scaleX, pts[0].y * scaleY);
        for (let i = 1; i < pts.length; i++) {
          ctx.lineTo(pts[i].x * scaleX, pts[i].y * scaleY);
        }
        ctx.closePath();
        ctx.strokeStyle = color;
        ctx.lineWidth = 2.5;
        ctx.stroke();

        // Полупрозрачная заливка
        ctx.fillStyle = color + '22';
        ctx.fill();

        // Метка с кодом
        const labelX = pts[0].x * scaleX;
        const labelY = pts[0].y * scaleY - 8;
        const shortCode = b.rawValue.length > 16 ? b.rawValue.slice(0, 14) + '…' : b.rawValue;

        ctx.font = 'bold 11px monospace';
        const textW = ctx.measureText(shortCode).width;
        ctx.fillStyle = color;
        ctx.fillRect(labelX - 2, labelY - 13, textW + 8, 16);
        ctx.fillStyle = '#000';
        ctx.fillText(shortCode, labelX + 2, labelY);
      } else {
        // Fallback: просто bounding box
        const { x, y, width, height } = b.boundingBox;
        ctx.strokeStyle = color;
        ctx.lineWidth = 2.5;
        ctx.strokeRect(x * scaleX, y * scaleY, width * scaleX, height * scaleY);
        ctx.fillStyle = color + '22';
        ctx.fillRect(x * scaleX, y * scaleY, width * scaleX, height * scaleY);
      }
    });
  }, []);

  useEffect(() => {
    if (!isActive) {
      cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach(t => t.stop());
      streamRef.current = null;
      lastBarcodesRef.current = [];
      const canvas = canvasRef.current;
      if (canvas) canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
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
          video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
        });
        if (!active) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        if ('BarcodeDetector' in window) {
          detector = new window.BarcodeDetector({ formats: FORMATS });
          setNativeSupported(true);
        }

        scanLoop();
      } catch {
        setCameraError('Нет доступа к камере');
      }
    };

    const scanLoop = async () => {
      if (!active || !videoRef.current) return;
      const video = videoRef.current;

      if (video.readyState >= 2 && detector) {
        try {
          const barcodes = await detector.detect(video);
          lastBarcodesRef.current = barcodes;
          drawOverlay(barcodes);
          barcodes.forEach(b => { if (b.rawValue) handleCode(b.rawValue); });
        } catch {
          // пропускаем
        }
      } else if (video.readyState >= 2 && !detector) {
        // Fallback без рамок — ZXing
        try {
          const { BrowserMultiFormatReader, NotFoundException } = await import('@zxing/library');
          const reader = new BrowserMultiFormatReader();
          const canvas = document.createElement('canvas');
          canvas.width = video.videoWidth || 640;
          canvas.height = video.videoHeight || 480;
          const ctx2 = canvas.getContext('2d');
          if (ctx2) {
            ctx2.drawImage(video, 0, 0);
            try {
              const res = await (reader as unknown as { decodeFromCanvas(c: HTMLCanvasElement): { getText(): string } }).decodeFromCanvas(canvas);
              if (res) handleCode(res.getText());
            } catch (e) {
              if (!(e instanceof NotFoundException)) { /* ignore */ }
            }
          }
        } catch { /* ignore */ }
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
  }, [isActive, handleCode, drawOverlay]);

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
            {/* Canvas для рамок поверх видео */}
            <canvas
              ref={canvasRef}
              className="absolute inset-0 w-full h-full pointer-events-none"
            />
            {/* Угловые маркеры зоны сканирования */}
            {!nativeSupported && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="relative w-[85%] h-[55%]">
                  {['top-0 left-0 border-t-2 border-l-2', 'top-0 right-0 border-t-2 border-r-2',
                    'bottom-0 left-0 border-b-2 border-l-2', 'bottom-0 right-0 border-b-2 border-r-2',
                  ].map((cls, i) => (
                    <span key={i} className={`absolute w-7 h-7 border-[hsl(var(--scan-green))] ${cls}`} />
                  ))}
                  <div className="scan-line" />
                </div>
              </div>
            )}
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

        <div className="absolute top-3 left-3 flex items-center gap-2 bg-black/60 rounded-lg px-3 py-1.5 backdrop-blur-sm">
          <span className={`status-dot ${isActive && !cameraError ? 'online' : 'offline'}`} />
          <span className="text-xs text-white/80">
            {isActive && !cameraError ? (nativeSupported ? 'Мульти-скан' : 'Сканирование') : 'Остановлено'}
          </span>
        </div>

        {!serverReady && isActive && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-[hsl(var(--scan-amber)/0.9)] rounded-lg px-3 py-1.5 backdrop-blur-sm whitespace-nowrap">
            <span className="text-xs text-black font-medium">Настройте IP сервера 1С</span>
          </div>
        )}
      </div>

      {recentScans.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground px-1">Отсканированные коды</p>
          {recentScans.map((scan, i) => (
            <div
              key={`${scan.code}-${i}`}
              className={`flex items-center gap-3 rounded-xl px-4 py-2.5 border animate-fade-in ${
                scan.status === 'confirmed' ? 'bg-[hsl(var(--scan-green)/0.08)] border-[hsl(var(--scan-green)/0.25)]'
                : scan.status === 'rejected' ? 'bg-[hsl(var(--scan-red)/0.08)] border-[hsl(var(--scan-red)/0.25)]'
                : 'bg-muted/50 border-border'
              }`}
            >
              <StatusSquare status={scan.status} />
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
        {nativeSupported ? 'Рамка подсвечивает каждый найденный код' : 'Наведите камеру на штрихкод'}
      </p>
    </div>
  );
}

function StatusSquare({ status }: { status: ScanResult['status'] }) {
  if (status === 'sending') {
    return (
      <div className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
        <div className="w-3 h-3 rounded-sm border-2 border-muted-foreground border-t-transparent animate-spin" />
      </div>
    );
  }
  if (status === 'confirmed') {
    return (
      <div className="w-7 h-7 rounded-lg bg-[hsl(var(--scan-green))] flex items-center justify-center flex-shrink-0 shadow-[0_0_10px_hsl(var(--scan-green)/0.4)]">
        <Icon name="Check" size={14} className="text-black" />
      </div>
    );
  }
  if (status === 'rejected') {
    return (
      <div className="w-7 h-7 rounded-lg bg-[hsl(var(--scan-red))] flex items-center justify-center flex-shrink-0 shadow-[0_0_10px_hsl(var(--scan-red)/0.4)]">
        <Icon name="X" size={14} className="text-white" />
      </div>
    );
  }
  return null;
}
