import { useEffect, useRef, type PointerEvent } from "react";
import { Button } from "@/components/ui/button";

export function SignaturePad({
  value,
  onChange,
}: {
  value?: string;
  onChange: (dataUrl: string) => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const resize = () => {
      const { width } = canvas.getBoundingClientRect();
      const h = 160;
      canvas.width = Math.floor(width * 2);
      canvas.height = h * 2;
      ctx.setTransform(2, 0, 0, 2, 0, 0);
      ctx.fillStyle = "#111318";
      ctx.fillRect(0, 0, width, h);
      ctx.strokeStyle = "#c9a227";
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      if (value) {
        const img = new Image();
        img.onload = () => ctx.drawImage(img, 0, 0, width, h);
        img.src = value;
      }
    };
    resize();
  }, [value]);

  function pos(e: PointerEvent<HTMLCanvasElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function start(e: PointerEvent<HTMLCanvasElement>) {
    drawing.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    const ctx = e.currentTarget.getContext("2d");
    if (!ctx) return;
    const p = pos(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  }
  function move(e: PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const ctx = e.currentTarget.getContext("2d");
    if (!ctx) return;
    const p = pos(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  }
  function end(e: PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    drawing.current = false;
    onChange(e.currentTarget.toDataURL("image/png"));
  }

  function clear() {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { width, height } = canvas.getBoundingClientRect();
    ctx.fillStyle = "#111318";
    ctx.fillRect(0, 0, width, height);
    onChange("");
  }

  return (
    <div>
      <canvas
        ref={ref}
        className="h-40 w-full touch-none rounded-xl bg-elevated shadow-[0_0_0_1px_var(--color-line)]"
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
      />
      <div className="mt-2 flex justify-end">
        <Button type="button" variant="ghost" size="sm" onClick={clear}>
          Unterschrift löschen
        </Button>
      </div>
    </div>
  );
}
