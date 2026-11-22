"use client";
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { createConstellation } from "./constellation";
import nebulaTexture from "./nebula.webp";
import galaxyTexture from "./galaxy.webp";

/**
 * The backdrop: deep space.
 *
 * One fixed canvas behind every page, drawn back to front:
 *  - drifting nebula clouds, a rotating spiral galaxy, a ringed planet
 *    (slow scroll parallax)
 *  - a wave grid in perspective along the bottom that rises and falls like
 *    the open sea
 *  - a thin scroll-progress line on the top edge
 *
 * It never takes pointer events, pauses while the tab is hidden, and draws a
 * single still frame when the visitor prefers reduced motion.
 */

const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));

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

    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let reduce = motion.matches;
    const stars = createConstellation();
    let lastSkyTime = 0;
    let w = 0;
    let h = 0;
    let dpr = 1;
    let small = false;
    // The textures are rendered from the original procedural artwork ahead of time.
    // Decode off the interaction path and keep drawing the rest of the sky meanwhile.
    let nebula: HTMLImageElement | null = null;
    let galaxy: HTMLImageElement | null = null;
    let disposed = false;
    function loadTexture(src: string, ready: (image: HTMLImageElement) => void) {
      const image = new Image();
      image.decoding = "async";
      image.fetchPriority = "low";
      image.src = src;
      void image.decode().then(() => {
        if (disposed) return;
        ready(image);
        skyAge = 99;
        if (reduce) draw(t);
      }).catch(() => { /* The remaining sky layers can render without this texture. */ });
    }
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
      if (reduce) draw(t);
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

    // ── the sea: a wave grid in perspective under the page. Swells of different
    // lengths roll in from slightly different directions, so the surface keeps
    // rising and falling like open water; scrolling nudges it along a little.
    function sea(x: number, z: number, time: number, flow: number) {
      const zz = z + flow;
      return (
        0.15 * Math.sin(zz * 0.8 + x * 0.12 + time * 0.5) + // the long swell, rolling toward the viewer
        0.09 * Math.sin(x * 0.65 - zz * 0.45 + time * 0.38) + // a cross swell
        0.055 * Math.sin(x * 1.5 + zz * 1.25 + time * 0.78) +
        0.03 * Math.sin(x * 2.7 - zz * 2.1 + time * 1.05) // chop
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
      const flow = scrollY * 0.0025;
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
          ly[o] = hor + (camY - sea(x, z, time, flow)) * k;
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
      stars.paint(c, w, h, time, scrollY, Math.min(.1, Math.max(0, time - lastSkyTime)), reduce);
      lastSkyTime = time;
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
    loadTexture(nebulaTexture.src, (image) => { nebula = image; });
    loadTexture(galaxyTexture.src, (image) => { galaxy = image; });
    window.addEventListener("resize", resize);
    function onStillScroll() {
      scrollY = window.scrollY;
      draw(t);
    }
    function motionChanged() {
      reduce = motion.matches;
      window.removeEventListener("scroll", onStillScroll);
      onVisibility();
      if (reduce) {
        window.addEventListener("scroll", onStillScroll, { passive: true });
        onStillScroll();
      }
    }
    function press(event: PointerEvent) {
      if (reduce || !event.isPrimary || event.button !== 0) return;
      if (event.target instanceof Element && event.target.closest("input,textarea,select,[contenteditable=true]")) return;
      stars.sendPulse(event.clientX, event.clientY);
    }
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pointerdown", press, { passive: true });
    motion.addEventListener("change", motionChanged);
    motionChanged();
    return () => {
      cancelAnimationFrame(raf);
      disposed = true;
      motion.removeEventListener("change", motionChanged);
      window.removeEventListener("pointerdown", press);
      window.removeEventListener("resize", resize);
      window.removeEventListener("scroll", onStillScroll);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return <canvas ref={ref} aria-hidden className="pointer-events-none fixed inset-0 -z-20 size-full" />;
}
