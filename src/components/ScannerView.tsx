import { useRef, useEffect, useState } from 'react';
import Icon from '@/components/ui/icon';

interface ScannerViewProps {
  onCodeDetected: (code: string) => void;
  isActive: boolean;
}

export default function ScannerView({ onCodeDetected, isActive }: ScannerViewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [lastCode, setLastCode] = useState<string | null>(null);
  const [flashEffect, setFlashEffect] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (!isActive) {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }
      return;
    }

    navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
    }).then(stream => {
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    }).catch(() => {
      setCameraError('Нет доступа к камере');
    });

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }
    };
  }, [isActive]);

  const simulateScan = () => {
    const codes = [
      '4607036192199',
      '4650099110032',
      '4601234567890',
      '2345678901234',
      '5901234123457',
    ];
    const code = codes[Math.floor(Math.random() * codes.length)];
    setLastCode(code);
    setFlashEffect(true);
    setTimeout(() => setFlashEffect(false), 300);
    onCodeDetected(code);
  };

  return (
    <div className="flex flex-col gap-4 h-full">
      <div className="relative bg-black rounded-xl overflow-hidden aspect-video flex-shrink-0" style={{ minHeight: 240 }}>
        {flashEffect && (
          <div className="absolute inset-0 bg-[hsl(var(--scan-green)/0.2)] z-20 pointer-events-none transition-opacity" />
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
              <div className="relative w-56 h-32 corner-tl corner-br">
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
            <p className="text-sm">Камера остановлена</p>
          </div>
        )}

        <div className="absolute top-3 left-3 flex items-center gap-2 bg-black/60 rounded-lg px-3 py-1.5 backdrop-blur-sm">
          <span className={`status-dot ${isActive && !cameraError ? 'online' : 'offline'}`} />
          <span className="text-xs text-white/80">{isActive && !cameraError ? 'Сканирование' : 'Остановлено'}</span>
        </div>
      </div>

      {lastCode && (
        <div className="flex items-center gap-3 bg-[hsl(var(--scan-green)/0.08)] border border-[hsl(var(--scan-green)/0.25)] rounded-lg px-4 py-3 animate-fade-in">
          <Icon name="CheckCircle" size={18} className="text-[hsl(var(--scan-green))] flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Последний код</p>
            <p className="font-mono text-sm text-foreground truncate">{lastCode}</p>
          </div>
        </div>
      )}

      <button
        onClick={simulateScan}
        disabled={!isActive}
        className="w-full py-3.5 rounded-xl font-medium text-sm transition-all
          bg-[hsl(var(--scan-green))] text-[hsl(var(--primary-foreground))]
          hover:opacity-90 active:scale-95
          disabled:opacity-30 disabled:cursor-not-allowed"
      >
        Симулировать сканирование
      </button>

      <p className="text-xs text-center text-muted-foreground -mt-1">
        Наведите камеру на штрихкод для автоматического считывания
      </p>
    </div>
  );
}
