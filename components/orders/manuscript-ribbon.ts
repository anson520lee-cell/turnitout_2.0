import type { paperSurface } from "./ribbon-surface";

// Project a printed strip in narrow cross-sections. The drawing sleeps once the paper settles.
export function mountRibbon(canvas: HTMLCanvasElement, lines: readonly string[]) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const context = ctx;
  const print = document.createElement("canvas");
  print.width = 2400;
  print.height = 360;
  const printContext = print.getContext("2d");
  if (!printContext) return;
  const ink = printContext;
  const type = getComputedStyle(canvas);
  const sans = type.fontFamily;
  const mono = type.getPropertyValue("--font-geist-mono").trim() || "monospace";
  let custom = "";
  function typeset() {
    ink.fillStyle = "#e4e7e7";
    ink.fillRect(0, 0, print.width, print.height);
    ink.strokeStyle = "#83929e";
    for (const y of [13, 23, 290, 335, 346]) {
      ink.beginPath(); ink.moveTo(0, y); ink.lineTo(print.width, y); ink.stroke();
    }
    const words = custom || lines.join("   ");
    for (let k = 0; k < 3; k++) {
      const left = k * 800;
      ink.save(); ink.beginPath(); ink.rect(left, 0, 800, 360); ink.clip();
      ink.fillStyle = "#253648";
      ink.font = "22px " + mono;
      ink.fillText("0%   /   FIELD NOTES                             P. 0" + (k + 1), left + 22, 60);
      ink.font = "550 122px " + sans;
      const title = custom || ["The city", "One window", "The table"][k];
      if (custom) ink.font = "550 " + Math.max(30, Math.min(122, 1100 / Math.max(1, title.length))) + "px " + sans;
      ink.fillText(title, left + 18, 184, 770);
      ink.font = "24px " + sans;
      ink.fillText(words, left + 22, 230);
      ink.fillText(custom || lines[(k + 1) % lines.length], left + 22, 261);
      ink.font = "17px " + mono;
      ink.fillText("READING COPY     /     SENTENCE 0" + (k + 1), left + 22, 321);
      ink.restore();
    }
    surface?.refreshPrint();
  }
  let surface: ReturnType<typeof paperSurface> | undefined;
  let disposed = false;
  let width = 1, height = 1, frame = 0, selected = 0, blend = 0;
  let x = 0, y = 0, targetX = 0, targetY = 0;
  const motion = matchMedia("(prefers-reduced-motion: reduce)");
  function render() {
    frame = 0;
    const speed = motion.matches ? 1 : .16;
    x += (targetX - x) * speed; y += (targetY - y) * speed;
    blend += (selected - blend) * speed;
    context.clearRect(0, 0, width, height);
    const segments = Math.max(150, Math.ceil(width / 2));
    // Orthographic projection of a spiral cut from a tilted cylinder.
    function edge(t: number) {
      const angle = t * Math.PI * 2.17 - 1.08 + x * .23 + blend * .14;
      const z = Math.sin(angle);
      const xx = .092 + .80 * t + .085 * Math.cos(angle);
      const yy = .66 - .27 * t - .235 * z + y * .048 * z;
      const dx = -.039 + .095 * Math.cos(angle + .3);
      const dy = .227 * Math.cos(angle - .59) + .105;
      return { x: xx * width, y: yy * height, dx: dx * width, dy: dy * height, z };
    }
    if (surface) {
      surface.draw(edge, width, height, blend);
    } else {
      const points = Array.from({ length: segments + 1 }, (_, i) => edge(i / segments));
      // Paint the farthest sections first so the twist overlaps itself correctly.
      const order = Array.from({length: segments}, (_, i) => i).sort((a,b) => points[a].z - points[b].z);
      for (const i of order) {
        const a = points[i], b = points[i + 1];
        const ax = a.x - a.dx, ay = a.y - a.dy;
        const bx = b.x - b.dx, by = b.y - b.dy;
        context.save();
        context.transform((bx - ax) * 1.12, (by - ay) * 1.12, a.dx * 2, a.dy * 2, ax, ay);
        context.drawImage(print, i / segments * print.width, 0, print.width / segments, print.height, 0, 0, 1, 1);
        const shade = .09 + .53 * (1 - (a.z + 1) / 2);
        context.fillStyle = `rgba(21,44,83,${shade})`;
        context.fillRect(0, 0, 1, 1);
        context.restore();
      }
    }
    if (Math.abs(x-targetX) + Math.abs(y-targetY) + Math.abs(blend-selected) > .001) schedule();
  }
  function schedule() { if (!frame) frame = requestAnimationFrame(render); }
  function resize() {
    const box = canvas.getBoundingClientRect();
    width = Math.max(1, box.width); height = Math.max(1, box.height);
    const pixelRatio = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * pixelRatio); canvas.height = Math.round(height * pixelRatio);
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    schedule();
  }
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  typeset();
  resize();
  void document.fonts.ready.then(() => { if (!disposed) { typeset(); schedule(); } });
  void import("./ribbon-surface").then(({ paperSurface }) => {
    if (disposed) return;
    surface = paperSurface(canvas, print);
    schedule();
  }).catch(() => { /* The printed 2D strip stays interactive without WebGL. */ });
  return {
    text(value: string) { custom = value; typeset(); schedule(); },
    move(nx: number, ny: number) { targetX = motion.matches ? 0 : nx; targetY = motion.matches ? 0 : ny; schedule(); },
    select(index: number) { selected = index; schedule(); },
    stop() { disposed = true; observer.disconnect(); cancelAnimationFrame(frame); surface?.stop(); }
  };
}
