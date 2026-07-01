import { isWebGPUSupported, loadModel } from './llm.js';
import { measureBandwidth } from './bandwidth.js';
import { extractClaims, verifyClaims } from './pipeline.js';
import { performParallelSearches } from './search.js';
import {
  showLoading,
  hideLoading,
  showStatus,
  renderWebGPUWarning,
  renderModelTierSelection,
  renderClaimChecklist,
  renderResults,
  renderError
} from './ui.js';
import { MODEL_TIERS } from './constants.js';

let selectedTier = null;
let extractedClaims = [];
let bandwidthBps = null;

const appContainer = document.getElementById('app');
const inputTextarea = document.getElementById('inputText');
const detectBtn = document.getElementById('detectBtn');

async function init() {
  if (!isWebGPUSupported()) {
    renderWebGPUWarning(appContainer);
    detectBtn.disabled = true;
    detectBtn.classList.add('btn-disabled');
    return;
  }

  try {
    bandwidthBps = await measureBandwidth();
  } catch {
    bandwidthBps = null;
  }
}

detectBtn.addEventListener('click', async () => {
  if (!inputTextarea.value.trim()) return;

  detectBtn.disabled = true;
  detectBtn.classList.add('btn-disabled');

  showLoading(appContainer);
  renderModelTierSelection(appContainer, MODEL_TIERS, bandwidthBps);
  setupTierSelection();
});

function getInputText() {
  return inputTextarea.value.trim();
}

function setupTierSelection() {
  const tierButtons = appContainer.querySelectorAll('.tier-card');
  tierButtons.forEach(btn => {
    btn.addEventListener('click', async () => {
      const tierId = btn.dataset.tier;
      selectedTier = MODEL_TIERS.find(t => t.id === tierId);
      if (!selectedTier) return;

      await runPipeline(getInputText(), selectedTier);
    });
  });
}

async function runPipeline(text, tier) {
  try {
    showLoading(appContainer);

    const engine = await loadModel(tier.id, (progress) => {
      const msgEl = document.getElementById('loadingMessage');
      if (msgEl && progress.text) {
        msgEl.textContent = progress.text;
      }
    });

    showStatus(appContainer, 'Isolating confident-sounding lies...');
    extractedClaims = await extractClaims(text, (msg) => {
      showStatus(appContainer, msg);
    });

    hideLoading();
    renderClaimChecklist(appContainer, extractedClaims);
    setupChecklistListeners();

  } catch (err) {
    hideLoading();
    console.error('Pipeline error:', err);
    renderError(appContainer, 'Something went wrong', err.message || 'The bullshit remains undetected. For now.');
  }
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
    checkboxes.forEach(cb => {
      cb.checked = true;
    });
    updateButton();
  });

  deselectAllBtn.addEventListener('click', () => {
    checkboxes.forEach(cb => {
      cb.checked = false;
    });
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
    showStatus(appContainer, 'Checking the actual, live internet...');

    const claimsWithSnippets = await performParallelSearches(selectedClaims, (done, total) => {
      showStatus(appContainer, `Searching... ${done}/${total} queries`);
    });

    showStatus(appContainer, 'Sniffing out the hallucinations...');

    const { verdicts, overallSmellRating } = await verifyClaims(claimsWithSnippets, (msg) => {
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

init();
