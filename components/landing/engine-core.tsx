"use client";
import { useEffect, useRef, type MutableRefObject } from "react";
import { onPointerFrame, type PointerState } from "@/components/motion/pointer-engine";

/**
 * The engine illustration: a glass lens at the centre with the six signals
 * orbiting it on a tilted ring. Decorative (aria-hidden); the signals are
 * listed in text beside it.
 *
 * With the pointer engine running, one frame listener (the shared loop, no
 * React state) turns the ring toward the cursor, moves the lens's specular
 * highlight to face it, brightens the arc of the ring nearest it, and lights
 * each signal by its distance from the cursor. Hovering a signal in the list
 * swings the orbit to bring that signal to the front.
 *
 * The node positions are real 3D math (the same rotations and perspective as
 * the CSS ring), so they sit exactly on it. Everything is expressed in
 * container units (cqw), so nothing is measured per frame. Without the engine
 * (touch, reduced motion) it renders once at a fixed angle.
 */

export const ENGINE_SIGNALS = [
  "Sentence variation",
  "Structural repetition",
  "Transition patterns",
  "Phrase uniformity",
  "Lexical diversity",
  "Paragraph consistency",
] as const;

/** Perspective distance and ring radius, in container units (1 = 1cqw). */
const P = 190;
const R = 41;
/** Orbit centre and lens centre, as % of the (square) container. */
const OY = 58;
const CY = 40;
const BASE = { ax: 58, ay: 0, rz: -9 };
const SPIN = 360 / 46; // degrees per second

const rad = (d: number) => (d * Math.PI) / 180;

interface Pose {
  ax: number;
  ay: number;
  rz: number;
}

/** Project a point on the ring at angle `deg` through rotateY·rotateZ·rotateX. */
function project(deg: number, pose: Pose) {
  let x = R * Math.cos(rad(deg));
  let y = R * Math.sin(rad(deg));
  let z = 0;
  // rotateX
  const ca = Math.cos(rad(pose.ax));
  const sa = Math.sin(rad(pose.ax));
  [y, z] = [y * ca - z * sa, y * sa + z * ca];
  // rotateZ
  const cz = Math.cos(rad(pose.rz));
  const sz = Math.sin(rad(pose.rz));
  [x, y] = [x * cz - y * sz, x * sz + y * cz];
  // rotateY
  const cy = Math.cos(rad(pose.ay));
  const sy = Math.sin(rad(pose.ay));
  [x, z] = [x * cy + z * sy, -x * sy + z * cy];
  const s = P / (P - z);
  return { x: x * s, y: y * s, z, s };
}

const planeTransform = (p: Pose) => `rotateY(${p.ay.toFixed(2)}deg) rotateZ(${p.rz.toFixed(2)}deg) rotateX(${p.ax.toFixed(2)}deg)`;
const nodeTransform = (x: number, y: number, s: number) =>
  `translate3d(${x.toFixed(3)}cqw, ${y.toFixed(3)}cqw, 0) translate(-50%, -50%) scale(${(0.72 + (s - 0.8) * 0.9).toFixed(3)})`;

/** Gyroscope rings around the lens; they lean further as the cursor moves. */
const GYROS = [
  { id: "a", spin: "11s", style: { ["--gx" as string]: "74deg", ["--gy" as string]: "24deg" } },
  { id: "b", spin: "15s", style: { ["--gx" as string]: "66deg", ["--gy" as string]: "-38deg" } },
];

/** Initial (and static) layout, identical on server and client. */
const START = 18;
const staticNodes = ENGINE_SIGNALS.map((_, i) => {
  const p = project(START + i * 60, BASE);
  return { ...p, front: p.z > 0 };
});

export function EngineCore({
  focus,
  listItems,
}: {
  /** Index of the signal hovered in the list, or null. */
  focus: MutableRefObject<number | null>;
  /** List rows to light up alongside their nodes. */
  listItems: MutableRefObject<(HTMLElement | null)[]>;
}) {
  const root = useRef<HTMLDivElement>(null);
  const plane = useRef<HTMLDivElement>(null);
  const arc = useRef<HTMLDivElement>(null);
  const core = useRef<HTMLDivElement>(null);
  const nodes = useRef<(HTMLDivElement | null)[]>([]);
  const beams = useRef<(SVGLineElement | null)[]>([]);

  useEffect(() => {
    const el = root.current;
    if (!el) return;

    // Container rect in document coordinates, refreshed by observers only.
    const box = { left: 0, top: 0, size: 1 };
    const measure = () => {
      const r = el.getBoundingClientRect();
      box.left = r.left + window.scrollX;
      box.top = r.top + window.scrollY;
      box.size = r.width || 1;
    };
    const state = { angle: START, ax: BASE.ax, ay: BASE.ay, rz: BASE.rz, on: ENGINE_SIGNALS.map(() => 0) };
    let unsub: (() => void) | null = null;
    // While the section is on screen but idle (cursor still, nothing focused)
    // the orbit still has to keep turning, so this listener can't go idle
    // like the tilt/magnet ones do — but it can do that work at half rate
    // instead of every frame, which is what actually costs main-thread time.
    let idleSkip = 0;

    const frame = (p: PointerState) => {
      const idle = p.speed === 0 && focus.current === null;
      if (idle) {
        idleSkip = (idleSkip + 1) % 2;
        if (idleSkip) return true;
      } else {
        idleSkip = 0;
      }
      const dt = p.dt * (idle ? 2 : 1); // one throttled step covers the skipped frame too
      const k = 1 - Math.exp(-5 * dt);
      // Cursor relative to the lens centre, in container units.
      const cxp = box.left - window.scrollX + box.size / 2;
      const cyp = box.top - window.scrollY + (box.size * OY) / 100;
      const ux = p.inside ? ((p.lx - cxp) / box.size) * 100 : 0;
      const uy = p.inside ? ((p.ly - cyp) / box.size) * 100 : 0;
      const tx = Math.tanh(ux / 70);
      const ty = Math.tanh(uy / 70);

      // Orbit: steady spin, or swing the hovered signal to the front (90°).
      const f = focus.current;
      if (f === null) state.angle += SPIN * dt;
      else {
        const target = 90 - f * 60;
        const diff = ((((target - state.angle) % 360) + 540) % 360) - 180;
        state.angle += diff * (1 - Math.exp(-4 * dt));
      }
      state.ax += (BASE.ax - ty * 12 - state.ax) * k;
      state.ay += (tx * 22 - state.ay) * k;
      state.rz += (BASE.rz + tx * 6 - state.rz) * k;
      const pose = { ax: state.ax, ay: state.ay, rz: state.rz };
      if (plane.current) plane.current.style.transform = planeTransform(pose);

      // The ring's bright arc points at the cursor (in the ring's own frame).
      const la = (Math.atan2(uy / Math.max(Math.cos(rad(state.ax)), 0.3), ux) * 180) / Math.PI - state.rz;
      const near = p.inside ? Math.exp(-Math.pow(Math.hypot(ux, uy) / 90, 2)) : 0;
      arc.current?.style.setProperty("--la", `${(la + 90).toFixed(1)}deg`);
      arc.current?.style.setProperty("--arc", near.toFixed(3));
      // Specular highlight on the lens faces the light.
      const ly = uy + OY - CY;
      core.current?.style.setProperty("--hx", `${(50 + Math.tanh(ux / 40) * 26).toFixed(1)}%`);
      core.current?.style.setProperty("--hy", `${(50 + Math.tanh(ly / 40) * 26).toFixed(1)}%`);
      core.current?.style.setProperty("--tx", tx.toFixed(3));
      core.current?.style.setProperty("--ty", Math.tanh(ly / 70).toFixed(3));

      ENGINE_SIGNALS.forEach((_, i) => {
        const n = project(state.angle + i * 60, pose);
        const d = Math.hypot(n.x - ux, n.y - uy);
        const lit = Math.max(p.inside ? Math.exp(-Math.pow(d / 21, 2)) : 0, f === i ? 1 : 0);
        state.on[i] += (lit - state.on[i]) * (1 - Math.exp(-10 * dt));
        const on = state.on[i];
        const node = nodes.current[i];
        if (node) {
          node.style.transform = nodeTransform(n.x, n.y, n.s);
          node.style.zIndex = n.z > 0 ? "30" : "10";
          node.style.setProperty("--on", on.toFixed(3));
          node.style.setProperty("--depth", ((n.z / R + 1) / 2).toFixed(3));
        }
        const beam = beams.current[i];
        if (beam) {
          beam.setAttribute("x2", (50 + n.x).toFixed(2));
          beam.setAttribute("y2", (OY + n.y).toFixed(2));
          beam.style.opacity = (0.16 + on * 0.84).toFixed(3);
          beam.style.strokeDashoffset = (-p.time * 9).toFixed(2);
        }
        core.current?.style.setProperty(`--s${i}`, on.toFixed(3));
        listItems.current[i]?.style.setProperty("--on", on.toFixed(3));
      });
      return true;
    };

    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          measure();
          unsub ??= onPointerFrame(frame);
        } else {
          unsub?.();
          unsub = null;
        }
      },
      { rootMargin: "120px" },
    );
    io.observe(el);
    const ro = new ResizeObserver(measure);
    ro.observe(document.body);
    // The section flips in; measure again once it has settled, and whenever
    // the cursor arrives in case the layout moved.
    const late = window.setTimeout(measure, 1500);
    el.addEventListener("pointerenter", measure);
    return () => {
      io.disconnect();
      ro.disconnect();
      window.clearTimeout(late);
      el.removeEventListener("pointerenter", measure);
      unsub?.();
    };
  }, [focus, listItems]);

  return (
    <div
      ref={root}
      aria-hidden
      className="relative mx-auto aspect-square w-full max-w-[540px] select-none [container-type:inline-size]"
    >
      {/* ambient glow and floor shadow */}
      <div data-depth="-2" className="absolute inset-[-12%] rounded-full bg-[radial-gradient(closest-side,rgb(91_140_255/0.22),rgb(154_123_255/0.08)_55%,transparent_75%)]" />
      <div className="absolute inset-x-[18%] bottom-[4%] h-[9%] rounded-[50%] bg-[radial-gradient(closest-side,rgb(0_0_0/0.75),transparent)]" />

      {/* the tilted orbit plane */}
      <div className="absolute inset-0 [perspective:190cqw] [perspective-origin:50%_58%]">
        <div
          ref={plane}
          className="absolute left-[9%] top-[17%] size-[82%] [transform-style:preserve-3d]"
          style={{ transform: planeTransform(BASE) }}
        >
          <div className="absolute inset-0 rounded-full border border-[rgb(143_176_255/0.4)] bg-[radial-gradient(closest-side,rgb(91_140_255/0.1),rgb(91_140_255/0.03)_70%,transparent)] shadow-[0_0_60px_-10px_rgb(91_140_255/0.55),inset_0_0_50px_-12px_rgb(154_123_255/0.5)]" />
          <div className="absolute inset-[16%] rounded-full border border-dashed border-[rgb(143_176_255/0.22)]" />
          <div className="absolute inset-[34%] rounded-full border border-[rgb(95_216_245/0.25)]" />
          {/* radar sweep */}
          <div className="engine-spin absolute inset-0 rounded-full bg-[conic-gradient(from_0deg,transparent_0deg,rgb(95_216_245/0.0)_300deg,rgb(95_216_245/0.13)_356deg,rgb(200_245_255/0.4)_360deg)] [--spin:7s] [mask-image:radial-gradient(closest-side,#000_97%,transparent)]" />
          {/* ticks around the rim */}
          <div className="absolute inset-[-3%] rounded-full bg-[repeating-conic-gradient(from_0deg,rgb(170_195_255/0.4)_0deg_0.6deg,transparent_0.6deg_6deg)] [mask-image:radial-gradient(closest-side,transparent_93%,#000_94%,#000_99%,transparent)]" />
          {/* the arc of the ring nearest the cursor catches the light */}
          <div
            ref={arc}
            className="absolute inset-[-1px] rounded-full [mask-image:radial-gradient(closest-side,transparent_96%,#000_97.5%,transparent_100%)]"
            style={{
              background:
                "conic-gradient(from calc(var(--la, 90deg) - 50deg), transparent, rgb(225 236 255 / 1) 50deg, transparent 100deg)",
              opacity: "calc(0.25 + var(--arc, 0) * 0.75)",
            }}
          />
        </div>
      </div>

      {/* beams from the lens to each signal */}
      <svg viewBox="0 0 100 100" className="absolute inset-0 z-[5] size-full overflow-visible">
        <defs>
          <radialGradient id="engine-beam" cx="50" cy={CY} r="50" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#c9d8ff" />
            <stop offset="1" stopColor="#5b8cff" stopOpacity="0.4" />
          </radialGradient>
        </defs>
        {staticNodes.map((n, i) => (
          <line
            key={i}
            ref={(el) => void (beams.current[i] = el)}
            x1="50"
            y1={CY}
            x2={(50 + n.x).toFixed(2)}
            y2={(OY + n.y).toFixed(2)}
            stroke="url(#engine-beam)"
            strokeWidth="0.35"
            strokeDasharray="0.8 1.6"
            strokeLinecap="round"
            style={{ opacity: 0.2 }}
          />
        ))}
      </svg>

      {/* a column of light from the lens down to the ring's centre */}
      <div className="absolute left-1/2 top-[40%] z-[6] h-[18%] w-[16%] -translate-x-1/2 bg-[linear-gradient(to_bottom,rgb(95_216_245/0.28),rgb(91_140_255/0.1)_60%,transparent)] [clip-path:polygon(38%_0,62%_0,100%_100%,0_100%)]" />
      <div className="absolute left-1/2 top-[58%] z-[6] h-[3%] w-[22%] -translate-x-1/2 -translate-y-1/2 rounded-[50%] bg-[radial-gradient(closest-side,rgb(150_220_255/0.6),rgb(91_140_255/0.18)_60%,transparent)]" />

      {/* the lens, with two gyroscope rings passing through it in 3D */}
      <div
        ref={core}
        className="absolute left-1/2 top-[40%] z-20 size-[36%] -translate-x-1/2 -translate-y-1/2 [perspective:120cqw]"
      >
        <div className="engine-pulse absolute inset-[-32%] rounded-full bg-[radial-gradient(closest-side,rgb(91_140_255/0.38),rgb(154_123_255/0.12)_55%,transparent)]" />
        <div className="absolute inset-0 [transform-style:preserve-3d]">
          <div className="engine-spin absolute inset-0 rounded-full bg-[conic-gradient(from_0deg,#5fd8f5,#5b8cff_25%,#9a7bff_45%,transparent_60%,transparent_80%,#5fd8f5)] [--spin:9s] [mask-image:radial-gradient(closest-side,transparent_86%,#000_88%,#000_97%,transparent)]" />
          <div className="engine-spin-rev absolute inset-[7%] rounded-full bg-[repeating-conic-gradient(from_0deg,rgb(170_195_255/0.55)_0deg_1.2deg,transparent_1.2deg_10deg)] [--spin:26s] [mask-image:radial-gradient(closest-side,transparent_88%,#000_90%,#000_98%,transparent)]" />
          <div
            className="absolute inset-[15%] rounded-full border border-white/20 shadow-[0_0_46px_-4px_rgb(91_140_255/0.75),inset_0_-12px_26px_rgb(0_0_0/0.55),inset_0_2px_0_rgb(255_255_255/0.25)]"
            style={{
              background:
                "radial-gradient(circle at var(--hx, 36%) var(--hy, 30%), rgb(255 255 255 / 0.8) 0%, rgb(190 208 255 / 0.42) 9%, rgb(96 128 240 / 0.32) 30%, rgb(34 36 96 / 0.85) 62%, rgb(8 10 24 / 0.96) 100%)",
            }}
          >
            {/* six signal ticks in a hexagon, lit with their nodes */}
            <svg viewBox="-50 -50 100 100" className="absolute inset-[22%] size-[56%]">
              <polygon
                points={ENGINE_SIGNALS.map((_, i) => `${(34 * Math.cos(rad(i * 60 - 90))).toFixed(2)},${(34 * Math.sin(rad(i * 60 - 90))).toFixed(2)}`).join(" ")}
                fill="none"
                stroke="rgb(200 215 255 / 0.35)"
                strokeWidth="1.5"
              />
              {ENGINE_SIGNALS.map((_, i) => (
                <circle
                  key={i}
                  cx={(34 * Math.cos(rad(i * 60 - 90))).toFixed(2)}
                  cy={(34 * Math.sin(rad(i * 60 - 90))).toFixed(2)}
                  r="6"
                  fill={i % 2 ? "#b9a6ff" : "#8feaff"}
                  style={{ opacity: `calc(0.35 + var(--s${i}, 0) * 0.65)` }}
                />
              ))}
            </svg>
          </div>
          {GYROS.map((g) => (
            <div key={g.id} className="engine-gyro absolute inset-[-14%]" style={g.style}>
              <div className="engine-spin absolute inset-0 rounded-full" style={{ ["--spin" as string]: g.spin }} />
            </div>
          ))}
        </div>
      </div>

      {/* the six signals */}
      {staticNodes.map((n, i) => (
        <div
          key={ENGINE_SIGNALS[i]}
          ref={(el) => void (nodes.current[i] = el)}
          className="engine-node absolute left-1/2 top-[58%]"
          style={{
            transform: nodeTransform(n.x, n.y, n.s),
            zIndex: n.front ? 30 : 10,
            ["--on" as string]: 0,
            ["--depth" as string]: ((n.z / R + 1) / 2).toFixed(3),
          }}
        >
          <span className="engine-node-chip">
            <span className="engine-node-dot" data-tone={i % 2 ? "violet" : "cyan"} />
            <span className="font-mono text-[10px] text-fg-subtle">0{i + 1}</span>
            <span className="hidden sm:inline">{ENGINE_SIGNALS[i]}</span>
          </span>
        </div>
      ))}
    </div>
  );
}
