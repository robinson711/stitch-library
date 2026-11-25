// Runs the DINOv2-small image model in a background worker so the screen
// stays responsive. Every file comes from this site; remote models are off.
import { AutoModel, Tensor, env, type PreTrainedModel } from '@huggingface/transformers';
import { threadCount } from './threads';

export type Dtype = 'q8' | 'q4f16';
export type Device = 'webgpu' | 'wasm';
/** Which ONNX Runtime WebAssembly file to load. */
export type OrtBuild = 'plain' | 'asyncify';

export interface InitOptions {
  base: string;
  dtype: Dtype;
  device: Device | 'auto';
  /**
   * 'auto' (default): the small plain build on the processor, the asyncify
   * build only when the graphics chip is used (it needs it). On iOS 26 the
   * asyncify build is far slower on the processor (WebKit bug 304810).
   */
  build?: OrtBuild | 'auto';
  /** Processor threads. 0 or missing: as many as allowed (needs cross-origin isolation). */
  threads?: number;
}

export type EmbedRequest =
  | ({ type: 'init' } & InitOptions)
  | { type: 'embed'; id: number; pixels: Float32Array; count: number };

export type EmbedResponse =
  | { type: 'ready'; device: Device; build: OrtBuild; threads: number; loadMs: number }
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

async function init(o: InitOptions) {
  const { base, dtype } = o;
  env.allowRemoteModels = false;
  env.allowLocalModels = true;
  env.localModelPath = new URL('models/', base).href;
  // Load runtime files straight from this site. The library's own cache turns
  // the runtime into a blob: URL, which the security policy (rightly) blocks
  // for helper threads; the service worker will do the offline caching.
  (env as { useWasmCache?: boolean }).useWasmCache = false;
  // 'auto' uses the graphics chip only for the Small model: the Standard (q8)
  // model's integer maths isn't supported there and runs slower than on the
  // processor (Mac Safari: 1.7 s vs 0.27 s with 4 threads).
  const device: Device = o.device === 'auto' ? (dtype === 'q4f16' && (await hasWebGPU()) ? 'webgpu' : 'wasm') : o.device;
  const build: OrtBuild = !o.build || o.build === 'auto' ? (device === 'webgpu' ? 'asyncify' : 'plain') : o.build;
  const isolated = (self as { crossOriginIsolated?: boolean }).crossOriginIsolated === true;
  const threads = threadCount(o.threads, isolated, navigator.hardwareConcurrency);
  const ort = env.backends.onnx;
  if (ort.wasm) {
    const file = build === 'plain' ? 'ort-wasm-simd-threaded' : 'ort-wasm-simd-threaded.asyncify';
    ort.wasm.wasmPaths = {
      mjs: new URL(`ort/${file}.mjs`, base).href,
      wasm: new URL(`ort/${file}.wasm`, base).href,
    };
    ort.wasm.numThreads = threads;
  }
  const t0 = performance.now();
  model = await AutoModel.from_pretrained(MODEL, { dtype, device });
  post({ type: 'ready', device, build, threads, loadMs: performance.now() - t0 });
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
    if (msg.type === 'init') await init(msg);
    else await embed(msg.id, msg.pixels, msg.count);
  } catch (err) {
    post({ type: 'error', id: msg.type === 'embed' ? msg.id : undefined, message: String((err as Error)?.message ?? err) });
  }
};
