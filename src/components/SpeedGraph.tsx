import { useEffect, useRef } from "react";

export interface Point {
  t: number;
  up: number;
  down: number;
}

export function SpeedGraph({ points }: { points: Point[] }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth || 600;
    const h = canvas.clientHeight || 200;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.clearRect(0, 0, w, h);

    ctx.strokeStyle = "rgba(255,255,255,0.07)";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = (h / 4) * i;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    if (points.length < 2) {
      ctx.fillStyle = "rgba(255,255,255,0.25)";
      ctx.font = "13px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Нет данных о трафике", w / 2, h / 2);
      return;
    }

    let max = 1;
    for (const p of points) {
      max = Math.max(max, p.up, p.down);
    }
    const scale = max * 1.2;
    const step = w / (points.length - 1);

    const drawLine = (key: "up" | "down", color: string) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      points.forEach((p, i) => {
        const x = i * step;
        const y = h - (p[key] / scale) * (h - 14);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    };

    drawLine("down", "#22d3ee");
    drawLine("up", "#f59e0b");

    ctx.fillStyle = "rgba(255,255,255,0.4)";
    ctx.font = "11px system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("↓ входящий", 8, 14);
    ctx.fillText("↑ исходящий", 8, 28);
  }, [points]);

  return <canvas ref={canvasRef} className="speed-graph" />;
}