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

declare global {
  interface Window {
    BarcodeDetector: new (opts: { formats: string[] }) => {
      detect: (source: HTMLVideoElement) => Promise<DetectedBarcode[]>;
    };
  }
}

const GREEN = '#22c55e';
const AMBER = '#f59e0b';
const RED   = '#ef4444';

const FORMATS = [
  'ean_13','ean_8','code_128','code_39','code_93',
  'qr_code','data_matrix','upc_a','upc_e','itf','codabar',
];

export default function ScannerView({
  onCodeDetected, isActive, serverReady,
  beepEnabled, beepVolume, vibrateEnabled,
}: ScannerViewProps) {
  const videoRef    = useRef<HTMLVideoElement>(null);
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const streamRef   = useRef<MediaStream | null>(null);
  const detectorRef = useRef<InstanceType<typeof window.BarcodeDetector> | null>(null);
  const rafRef      = useRef<number>(0);

  // Горячие структуры — без setState, чтобы не тормозить рендер
  const cooldownMap   = useRef<Map<string, number>>(new Map());   // code → timestamp
  const processingSet = useRef<Set<string>>(new Set());
  const boxColors     = useRef<Map<string, string>>(new Map());   // code → цвет рамки
  const lastBarcodes  = useRef<DetectedBarcode[]>([]);
  const detectingRef  = useRef(false);                            // флаг: детекция в процессе

  const [cameraError, setCameraError]   = useState<string | null>(null);
  const [recentScans, setRecentScans]   = useState<ScanResult[]>([]);
  const [nativeOk, setNativeOk]         = useState(false);
  const { beep } = useBeep();

  // ─── Отрисовка рамок на canvas ───────────────────────────────────────────
  const drawOverlay = useCallback((barcodes: DetectedBarcode[]) => {
    const canvas = canvasRef.current;
    const video  = videoRef.current;
    if (!canvas || !video) return;

    const cw = canvas.clientWidth;
    const ch = canvas.clientHeight;
    // Сбрасываем размер только если изменился
    if (canvas.width !== cw)  canvas.width  = cw;
    if (canvas.height !== ch) canvas.height = ch;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, cw, ch);

    const vw = video.videoWidth  || cw;
    const vh = video.videoHeight || ch;
    const sx = cw / vw;
    const sy = ch / vh;

    barcodes.forEach(b => {
      const color = boxColors.current.get(b.rawValue) ?? GREEN;
      const pts   = b.cornerPoints;

      ctx.beginPath();
      if (pts?.length === 4) {
        ctx.moveTo(pts[0].x * sx, pts[0].y * sy);
        pts.slice(1).forEach(p => ctx.lineTo(p.x * sx, p.y * sy));
      } else {
        const { x, y, width, height } = b.boundingBox;
        ctx.rect(x * sx, y * sy, width * sx, height * sy);
      }
      ctx.closePath();
      ctx.strokeStyle = color;
      ctx.lineWidth   = 2.5;
      ctx.stroke();
      ctx.fillStyle = color + '28';
      ctx.fill();

      // Подпись
      const lx = (pts?.[0]?.x ?? b.boundingBox.x) * sx;
      const ly = (pts?.[0]?.y ?? b.boundingBox.y) * sy - 7;
      const label = b.rawValue.length > 18 ? b.rawValue.slice(0, 16) + '…' : b.rawValue;
      ctx.font = 'bold 11px monospace';
      const tw  = ctx.measureText(label).width;
      ctx.fillStyle = color;
      ctx.fillRect(lx - 2, ly - 13, tw + 8, 16);
      ctx.fillStyle = '#000';
      ctx.fillText(label, lx + 2, ly);
    });
  }, []);

  // ─── Обработка одного найденного кода ─────────────────────────────────────
  const handleCode = useCallback(async (code: string) => {
    const now = Date.now();
    const last = cooldownMap.current.get(code) ?? 0;
    if (now - last < 3000) return;                 // кулдаун 3с
    if (processingSet.current.has(code)) return;

    cooldownMap.current.set(code, now);
    processingSet.current.add(code);
    boxColors.current.set(code, AMBER);

    setRecentScans(prev => [{ code, status: 'sending' }, ...prev.slice(0, 4)]);
    if (vibrateEnabled && navigator.vibrate) navigator.vibrate(40);

    try {
      const result = await onCodeDetected(code);
      const color  = result === 'confirmed' ? GREEN : RED;
      boxColors.current.set(code, color);
      setRecentScans(prev =>
        prev.map(r => r.code === code && r.status === 'sending' ? { code, status: result } : r)
      );
      if (beepEnabled) beep(result, beepVolume);
      if (vibrateEnabled && navigator.vibrate) {
        navigator.vibrate(result === 'confirmed' ? [60] : [80, 60, 80]);
      }
    } finally {
      processingSet.current.delete(code);
      // Убираем рамку через 2с
      setTimeout(() => boxColors.current.delete(code), 2000);
    }
  }, [onCodeDetected, beepEnabled, beepVolume, vibrateEnabled, beep]);

  // ─── Основной цикл: RAF для рисования + детекция параллельно ─────────────
  useEffect(() => {
    if (!isActive) {
      cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach(t => t.stop());
      streamRef.current = null;
      detectingRef.current = false;
      lastBarcodes.current = [];
      const ctx = canvasRef.current?.getContext('2d');
      if (ctx && canvasRef.current) ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      return;
    }

    let alive = true;

    const start = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
        });
        if (!alive) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        if ('BarcodeDetector' in window) {
          detectorRef.current = new window.BarcodeDetector({ formats: FORMATS });
          setNativeOk(true);
        }

        // RAF-цикл: только рисование, НЕ блокируется детекцией
        const drawLoop = () => {
          if (!alive) return;
          drawOverlay(lastBarcodes.current);
          rafRef.current = requestAnimationFrame(drawLoop);
        };
        drawLoop();

        // Детекция в отдельном цикле через setTimeout(0) — не блокирует рисование
        const detectLoop = async () => {
          if (!alive) return;
          const video    = videoRef.current;
          const detector = detectorRef.current;
          if (video && video.readyState >= 2 && detector && !detectingRef.current) {
            detectingRef.current = true;
            try {
              const barcodes = await detector.detect(video);
              lastBarcodes.current = barcodes;
              // Запускаем обработку каждого кода параллельно
              barcodes.forEach(b => { if (b.rawValue) handleCode(b.rawValue); });
            } finally {
              detectingRef.current = false;
            }
          }
          if (alive) setTimeout(detectLoop, 0); // сразу следующий кадр
        };
        detectLoop();

      } catch {
        setCameraError('Нет доступа к камере');
      }
    };

    start();

    return () => {
      alive = false;
      cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach(t => t.stop());
      streamRef.current = null;
      detectorRef.current = null;
      detectingRef.current = false;
    };
  }, [isActive, handleCode, drawOverlay]);

  return (
    <div className="flex flex-col gap-3">
      <div
        className="relative bg-black rounded-2xl overflow-hidden"
        style={{ aspectRatio: '4/3', minHeight: 260 }}
      >
        {isActive && !cameraError ? (
          <>
            <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
            <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />
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
            {isActive && !cameraError
              ? nativeOk ? 'Мульти-скан' : 'Сканирование'
              : 'Остановлено'}
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
                {scan.status === 'rejected'  && '✗ Нет'}
                {scan.status === 'sending'   && '...'}
              </span>
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-center text-muted-foreground">
        {nativeOk ? 'Рамка подсвечивает каждый найденный код' : 'Наведите камеру на штрихкод'}
      </p>
    </div>
  );
}

function StatusSquare({ status }: { status: ScanResult['status'] }) {
  if (status === 'sending') return (
    <div className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
      <div className="w-3 h-3 border-2 border-muted-foreground border-t-transparent rounded-sm animate-spin" />
    </div>
  );
  if (status === 'confirmed') return (
    <div className="w-7 h-7 rounded-lg bg-[hsl(var(--scan-green))] flex items-center justify-center flex-shrink-0 shadow-[0_0_10px_hsl(var(--scan-green)/0.4)]">
      <Icon name="Check" size={14} className="text-black" />
    </div>
  );
  if (status === 'rejected') return (
    <div className="w-7 h-7 rounded-lg bg-[hsl(var(--scan-red))] flex items-center justify-center flex-shrink-0 shadow-[0_0_10px_hsl(var(--scan-red)/0.4)]">
      <Icon name="X" size={14} className="text-white" />
    </div>
  );
  return null;
}
