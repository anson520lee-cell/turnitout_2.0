import { pointer } from "@/components/motion/pointer-engine";

/** A sparse depth field. Only nearby stars bend toward the pointer and join its constellation. */
export function createConstellation() {
  let seed = 983742;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const stars = Array.from({ length: 150 }, () => ({
    u: random(),
    v: random(),
    depth: 0.22 + random() * 0.78,
    phase: random() * Math.PI * 2,
  }));
  let waveX = 0,
    waveY = 0,
    elapsed = 2;
  function sendPulse(x: number, y: number) {
    waveX = x;
    waveY = y;
    elapsed = 0;
  }
  function paint(
    c: CanvasRenderingContext2D,
    w: number,
    h: number,
    time: number,
    scroll: number,
    dt: number,
    still: boolean,
  ) {
    elapsed = still ? 2 : elapsed + dt;
    const live = !still && pointer.inside;
    const reach = Math.min(177, w * 0.3);
    const wave = elapsed * 340;
    const count = w < 650 ? 84 : stars.length;
    let previousX = 0,
      previousY = 0,
      nearby = 0;
    c.lineWidth = 0.8;
    for (let i = 0; i < count; i++) {
      const star = stars[i];
      let x = (star.u * w + Math.cos(star.phase + time * 0.047) * 4 + w) % w;
      let y = (((star.v * h - scroll * 0.045 * star.depth) % h) + h) % h;
      const dx = pointer.x - x,
        dy = pointer.y - y;
      const distance = live ? Math.hypot(dx, dy) : reach;
      const pull = Math.max(0, 1 - distance / reach);
      x += live ? dx * pull * 0.34 : 0;
      y += live ? dy * pull * 0.34 : 0;
      let wake = 0;
      if (elapsed < 0.95) {
        const rx = x - waveX,
          ry = y - waveY;
        const radius = Math.hypot(rx, ry) || 1;
        wake = Math.max(0, 1 - Math.abs(radius - wave) / 40) * (1 - elapsed);
        x += (rx / radius) * wake * 27;
        y += (ry / radius) * wake * 27;
      }
      if (pull > 0.1) {
        c.strokeStyle = `rgba(141,195,255,${pull * 0.72})`;
        c.beginPath();
        c.moveTo(x, y);
        if (nearby < 2) c.lineTo(pointer.x, pointer.y);
        else c.lineTo(previousX, previousY);
        c.stroke();
        previousX = x;
        previousY = y;
        nearby++;
      }
      c.fillStyle = `rgba(195,219,255,${Math.min(0.96, 0.15 + star.depth * 0.5 + pull * 0.44 + wake)})`;
      const size = 0.45 + star.depth * 1.05 + pull + wake;
      c.fillRect(x, y, size, size);
      if (star.depth > 0.97 || pull > 0.66) {
        c.fillRect(x - 2, y + 0.48, size + 4, 0.6);
        c.fillRect(x + 0.5, y - 2, 0.6, size + 4);
      }
    }
    if (elapsed < 0.72) {
      c.strokeStyle = `rgba(153,208,255,${0.36 * (1 - elapsed / 0.72)})`;
      c.beginPath();
      c.arc(waveX, waveY, wave, 0, 2 * Math.PI);
      c.stroke();
    }
  }
  return { paint, sendPulse };
}
