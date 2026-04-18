import { useRef, useCallback } from 'react';

export function useBeep() {
  const ctxRef = useRef<AudioContext | null>(null);

  const getCtx = () => {
    if (!ctxRef.current) {
      ctxRef.current = new AudioContext();
    }
    return ctxRef.current;
  };

  const beep = useCallback((type: 'confirmed' | 'rejected', volume: number) => {
    if (volume === 0) return;
    try {
      const ctx = getCtx();
      const gainNode = ctx.createGain();
      gainNode.gain.value = volume;
      gainNode.connect(ctx.destination);

      if (type === 'confirmed') {
        // Два коротких восходящих тона — успех
        [0, 0.12].forEach((delay, i) => {
          const osc = ctx.createOscillator();
          osc.type = 'sine';
          osc.frequency.value = 880 + i * 440;
          osc.connect(gainNode);
          const t = ctx.currentTime + delay;
          osc.start(t);
          osc.stop(t + 0.1);
        });
      } else {
        // Один низкий нисходящий тон — ошибка
        const osc = ctx.createOscillator();
        osc.type = 'square';
        osc.frequency.setValueAtTime(300, ctx.currentTime);
        osc.frequency.linearRampToValueAtTime(150, ctx.currentTime + 0.2);
        osc.connect(gainNode);
        gainNode.gain.setValueAtTime(volume * 0.5, ctx.currentTime);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.22);
      }
    } catch {
      // AudioContext не доступен
    }
  }, []);

  return { beep };
}
