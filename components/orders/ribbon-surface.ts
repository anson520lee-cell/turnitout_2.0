import { BufferAttribute, BufferGeometry, CanvasTexture, DoubleSide, Mesh, MeshBasicMaterial,
  OrthographicCamera, Scene, SRGBColorSpace, WebGLRenderer } from "three";

export interface Section { x: number; y: number; dx: number; dy: number; z: number }

export function paperSurface(underlay: HTMLCanvasElement, print: HTMLCanvasElement) {
  const surface = document.createElement("canvas");
  surface.className = underlay.className;
  surface.setAttribute("aria-hidden", "true");
  const renderer = new WebGLRenderer({ canvas: surface, alpha: true, antialias: true, powerPreference: "low-power" });
  underlay.after(surface);
  const steps = 200;
  const geometry = new BufferGeometry();
  const vertices = new BufferAttribute(new Float32Array((steps + 1) * 6), 3);
  const colors = new BufferAttribute(new Float32Array((steps + 1) * 6), 3);
  const uv = [], triangles = [];
  for (let i = 0; i <= steps; i++) {
    uv.push(i / steps, 1, i / steps, 0);
    const a = i * 2;
    if (i < steps) triangles.push(a, a+1, a+2, a+2, a+1, a+3);
  }
  geometry.setIndex(triangles);
  geometry.setAttribute("position", vertices);
  geometry.setAttribute("color", colors);
  geometry.setAttribute("uv", new BufferAttribute(new Float32Array(uv), 2));
  const texture = new CanvasTexture(print);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const material = new MeshBasicMaterial({ map: texture, side: DoubleSide, vertexColors: true });
  const mesh = new Mesh(geometry, material);
  mesh.frustumCulled = false;
  const scene = new Scene();
  scene.add(mesh);
  const camera = new OrthographicCamera(-1, 1, 1, -1, .01, 10);
  camera.position.z = 3;
  let lastWidth = 0, lastHeight = 0;
  return {
    refreshPrint() { texture.needsUpdate = true; },
    draw(section: (t: number) => Section, width: number, height: number, focus: number) {
      if (width !== lastWidth || height !== lastHeight) {
        renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
        renderer.setSize(width, height, false);
        lastWidth = width; lastHeight = height;
      }
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const p = section(t);
        const sheen = .42 + .45 * (1 + p.z) / 2 + .08 * Math.exp(-Math.pow((t - (focus + .5)/3)*6, 2));
        for (const side of [0, 1]) {
          const sign = side ? 1 : -1;
          const light = sheen * (side ? .90 : 1.04);
          const n = i * 2 + side;
          vertices.setXYZ(n, (p.x + sign*p.dx)/width*2-1, 1-(p.y + sign*p.dy)/height*2, p.z*.2 + sign*.025);
          colors.setXYZ(n, light * .88, light * .97, Math.min(1, light * 1.15));
        }
      }
      vertices.needsUpdate = colors.needsUpdate = true;
      renderer.render(scene, camera);
    },
    stop() {
      texture.dispose(); material.dispose(); geometry.dispose(); renderer.dispose(); renderer.forceContextLoss(); surface.remove();
    }
  };
}
