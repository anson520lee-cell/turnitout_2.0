/**
 * A real, small neural network, trained for real in the browser. The space
 * backdrop draws whatever this is doing; nothing in it is scripted.
 *
 * - Task: tell three interleaved spiral arms apart (240 points, 3 classes).
 * - Model: a 4-8-8-3 multilayer perceptron, tanh hidden units,
 *   softmax output. The four inputs are x, y, x·y and the radius.
 * - Learning: mini-batch gradient descent with backpropagation and the Adam
 *   update rule, cross-entropy loss.
 *
 * A run starts from random weights, takes a few hundred steps to pull the
 * arms apart, is left to settle, then the weights are thrown away and a new
 * run starts on freshly drawn spirals. The loss, accuracy, weights, gradients
 * and activations read from here are the actual numbers of that process.
 */

export const NET_LAYERS = [4, 8, 8, 3];
export const INPUT_NAMES = ["x", "y", "x·y", "r"];
export const CLASS_NAMES = ["A", "B", "C"];
const L = NET_LAYERS.length;
const POINTS = 240;
const BATCH = 16;
const LR = 0.003;
const B1 = 0.9;
const B2 = 0.999;
/** A run ends after this many steps, or sooner once it has clearly converged. */
const MAX_STEPS = 900;

export interface Trainer {
  /** weights, W[l][i * NET_LAYERS[l + 1] + j] connects neuron i of layer l to neuron j of the next */
  W: Float32Array[];
  /** a running average of each weight's gradient magnitude: how hard it is being corrected */
  G: Float32Array[];
  /** activations of the sample currently being shown */
  act: Float32Array[];
  /** backpropagated error at each neuron for that sample */
  del: Float32Array[];
  /** the sample being shown: its class, and the class the network picked */
  probeClass: number;
  probePick: number;
  step: number;
  /** passes over the data so far (steps × batch ÷ points) */
  epoch: number;
  /** running average of the batch loss (cross-entropy) */
  loss: number;
  /** share of the 240 points classified correctly, measured every 20 steps */
  acc: number;
  lr: number;
  run: number;
  done: boolean;
  /** loss sampled every 10 steps, for the curve */
  history: number[];
  /** the data: x, y, class, repeated */
  points: Float32Array;
  train(steps: number): void;
  /** Runs one random sample forward and backward so its signals can be drawn. */
  probe(): void;
  /** Fills `out` (n × n × 4 RGBA bytes) with the class the network predicts across the plane. */
  boundary(n: number, out: Uint8ClampedArray): void;
  reset(): void;
}

const CLASS_RGB = [
  [95, 216, 245],
  [178, 132, 255],
  [255, 176, 96],
];

export function createTrainer(): Trainer {
  const W: Float32Array[] = [];
  const Bi: Float32Array[] = [];
  const G: Float32Array[] = [];
  const gW: Float32Array[] = [];
  const gB: Float32Array[] = [];
  const mW: Float32Array[] = [];
  const vW: Float32Array[] = [];
  const mB: Float32Array[] = [];
  const vB: Float32Array[] = [];
  for (let l = 0; l < L - 1; l++) {
    const n = NET_LAYERS[l] * NET_LAYERS[l + 1];
    W.push(new Float32Array(n));
    G.push(new Float32Array(n));
    gW.push(new Float32Array(n));
    mW.push(new Float32Array(n));
    vW.push(new Float32Array(n));
    Bi.push(new Float32Array(NET_LAYERS[l + 1]));
    gB.push(new Float32Array(NET_LAYERS[l + 1]));
    mB.push(new Float32Array(NET_LAYERS[l + 1]));
    vB.push(new Float32Array(NET_LAYERS[l + 1]));
  }
  const act = NET_LAYERS.map((n) => new Float32Array(n));
  const del = NET_LAYERS.map((n) => new Float32Array(n));
  const feat = new Float32Array(POINTS * 4);
  const label = new Uint8Array(POINTS);
  const points = new Float32Array(POINTS * 3);
  let adamT = 0;

  function features(x: number, y: number, into: Float32Array, at: number) {
    into[at] = x;
    into[at + 1] = y;
    into[at + 2] = x * y * 2;
    into[at + 3] = Math.hypot(x, y) * 2 - 1;
  }

  /** Forward pass: fills `act`, ending with the softmax probabilities. */
  function forward(src: Float32Array, at: number) {
    for (let i = 0; i < 4; i++) act[0][i] = src[at + i];
    for (let l = 0; l < L - 1; l++) {
      const a = NET_LAYERS[l];
      const b = NET_LAYERS[l + 1];
      const w = W[l];
      const out = act[l + 1];
      const inp = act[l];
      const last = l === L - 2;
      for (let j = 0; j < b; j++) {
        let z = Bi[l][j];
        for (let i = 0; i < a; i++) z += w[i * b + j] * inp[i];
        out[j] = last ? z : Math.tanh(z);
      }
    }
    const o = act[L - 1];
    const m = Math.max(o[0], o[1], o[2]);
    let sum = 0;
    for (let k = 0; k < 3; k++) {
      o[k] = Math.exp(o[k] - m);
      sum += o[k];
    }
    for (let k = 0; k < 3; k++) o[k] /= sum;
  }

  /** Backward pass for the sample just run forward: fills `del`, adds to the gradient sums if asked. */
  function backward(cls: number, accumulate: boolean) {
    const o = act[L - 1];
    for (let j = 0; j < 3; j++) del[L - 1][j] = o[j] - (j === cls ? 1 : 0);
    for (let l = L - 2; l >= 0; l--) {
      const a = NET_LAYERS[l];
      const b = NET_LAYERS[l + 1];
      const w = W[l];
      const dn = del[l + 1];
      const inp = act[l];
      for (let i = 0; i < a; i++) {
        let e = 0;
        for (let j = 0; j < b; j++) {
          if (accumulate) gW[l][i * b + j] += dn[j] * inp[i];
          e += w[i * b + j] * dn[j];
        }
        del[l][i] = l > 0 ? e * (1 - inp[i] * inp[i]) : e;
      }
      if (accumulate) for (let j = 0; j < b; j++) gB[l][j] += dn[j];
    }
  }

  const t: Trainer = {
    W,
    G,
    act,
    del,
    probeClass: 0,
    probePick: 0,
    step: 0,
    epoch: 0,
    loss: 1.1,
    acc: 1 / 3,
    lr: LR,
    run: 0,
    done: false,
    history: [],
    points,
    train(steps) {
      for (let s = 0; s < steps && !t.done; s++) {
        for (let l = 0; l < L - 1; l++) {
          gW[l].fill(0);
          gB[l].fill(0);
        }
        let batchLoss = 0;
        for (let k = 0; k < BATCH; k++) {
          const p = Math.floor(Math.random() * POINTS);
          forward(feat, p * 4);
          batchLoss -= Math.log(act[L - 1][label[p]] + 1e-9);
          backward(label[p], true);
        }
        // Adam
        adamT++;
        const c1 = 1 - Math.pow(B1, adamT);
        const c2 = 1 - Math.pow(B2, adamT);
        for (let l = 0; l < L - 1; l++) {
          const w = W[l];
          const g = gW[l];
          const m = mW[l];
          const v = vW[l];
          const ga = G[l];
          for (let q = 0; q < w.length; q++) {
            const gr = g[q] / BATCH;
            m[q] = B1 * m[q] + (1 - B1) * gr;
            v[q] = B2 * v[q] + (1 - B2) * gr * gr;
            w[q] -= (LR * (m[q] / c1)) / (Math.sqrt(v[q] / c2) + 1e-8);
            ga[q] = ga[q] * 0.9 + Math.abs(gr) * 0.1;
          }
          const bb = Bi[l];
          const gb = gB[l];
          const bm = mB[l];
          const bv = vB[l];
          for (let q = 0; q < bb.length; q++) {
            const gr = gb[q] / BATCH;
            bm[q] = B1 * bm[q] + (1 - B1) * gr;
            bv[q] = B2 * bv[q] + (1 - B2) * gr * gr;
            bb[q] -= (LR * (bm[q] / c1)) / (Math.sqrt(bv[q] / c2) + 1e-8);
          }
        }
        t.step++;
        t.epoch = (t.step * BATCH) / POINTS;
        t.loss = t.step === 1 ? batchLoss / BATCH : t.loss * 0.94 + (batchLoss / BATCH) * 0.06;
        if (t.step % 10 === 0) {
          t.history.push(t.loss);
          if (t.history.length > 90) t.history.shift();
        }
        if (t.step % 20 === 0) {
          let ok = 0;
          for (let p = 0; p < POINTS; p++) {
            forward(feat, p * 4);
            const o = act[L - 1];
            const pick = o[0] >= o[1] && o[0] >= o[2] ? 0 : o[1] >= o[2] ? 1 : 2;
            if (pick === label[p]) ok++;
          }
          t.acc = ok / POINTS;
        }
        if (t.step >= MAX_STEPS || (t.step >= 620 && t.acc >= 0.995)) t.done = true;
      }
    },
    probe() {
      const p = Math.floor(Math.random() * POINTS);
      forward(feat, p * 4);
      const o = act[L - 1];
      t.probeClass = label[p];
      t.probePick = o[0] >= o[1] && o[0] >= o[2] ? 0 : o[1] >= o[2] ? 1 : 2;
      backward(label[p], false);
    },
    boundary(n, out) {
      const f = new Float32Array(4);
      // `act` is shared with the probe, so keep its values and put them back
      const keep = act.map((a) => Float32Array.from(a));
      for (let gy = 0; gy < n; gy++) {
        for (let gx = 0; gx < n; gx++) {
          features((gx / (n - 1)) * 2.2 - 1.1, (gy / (n - 1)) * 2.2 - 1.1, f, 0);
          forward(f, 0);
          const o = act[L - 1];
          const pick = o[0] >= o[1] && o[0] >= o[2] ? 0 : o[1] >= o[2] ? 1 : 2;
          const q = (gy * n + gx) * 4;
          out[q] = CLASS_RGB[pick][0];
          out[q + 1] = CLASS_RGB[pick][1];
          out[q + 2] = CLASS_RGB[pick][2];
          out[q + 3] = 40 + (o[pick] - 1 / 3) * 1.5 * 150; // surer = more opaque
        }
      }
      keep.forEach((a, l) => act[l].set(a));
    },
    reset() {
      // fresh spirals
      const turn = Math.random() * Math.PI * 2;
      for (let p = 0; p < POINTS; p++) {
        const cls = p % 3;
        const u = Math.random();
        const r = 0.12 + u * 0.88;
        const th = cls * ((Math.PI * 2) / 3) + u * Math.PI * 2.1 + (Math.random() - 0.5) * 0.22 + turn;
        const x = r * Math.cos(th);
        const y = r * Math.sin(th);
        features(x, y, feat, p * 4);
        label[p] = cls;
        points[p * 3] = x;
        points[p * 3 + 1] = y;
        points[p * 3 + 2] = cls;
      }
      // fresh weights
      for (let l = 0; l < L - 1; l++) {
        const scale = Math.sqrt(1 / NET_LAYERS[l]) * 1.6;
        for (let q = 0; q < W[l].length; q++) W[l][q] = (Math.random() * 2 - 1) * scale;
        Bi[l].fill(0);
        G[l].fill(0);
        mW[l].fill(0);
        vW[l].fill(0);
        mB[l].fill(0);
        vB[l].fill(0);
      }
      adamT = 0;
      t.step = 0;
      t.epoch = 0;
      t.loss = 1.1;
      t.acc = 1 / 3;
      t.history = [];
      t.done = false;
      t.run++;
      t.probe();
    },
  };
  t.reset();
  return t;
}

export const classColor = (k: number) => CLASS_RGB[k].join(",");
