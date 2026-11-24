// A local illustration of a forward pass. The brightest connections follow
// activations calculated from the current input and fixed illustrative weights.
type Point = { x: number; y: number };
type Fiber = { start: Point; end: Point; strength: number };
const nodeCount = 11;
const columns = [215, 347, 479];
const axis = (x: number) => 203 - x * .115;
const point = (x: number, offset = 0) => ({ x, y: axis(x) + offset });
const clip = (n: number) => Math.min(1, Math.max(0, n));
const unitY = (n: number) => (n - 5) * 12;
function trace(input: number) {
  let values = Array.from({ length: nodeCount }, (_, n) => Math.exp(-((n - input * 10) ** 2) / 3));
  const fibers: Fiber[][] = [];
  const activations = [values];
  fibers.push(values.map((strength, i) => ({
    start: point(-18, (input - .5) * 135 + unitY(i) * .16),
    end: point(columns[0], unitY(i)), strength
  })));
  for (let layer = 1; layer < columns.length; layer++) {
    const next = Array<number>(nodeCount).fill(0);
    const links: Fiber[] = [];
    for (let i = 0; i < nodeCount; i++) {
      for (const jump of [0, 3, 7]) {
        const j = (i + jump + layer) % nodeCount;
        const weight = .62 + .38 * Math.cos(i * .7 + jump * 1.7 + layer);
        const strength = values[i] * weight;
        next[j] += strength;
        links.push({ start: point(columns[layer - 1], unitY(i)), end: point(columns[layer], unitY(j)), strength });
      }
    }
    values = next.map(value => Math.tanh(value * 1.4));
    fibers.push(links);
    activations.push(values);
  }
  fibers.push(values.map((strength, i) => ({ start: point(columns[2], unitY(i)), end: point(610), strength })));
  return { fibers, activations };
}
function sample(fiber: Fiber, t: number) {
  const k = t * t * (3 - 2 * t);
  const horizontal = t * (1.5 + t * (t - 1.5));
  return { x: fiber.start.x + (fiber.end.x - fiber.start.x) * horizontal, y: fiber.start.y + (fiber.end.y - fiber.start.y) * k };
}
function path(ctx: CanvasRenderingContext2D, fiber: Fiber) {
  const {start, end} = fiber;
  const mid = (start.x + end.x) / 2;
  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  ctx.bezierCurveTo(mid, start.y, mid, end.y, end.x, end.y);
  ctx.stroke();
}
function line(ctx: CanvasRenderingContext2D, a: Point, b: Point) {
  ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
}
function plane(ctx: CanvasRenderingContext2D, x: number, layer: number) {
  const y = axis(x);
  const project = (u: number, v: number) => ({ x: x + u * 34, y: y - u * 22 + v * 98 });
  function face(dx: number) {
    ctx.beginPath();
    for (const [i, [u, v]] of [[-1,-1],[1,-1],[1,1],[-1,1]].entries()) {
      const p = project(u,v);
      if (i === 0) ctx.moveTo(p.x + dx,p.y); else ctx.lineTo(p.x + dx,p.y);
    }
    ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  ctx.fillStyle = "#152b51"; ctx.strokeStyle = "#546c9b"; ctx.lineWidth = .85;
  face(-5);
  const film = ctx.createLinearGradient(x - 35, y - 82, x + 34, y + 90);
  film.addColorStop(0,"#597fbb"); film.addColorStop(.22,"#263e69");
  film.addColorStop(.62,"#152649"); film.addColorStop(1,"#3f5387");
  ctx.fillStyle = film; ctx.strokeStyle = "#99bae7"; face(0);
  ctx.strokeStyle = "rgba(156,193,242,.16)";
  for (let k = -8; k <= 8; k++) line(ctx,project(-1,k/9),project(1,k/9));
  for (let k = -3; k <= 3; k++) line(ctx,project(k/4,-1),project(k/4,1));
  for (let row = -7; row <= 7; row++) {
    for (let col = -3; col <= 3; col++) {
      const p = project(col / 4, row / 8);
      const light = .26 + .21 * Math.cos(layer + row * 13 + col * 7);
      ctx.fillStyle = "rgba(190,222,255," + light + ")";
      ctx.fillRect(p.x,p.y,1.6,1.6);
    }
  }
  ctx.strokeStyle="#d4e8ff"; line(ctx,project(-1,-1),project(1,-1));
}

export function mountInference(canvas: HTMLCanvasElement, onOutput: (count: number) => void) {
  const context = canvas.getContext("2d");
  if (!context) return;
  const ctx = context;
  const base = document.createElement("canvas");
  const backdrop = base.getContext("2d")!;
  const motion = matchMedia("(prefers-reduced-motion: reduce)");
  let input = .46, network = trace(input), count = 0;
  let tick = 0, previous = 0, frame = 0, visible = true, held = false;
  let lastShot = 0, outTime = -2, lastTrace = .4;
  const signals: { phase: number; field: ReturnType<typeof trace> }[] = [];
  let width = 1, height = 1;
  function resize() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(2, devicePixelRatio || 1);
    canvas.width = base.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = base.height = Math.max(1, Math.round(rect.height * dpr));
    width = canvas.width / 720;
    height = Math.min(canvas.height / 345, width * 1.45);
    backdrop.setTransform(width,0,0,height,0,(canvas.height-height*330)/2);
    columns.forEach((x, i) => plane(backdrop, x, i));
    schedule();
  }
  function deliver(field: ReturnType<typeof trace>) {
    count++; outTime = tick;
    const output = field.activations[2];
    lastTrace = output.reduce((sum, value, i) => sum + value * i, 0) / (output.reduce((a,b) => a+b,0) * 10);
    onOutput(count);
  }
  function send() {
    if (motion.matches) deliver(network);
    else if (signals.length < 16) signals.push({phase: 0, field: network});
    lastShot = tick;
    schedule();
  }
  function strand(fiber: Fiber, t: number, tail: number) {
    const a = sample(fiber, Math.max(0, t-tail)), b = sample(fiber, t);
    line(ctx,a,b);
  }
  function render(now: number) {
    frame = 0;
    if (!visible || document.hidden) { previous = 0; return; }
    const dt = previous ? Math.min((now-previous)/1000,.05) : 0;
    previous = now;
    tick += dt;
    if (held && !motion.matches && tick - lastShot > .19) send();
    ctx.setTransform(1,0,0,1,0,0);
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.drawImage(base,0,0);
    ctx.setTransform(width,0,0,height,0,(canvas.height-height*330)/2);
    ctx.lineCap="round";
    // Long exposure filaments feed the first layer and draw the eye forward.
    for (let i = 0; i < 32; i++) {
      const k = i / 31;
      const spread = (k - .5);
      const a = point(-10, (input-.5)*130 + spread*150);
      const b = point(columns[0], (input-.5)*82 + spread*38);
      ctx.lineWidth = i % 6 === 0 ? 1.45 : .8;
      ctx.strokeStyle = i % 4 === 0 ? "rgba(118,161,255,.72)" : "rgba(103,139,230,.33)";
      const f = {start:a,end:b,strength:1};
      path(ctx,f);
      ctx.strokeStyle = i % 4 === 0 ? "#d6ecff" : "#8ab6ff";
      strand(f,(tick*(.5 + (i%4)*.08)+i*.618)%1,.065);
    }
    network.fibers.forEach((group, layer) => {
      group.forEach((fiber, i) => {
        ctx.lineWidth = .6 + fiber.strength*.8;
        ctx.strokeStyle = "rgba(121,165,255," + (.06 + fiber.strength*.46) + ")";
        path(ctx,fiber);
        if (fiber.strength < .12) return;
        ctx.strokeStyle = "rgba(184,222,255," + (.2 + fiber.strength*.7) + ")";
        strand(fiber,(tick*.96 + i*.389 + layer*.31)%1,.045);
      });
    });
    network.activations.forEach((nodes, layer) => nodes.forEach((strength, i) => {
      const p = point(columns[layer], unitY(i));
      ctx.fillStyle = "rgba(77,144,255," + (.08 + strength*.24) + ")";
      ctx.beginPath(); ctx.arc(p.x,p.y,2.3+strength*4.4,0,Math.PI*2);ctx.fill();
      ctx.fillStyle = strength > .3 ? "#d7f5ff" : "#7896bf";
      ctx.beginPath(); ctx.arc(p.x,p.y,1+strength*1.45,0,Math.PI*2);ctx.fill();
    }));
    ctx.save();
    ctx.globalCompositeOperation="lighter";
    for (let i = signals.length - 1; i >= 0; i--) {
      const signal = signals[i];
      signal.phase += dt * 3.1;
      if (signal.phase >= 4 || motion.matches) { deliver(signal.field); signals.splice(i,1); continue; }
      const section = Math.floor(signal.phase), t = signal.phase % 1;
      if (section > 0 && t < .48) {
        const x = columns[section - 1];
        const decay = 1 - t / .48;
        signal.field.activations[section - 1].forEach((energy, n) => {
          const p = point(x, unitY(n));
          ctx.fillStyle = "rgba(101,193,255," + energy * decay * .54 + ")";
          ctx.beginPath();
          ctx.ellipse(p.x, p.y, 2 + 5 * energy, 2 + 3 * energy, -.5, 0, Math.PI * 2);
          ctx.fill();
        });
      }
      for (const fiber of signal.field.fibers[section]) {
        if (fiber.strength < .13) continue;
        ctx.lineWidth = 4.2;
        ctx.strokeStyle = "rgba(57,139,255,"+(.14+fiber.strength*.27)+")";
        strand(fiber,t,.19);
        ctx.lineWidth = 1.8;
        ctx.strokeStyle = "rgba(174,232,255,"+(.35+fiber.strength*.58)+")";
        strand(fiber,t,.12);
      }
    }
    ctx.restore();
    const hit = Math.max(0, 1 - (tick-outTime)*1.6);
    // Oscilloscope at the collector: the most recent pass changes its envelope.
    ctx.beginPath();
    for (let j=0;j<=120;j+=2) {
      const envelope = Math.sin(Math.PI*j/120)**2;
      const wave = Math.sin(j*(.18+lastTrace*.15)-tick*6) * Math.cos(j*.044-tick);
      const x=610+j,y=axis(x) + wave*envelope*(6+hit*35);
      if (j===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
    }
    ctx.strokeStyle = hit > .2 ? "#bcf5ff" : "#8aacff";ctx.lineWidth=1.8;ctx.stroke();
    const p=point(610);
    const halo=ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,21+hit*18);
    halo.addColorStop(0,"#bfdfff"); halo.addColorStop(.12,"#85bcffb8");halo.addColorStop(1,"#608aff00");
    ctx.fillStyle=halo;ctx.fillRect(p.x-40,p.y-40,80,80);
    if (!motion.matches) schedule();
  }
  function schedule() { if (!frame && visible && !document.hidden) frame=requestAnimationFrame(render); }
  function visibility() { previous=0; held=false; schedule(); }
  const resizeObserver=new ResizeObserver(resize);
  resizeObserver.observe(canvas);
  const observer=new IntersectionObserver(([entry])=>{visible=entry.isIntersecting;visibility();});
  observer.observe(canvas);
  document.addEventListener("visibilitychange",visibility);
  motion.addEventListener("change",visibility);
  resize();
  return {
    steer(value: number) { input=clip(value); network=trace(input); schedule(); },
    hold(value: boolean) { held=value; if (value) send(); },
    send,
    stop() {
      cancelAnimationFrame(frame); resizeObserver.disconnect(); observer.disconnect();
      document.removeEventListener("visibilitychange",visibility); motion.removeEventListener("change",visibility);
    }
  };
}
