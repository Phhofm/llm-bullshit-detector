import { checkGPUStatus, loadModel, getEngineInfo } from './llm.js';
import { measureBandwidth } from './bandwidth.js';
import { extractClaims, verifyClaims } from './pipeline.js';
import { performParallelSearches, fetchURL } from './search.js';
import {
  showLoading,
  hideLoading,
  showStatus,
  showCyclingStatus,
  setLoadingText,
  renderGPUStatus,
  renderModelTierSelection,
  renderClaimChecklist,
  renderResults,
  renderError
} from './ui.js';
import { MODEL_TIERS, FIREFOX_UNSTABLE_MESSAGE, SNIFFING_MESSAGES } from './constants.js';

let selectedTier = null;
let extractedClaims = [];
let bandwidthBps = null;
let urlContent = null;

const appContainer = document.getElementById('app');
const inputTextarea = document.getElementById('inputText');
const inputUrl = document.getElementById('inputUrl');
const detectBtn = document.getElementById('detectBtn');

async function prewarmEngine() {
  const lastTierId = localStorage.getItem('bullshit-tier');
  if (!lastTierId) return;
  const tier = MODEL_TIERS.find(t => t.id === lastTierId);
  if (!tier) return;

  try {
    await loadModel(tier.id, () => {});
  } catch {
    // pre-warming failed silently, will load on demand
  }
}

async function init() {
  const status = await checkGPUStatus();

  if (status === 'no_webgpu') {
    renderGPUStatus(appContainer, status);
    detectBtn.disabled = true;
    detectBtn.classList.add('btn-disabled');
    return;
  }

  if (status === 'firefox_no_flag') {
    renderGPUStatus(appContainer, status);
    detectBtn.disabled = true;
    detectBtn.classList.add('btn-disabled');
    return;
  }

  if (status === 'firefox_ready') {
    const warning = document.createElement('div');
    warning.className = 'max-w-2xl mx-auto mb-6 bg-amber-900/20 border border-amber-800/50 rounded-lg p-4 text-center';
    warning.innerHTML = `<p class="text-amber-300 text-sm leading-relaxed">${FIREFOX_UNSTABLE_MESSAGE}</p>`;
    const inputSection = document.getElementById('inputSection');
    inputSection.parentNode.insertBefore(warning, inputSection);
  }

  try {
    bandwidthBps = await measureBandwidth();
  } catch {
    bandwidthBps = null;
  }

  prewarmEngine();
}

detectBtn.addEventListener('click', async () => {
  if (!inputTextarea.value.trim()) return;

  detectBtn.disabled = true;
  detectBtn.classList.add('btn-disabled');

  const existing = getEngineInfo();
  if (existing && existing.tierId) {
    const tier = MODEL_TIERS.find(t => t.id === existing.tierId);
    if (tier) {
      selectedTier = tier;
      await runPipeline(getInputText(), tier);
      return;
    }
  }

  showLoading(appContainer);
  renderModelTierSelection(appContainer, MODEL_TIERS, bandwidthBps);
  setupTierSelection();
});

function resetApp() {
  hideLoading();
  selectedTier = null;
  extractedClaims = [];
  urlContent = null;
  inputTextarea.value = '';
  if (inputUrl) inputUrl.value = '';
  detectBtn.disabled = false;
  detectBtn.classList.remove('btn-disabled');
  appContainer.innerHTML = '';
}

function getInputText() {
  return inputTextarea.value.trim();
}

function getInputUrl() {
  return (inputUrl.value || '').trim();
}

function setupTierSelection() {
  const tierButtons = appContainer.querySelectorAll('.tier-card');
  tierButtons.forEach(btn => {
    btn.addEventListener('click', async () => {
      const tierId = btn.dataset.tier;
      selectedTier = MODEL_TIERS.find(t => t.id === tierId);
      if (!selectedTier) return;

      localStorage.setItem('bullshit-tier', selectedTier.id);
      await runPipeline(getInputText(), selectedTier);
    });
  });
}

async function runPipeline(text, tier) {
  try {
    showLoading(appContainer);

    const engine = await loadModel(tier.id, (progress) => {
      if (progress.text) {
        setLoadingText(progress.text);
      }
    });

    showCyclingStatus(appContainer, SNIFFING_MESSAGES);
    extractedClaims = await extractClaims(text, (msg) => {
      showStatus(appContainer, msg);
    });

    hideLoading();
    renderClaimChecklist(appContainer, extractedClaims);
    setupChecklistListeners();

  } catch (err) {
    hideLoading();
    console.error('Pipeline error:', err);
    const message = translateError(err.message || '');
    renderError(appContainer, 'Something went wrong', message);
  }
}

function translateError(msg) {
  if (msg.includes('compatible GPU') || msg.includes('GPU')) {
    const platform = navigator.platform || '';
    if (platform.includes('Linux')) {
      return 'WebGPU is available but Chrome is using a compatibility fallback that WebLLM can\'t work with. ' +
        'Try launching Chrome with --enable-unsafe-webgpu flag, or switch to Edge which handles this better on Linux.';
    }
    if (platform.includes('Win')) {
      return 'WebGPU is available but no compatible adapter was found. Try updating your graphics drivers.';
    }
    return 'WebGPU is available but no compatible adapter was found. Try updating your graphics drivers.';
  }
  return msg || 'The bullshit remains undetected. For now.';
}

function setupChecklistListeners() {
  const sniffBtn = document.getElementById('sniffSelectedBtn');
  const selectAllBtn = document.getElementById('selectAllBtn');
  const deselectAllBtn = document.getElementById('deselectAllBtn');
  const estimateLabel = document.getElementById('estimateLabel');

  if (!sniffBtn) return;

  const checkboxes = appContainer.querySelectorAll('.claim-checkbox');

  const updateButton = () => {
    const checked = appContainer.querySelectorAll('.claim-checkbox:checked');
    const count = checked.length;

    if (count === 0) {
      sniffBtn.textContent = 'Sniff 0 claims';
      sniffBtn.classList.add('btn-disabled');
      sniffBtn.disabled = true;
      estimateLabel.textContent = 'Select claims to sniff';
    } else {
      const estSecs = count * 4;
      sniffBtn.textContent = `Sniff ${count} claim${count > 1 ? 's' : ''} (~${estSecs}s)`;
      sniffBtn.classList.remove('btn-disabled');
      sniffBtn.disabled = false;
      estimateLabel.textContent = `Estimated time: ~${estSecs} seconds`;
    }
  };

  checkboxes.forEach(cb => cb.addEventListener('change', updateButton));

  selectAllBtn.addEventListener('click', () => {
    checkboxes.forEach(cb => { cb.checked = true; });
    updateButton();
  });

  deselectAllBtn.addEventListener('click', () => {
    checkboxes.forEach(cb => { cb.checked = false; });
    updateButton();
  });

  sniffBtn.addEventListener('click', async () => {
    const checked = appContainer.querySelectorAll('.claim-checkbox:checked');
    if (checked.length === 0) return;

    const selectedIndices = Array.from(checked).map(cb => parseInt(cb.dataset.index));
    const selectedClaims = selectedIndices.map(i => extractedClaims[i]);

    await runVerification(selectedClaims);
  });
}

async function runVerification(selectedClaims) {
  try {
    const targetUrl = getInputUrl();
    urlContent = null;

    if (targetUrl) {
      showStatus(appContainer, 'Fetching live page content...');
      try {
        const result = await fetchURL(targetUrl);
        urlContent = result.content
          ? `Title: ${result.title || ''}\nURL: ${result.finalUrl || targetUrl}\nContent:\n${result.content}`
          : null;
      } catch (err) {
        console.warn('URL fetch failed:', err.message);
        urlContent = null;
      }
    }

    showStatus(appContainer, 'Checking the actual, live internet...');

    const claimsWithSnippets = await performParallelSearches(selectedClaims, (done, total) => {
      showStatus(appContainer, `Searching... ${done}/${total} queries`);
    });

    showCyclingStatus(appContainer, SNIFFING_MESSAGES);

    const { verdicts, overallSmellRating } = await verifyClaims(claimsWithSnippets, urlContent, (msg) => {
      showStatus(appContainer, msg);
    });

    hideLoading();
    renderResults(appContainer, verdicts, overallSmellRating);

  } catch (err) {
    hideLoading();
    console.error('Verification error:', err);
    renderError(appContainer, 'Verification failed', err.message || 'The internet refused to cooperate. Try again.');
  }
}

window.resetApp = resetApp;

init();
