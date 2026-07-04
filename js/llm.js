import { MODEL_TIERS } from './constants.js';

let engine = null;
let currentModelId = null;
let loadProgressCallback = null;
let modelLoadingPromise = null;

export function isModelLoading() {
  return modelLoadingPromise !== null;
}

export async function waitForModel() {
  if (!modelLoadingPromise) return null;
  try {
    return await modelLoadingPromise;
  } catch {
    return null;
  }
}

export async function checkGPUStatus() {
  if (typeof navigator === 'undefined' || !navigator.gpu) {
    const isFirefox = typeof navigator !== 'undefined' && /Firefox/.test(navigator.userAgent || '');
    return isFirefox ? 'firefox_no_flag' : 'no_webgpu';
  }

  const isFirefox = /Firefox/.test(navigator.userAgent || '');

  try {
    let adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
      adapter = await navigator.gpu.requestAdapter({ powerPreference: 'low-power' });
    }
    if (!adapter) {
      adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
    }
    if (!adapter) {
      return 'no_adapter';
    }
    return isFirefox ? 'firefox_ready' : 'ready';
  } catch {
    return 'no_adapter';
  }
}

export function isWebGPUSupported() {
  return typeof navigator !== 'undefined' && !!navigator.gpu;
}

export function getEngineInfo() {
  if (!engine) return null;
  const tier = MODEL_TIERS.find(t => t.modelId === currentModelId);
  return { tierId: tier ? tier.id : null, modelId: currentModelId };
}

export async function loadModel(tierId, onProgress) {
  const tier = MODEL_TIERS.find(t => t.id === tierId);
  if (!tier) throw new Error(`Unknown model tier: ${tierId}`);

  if (engine && currentModelId === tier.modelId) {
    return engine;
  }

  if (engine && currentModelId !== tier.modelId) {
    await engine.unload();
    engine = null;
    modelLoadingPromise = null;
  }

  loadProgressCallback = onProgress;

  modelLoadingPromise = (async () => {
    const { CreateMLCEngine } = await import('https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.83/+esm');

    engine = await CreateMLCEngine(tier.modelId, {
      initProgressCallback: (progress) => {
        if (loadProgressCallback) {
          loadProgressCallback(progress);
        }
      }
    });

    currentModelId = tier.modelId;
    modelLoadingPromise = null;
    return engine;
  })();

  try {
    return await modelLoadingPromise;
  } catch (err) {
    modelLoadingPromise = null;
    throw err;
  }
}

export async function runInference(messages, timeoutMs = 90000) {
  if (!engine) throw new Error('Model not loaded');

  const request = {
    messages,
    temperature: 0.0,
    top_p: 1.0,
    max_tokens: 2048
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const reply = await Promise.race([
      engine.chat.completions.create(request),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Inference timed out after ${timeoutMs / 1000}s`)), timeoutMs)
      )
    ]);
    clearTimeout(timeoutId);
    const content = reply.choices[0]?.message?.content || '';
    return content;
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}
