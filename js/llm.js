import { MODEL_TIERS } from './constants.js';

let engine = null;
let currentModelId = null;
let loadProgressCallback = null;

export function isWebGPUSupported() {
  return typeof navigator !== 'undefined' && !!navigator.gpu;
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
  }

  loadProgressCallback = onProgress;

  const { CreateMLCEngine } = await import('https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.83/+esm');

  engine = await CreateMLCEngine(tier.modelId, {
    initProgressCallback: (progress) => {
      if (loadProgressCallback) {
        loadProgressCallback(progress);
      }
    }
  });

  currentModelId = tier.modelId;
  return engine;
}

export async function runInference(messages, responseFormat) {
  if (!engine) throw new Error('Model not loaded');

  const request = {
    messages,
    temperature: 0.1,
    top_p: 0.95,
    max_tokens: 2048
  };

  if (responseFormat) {
    request.response_format = responseFormat;
  }

  const reply = await engine.chat.completions.create(request);
  const content = reply.choices[0]?.message?.content || '';
  return content;
}
