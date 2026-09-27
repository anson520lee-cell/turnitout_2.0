"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";

/**
 * Lightweight hero scene: a translucent document, a second sheet behind it,
 * a moving scan plane, data nodes and a particle field. Unlit basic materials
 * only (no shadows, no post-processing) so it stays cheap. Loaded lazily and
 * only on larger screens without reduced-motion.
 */

const DOC_W = 2.2;
const DOC_H = 2.9;

function roundedRectShape(w: number, h: number, r: number) {
  const s = new THREE.Shape();
  const x = -w / 2;
  const y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

function Sheet({ z, opacity, edge }: { z: number; opacity: number; edge: number }) {
  const shape = useMemo(() => roundedRectShape(DOC_W, DOC_H, 0.12), []);
  const geo = useMemo(() => new THREE.ShapeGeometry(shape, 8), [shape]);
  const outline = useMemo(() => {
    const pts = shape.getPoints(40).map((p) => new THREE.Vector3(p.x, p.y, 0));
    const g = new THREE.BufferGeometry().setFromPoints([...pts, pts[0]]);
    return new THREE.Line(g, new THREE.LineBasicMaterial({ color: "#8fb0ff", transparent: true, opacity: edge }));
  }, [shape, edge]);
  return (
    <group position={[0, 0, z]}>
      <mesh geometry={geo}>
        <meshBasicMaterial color="#1a2550" transparent opacity={opacity} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      <primitive object={outline} />
    </group>
  );
}

function TextLines() {
  const rows = useMemo(() => {
    const out: { y: number; w: number; x: number; hi: boolean }[] = [];
    let y = DOC_H / 2 - 0.42;
    let i = 0;
    while (y > -DOC_H / 2 + 0.3) {
      const para = i % 6 === 5;
      if (!para) {
        const w = (i % 6 === 4 ? 0.55 : 0.78 + ((i * 37) % 17) / 100) * (DOC_W - 0.5);
        out.push({ y, w, x: -DOC_W / 2 + 0.25 + w / 2, hi: i === 3 || i === 9 || i === 14 });
      }
      y -= para ? 0.2 : 0.13;
      i++;
    }
    return out;
  }, []);
  return (
    <group position={[0, 0, 0.003]}>
      {rows.map((r, i) => (
        <mesh key={i} position={[r.x, r.y, 0]}>
          <planeGeometry args={[r.w, 0.034]} />
          <meshBasicMaterial color={r.hi ? "#9a7bff" : "#c6d3ff"} transparent opacity={r.hi ? 0.75 : 0.28} />
        </mesh>
      ))}
    </group>
  );
}

function ScanPlane() {
  const ref = useRef<THREE.Group>(null);
  const tex = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 4;
    c.height = 128;
    const g = c.getContext("2d")!;
    const grad = g.createLinearGradient(0, 0, 0, 128);
    grad.addColorStop(0, "rgba(95,216,245,0)");
    grad.addColorStop(0.92, "rgba(95,216,245,0.35)");
    grad.addColorStop(1, "rgba(200,245,255,1)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 4, 128);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, []);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = (Math.sin(clock.elapsedTime * 0.7) + 1) / 2;
    ref.current.position.y = THREE.MathUtils.lerp(-DOC_H / 2 + 0.1, DOC_H / 2 - 0.1, t);
  });
  return (
    <group ref={ref}>
      <mesh position={[0, -0.25, 0.05]}>
        <planeGeometry args={[DOC_W + 0.5, 0.5]} />
        <meshBasicMaterial map={tex} transparent blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
    </group>
  );
}

/** Small deterministic PRNG so the particle field is stable across renders. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function Particles({ count = 420 }: { count?: number }) {
  const ref = useRef<THREE.Points>(null);
  const positions = useMemo(() => {
    const rand = mulberry32(7);
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const r = 2.2 + rand() * 2.4;
      const th = rand() * Math.PI * 2;
      const ph = Math.acos(2 * rand() - 1);
      arr[i * 3] = r * Math.sin(ph) * Math.cos(th);
      arr[i * 3 + 1] = r * Math.cos(ph) * 0.8;
      arr[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th) - 1;
    }
    return arr;
  }, [count]);
  useFrame((_, dt) => {
    if (ref.current) ref.current.rotation.y += dt * 0.025;
  });
  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial size={0.018} color="#a9c1ff" transparent opacity={0.55} sizeAttenuation depthWrite={false} />
    </points>
  );
}

const NODES: [number, number, number][] = [
  [-1.75, 0.95, 0.35],
  [1.7, 0.45, 0.5],
  [-1.55, -0.85, 0.45],
  [1.55, -1.1, 0.3],
];

function Nodes() {
  const group = useRef<THREE.Group>(null);
  const lineGeo = useMemo(() => {
    const pts: THREE.Vector3[] = [];
    NODES.forEach(([x, y, z]) => {
      pts.push(new THREE.Vector3(x, y, z));
      pts.push(new THREE.Vector3(Math.sign(x) * (DOC_W / 2), y * 0.8, 0.02));
    });
    return new THREE.BufferGeometry().setFromPoints(pts);
  }, []);
  useFrame(({ clock }) => {
    group.current?.children.forEach((c, i) => {
      if (c.type === "Mesh") {
        const s = 1 + Math.sin(clock.elapsedTime * 1.6 + i) * 0.18;
        c.scale.setScalar(s);
      }
    });
  });
  return (
    <group ref={group}>
      <lineSegments geometry={lineGeo}>
        <lineBasicMaterial color="#5b8cff" transparent opacity={0.35} />
      </lineSegments>
      {NODES.map((p, i) => (
        <mesh key={i} position={p}>
          <sphereGeometry args={[0.035, 16, 16]} />
          <meshBasicMaterial color={i % 2 ? "#9a7bff" : "#5fd8f5"} />
        </mesh>
      ))}
    </group>
  );
}

function Rig({ children }: { children: React.ReactNode }) {
  const ref = useRef<THREE.Group>(null);
  useFrame(({ pointer, clock }, dt) => {
    if (!ref.current) return;
    const k = 1 - Math.pow(0.001, dt);
    ref.current.rotation.y = THREE.MathUtils.lerp(ref.current.rotation.y, -0.32 + pointer.x * 0.1, k);
    ref.current.rotation.x = THREE.MathUtils.lerp(ref.current.rotation.x, 0.1 - pointer.y * 0.07, k);
    ref.current.position.y = Math.sin(clock.elapsedTime * 0.6) * 0.06;
  });
  return <group ref={ref}>{children}</group>;
}

export default function HeroScene() {
  const wrap = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={wrap} className="absolute inset-0">
      <Canvas
        dpr={[1, 1.75]}
        frameloop={visible ? "always" : "never"}
        camera={{ position: [0, 0, 6.2], fov: 38 }}
        gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
        aria-hidden
      >
        <Particles />
        <Rig>
          <Sheet z={-0.28} opacity={0.25} edge={0.25} />
          <group position={[-0.12, 0.1, -0.14]}>
            <Sheet z={0} opacity={0.18} edge={0.18} />
          </group>
          <Sheet z={0} opacity={0.55} edge={0.7} />
          <TextLines />
          <ScanPlane />
          <Nodes />
        </Rig>
      </Canvas>
    </div>
  );
}
