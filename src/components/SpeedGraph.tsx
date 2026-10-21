import { useEffect, useRef } from "react";

export interface Point {
  t: number;
  up: number;
  down: number;
}

function formatRate(value: number) {
  if (value <= 0) return "0 B/s";
  const units = ["B/s", "KB/s", "MB/s", "GB/s"];
  const i = Math.min(
    Math.floor(Math.log(value) / Math.log(1024)),
    units.length - 1,
  );
  const val = value / Math.pow(1024, i);
  return `${val.toFixed(val >= 100 ? 0 : 1)} ${units[i]}`;
}

export function SpeedGraph({
  points,
  rangeLabel,
}: {
  points: Point[];
  rangeLabel?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const draw = () => {
      const rect = canvas.getBoundingClientRect();
      const w = Math.max(1, rect.width);
      const h = Math.max(1, rect.height);
      const dpr = window.devicePixelRatio || 1;
      if (canvas.width !== Math.round(w * dpr)) canvas.width = Math.round(w * dpr);
      if (canvas.height !== Math.round(h * dpr)) canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const padL = 48;
      const padR = 10;
      const padT = 16;
      const padB = 22;
      const plotW = Math.max(1, w - padL - padR);
      const plotH = Math.max(1, h - padT - padB);
      const baseY = padT + plotH;

      ctx.font = "11px 'Segoe UI', Inter, sans-serif";
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";

      if (points.length < 2) {
        ctx.fillStyle = "rgba(200, 220, 245, 0.35)";
        ctx.textAlign = "center";
        ctx.fillText("Нет данных о трафике", w / 2, h / 2);
        return;
      }

      let max = 1;
      for (const p of points) max = Math.max(max, p.up, p.down);
      const scale = max * 1.15;

      for (let i = 0; i <= 4; i += 1) {
        const y = padT + (plotH / 4) * i;
        ctx.strokeStyle = "rgba(148, 180, 214, 0.09)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(padL, y);
        ctx.lineTo(w - padR, y);
        ctx.stroke();
        ctx.fillStyle = "rgba(150, 172, 198, 0.55)";
        ctx.textAlign = "right";
        ctx.fillText(formatRate(scale * (1 - i / 4)), padL - 8, y);
      }

      const step = plotW / (points.length - 1);
      const xy = (value: number, i: number) => ({
        x: padL + i * step,
        y: baseY - (value / scale) * plotH,
      });

      const trace = (key: "up" | "down") => {
        const coords = points.map((p, i) => xy(p[key], i));
        ctx.beginPath();
        ctx.moveTo(coords[0].x, coords[0].y);
        for (let i = 1; i < coords.length; i += 1) {
          const prev = coords[i - 1];
          const cur = coords[i];
          const mx = (prev.x + cur.x) / 2;
          ctx.bezierCurveTo(mx, prev.y, mx, cur.y, cur.x, cur.y);
        }
        return coords;
      };

      const fillArea = (key: "up" | "down", from: string, to: string) => {
        const coords = trace(key);
        ctx.lineTo(coords[coords.length - 1].x, baseY);
        ctx.lineTo(coords[0].x, baseY);
        ctx.closePath();
        const grad = ctx.createLinearGradient(0, padT, 0, baseY);
        grad.addColorStop(0, from);
        grad.addColorStop(1, to);
        ctx.fillStyle = grad;
        ctx.fill();
      };

      fillArea("down", "rgba(34, 211, 238, 0.30)", "rgba(34, 211, 238, 0.01)");
      fillArea("up", "rgba(167, 139, 250, 0.22)", "rgba(167, 139, 250, 0.01)");

      const strokeLine = (key: "up" | "down", color: string) => {
        trace(key);
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.shadowColor = color;
        ctx.shadowBlur = 8;
        ctx.stroke();
        ctx.shadowBlur = 0;
      };

      strokeLine("down", "#22d3ee");
      strokeLine("up", "#a78bfa");

      ctx.fillStyle = "rgba(150, 172, 198, 0.55)";
      ctx.textBaseline = "top";
      ctx.textAlign = "left";
      if (rangeLabel) ctx.fillText(`−${rangeLabel}`, padL, baseY + 7);
      ctx.textAlign = "right";
      ctx.fillText("сейчас", w - padR, baseY + 7);
    };

    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [points, rangeLabel]);

  return <canvas ref={canvasRef} className="speed-graph" />;
}
