"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { pointer } from "@/components/motion/pointer-engine";
import { decodeLine } from "@/lib/greek-decode";

/**
 * Hero scene: a translucent document with sheets behind it, a scan beam,
 * data nodes and two particle fields, lit by the cursor.
 *
 * The cursor is a light. Its position comes from the shared pointer engine
 * (the same lagging light that lights the page's glass), is cast onto the
 * document's plane, and small shaders use it: the sheet brightens around it
 * with a specular hot spot, the rim catches it, text lines and nodes glow as
 * it passes, particles near it swell and a click sends a ring of light across
 * the page. The whole document turns to face the cursor and the particle
 * fields drift at different depths.
 *
 * No scene lights, shadows or post-processing: a handful of unlit shaders,
 * so it stays cheap. Loaded lazily, only on larger screens with a fine pointer
 * and motion allowed; paused while off-screen.
 */

const DOC_W = 2.2;
const DOC_H = 2.9;
const RADIUS = 0.12;

/** Uniforms every material reads. The light and pulse are in world space. */
const light = {
  uLightW: { value: new THREE.Vector3(0, 0, -50) },
  uLightOn: { value: 0 },
  uPulseW: { value: new THREE.Vector3(0, 0, -50) },
  uPulseT: { value: -10 },
  uTime: { value: 0 },
};

const worldVert = /* glsl */ `
  varying vec3 vWorld;
  varying vec2 vLocal;
  void main() {
    vLocal = position.xy;
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

const sheetFrag = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uEdge;
  uniform vec3 uLightW;
  uniform float uLightOn;
  uniform vec3 uPulseW;
  uniform float uPulseT;
  uniform float uTime;
  uniform vec2 uSize;
  uniform float uRadius;
  varying vec3 vWorld;
  varying vec2 vLocal;

  float sdRoundBox(vec2 p, vec2 b, float r) {
    vec2 q = abs(p) - b + r;
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
  }

  void main() {
    float sd = sdRoundBox(vLocal, uSize * 0.5, uRadius);
    float d = distance(vWorld, uLightW);
    float glow = exp(-d * d * 1.2) * uLightOn;
    float hot = exp(-d * d * 14.0) * uLightOn;
    // The rim: bright on the side facing the light, even from afar.
    float rim = smoothstep(0.03, 0.0, -sd);
    float rimLit = rim * (uEdge + exp(-d * 1.1) * 1.3 * uLightOn);
    // Click: a ring of light spreading from where the light was.
    float t = uTime - uPulseT;
    float ring = 0.0;
    if (t > 0.0 && t < 1.5) {
      float pd = distance(vWorld, uPulseW);
      ring = exp(-pow((pd - t * 2.4) * 6.0, 2.0)) * (1.0 - t / 1.5);
    }
    float g = smoothstep(-uSize.y * 0.5, uSize.y * 0.5, vLocal.y);
    vec3 col = uColor * (0.78 + g * 0.4);
    col += vec3(0.36, 0.55, 1.0) * glow * 0.55;
    col += vec3(0.88, 0.94, 1.0) * hot * 0.5;
    col += vec3(0.66, 0.78, 1.0) * rimLit;
    col += vec3(0.37, 0.85, 0.96) * ring;
    float a = uOpacity + glow * 0.22 + hot * 0.25 + rimLit * 0.85 + ring * 0.55;
    gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
  }
`;

const lineFrag = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform vec3 uLightW;
  uniform float uLightOn;
  varying vec3 vWorld;
  void main() {
    float d = distance(vWorld, uLightW);
    float g = exp(-d * d * 2.6) * uLightOn;
    gl_FragColor = vec4(uColor + vec3(0.55, 0.7, 1.0) * g * 0.7, clamp(uOpacity + g * 0.5, 0.0, 1.0));
  }
`;

const pointsVert = /* glsl */ `
  attribute float aSeed;
  uniform float uTime;
  uniform vec3 uLightW;
  uniform float uLightOn;
  uniform float uSize;
  uniform float uPR;
  varying float vBoost;
  varying float vAlpha;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vec4 mv = viewMatrix * w;
    float d = distance(w.xyz, uLightW);
    float b = exp(-d * d * 0.9) * uLightOn;
    float tw = 0.6 + 0.4 * sin(uTime * 1.6 + aSeed * 6.2831);
    vBoost = b;
    vAlpha = 0.28 + 0.3 * tw + b * 0.7;
    gl_PointSize = uSize * (1.0 + b * 1.8) * (0.8 + 0.4 * tw) * uPR * (6.0 / -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;

const pointsFrag = /* glsl */ `
  varying float vBoost;
  varying float vAlpha;
  void main() {
    float r = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.0, r);
    gl_FragColor = vec4(mix(vec3(0.62, 0.72, 1.0), vec3(0.86, 0.97, 1.0), vBoost), a * a * vAlpha);
  }
`;

/** sRGB hex to a plain vec3 (the shaders output display values directly). */
const rgb = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return new THREE.Vector3(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
};

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

function Sheet({ z, opacity, edge, color = "#1a2550" }: { z: number; opacity: number; edge: number; color?: string }) {
  const geo = useMemo(() => new THREE.ShapeGeometry(roundedRectShape(DOC_W, DOC_H, RADIUS), 10), []);
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: worldVert,
        fragmentShader: sheetFrag,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        uniforms: {
          ...light,
          uColor: { value: rgb(color) },
          uOpacity: { value: opacity },
          uEdge: { value: edge },
          uSize: { value: new THREE.Vector2(DOC_W, DOC_H) },
          uRadius: { value: RADIUS },
        },
      }),
    [color, opacity, edge],
  );
  return <mesh geometry={geo} material={mat} position={[0, 0, z]} />;
}

const textFrag = /* glsl */ `
  uniform sampler2D uMap;
  uniform vec3 uLightW;
  uniform float uLightOn;
  uniform vec2 uSize;
  varying vec3 vWorld;
  varying vec2 vLocal;
  void main() {
    vec2 uv = vLocal / uSize + 0.5;
    vec4 t = texture2D(uMap, uv);
    float d = distance(vWorld, uLightW);
    float g = exp(-d * d * 2.6) * uLightOn;
    gl_FragColor = vec4(t.rgb + vec3(0.55, 0.7, 1.0) * g * 0.5 * t.a, clamp(t.a * (1.0 + g * 0.8), 0.0, 1.0));
  }
`;

/**
 * The document's text: random Greek that decodes in a wave (see
 * lib/greek-decode). Drawn into a canvas texture at ~15 fps and shown on one
 * plane; the cursor light still brightens it through textFrag.
 */
function TextLines() {
  const rows = useMemo(() => {
    const out: { y: number; len: number; x0: number; hi: boolean }[] = [];
    let y = DOC_H / 2 - 0.42;
    let i = 0;
    while (y > -DOC_H / 2 + 0.3) {
      const para = i % 6 === 5;
      if (!para) {
        const w = (i % 6 === 4 ? 0.55 : 0.78 + ((i * 37) % 17) / 100) * (DOC_W - 0.5);
        out.push({ y, len: Math.round((w / (DOC_W - 0.5)) * 38), x0: -DOC_W / 2 + 0.25, hi: i === 3 || i === 9 || i === 14 });
      }
      y -= para ? 0.2 : 0.13;
      i++;
    }
    return out;
  }, []);

  const { canvas, tex } = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 1024;
    c.height = Math.round(1024 * (DOC_H / DOC_W));
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return { canvas: c, tex: t };
  }, []);

  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: worldVert,
        fragmentShader: textFrag,
        transparent: true,
        depthWrite: false,
        uniforms: {
          ...light,
          uMap: { value: tex },
          uSize: { value: new THREE.Vector2(DOC_W, DOC_H) },
        },
      }),
    [tex],
  );

  const last = useRef(-1);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (t - last.current < 0.066) return;
    last.current = t;
    const g = canvas.getContext("2d")!;
    const px = canvas.width / DOC_W; // pixels per world unit
    g.clearRect(0, 0, canvas.width, canvas.height);
    const fs = 0.072 * px;
    g.font = `${fs}px ui-monospace, Consolas, "Courier New", monospace`;
    g.textBaseline = "middle";
    const cw = fs * 0.62; // fixed advance so rows line up whatever the fallback font
    rows.forEach((r, i) => {
      const d = decodeLine(r.len, i + 1, t);
      const x = (r.x0 + DOC_W / 2) * px;
      const y = (DOC_H / 2 - r.y) * px;
      if (r.hi) {
        g.fillStyle = "rgba(154,123,255,0.14)";
        g.fillRect(x - 6, y - fs * 0.7, r.len * cw + 12, fs * 1.4);
      }
      g.fillStyle = r.hi ? "rgba(176,152,255,0.95)" : "rgba(172,186,235,0.55)";
      const s = d.settled;
      for (let k = 0; k < s.length; k++) g.fillText(s[k], x + k * cw, y);
      g.fillStyle = "rgba(95,216,245,0.85)";
      const n = d.noise;
      for (let k = 0; k < n.length; k++) g.fillText(n[k], x + (s.length + k) * cw, y);
    });
    tex.needsUpdate = true;
  });

  return (
    <mesh position={[0, 0, 0.004]} material={mat}>
      <planeGeometry args={[DOC_W, DOC_H]} />
    </mesh>
  );
}

function ScanPlane() {
  const ref = useRef<THREE.Group>(null);
  const tex = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 64;
    c.height = 128;
    const g = c.getContext("2d")!;
    const grad = g.createLinearGradient(0, 0, 0, 128);
    grad.addColorStop(0, "rgba(95,216,245,0)");
    grad.addColorStop(0.92, "rgba(95,216,245,0.35)");
    grad.addColorStop(1, "rgba(200,245,255,1)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 128);
    // Fade the beam out at its ends so it reads as light, not a slab.
    g.globalCompositeOperation = "destination-in";
    const fade = g.createLinearGradient(0, 0, 64, 0);
    fade.addColorStop(0, "rgba(0,0,0,0)");
    fade.addColorStop(0.12, "rgba(0,0,0,1)");
    fade.addColorStop(0.88, "rgba(0,0,0,1)");
    fade.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = fade;
    g.fillRect(0, 0, 64, 128);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, []);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = (Math.sin(clock.elapsedTime * 0.7) + 1) / 2;
    // The beam's bright edge sits 0.5 below the group; keep it on the page.
    ref.current.position.y = THREE.MathUtils.lerp(-DOC_H / 2 + 0.62, DOC_H / 2 + 0.38, t);
  });
  return (
    <group ref={ref}>
      <mesh position={[0, -0.25, 0.05]}>
        <planeGeometry args={[DOC_W - 0.06, 0.5]} />
        <meshBasicMaterial map={tex} transparent blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
    </group>
  );
}

/** Soft round glow texture shared by the light and the node halos. */
function useGlowTexture() {
  return useMemo(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d")!;
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(0.25, "rgba(200,220,255,0.55)");
    grad.addColorStop(1, "rgba(120,150,255,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, []);
}

/** Small deterministic PRNG so the particle fields are stable across renders. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A particle field. `depth` sets how far it drifts with the cursor; negative
 * drifts against it (behind the document), positive with it (in front).
 */
function Particles({
  count,
  seed,
  radius,
  spread,
  z,
  size,
  depth,
}: {
  count: number;
  seed: number;
  radius: [number, number];
  spread: number;
  z: number;
  size: number;
  depth: number;
}) {
  const ref = useRef<THREE.Points>(null);
  const [positions, seeds] = useMemo(() => {
    const rand = mulberry32(seed);
    const arr = new Float32Array(count * 3);
    const s = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const r = radius[0] + rand() * (radius[1] - radius[0]);
      const th = rand() * Math.PI * 2;
      const ph = Math.acos(2 * rand() - 1);
      arr[i * 3] = r * Math.sin(ph) * Math.cos(th);
      arr[i * 3 + 1] = r * Math.cos(ph) * 0.8;
      arr[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th) * spread + z;
      s[i] = rand();
    }
    return [arr, s];
  }, [count, seed, radius, spread, z]);
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: pointsVert,
        fragmentShader: pointsFrag,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: {
          ...light,
          uSize: { value: size },
          uPR: { value: Math.min(window.devicePixelRatio || 1, 1.75) },
        },
      }),
    [size],
  );
  useFrame((_, dt) => {
    const p = ref.current;
    if (!p) return;
    const k = 1 - Math.pow(0.03, dt);
    p.rotation.y += dt * 0.02 * Math.sign(depth || 1);
    p.position.x = THREE.MathUtils.lerp(p.position.x, pointer.cx * depth, k);
    p.position.y = THREE.MathUtils.lerp(p.position.y, -pointer.cy * depth * 0.7, k);
  });
  return (
    <points ref={ref} material={mat}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-aSeed" args={[seeds, 1]} />
      </bufferGeometry>
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
  const glow = useGlowTexture();
  const dots = useRef<(THREE.Mesh | null)[]>([]);
  const halos = useRef<(THREE.Sprite | null)[]>([]);
  const tmp = useMemo(() => new THREE.Vector3(), []);
  const lineGeo = useMemo(() => {
    const pts: THREE.Vector3[] = [];
    NODES.forEach(([x, y, z]) => {
      pts.push(new THREE.Vector3(x, y, z));
      pts.push(new THREE.Vector3(Math.sign(x) * (DOC_W / 2), y * 0.8, 0.02));
    });
    return new THREE.BufferGeometry().setFromPoints(pts);
  }, []);
  useFrame(({ clock }) => {
    NODES.forEach((_, i) => {
      const m = dots.current[i];
      const h = halos.current[i];
      if (!m || !h) return;
      m.getWorldPosition(tmp);
      const near = Math.exp(-tmp.distanceToSquared(light.uLightW.value) * 1.4) * light.uLightOn.value;
      const pulse = 1 + Math.sin(clock.elapsedTime * 1.6 + i) * 0.15;
      m.scale.setScalar(pulse * (1 + near * 0.9));
      h.scale.setScalar(0.32 + near * 0.55);
      (h.material as THREE.SpriteMaterial).opacity = 0.25 + near * 0.75;
    });
  });
  return (
    <group>
      <lineSegments geometry={lineGeo}>
        <lineBasicMaterial color="#5b8cff" transparent opacity={0.4} />
      </lineSegments>
      {NODES.map((p, i) => (
        <group key={i} position={p}>
          <mesh ref={(el) => void (dots.current[i] = el)}>
            <sphereGeometry args={[0.035, 16, 16]} />
            <meshBasicMaterial color={i % 2 ? "#9a7bff" : "#5fd8f5"} />
          </mesh>
          <sprite ref={(el) => void (halos.current[i] = el)}>
            <spriteMaterial map={glow} color={i % 2 ? "#b9a6ff" : "#8feaff"} transparent depthWrite={false} blending={THREE.AdditiveBlending} />
          </sprite>
        </group>
      ))}
    </group>
  );
}

/** The light itself: a soft glow riding just above the document. */
function LightGlow() {
  const glow = useGlowTexture();
  const ref = useRef<THREE.Sprite>(null);
  useFrame(() => {
    const s = ref.current;
    if (!s) return;
    s.position.copy(light.uLightW.value);
    s.position.z += 0.05;
    (s.material as THREE.SpriteMaterial).opacity = 0.35 * light.uLightOn.value;
  });
  return (
    <sprite ref={ref} scale={[0.9, 0.9, 1]}>
      <spriteMaterial map={glow} color="#a9c1ff" transparent depthWrite={false} blending={THREE.AdditiveBlending} />
    </sprite>
  );
}

/**
 * Turns the document toward the cursor and projects the cursor light onto
 * its plane. `rect` is the canvas position in document coordinates.
 */
function Rig({ rect, children }: { rect: React.RefObject<{ left: number; top: number; width: number; height: number }>; children: React.ReactNode }) {
  const ref = useRef<THREE.Group>(null);
  const tools = useMemo(
    () => ({
      ray: new THREE.Raycaster(),
      ndc: new THREE.Vector2(),
      plane: new THREE.Plane(),
      normal: new THREE.Vector3(),
      origin: new THREE.Vector3(),
      q: new THREE.Quaternion(),
      hit: new THREE.Vector3(),
    }),
    [],
  );
  const clickSeen = useRef(-1);
  useFrame(({ clock, camera }, dt) => {
    const g = ref.current;
    if (!g) return;
    const t = clock.elapsedTime;
    light.uTime.value = t;
    const k = 1 - Math.pow(0.006, dt);
    g.rotation.y = THREE.MathUtils.lerp(g.rotation.y, -0.34 + pointer.cx * 0.62 + Math.sin(t * 0.4) * 0.03, k);
    g.rotation.x = THREE.MathUtils.lerp(g.rotation.x, 0.1 + pointer.cy * 0.36, k);
    g.position.x = THREE.MathUtils.lerp(g.position.x, pointer.cx * 0.16, k);
    g.position.y = Math.sin(t * 0.6) * 0.06 - pointer.cy * 0.06;
    g.updateMatrixWorld();

    // Cast the light (the engine's lagging cursor) onto the document plane.
    const r = rect.current;
    const top = r.top - window.scrollY;
    tools.ndc.set(((pointer.lx - r.left) / r.width) * 2 - 1, -(((pointer.ly - top) / r.height) * 2 - 1));
    tools.ray.setFromCamera(tools.ndc, camera);
    g.getWorldQuaternion(tools.q);
    tools.normal.set(0, 0, 1).applyQuaternion(tools.q);
    g.getWorldPosition(tools.origin);
    tools.plane.setFromNormalAndCoplanarPoint(tools.normal, tools.origin);
    const hit = tools.ray.ray.intersectPlane(tools.plane, tools.hit);
    const on = pointer.inside && hit ? 1 : 0;
    if (hit) light.uLightW.value.copy(hit);
    light.uLightOn.value += (on - light.uLightOn.value) * (1 - Math.pow(0.02, dt));

    if (pointer.clickAt !== clickSeen.current) {
      clickSeen.current = pointer.clickAt;
      if (pointer.clickAt >= 0 && hit) {
        light.uPulseW.value.copy(hit);
        light.uPulseT.value = t;
      }
    }
  });
  return <group ref={ref}>{children}</group>;
}

export default function HeroScene() {
  const wrap = useRef<HTMLDivElement>(null);
  const rect = useRef({ left: 0, top: 0, width: 1, height: 1 });
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0 });
    io.observe(el);
    // Canvas position in document coordinates; the frame loop subtracts the
    // scroll offset, so nothing is measured per frame.
    const measure = () => {
      const r = el.getBoundingClientRect();
      rect.current = { left: r.left + window.scrollX, top: r.top + window.scrollY, width: r.width, height: r.height };
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    // The hero fades in with a transform; measure again once it has settled.
    const late = window.setTimeout(measure, 1400);
    window.addEventListener("resize", measure);
    return () => {
      io.disconnect();
      ro.disconnect();
      window.clearTimeout(late);
      window.removeEventListener("resize", measure);
    };
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
        <Particles count={420} seed={7} radius={[2.2, 4.6]} spread={1} z={-1} size={1.5} depth={-0.45} />
        <Rig rect={rect}>
          <Sheet z={-0.3} opacity={0.2} edge={0.18} color="#1b2250" />
          <group position={[-0.12, 0.1, -0.15]}>
            <Sheet z={0} opacity={0.16} edge={0.14} color="#221f55" />
          </group>
          <Sheet z={0} opacity={0.5} edge={0.42} />
          <TextLines />
          <ScanPlane />
          <Nodes />
        </Rig>
        <LightGlow />
        <Particles count={70} seed={19} radius={[1.6, 3.4]} spread={0.35} z={1.9} size={2.4} depth={0.55} />
      </Canvas>
    </div>
  );
}
