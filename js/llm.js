import { MODEL_TIERS } from './constants.js';

let engine = null;
let currentModelId = null;
let loadProgressCallback = null;
let modelLoadingPromise = null;
let remoteConfig = null;

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
  const isRemote = remoteConfig !== null;
  if (isRemote) return 'remote';
  
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
  const isRemote = remoteConfig !== null;
  return isRemote || (typeof navigator !== 'undefined' && !!navigator.gpu);
}

export function getEngineInfo() {
  if (remoteConfig) {
    return { tierId: 'remote', modelId: remoteConfig.model };
  }
  if (!engine) return null;
  const tier = MODEL_TIERS.find(t => t.modelId === currentModelId);
  return { tierId: tier ? tier.id : null, modelId: currentModelId };
}

export async function loadModel(tierId, onProgress) {
  const isRemote = remoteConfig !== null;
  if (isRemote) return null;

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

export function configureRemote({ baseUrl, apiKey, model }) {
  remoteConfig = { baseUrl, apiKey, model };
  try {
    localStorage.setItem('bullshit-remote-config', JSON.stringify({ baseUrl, model }));
    localStorage.setItem('bullshit-remote-key', apiKey);
  } catch {}
}

export function useLocalEngine() {
  remoteConfig = null;
  try {
    localStorage.removeItem('bullshit-remote-config');
    localStorage.removeItem('bullshit-remote-key');
  } catch {}
}

export async function runInference(messages, timeoutMs = 90000, schema) {
  const effectiveTimeout = typeof timeoutMs === 'number' && timeoutMs > 0 ? timeoutMs : 90000;

  if (remoteConfig) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), effectiveTimeout);

    try {
      const resp = await fetch(`${remoteConfig.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${remoteConfig.apiKey}`
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: remoteConfig.model,
          messages,
          temperature: 0.0,
          ...(schema && { response_format: { type: 'json_object' } })
        })
      });

      clearTimeout(timeoutId);

      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({ error: { message: `HTTP ${resp.status}` } }));
        throw new Error(errData.error?.message || `HTTP ${resp.status}`);
      }

      const data = await resp.json();
      return data.choices[0]?.message?.content || '';
    } catch (err) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        throw new Error(`Inference timed out after ${effectiveTimeout / 1000}s`);
      }
      throw err;
    }
  }

  if (!engine) throw new Error('Model not loaded');

  const request = {
    messages,
    temperature: 0.0,
    top_p: 1.0,
    max_tokens: 2048,
    ...(schema && {
      response_format: {
        type: 'json_object',
        schema: JSON.stringify(schema)
      }
    })
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), effectiveTimeout);

  try {
    const reply = await Promise.race([
      engine.chat.completions.create(request),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Inference timed out after ${effectiveTimeout / 1000}s`)), effectiveTimeout)
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