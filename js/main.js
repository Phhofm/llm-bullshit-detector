import { checkGPUStatus, loadModel, getEngineInfo } from './llm.js';
import { extractClaims, verifyClaims } from './pipeline.js';
import { performParallelSearches, fetchURL } from './search.js';
import {
  showLoading,
  hideLoading,
  showStatus,
  showCyclingStatus,
  setLoadingText,
  renderGPUStatus,
  renderModelLoader,
  renderClaimChecklist,
  renderResults,
  renderError
} from './ui.js';
import { MODEL_TIERS, FIREFOX_UNSTABLE_MESSAGE, SNIFFING_MESSAGES } from './constants.js';

let selectedTier = null;
let extractedClaims = [];
let urlContent = null;
let modelLoadVersion = 0;

const appContainer = document.getElementById('app');
const inputTextarea = document.getElementById('inputText');
const inputUrl = document.getElementById('inputUrl');
const detectBtn = document.getElementById('detectBtn');

function getDefaultTier() {
  const saved = localStorage.getItem('bullshit-tier');
  if (saved) {
    const tier = MODEL_TIERS.find(t => t.id === saved);
    if (tier) return tier;
  }
  return MODEL_TIERS.find(t => t.id === 'deep') || MODEL_TIERS[0];
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

  if (status === 'no_adapter') {
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

  await loadAndRun();
});

async function loadAndRun() {
  const tier = getDefaultTier();
  selectedTier = tier;

  showLoading(appContainer);
  renderModelLoader(appContainer, MODEL_TIERS, tier, async (newTier) => {
    selectedTier = newTier;
    localStorage.setItem('bullshit-tier', newTier.id);
    await runWithModel(newTier);
  });

  await runWithModel(tier);
}

async function runWithModel(tier) {
  const currentVersion = ++modelLoadVersion;

  try {
    const engine = await loadModel(tier.id, (progress) => {
      if (progress.text) {
        setLoadingText(progress.text);
      }
    });

    if (modelLoadVersion !== currentVersion) return;

    if (!engine) {
      throw new Error('Model failed to load');
    }

    showStatus(appContainer, 'Analyzing text and extracting claims...');
    extractedClaims = await extractClaims(getInputText(), (msg) => {
      showStatus(appContainer, msg);
    });

    if (modelLoadVersion !== currentVersion) return;

    hideLoading();
    renderClaimChecklist(appContainer, extractedClaims);
    setupChecklistListeners();

  } catch (err) {
    if (modelLoadVersion !== currentVersion) return;
    hideLoading();
    console.error('Pipeline error:', err);
    const message = translateError(err.message || '');
    renderError(appContainer, 'Something went wrong', message);
    detectBtn.disabled = false;
    detectBtn.classList.remove('btn-disabled');
  }
}

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
