"use client";
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

/**
 * The backdrop: deep space.
 *
 * One fixed canvas behind every page, drawn back to front:
 *  - drifting nebula clouds, a rotating spiral galaxy, a ringed planet
 *    (slow scroll parallax)
 *  - a loss landscape in perspective along the bottom: it flows toward the
 *    viewer over time and as the page scrolls
 *  - a thin scroll-progress line on the top edge
 *
 * It never takes pointer events, pauses while the tab is hidden, and draws a
 * single still frame when the visitor prefers reduced motion.
 */

const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));

/** A cloud texture: domain-warped fractal noise coloured blue → violet → magenta with cyan filaments. Built once. */
function makeNebula(): HTMLCanvasElement {
  const N = 384;
  const cvs = document.createElement("canvas");
  cvs.width = cvs.height = N;
  const g = cvs.getContext("2d");
  if (!g) return cvs;
  const P = new Uint8Array(512);
  for (let i = 0; i < 256; i++) P[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = P[i];
    P[i] = P[j];
    P[j] = t;
  }
  for (let i = 0; i < 256; i++) P[i + 256] = P[i];
  const lat = (x: number, y: number) => P[(P[x & 255] + y) & 255] / 255;
  const noise = (x: number, y: number) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const fx = x - xi;
    const fy = y - yi;
    const u = fx * fx * (3 - 2 * fx);
    const v = fy * fy * (3 - 2 * fy);
    const a = lat(xi, yi);
    const b = lat(xi + 1, yi);
    const d = lat(xi, yi + 1);
    const e = lat(xi + 1, yi + 1);
    return a + (b - a) * u + (d - a) * v + (a - b - d + e) * u * v;
  };
  const fbm = (x: number, y: number) => {
    let sum = 0;
    let amp = 0.5;
    let f = 1;
    for (let o = 0; o < 5; o++) {
      sum += amp * noise(x * f, y * f);
      amp *= 0.5;
      f *= 2;
    }
    return sum;
  };
  const img = g.createImageData(N, N);
  const C1 = [50, 105, 255];
  const C2 = [150, 90, 255];
  const C3 = [240, 95, 205];
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const nx = (x / N) * 3.6;
      const ny = (y / N) * 3.6;
      const q = fbm(nx + 3.1, ny + 1.7);
      const n = fbm(nx + q * 1.7, ny + q * 1.7 + 5.2);
      const m = fbm(nx * 1.6 + 9.4, ny * 1.6 + 2.8);
      // fade to nothing at the border so the texture can be drawn at any size
      const edge = clamp(Math.min(Math.min(x, N - 1 - x), Math.min(y, N - 1 - y)) / (N * 0.2));
      const d = clamp((n - 0.4) / 0.36) * edge * edge * (3 - 2 * edge);
      const t = clamp((m - 0.32) / 0.38);
      const A = t < 0.5 ? C1 : C2;
      const B = t < 0.5 ? C2 : C3;
      const k = t < 0.5 ? t * 2 : (t - 0.5) * 2;
      const hi = clamp((n - 0.66) / 0.14); // bright cyan filaments in the densest folds
      const o = (y * N + x) * 4;
      img.data[o] = A[0] + (B[0] - A[0]) * k + (120 - 60) * hi;
      img.data[o + 1] = A[1] + (B[1] - A[1]) * k + 120 * hi;
      img.data[o + 2] = A[2] + (B[2] - A[2]) * k;
      img.data[o + 3] = d * d * 235;
    }
  }
  g.putImageData(img, 0, 0);
  return cvs;
}

/**
 * A spiral galaxy sprite, built once and drawn rotating. Tens of thousands of
 * faint points add up to smooth light, the way a real disc does:
 * an exponential stellar disc, two major and two minor logarithmic arms with
 * clumpy brightness, a warm bulge, blue young clusters and pink star-forming
 * regions along the arms, soft glow lanes, dark dust carved along the arms'
 * inner edges, and a faint halo.
 */
function makeGalaxy(): HTMLCanvasElement {
  const N = 1024;
  const cvs = document.createElement("canvas");
  cvs.width = cvs.height = N;
  const g = cvs.getContext("2d");
  if (!g) return cvs;
  g.translate(N / 2, N / 2);
  const R = N * 0.48;
  const TAU = Math.PI * 2;
  const gauss = () => (Math.random() + Math.random() + Math.random() + Math.random() - 2) / 2;
  const WIND = 2.9;
  const spiral = (r: number) => WIND * Math.log(1 + r / (R * 0.16));
  const dot = (x: number, y: number, size: number) => g.fillRect(x - size / 2, y - size / 2, size, size);
  const blob = (x: number, y: number, r: number, col: string, a: number) => {
    const b = g.createRadialGradient(x, y, 0, x, y, r);
    b.addColorStop(0, `rgba(${col},${a})`);
    b.addColorStop(1, `rgba(${col},0)`);
    g.fillStyle = b;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  };

  // halo
  blob(0, 0, R, "120,135,255", 0.13);
  g.globalCompositeOperation = "lighter";

  // the smooth disc: brightness falls off exponentially with radius
  for (let i = 0; i < 70000; i++) {
    const r = Math.min(R, -Math.log(1 - Math.random()) * R * 0.27);
    const th = Math.random() * TAU;
    const warm = Math.max(0, 1 - r / (R * 0.5));
    g.fillStyle = `rgba(${Math.round(190 + 65 * warm)},${Math.round(200 + 35 * warm)},${Math.round(255 - 30 * warm)},${0.035 + Math.random() * 0.08})`;
    dot(Math.cos(th) * r, Math.sin(th) * r, 1.3);
  }

  // the arms
  const ARMS: [number, number][] = [
    [0, 1],
    [Math.PI, 1],
    [Math.PI * 0.5, 0.42],
    [Math.PI * 1.5, 0.42],
  ];
  for (const [phase, strength] of ARMS) {
    const count = Math.round(46000 * strength);
    for (let i = 0; i < count; i++) {
      // broad, diffuse arms that thin out and fade toward the rim
      const r = R * (0.06 + 0.9 * Math.pow(Math.random(), 1.1));
      const k = r / R;
      const fade = Math.pow(1 - k, 0.7);
      const th = phase + spiral(r) + gauss() * (0.62 - 0.2 * k) + (Math.random() - 0.5) * 0.25;
      // clumps: the arm is brighter in knots along its length
      const clump = 0.55 + 0.45 * Math.sin(spiral(r) * 5.3 + phase * 3) * Math.sin(r * 0.031 + phase);
      const x = Math.cos(th) * r;
      const y = Math.sin(th) * r;
      const p = Math.random();
      if (p < 0.005) {
        // a young blue cluster
        blob(x, y, 3 + Math.random() * 4, "170,205,255", 0.2 * strength * fade);
        g.fillStyle = `rgba(225,238,255,${(0.85 * fade + 0.1).toFixed(2)})`;
        dot(x, y, 1.5);
      } else if (p < 0.009 && k > 0.18) {
        // a pink star-forming region
        blob(x, y, 4 + Math.random() * 6, "255,110,180", 0.17 * strength * fade);
        g.fillStyle = `rgba(255,190,220,${(0.7 * fade + 0.1).toFixed(2)})`;
        dot(x, y, 1.3);
      } else {
        const warm = Math.max(0, 1 - k * 2.4);
        g.fillStyle = `rgba(${Math.round(155 + 100 * warm)},${Math.round(185 + 50 * warm)},${Math.round(255 - 40 * warm)},${((0.04 + Math.random() * 0.13) * strength * (0.5 + clump) * (0.25 + fade)).toFixed(3)})`;
        dot(x, y, Math.random() < 0.08 ? 1.7 : 1.1);
      }
    }
    // glow that follows the arm
    for (let i = 0; i < 260 * strength; i++) {
      const r = R * (0.1 + 0.88 * Math.random());
      const th = phase + spiral(r) + gauss() * 0.16;
      blob(Math.cos(th) * r, Math.sin(th) * r, 22 + Math.random() * 44, r < R * 0.35 ? "210,190,255" : "110,150,255", (0.034 * strength + 0.012) * (1.15 - r / R));
    }
  }

  // dust: dark lanes on the inner (trailing) edge of the two major arms
  g.globalCompositeOperation = "destination-out";
  for (const phase of [0, Math.PI]) {
    for (let i = 0; i < 520; i++) {
      const r = R * (0.12 + 0.7 * Math.random());
      const th = phase + spiral(r) - 0.42 + gauss() * 0.12;
      blob(Math.cos(th) * r, Math.sin(th) * r, 6 + Math.random() * 14, "0,0,0", 0.07 + Math.random() * 0.08);
    }
  }
  g.globalCompositeOperation = "lighter";

  // the bulge: old, warm stars packed round the centre, slightly barred
  for (let i = 0; i < 11000; i++) {
    const r = Math.abs(gauss()) * R * 0.26;
    const th = Math.random() * TAU;
    g.fillStyle = `rgba(255,${Math.round(225 + Math.random() * 20)},${Math.round(190 + Math.random() * 30)},${0.05 + Math.random() * 0.1})`;
    dot(Math.cos(th) * r * 1.25, Math.sin(th) * r * 0.85, 1.2);
  }
  blob(0, 0, R * 0.2, "255,236,208", 0.5);
  blob(0, 0, R * 0.075, "255,250,240", 0.95);

  // a scatter of foreground stars across the whole disc
  for (let i = 0; i < 260; i++) {
    const r = Math.sqrt(Math.random()) * R;
    const th = Math.random() * TAU;
    g.fillStyle = `rgba(240,245,255,${0.35 + Math.random() * 0.55})`;
    dot(Math.cos(th) * r, Math.sin(th) * r, Math.random() < 0.2 ? 1.9 : 1.2);
  }
  return cvs;
}

/** Signed-in areas get the full show; public pages keep it quieter behind their own visuals. */
const APP_ROUTES = /^\/(dashboard|scan|orders|services|billing|settings|admin)(\/|$)/;

export function SpaceBackground() {
  const ref = useRef<HTMLCanvasElement>(null);
  const pathname = usePathname();
  const inApp = useRef(false);
  useEffect(() => {
    inApp.current = APP_ROUTES.test(pathname ?? "");
  }, [pathname]);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const c = ctx;
    const cv = canvas;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let w = 0;
    let h = 0;
    let dpr = 1;
    let small = false;
    // The two textures take a moment to paint, so they are built just after
    // the first frame instead of holding it up.
    let nebula: HTMLCanvasElement | null = null;
    let galaxy: HTMLCanvasElement | null = null;
    const texTimer = window.setTimeout(() => {
      nebula = makeNebula();
      galaxy = makeGalaxy();
      skyAge = 99;
      if (reduce) draw(0);
    }, 80);
    // The clouds drift slowly, so they are painted into a half-resolution
    // layer every few frames and that layer is blitted, instead of blending
    // two full-screen textures on every frame.
    const sky = document.createElement("canvas");
    const skyCtx = sky.getContext("2d");
    let skyAge = 99;
    let lx = new Float32Array(0);
    let ly = new Float32Array(0);

    let scrollY = window.scrollY;
    let docH = document.documentElement.scrollHeight;
    let raf = 0;
    let last = performance.now();
    let t = 0;
    let frame = 0;

    function resize() {
      small = window.innerWidth < 760;
      dpr = Math.min(window.devicePixelRatio || 1, small ? 1 : 1.5);
      w = window.innerWidth;
      h = window.innerHeight;
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      sky.width = Math.max(2, Math.round(w / 2));
      sky.height = Math.max(2, Math.round(h / 2));
      skyAge = 99;
      docH = document.documentElement.scrollHeight;
      if (reduce) draw(0);
    }

    function drawNebula(time: number, off: number) {
      const k = skyCtx;
      if (k && nebula && ++skyAge > 5) {
        skyAge = 0;
        const sw = sky.width;
        const sh = sky.height;
        k.setTransform(1, 0, 0, 1, 0, 0);
        k.globalCompositeOperation = "source-over";
        k.globalAlpha = 1;
        k.clearRect(0, 0, sw, sh);
        // base wash so the void is never flat black
        const wash = k.createLinearGradient(0, 0, sw, sh);
        // deep space: the wash is barely there, so black stays black
        wash.addColorStop(0, "rgba(22,30,90,0.14)");
        wash.addColorStop(0.5, "rgba(6,8,26,0.02)");
        wash.addColorStop(1, "rgba(52,26,96,0.12)");
        k.fillStyle = wash;
        k.fillRect(0, 0, sw, sh);
        // two sheets of cloud drifting past each other
        const big = Math.max(sw, sh);
        k.globalCompositeOperation = "lighter";
        k.globalAlpha = 0.24;
        k.translate(sw * 0.62 + Math.sin(time * 0.021) * 30, sh * 0.42);
        k.rotate(-0.35 + Math.sin(time * 0.013) * 0.06);
        k.drawImage(nebula, -big * 0.95, -big * 0.7, big * 1.9, big * 1.4);
        k.setTransform(1, 0, 0, 1, 0, 0);
        k.globalAlpha = 0.16;
        k.translate(sw * 0.24 - Math.sin(time * 0.017) * 35, sh * 0.82);
        k.rotate(2.6 + Math.cos(time * 0.011) * 0.08);
        k.drawImage(nebula, -big * 0.8, -big * 0.6, big * 1.6, big * 1.2);
      }
      // drawn a little oversized so the scroll parallax never shows an edge
      c.drawImage(sky, -w * 0.04, -h * 0.1 - off * 0.8, w * 1.08, h * 1.2);
    }

    function drawGalaxy(time: number, off: number) {
      if (!galaxy) return;
      // top right, clear of the headings; drawn close to the sprite's own size
      const R = Math.min(Math.min(w, h) * (small ? 0.46 : 0.56), 540);
      c.save();
      c.globalCompositeOperation = "lighter";
      c.globalAlpha = inApp.current ? 0.7 : 0.82;
      c.translate(small ? w * 0.82 : w * 0.83, h * 0.13 - off * 0.45);
      c.rotate(0.42);
      c.scale(1, 0.56);
      c.rotate(-time * 0.022);
      c.drawImage(galaxy, -R, -R, R * 2, R * 2);
      c.restore();
    }

    // ── the loss landscape: a surface in perspective under the page. It flows
    // toward the viewer over time and when the page scrolls.
    function landscape(x: number, z: number, time: number, flow: number) {
      const zz = z + flow;
      return (
        0.27 * Math.sin(x * 1.2 + time * 0.2) * Math.cos(zz * 0.85) +
        0.13 * Math.sin(x * 2.5 - zz * 1.6 + time * 0.3) -
        0.44 * Math.exp(-((x - 0.3) * (x - 0.3) + (z - 4.3) * (z - 4.3)) / 2.4)
      );
    }

    function drawLandscape(time: number) {
      const COLS = small ? 34 : 64;
      const ROWS = small ? 14 : 22;
      const X = 6;
      const Z0 = 1.3;
      const Z1 = 8.2;
      const camY = 0.74;
      // On a wide screen the surface fills the lower part of the viewport. On a
      // phone the viewport is tall and narrow: scaling by height would zoom the
      // surface in until only its middle strip showed and park it halfway up the
      // page, so scale by width and sit the nearest edge on the bottom instead.
      const f = Math.min(h * 0.85, w * 0.95);
      const hor = small ? h - f * (camY / Z0 + 0.04) : h * 0.6;
      const flow = time * 0.22 + scrollY * 0.0042;
      const A = inApp.current ? 0.3 : 0.26;

      // horizon glow
      const hg = c.createLinearGradient(0, hor - h * 0.1, 0, hor + h * 0.16);
      hg.addColorStop(0, "rgba(91,140,255,0)");
      hg.addColorStop(0.45, "rgba(110,150,255,0.07)");
      hg.addColorStop(1, "rgba(154,123,255,0)");
      c.fillStyle = hg;
      c.fillRect(0, hor - h * 0.1, w, h * 0.26);

      const n = (COLS + 1) * ROWS;
      if (lx.length !== n) {
        lx = new Float32Array(n);
        ly = new Float32Array(n);
      }
      for (let j = 0; j < ROWS; j++) {
        const z = Z0 + (j / (ROWS - 1)) * (Z1 - Z0);
        const k = f / z;
        for (let i = 0; i <= COLS; i++) {
          const x = (i / COLS - 0.5) * 2 * X;
          const o = j * (COLS + 1) + i;
          lx[o] = w / 2 + x * k;
          ly[o] = hor + (camY - landscape(x, z, time, flow)) * k;
        }
      }
      c.lineWidth = 0.7;
      // contour rows, far to near
      for (let j = ROWS - 1; j >= 0; j--) {
        const d = j / (ROWS - 1);
        c.strokeStyle = `hsla(${188 + 72 * d},92%,${70 - 8 * d}%,${(Math.pow(1 - d, 1.25) * A + 0.035).toFixed(3)})`;
        c.beginPath();
        let pen = false;
        for (let i = 0; i <= COLS; i++) {
          const o = j * (COLS + 1) + i;
          if (lx[o] < -80 || lx[o] > w + 80) {
            pen = false;
            continue;
          }
          if (pen) c.lineTo(lx[o], ly[o]);
          else c.moveTo(lx[o], ly[o]);
          pen = true;
        }
        c.stroke();
      }
      // the lines running away from the viewer
      c.strokeStyle = `rgba(140,150,255,${(A * 0.26).toFixed(3)})`;
      c.beginPath();
      for (let i = 0; i <= COLS; i++) {
        if (lx[i] < -w * 0.6 || lx[i] > w * 1.6) continue;
        c.moveTo(lx[i], ly[i]);
        for (let j = 1; j < ROWS; j++) c.lineTo(lx[j * (COLS + 1) + i], ly[j * (COLS + 1) + i]);
      }
      c.stroke();
    }

    function drawPlanet(off: number) {
      const r = Math.min(w, h) * (small ? 0.42 : 0.5);
      const x = w * 0.96;
      const y = h * 1.04 - off * 0.6;
      const body = c.createRadialGradient(x - r * 0.45, y - r * 0.5, r * 0.05, x, y, r);
      body.addColorStop(0, "rgba(34,48,112,0.97)");
      body.addColorStop(0.5, "rgba(12,16,46,0.98)");
      body.addColorStop(1, "rgba(3,4,10,1)");
      c.fillStyle = body;
      c.beginPath();
      c.arc(x, y, r, 0, Math.PI * 2);
      c.fill();
      // atmosphere rim on the lit side
      const rim = c.createRadialGradient(x, y, r * 0.96, x, y, r * 1.06);
      rim.addColorStop(0, "rgba(95,216,245,0.0)");
      rim.addColorStop(0.55, "rgba(120,170,255,0.22)");
      rim.addColorStop(1, "rgba(120,170,255,0)");
      c.fillStyle = rim;
      c.beginPath();
      c.arc(x, y, r * 1.06, 0, Math.PI * 2);
      c.fill();
      // a ring
      c.save();
      c.translate(x, y);
      c.rotate(-0.38);
      c.scale(1, 0.18);
      c.strokeStyle = "rgba(160,190,255,0.16)";
      c.lineWidth = r * 0.05;
      c.beginPath();
      c.arc(0, 0, r * 1.35, 0, Math.PI * 2);
      c.stroke();
      c.strokeStyle = "rgba(154,123,255,0.1)";
      c.lineWidth = r * 0.02;
      c.beginPath();
      c.arc(0, 0, r * 1.5, 0, Math.PI * 2);
      c.stroke();
      c.restore();
    }

    function drawProgress() {
      const max = Math.max(1, docH - h);
      const p = clamp(scrollY / max);
      if (p <= 0.002) return;
      const g = c.createLinearGradient(0, 0, w * p, 0);
      g.addColorStop(0, "rgba(95,216,245,0.0)");
      g.addColorStop(0.7, "rgba(95,216,245,0.85)");
      g.addColorStop(1, "rgba(190,170,255,1)");
      c.fillStyle = g;
      c.fillRect(0, 0, w * p, 2);
      const hg = c.createRadialGradient(w * p, 1, 0, w * p, 1, 14);
      hg.addColorStop(0, "rgba(200,190,255,0.8)");
      hg.addColorStop(1, "rgba(200,190,255,0)");
      c.fillStyle = hg;
      c.fillRect(w * p - 14, 0, 28, 16);
    }

    function draw(time: number) {
      c.clearRect(0, 0, w, h);
      const off = Math.sin(scrollY * 0.0009) * 80;
      drawNebula(time, off);
      drawGalaxy(time, off);
      drawPlanet(off);
      drawLandscape(time);
      drawProgress();
    }

    function loop(now: number) {
      raf = requestAnimationFrame(loop);
      const dt = clamp((now - last) / 1000, 0, 0.05);
      last = now;
      t += dt;
      frame++;
      if (frame % 90 === 0) docH = document.documentElement.scrollHeight;
      scrollY = window.scrollY;
      // Public pages and phones run at half rate; they have their own visuals to pay for.
      if ((small || !inApp.current) && frame % 2 === 1) return;
      draw(t);
    }

    function onVisibility() {
      cancelAnimationFrame(raf);
      if (!document.hidden && !reduce) {
        last = performance.now();
        raf = requestAnimationFrame(loop);
      }
    }

    resize();
    window.addEventListener("resize", resize);
    function onStillScroll() {
      scrollY = window.scrollY;
      draw(0);
    }
    if (reduce) {
      window.addEventListener("scroll", onStillScroll, { passive: true });
      draw(0);
    } else {
      document.addEventListener("visibilitychange", onVisibility);
      raf = requestAnimationFrame(loop);
    }
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(texTimer);
      window.removeEventListener("resize", resize);
      window.removeEventListener("scroll", onStillScroll);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return <canvas ref={ref} aria-hidden className="pointer-events-none fixed inset-0 -z-20 size-full" />;
}
