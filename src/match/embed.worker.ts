// Runs the DINOv2-small image model in a background worker so the screen
// stays responsive. Every file comes from this site; remote models are off.
import { AutoModel, Tensor, env, type PreTrainedModel } from '@huggingface/transformers';

export type Dtype = 'q8' | 'q4f16';
export type Device = 'webgpu' | 'wasm';

export type EmbedRequest =
  | { type: 'init'; base: string; dtype: Dtype; device: Device | 'auto' }
  | { type: 'embed'; id: number; pixels: Float32Array; count: number };

export type EmbedResponse =
  | { type: 'ready'; device: Device; loadMs: number }
  | { type: 'result'; id: number; cls: Float32Array; mean: Float32Array; dim: number; ms: number }
  | { type: 'error'; id?: number; message: string };

const MODEL = 'Xenova/dinov2-small';
let model: PreTrainedModel | null = null;

function post(msg: EmbedResponse, transfer: Transferable[] = []) {
  (self as unknown as Worker).postMessage(msg, transfer);
}

async function hasWebGPU(): Promise<boolean> {
  const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
  if (!gpu) return false;
  try {
    return !!(await gpu.requestAdapter());
  } catch {
    return false;
  }
}

async function init(base: string, dtype: Dtype, wanted: Device | 'auto') {
  env.allowRemoteModels = false;
  env.allowLocalModels = true;
  env.localModelPath = new URL('models/', base).href;
  const ort = env.backends.onnx;
  if (ort.wasm) {
    ort.wasm.wasmPaths = {
      mjs: new URL('ort/ort-wasm-simd-threaded.asyncify.mjs', base).href,
      wasm: new URL('ort/ort-wasm-simd-threaded.asyncify.wasm', base).href,
    };
    ort.wasm.numThreads = 1; // GitHub Pages cannot enable cross-origin isolation
  }
  const device: Device = wanted === 'auto' ? ((await hasWebGPU()) ? 'webgpu' : 'wasm') : wanted;
  const t0 = performance.now();
  model = await AutoModel.from_pretrained(MODEL, { dtype, device });
  post({ type: 'ready', device, loadMs: performance.now() - t0 });
}

function l2(rows: Float32Array, n: number, dim: number) {
  for (let r = 0; r < n; r++) {
    let s = 0;
    for (let i = 0; i < dim; i++) s += rows[r * dim + i] ** 2;
    const k = 1 / (Math.sqrt(s) || 1);
    for (let i = 0; i < dim; i++) rows[r * dim + i] *= k;
  }
}

async function embed(id: number, pixels: Float32Array, count: number) {
  if (!model) throw new Error('Model not loaded');
  const t0 = performance.now();
  const input = new Tensor('float32', pixels, [count, 3, 224, 224]);
  const out = await model({ pixel_values: input });
  const hidden = out.last_hidden_state as Tensor; // [n, 1 + patches, dim]
  const [n, tokens, dim] = hidden.dims as number[];
  const data = Float32Array.from(hidden.data as ArrayLike<number>);
  const cls = new Float32Array(n * dim);
  const mean = new Float32Array(n * dim);
  for (let r = 0; r < n; r++) {
    const row = r * tokens * dim;
    for (let i = 0; i < dim; i++) cls[r * dim + i] = data[row + i];
    for (let t = 1; t < tokens; t++) for (let i = 0; i < dim; i++) mean[r * dim + i] += data[row + t * dim + i];
  }
  l2(cls, n, dim);
  l2(mean, n, dim);
  hidden.dispose?.();
  input.dispose?.();
  post({ type: 'result', id, cls, mean, dim, ms: performance.now() - t0 }, [cls.buffer, mean.buffer]);
}

self.onmessage = async (e: MessageEvent<EmbedRequest>) => {
  const msg = e.data;
  try {
    if (msg.type === 'init') await init(msg.base, msg.dtype, msg.device);
    else await embed(msg.id, msg.pixels, msg.count);
  } catch (err) {
    post({ type: 'error', id: msg.type === 'embed' ? msg.id : undefined, message: String((err as Error)?.message ?? err) });
  }
};
