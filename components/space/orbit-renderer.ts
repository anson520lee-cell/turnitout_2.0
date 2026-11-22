/** Three surfaces with matching vertex indices, so a scan can unfold directly from a draft. */
export type OrbitForm = "draft" | "scan" | "report";
const FORMS: OrbitForm[] = ["draft", "scan", "report"];
const TAU = 2 * Math.PI;
const clamp = (n: number, low: number, high: number) => Math.min(high, Math.max(low, n));

function makeSurfaces(lines: number, segments: number) {
  const count = lines * (segments + 1) * 3;
  const draft = new Float32Array(count);
  const scan = new Float32Array(count);
  const report = new Float32Array(count);
  for (let row = 0; row < lines; row++) {
    const v = row / lines;
    const latitude = (v - 0.49) * Math.PI * 0.97;
    for (let col = 0; col <= segments; col++) {
      const u = (col / segments) * TAU;
      const c = Math.cos(u);
      const s = Math.sin(u);
      const twist = v * TAU + 2 * u + 0.48 * Math.sin(3 * u);
      const tube = 0.23 + 0.065 * Math.sin(3 * u - 0.4);
      const r = 0.71 + tube * Math.cos(twist);
      const i = (row * (segments + 1) + col) * 3;
      draft[i] = r * c;
      draft[i + 1] = r * s;
      draft[i + 2] = tube * Math.sin(twist) + 0.22 * Math.sin(2 * u + 0.8);

      const parallel = 0.81 * Math.cos(latitude) * (1 + 0.055 * Math.sin(3 * u + 2 * latitude));
      scan[i] = parallel * c;
      scan[i + 1] = 0.88 * Math.sin(latitude);
      scan[i + 2] = parallel * s;

      // Three folded sheets. Their edges remain individual filaments throughout the morph.
      const sheet = Math.floor(v * 3);
      const level = (v * 3) % 1;
      const sheetX = Math.sign(c) * Math.pow(Math.abs(c), 0.52);
      const sheetZ = Math.sign(s) * Math.pow(Math.abs(s), 0.53);
      report[i] = sheetX * (0.8 + 0.09 * level);
      report[i + 1] =
        (sheet - 1) * 0.32 + level * 0.12 + 0.16 * Math.sin(sheetX * 3 + sheet * 0.38) - 0.16 * sheetZ;
      report[i + 2] = sheetZ * (0.52 + 0.13 * level);
    }
  }
  return [draft, scan, report];
}

export function mountOrbit(canvas: HTMLCanvasElement, initial: OrbitForm, interactive: boolean) {
  const ctx = canvas.getContext("2d");
  const surface = canvas.parentElement;
  if (!ctx || !surface) return null;
  const c = ctx;
  const host = surface;
  const compact = host.classList.contains("orbit-compact");
  const small = host.clientWidth < 440;
  const lines = compact || small ? 40 : 62;
  const segments = compact || small ? 72 : 100;
  const stride = segments + 1;
  const shapes = makeSurfaces(lines, segments);
  const xy = new Float32Array(lines * stride * 2);
  const weights = FORMS.map((name) => (name === initial ? 1 : 0));
  let target = FORMS.indexOf(initial);
  let width = 1,
    height = 1;
  let ink: CanvasGradient;
  let time = 0.15,
    lastDraw = 0,
    raf = 0,
    visible = false;
  let paused = false,
    yaw = 0,
    pitch = 0,
    aimYaw = 0,
    aimPitch = 0;
  let scrollAngle = 0;
  let mouseX = 0,
    mouseY = 0,
    probe = 0,
    inside = false;
  let dragId: number | null = null,
    startX = 0,
    startY = 0,
    startYaw = 0,
    startPitch = 0;
  let wasDrag = false,
    pulse = 1;
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");

  function draw(dt: number) {
    const still = motion.matches || paused;
    const follow = still ? 1 : 1 - Math.exp(-9 * dt);
    if (!still) time += dt;
    for (let n = 0; n < weights.length; n++) weights[n] += ((n === target ? 1 : 0) - weights[n]) * follow;
    probe += ((inside && !still ? 1 : 0) - probe) * follow;
    yaw += (aimYaw - yaw) * follow;
    pitch += (aimPitch - pitch) * follow;
    pulse = still ? 1 : Math.min(1, pulse + dt * 1.4);

    const radius = Math.min(width * 0.4, height * 0.45);
    const midX = width * 0.5,
      midY = height * 0.5;
    const ax = -0.43 + scrollAngle * 0.63 + pitch + 0.12 * Math.sin(time * 0.48) - 0.15 * weights[2];
    const ay = -0.36 + scrollAngle + yaw + time * 0.18;
    const az = -0.33 + 0.09 * Math.sin(time * 0.32);
    const sx = Math.sin(ax),
      cx = Math.cos(ax),
      sy = Math.sin(ay),
      cy = Math.cos(ay);
    const sz = Math.sin(az),
      cz = Math.cos(az);
    const reach = radius * 0.61;
    const reach2 = reach * reach;
    const flare = Math.sin(pulse * Math.PI);
    const [a, b, d] = weights;
    c.clearRect(0, 0, width, height);

    // The two faint paths and their moving beacons give the object a scale and a plane.
    for (let ring = 0; ring < 2; ring++) {
      const tilt = ring ? -0.63 : 0.29;
      const rx = radius * (ring ? 1.27 : 1.22);
      const ry = radius * (ring ? 0.5 : 0.78);
      c.beginPath();
      c.ellipse(midX, midY, rx, ry, tilt, 0, TAU);
      c.strokeStyle = ring ? "rgba(137,170,219,.27)" : "rgba(147,181,230,.15)";
      c.lineWidth = 0.7;
      c.setLineDash(ring ? [2, 6] : []);
      c.stroke();
      c.setLineDash([]);
      const angle = (ring ? 3.8 : 0.4) + time * (ring ? 0.4 : -0.24);
      const ex = Math.cos(angle) * rx,
        ey = Math.sin(angle) * ry;
      const bx = midX + ex * Math.cos(tilt) - ey * Math.sin(tilt);
      const by = midY + ex * Math.sin(tilt) + ey * Math.cos(tilt);
      c.fillStyle = "#c7e1ff";
      c.fillRect(bx - 1.2, by - 1.2, 2.4, 2.4);
      c.strokeRect(bx - 3.5, by - 3.5, 7, 7);
    }

    for (let i = 0, k = 0; i < shapes[0].length; i += 3, k += 2) {
      const x = shapes[0][i] * a + shapes[1][i] * b + shapes[2][i] * d;
      const y = shapes[0][i + 1] * a + shapes[1][i + 1] * b + shapes[2][i + 1] * d;
      const z = shapes[0][i + 2] * a + shapes[1][i + 2] * b + shapes[2][i + 2] * d;
      const xx = cy * x + sy * z,
        zz = cy * z - sy * x;
      const yy = cx * y - sx * zz;
      const depth = sx * y + cx * zz;
      const scale = radius * (3.8 / (3.8 - depth)) * (1 + flare * 0.08);
      let px = midX + (cz * xx - sz * yy) * scale;
      let py = midY + (sz * xx + cz * yy) * scale;
      const dx = px - mouseX,
        dy = py - mouseY;
      const distance2 = dx * dx + dy * dy;
      if (probe > 0.012 && distance2 < reach2) {
        const influence = (1 - distance2 / reach2) ** 2 * probe;
        px += (dx * 0.94 + radius * 0.12) * influence;
        py += (dy * 0.94 - radius * 0.19) * influence;
      }
      xy[k] = px;
      xy[k + 1] = py;
    }

    // Short transverse threads are uncovered only under the pointer.
    if (probe > 0.02) {
      c.beginPath();
      for (let row = 0; row < lines - 2; row += 2) {
        for (let col = 0; col < segments; col += 3) {
          const k = (row * stride + col) * 2;
          const dx = xy[k] - mouseX,
            dy = xy[k + 1] - mouseY;
          if (dx * dx + dy * dy > reach2 * 0.65) continue;
          c.moveTo(xy[k], xy[k + 1]);
          c.lineTo(xy[k + 4 * stride], xy[k + 4 * stride + 1]);
        }
      }
      c.strokeStyle = `rgba(121,193,255,${0.85 * probe})`;
      c.lineWidth = 0.85;
      c.stroke();
    }
    c.strokeStyle = ink;
    for (let row = 0; row < lines; row++) {
      const band = row / lines;
      c.globalAlpha = 0.4 + 0.53 * (0.5 + 0.5 * Math.cos(band * TAU - time * 0.5));
      c.lineWidth = row % 11 === 0 ? 1.4 : 0.85;
      const from = row * stride * 2;
      c.beginPath();
      c.moveTo(xy[from], xy[from + 1]);
      for (let col = 1; col <= segments; col++) {
        const k = from + col * 2;
        c.lineTo(xy[k], xy[k + 1]);
      }
      c.stroke();
    }
    c.globalAlpha = 1;
    // A few illuminated strands travel along the actual surface, including while it is morphing.
    for (let n = 0; n < 5; n++) {
      const thread = Math.floor(((n + 0.4) * lines) / 5);
      const tip = Math.floor((time * (0.079 + n * 0.006) + n * 0.27) * segments) % segments;
      const tail = Math.max(5, Math.round(segments * 0.09));
      c.beginPath();
      for (let j = 0; j <= tail; j++) {
        const col = (tip - tail + j + segments) % segments;
        const k = (thread * stride + col) * 2;
        if (j === 0) c.moveTo(xy[k], xy[k + 1]);
        else c.lineTo(xy[k], xy[k + 1]);
      }
      c.strokeStyle = n % 2 ? "rgba(143,202,255,.8)" : "rgba(209,231,255,.85)";
      c.lineWidth = 1.5;
      c.stroke();
      const k = (thread * stride + tip) * 2;
      c.fillStyle = "#dbedff";
      c.fillRect(xy[k] - 1, xy[k + 1] - 1, 2, 2);
    }
    // A narrow scanner crosses the globe. It also travels down the report's layers.
    const row = Math.floor((0.5 + 0.485 * Math.sin(time * 0.8)) * lines);
    const from = row * stride * 2;
    c.beginPath();
    c.moveTo(xy[from], xy[from + 1]);
    for (let col = 1; col <= segments; col++) c.lineTo(xy[from + col * 2], xy[from + col * 2 + 1]);
    c.strokeStyle = `rgba(214,239,255,${0.34 + 0.6 * (b + d)})`;
    c.lineWidth = 1.55;
    c.stroke();
  }

  function tick(now: number) {
    raf = 0;
    if (!visible || document.hidden) return;
    const elapsed = now - lastDraw;
    if (!lastDraw || elapsed >= (small || compact ? 31 : 23)) {
      draw(lastDraw ? Math.min(elapsed / 1000, 0.08) : 1 / 60);
      lastDraw = now;
    }
    if (!paused && !motion.matches) raf = requestAnimationFrame(tick);
  }
  function sync() {
    cancelAnimationFrame(raf);
    lastDraw = 0;
    if (visible && !document.hidden) tick(performance.now());
  }
  function readScroll() {
    if (!visible || motion.matches || paused) return;
    const rect = host.getBoundingClientRect();
    scrollAngle = clamp((innerHeight * 0.5 - rect.top - rect.height * 0.5) / innerHeight, -0.55, 0.55);
  }
  function resize() {
    width = Math.max(1, host.clientWidth);
    height = Math.max(1, host.clientHeight);
    const dpr = Math.min(window.devicePixelRatio || 1, compact || small ? 1.5 : 1.75);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    ink = c.createLinearGradient(width * 0.16, height * 0.74, width * 0.83, height * 0.25);
    ink.addColorStop(0, "#5262c0");
    ink.addColorStop(0.24, "#909cef");
    ink.addColorStop(0.47, "#d9eeff");
    ink.addColorStop(0.6, "#f1f6ff");
    ink.addColorStop(0.74, "#68a8ff");
    ink.addColorStop(1, "#425eb1");
    draw(0);
    host.dataset.ready = "true";
  }
  function move(e: PointerEvent) {
    if (motion.matches || (e.pointerType === "touch" && dragId !== e.pointerId)) return;
    const rect = canvas.getBoundingClientRect();
    mouseX = e.clientX - rect.left;
    mouseY = e.clientY - rect.top;
    inside = true;
    if (dragId !== e.pointerId) return;
    const dx = e.clientX - startX,
      dy = e.clientY - startY;
    if (Math.hypot(dx, dy) > 7) wasDrag = true;
    if (!wasDrag) return;
    aimYaw = startYaw + (dx / width) * 3.4;
    aimPitch = clamp(startPitch + (dy / height) * 1.9, -1.2, 1.2);
    if (paused) draw(0);
  }
  function down(e: PointerEvent) {
    if (!interactive || !e.isPrimary || e.button !== 0) return;
    dragId = e.pointerId;
    wasDrag = false;
    startX = e.clientX;
    startY = e.clientY;
    startYaw = aimYaw;
    startPitch = aimPitch;
    host.setPointerCapture(e.pointerId);
    move(e);
  }
  function up(e: PointerEvent) {
    if (e.pointerId !== dragId) return;
    dragId = null;
    if (e.pointerType !== "mouse" || e.type === "pointercancel") inside = false;
  }
  function leave() {
    if (dragId === null) inside = false;
  }
  window.addEventListener("scroll", readScroll, { passive: true });
  const sizeObserver = new ResizeObserver(resize);
  sizeObserver.observe(host);
  const viewObserver = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    sync();
  });
  viewObserver.observe(host);
  host.addEventListener("pointermove", move, { passive: true });
  host.addEventListener("pointerdown", down);
  host.addEventListener("pointerup", up);
  host.addEventListener("pointercancel", up);
  host.addEventListener("lostpointercapture", up);
  host.addEventListener("pointerleave", leave);
  document.addEventListener("visibilitychange", sync);
  motion.addEventListener("change", sync);
  resize();

  return {
    setForm(form: OrbitForm) {
      target = FORMS.indexOf(form);
      pulse = 0;
      if (visible && (paused || motion.matches)) draw(0);
    },
    setPaused(value: boolean) {
      paused = value;
      sync();
    },
    consumedDrag() {
      const result = wasDrag;
      wasDrag = false;
      return result;
    },
    dispose() {
      cancelAnimationFrame(raf);
      sizeObserver.disconnect();
      viewObserver.disconnect();
      window.removeEventListener("scroll", readScroll);
      motion.removeEventListener("change", sync);
      document.removeEventListener("visibilitychange", sync);
      host.removeEventListener("pointermove", move);
      host.removeEventListener("pointerdown", down);
      host.removeEventListener("pointerup", up);
      host.removeEventListener("pointercancel", up);
      host.removeEventListener("lostpointercapture", up);
      host.removeEventListener("pointerleave", leave);
    },
  };
}
