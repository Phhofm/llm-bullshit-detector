import {
  LOADING_MESSAGES,
  NO_WEBGPU_MESSAGE,
  FIREFOX_FLAG_MESSAGE,
  NO_GPU_ADAPTER_MESSAGE,
  NO_CLAIMS_MESSAGE,
  ALL_CLEAN_MESSAGE,
  SCORE_LABELS,
  WEBGPU_INFO_TEXT
} from './constants.js';

let loadingMessageInterval = null;

export function showLoading(containerEl) {
  hideLoading();

  containerEl.innerHTML = `
    <div class="loading-container text-center py-16">
      <div class="animate-spin inline-block w-12 h-12 border-4 border-amber-400 border-t-transparent rounded-full mb-6"></div>
      <p id="loadingMessage" class="text-gray-400 text-lg italic min-h-[2rem]"></p>
    </div>
  `;

  let idx = 0;
  const msgEl = document.getElementById('loadingMessage');

  const cycle = () => {
    if (msgEl && msgEl.dataset.frozen !== 'true') {
      msgEl.textContent = LOADING_MESSAGES[idx % LOADING_MESSAGES.length];
      idx++;
    }
  };

  cycle();
  loadingMessageInterval = setInterval(cycle, 3000);
}

export function setLoadingText(text) {
  const msgEl = document.getElementById('loadingMessage');
  if (msgEl) {
    msgEl.dataset.frozen = 'true';
    msgEl.textContent = text;
  }
}

export function unfreezeLoadingText() {
  const msgEl = document.getElementById('loadingMessage');
  if (msgEl) {
    msgEl.dataset.frozen = 'false';
  }
}

export function hideLoading() {
  if (loadingMessageInterval) {
    clearInterval(loadingMessageInterval);
    loadingMessageInterval = null;
  }
}

export function showStatus(containerEl, message) {
  hideCycling();
  hideLoading();
  containerEl.innerHTML = `
    <div class="text-center py-12">
      <div class="inline-block w-10 h-10 border-3 border-amber-400 border-t-transparent rounded-full animate-spin mb-4"></div>
      <p id="statusMessage" class="text-gray-400 text-lg italic">${escapeHtml(message)}</p>
    </div>
  `;
}

export function showCyclingStatus(containerEl, messages) {
  hideLoading();
  hideCycling();

  containerEl.innerHTML = `
    <div class="text-center py-12">
      <div class="inline-block w-10 h-10 border-3 border-amber-400 border-t-transparent rounded-full animate-spin mb-4"></div>
      <p id="statusMessage" class="text-gray-400 text-lg italic"></p>
    </div>
  `;

  let idx = 0;
  const msgEl = document.getElementById('statusMessage');

  const cycle = () => {
    if (msgEl) {
      msgEl.textContent = messages[idx % messages.length];
    }
    idx++;
  };

  cycle();
  loadingMessageInterval = setInterval(cycle, 2500);
}

function hideCycling() {
  if (loadingMessageInterval) {
    clearInterval(loadingMessageInterval);
    loadingMessageInterval = null;
  }
}

export function renderGPUStatus(containerEl, status) {
  if (status === 'firefox_no_flag') {
    containerEl.innerHTML = `
      <div class="max-w-2xl mx-auto bg-amber-900/20 border border-amber-800/50 rounded-lg p-6 text-center">
        <p class="text-amber-300 text-lg mb-2">Firefox needs a config tweak</p>
        <p class="text-gray-400 text-sm leading-relaxed">${FIREFOX_FLAG_MESSAGE}</p>
      </div>
    `;
  } else if (status === 'no_adapter') {
    containerEl.innerHTML = `
      <div class="max-w-2xl mx-auto bg-red-900/20 border border-red-800/50 rounded-lg p-6 text-center">
        <p class="text-red-300 text-lg mb-2">No compatible GPU found</p>
        <p class="text-gray-400 text-sm leading-relaxed">${NO_GPU_ADAPTER_MESSAGE}</p>
      </div>
    `;
  } else {
    containerEl.innerHTML = `
      <div class="max-w-2xl mx-auto bg-red-900/20 border border-red-800/50 rounded-lg p-6 text-center">
        <p class="text-red-300 text-lg mb-2">WebGPU not available</p>
        <p class="text-gray-400 text-sm leading-relaxed">${NO_WEBGPU_MESSAGE}</p>
      </div>
    `;
  }
}

export function renderWebGPUWarning(containerEl) {
  containerEl.innerHTML = `
    <div class="max-w-2xl mx-auto bg-red-900/20 border border-red-800/50 rounded-lg p-6 text-center">
      <p class="text-red-300 text-lg mb-2">WebGPU not available</p>
      <p class="text-gray-400 text-sm leading-relaxed">${NO_WEBGPU_MESSAGE}</p>
    </div>
  `;
}

export function renderWebGPUInfo(containerEl) {
  containerEl.innerHTML = `
    <div class="max-w-2xl mx-auto bg-gray-900 border border-gray-700/50 rounded-lg p-4 text-center mb-8">
      <p class="text-gray-500 text-xs leading-relaxed">${WEBGPU_INFO_TEXT}</p>
    </div>
  `;
}

export function renderModelSelector(containerEl, tiers, selectedTier) {
  const options = tiers.map(tier => {
    const selected = tier.id === selectedTier.id ? ' selected' : '';
    const desc = tier.id === 'deep'
      ? 'Recommended — best balance'
      : 'Most thorough, heavier';
    return `<option value="${tier.id}"${selected}>${tier.label} (${tier.modelId.split('-')[0]}-${tier.sizeGB}B) — ${desc}</option>`;
  }).join('');

  containerEl.innerHTML = `
    <div class="max-w-2xl mx-auto text-center">
      <p class="text-gray-400 text-sm mb-4">
        Choose model (default: <span class="text-amber-400">Deep Dive — Qwen2-1.5B</span>):
      </p>
      <select id="modelSelect" class="bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-gray-200 text-sm focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/30 w-full max-w-md mx-auto">
        ${options}
      </select>
      <p class="text-gray-600 text-xs mt-3">Models are cached after first download. Press <kbd class="bg-gray-800 px-1.5 py-0.5 rounded text-xs">Enter</kbd> or tap outside to confirm.</p>
    </div>
  `;
}

export function renderClaimChecklist(containerEl, claims) {
  if (!claims || claims.length === 0) {
    containerEl.innerHTML = `
      <div class="max-w-2xl mx-auto text-center py-8">
        <p class="text-gray-400 text-lg italic">${NO_CLAIMS_MESSAGE}</p>
      </div>
    `;
    return;
  }

  const items = claims.map((c, i) => `
    <label class="claim-item">
      <input type="checkbox" class="claim-checkbox" data-index="${i}">
      <div class="flex-1">
        <p class="text-white">${escapeHtml(c.claim)}</p>
        <p class="text-gray-500 text-xs mt-1">Search: ${escapeHtml(c.searchQuery)}</p>
      </div>
    </label>
  `).join('');

  containerEl.innerHTML = `
    <div class="max-w-2xl mx-auto" id="checklistContainer">
      <div class="flex items-center justify-between mb-4">
        <p class="text-gray-400 text-sm">
          We found <span class="text-white font-semibold">${claims.length}</span> verifiable claim${claims.length > 1 ? 's' : ''}.
          <span class="italic">Select the ones you want us to waste compute on.</span>
        </p>
        <div class="flex gap-2">
          <button id="selectAllBtn" class="text-xs text-amber-400 hover:text-amber-300 transition-colors">Select all</button>
          <span class="text-gray-600">|</span>
          <button id="deselectAllBtn" class="text-xs text-gray-500 hover:text-gray-400 transition-colors">Deselect all</button>
        </div>
      </div>
      <div class="claim-list">${items}</div>
      <div class="mt-6 text-center">
        <p id="estimateLabel" class="text-gray-500 text-sm mb-3">Select claims to sniff</p>
        <button id="sniffSelectedBtn" class="btn-primary btn-disabled" disabled>
          Sniff 0 claims
        </button>
      </div>
    </div>
  `;
}

export function renderResults(containerEl, verdicts, overallSmellRating) {
  const scoreLabel = getScoreLabel(overallSmellRating);
  const ratingColor = getRatingColor(overallSmellRating);
  const isAllClean = overallSmellRating === 0 && verdicts.length > 0;

  const cards = verdicts.map((v, i) => {
    const color = getVerdictColor(v.rating);
    const sources = (v.sources || []).map(s => `
      <a href="${escapeHtml(s.url)}" target="_blank" rel="noopener"
         class="block text-xs ${s.relevant ? 'text-amber-400' : 'text-gray-500'} hover:underline truncate">
        ${escapeHtml(s.title)}
      </a>
    `).join('');

    return `
      <div class="verdict-card ${color}">
        <div class="flex items-start justify-between mb-2">
          <p class="text-white font-medium flex-1 mr-4">${escapeHtml(v.claim)}</p>
          <span class="rating-badge ${color}">${v.rating}</span>
        </div>
        <p class="text-gray-400 text-sm mb-3">${escapeHtml(v.explanation || '')}</p>
        ${sources ? `<div class="sources-list">${sources}</div>` : ''}
      </div>
    `;
  }).join('');

  containerEl.innerHTML = `
    <div class="max-w-2xl mx-auto">
      <div class="text-center mb-8">
        <div class="inline-flex items-center gap-3 mb-3">
          <span class="text-5xl font-bold ${ratingColor}">${overallSmellRating}%</span>
          <span class="text-gray-500 text-lg">Bullshit</span>
        </div>
        <p class="text-gray-400 italic">${scoreLabel}</p>
        ${isAllClean ? `<p class="text-green-400 text-sm mt-2 italic">${ALL_CLEAN_MESSAGE}</p>` : ''}
      </div>
      <div class="verdict-list">${cards}</div>
      <div class="text-center mt-8">
        <button onclick="window.resetApp()" class="btn-secondary">
          Sniff something else
        </button>
      </div>
    </div>
  `;
}

function getScoreLabel(rating) {
  for (const label of SCORE_LABELS) {
    if (rating <= label.max) return label.text;
  }
  return SCORE_LABELS[SCORE_LABELS.length - 1].text;
}

function getRatingColor(rating) {
  if (rating <= 30) return 'text-green-400';
  if (rating <= 70) return 'text-yellow-400';
  return 'text-red-400';
}

function getVerdictColor(rating) {
  if (rating === 'Fresh') return 'verdict-clean';
  if (rating === 'Smelly') return 'verdict-smelly';
  return 'verdict-bullshit';
}

export function renderError(containerEl, heading, message) {
  containerEl.innerHTML = `
    <div class="max-w-2xl mx-auto text-center py-8">
      <p class="text-red-400 text-lg mb-2">${escapeHtml(heading)}</p>
      <p class="text-gray-400 text-sm">${escapeHtml(message)}</p>
      <button onclick="window.resetApp()" class="btn-secondary mt-4">Try again</button>
    </div>
  `;
}

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
