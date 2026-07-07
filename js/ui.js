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
import { reportToMarkdown } from './scoring.js';

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
      <button id="cancelBtn" class="btn-secondary mt-4 text-xs">Cancel</button>
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

  const cancelBtn = document.getElementById('cancelBtn');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      window.cancelVerification && window.cancelVerification();
    });
  }
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

export function renderModelLoader(containerEl, tiers, selectedTier, onSwitchModel) {
  const options = tiers.map(tier => {
    const selected = tier.id === selectedTier.id ? ' selected' : '';
    const desc = tier.id === 'deep'
      ? 'Recommended — best balance'
      : tier.id === 'quick'
      ? 'Fast but less reliable'
      : 'Most thorough, heavier';
    return `<option value="${tier.id}"${selected}>${tier.label} (${tier.modelId.split('-')[0]}-${tier.sizeGB}B) — ${desc}</option>`;
  }).join('');

  containerEl.innerHTML = `
    <div class="max-w-2xl mx-auto text-center">
      <div class="loading-container text-center py-8">
        <div class="animate-spin inline-block w-12 h-12 border-4 border-amber-400 border-t-transparent rounded-full mb-6"></div>
        <p id="loadingMessage" class="text-gray-400 text-lg italic min-h-[2rem]">Loading model...</p>
      </div>
      <p class="text-gray-500 text-sm mt-4">Model loads in the background. You can switch while it downloads.</p>
      <button id="switchModelBtn" class="text-xs text-amber-400 hover:text-amber-300 transition-colors mt-2 underline">
        Switch model
      </button>
      <div id="modelSelectContainer" class="mt-4 hidden">
        <select id="modelSelect" class="bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-gray-200 text-sm focus:outline-none focus:border-amber-500/50 w-full max-w-md mx-auto">
          ${options}
        </select>
        <p class="text-gray-600 text-xs mt-2">Press <kbd class="bg-gray-800 px-1.5 py-0.5 rounded text-xs">Enter</kbd> or tap outside to confirm.</p>
      </div>
    </div>
  `;

  const switchBtn = document.getElementById('switchModelBtn');
  const selectContainer = document.getElementById('modelSelectContainer');
  const select = document.getElementById('modelSelect');

  if (switchBtn && selectContainer) {
    switchBtn.addEventListener('click', () => {
      selectContainer.classList.remove('hidden');
      switchBtn.classList.add('hidden');
      if (select) select.focus();
    });
  }

  if (select && onSwitchModel) {
    select.addEventListener('change', () => {
      const tierId = select.value;
      const tier = tiers.find(t => t.id === tierId);
      if (tier) onSwitchModel(tier);
    });

    select.addEventListener('blur', () => {
      selectContainer.classList.add('hidden');
      const switchBtnEl = document.getElementById('switchModelBtn');
      if (switchBtnEl) switchBtnEl.classList.remove('hidden');
    });
  }
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

  const sorted = [...claims].sort((a, b) => {
    const order = { high: 0, medium: 1, low: 2 };
    return (order[a.importance] ?? 2) - (order[b.importance] ?? 2);
  });

  const items = sorted.map((c, i) => {
    const checked = c.importance !== 'low' ? ' checked' : '';
    return `
    <label class="claim-item">
      <input type="checkbox" class="claim-checkbox" data-index="${i}"${checked}>
      <div class="flex-1">
        <p class="text-white">${escapeHtml(c.claim)}</p>
        <p class="text-gray-500 text-xs mt-1">Search: ${escapeHtml(c.searchQuery)}</p>
      </div>
    </label>
  `;
  }).join('');

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

function verdictCardHTML(verdict) {
  const color = getVerdictColor(verdict.rating);
  const sources = (verdict.sources || []).map(s => `
    <a href="${escapeHtml(s.url)}" target="_blank" rel="noopener"
       class="block text-xs ${s.relevant ? 'text-amber-400' : 'text-gray-500'} hover:underline truncate">
      ${escapeHtml(s.title)}
    </a>
  `).join('');

  return `
    <div class="verdict-card ${color}">
      <div class="flex items-start justify-between mb-2">
        <p class="text-white font-medium flex-1 mr-4">${escapeHtml(verdict.claim)}</p>
        <span class="rating-badge ${color}">${verdict.rating}</span>
      </div>
      <p class="text-gray-400 text-sm mb-3">${escapeHtml(verdict.explanation || '')}</p>
      ${sources ? `<div class="sources-list">${sources}</div>` : ''}
    </div>
  `;
}

export function renderVerdictIncremental(containerEl, verdict, total) {
  let listEl = containerEl.querySelector('.verdict-list');
  
  if (!listEl) {
    containerEl.innerHTML = `
      <div class="max-w-2xl mx-auto">
        <div id="resultsHeader"></div>
        <div class="verdict-list"></div>
      </div>
    `;
    listEl = containerEl.querySelector('.verdict-list');
  }

  const card = verdictCardHTML(verdict);
  listEl.insertAdjacentHTML('beforeend', card);
}

export function renderResults(containerEl, verdicts, overallSmellRating, stoppedEarly = false, totalClaims = null) {
  const summary = {
    total: verdicts.length,
    fresh: verdicts.filter(v => v.rating === 'Fresh').length,
    smelly: verdicts.filter(v => v.rating === 'Smelly').length,
    bullshit: verdicts.filter(v => v.rating === 'Bullshit').length
  };

  const bullshitPct = summary.total > 0 ? Math.round(100 * summary.bullshit / summary.total) : 0;
  const uncheckedPct = summary.total > 0 ? Math.round(100 * summary.smelly / summary.total) : 0;

  let labelText;
  if (bullshitPct <= 10) {
    labelText = 'Suspiciously accurate. Almost too accurate...';
  } else if (bullshitPct <= 30) {
    labelText = 'Mostly fresh. A slight whiff of bullshit.';
  } else if (bullshitPct <= 60) {
    labelText = 'Something definitely smells in here.';
  } else if (bullshitPct <= 90) {
    labelText = 'Strong bullshit odor detected. Open a window.';
  } else {
    labelText = 'This text is 100% organic, free-range bullshit.';
  }

  const isAllClean = summary.fresh > 0 && summary.bullshit === 0 && summary.smelly === 0;
  const hasHighUnverified = uncheckedPct > 50 && bullshitPct < 20;
  if (hasHighUnverified && summary.total > 0) {
    labelText = "Couldn't verify much — that's not proof of bullshit, but don't trust it blindly either.";
  }

  const cards = verdicts.map(v => verdictCardHTML(v)).join('');

  const stoppedMsg = stoppedEarly && totalClaims ? `<p class="text-gray-500 text-xs mt-2">Stopped early — ${summary.total} of ${totalClaims} claims checked</p>` : '';

  containerEl.innerHTML = `
    <div class="max-w-2xl mx-auto">
      <div class="text-center mb-8">
        <div class="flex items-center justify-center gap-2 mb-3">
          <span class="text-3xl">🟢</span>
          <span class="text-xl text-white">${summary.fresh} confirmed</span>
          <span class="text-gray-600">·</span>
          <span class="text-3xl">🟡</span>
          <span class="text-xl text-white">${summary.smelly} unverified</span>
          <span class="text-gray-600">·</span>
          <span class="text-3xl">🔴</span>
          <span class="text-xl text-white">${summary.bullshit} contradicted</span>
        </div>
        <div class="w-full h-4 bg-gray-800 rounded-full overflow-hidden mb-2">
          <div class="flex h-full">
            <div class="bg-green-500" style="width: ${100 - uncheckedPct - bullshitPct}%"></div>
            <div class="bg-yellow-500" style="width: ${uncheckedPct}%"></div>
            <div class="bg-red-500" style="width: ${bullshitPct}%"></div>
          </div>
        </div>
        <p class="text-gray-400 italic">${labelText}</p>
        ${isAllClean ? `<p class="text-green-400 text-sm mt-2 italic">${ALL_CLEAN_MESSAGE}</p>` : ''}
        ${stoppedMsg}
        <button id="copyReportBtn" class="btn-secondary mt-4 text-xs">
          Copy report as Markdown
        </button>
      </div>
      <div class="verdict-list">${cards}</div>
      <div class="text-center mt-8">
        <button onclick="window.resetApp()" class="btn-secondary">
          Sniff something else
        </button>
      </div>
    </div>
  `;

  const copyBtn = document.getElementById('copyReportBtn');
  if (copyBtn) {
    copyBtn.addEventListener('click', async () => {
      const markdown = reportToMarkdown(verdicts, summary);
      await navigator.clipboard.writeText(markdown);
      copyBtn.textContent = 'Copied!';
      setTimeout(() => {
        copyBtn.textContent = 'Copy report as Markdown';
      }, 2000);
    });
  }
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

export function renderRemoteSettings(appContainer, remoteConfig) {
  const hasRemote = remoteConfig && remoteConfig.model;
  const remoteBadge = hasRemote ? `<span class="text-xs bg-amber-900/50 text-amber-300 px-2 py-1 rounded ml-2">Remote: ${escapeHtml(remoteConfig.model)} <button id="clearRemoteBtn" class="ml-1 text-red-400 hover:text-red-300">✕</button></span>` : '';

  const existingHeader = document.querySelector('header');
  if (existingHeader) {
    existingHeader.innerHTML = `
      <h1 class="text-4xl sm:text-5xl font-bold tracking-tight mb-3">
        <span class="text-amber-400">LLM</span> Bullshit Detector
      </h1>
      <p class="text-gray-500 text-lg italic max-w-lg mx-auto leading-relaxed">
        Because sometimes AI outputs smell worse than a forgotten Tupperware in the back of the fridge. ${remoteBadge}
      </p>
      <button id="remoteSettingsBtn" class="text-xs text-amber-400 hover:text-amber-300 transition-colors mt-2 underline">
        ⚙️ Use your own API key
      </button>
    `;

    document.getElementById('remoteSettingsBtn')?.addEventListener('click', () => {
      showRemoteSettingsPanel();
    });
    document.getElementById('clearRemoteBtn')?.addEventListener('click', () => {
      window.useLocalEngine && window.useLocalEngine();
      resetApp();
    });
  }
}

function showRemoteSettingsPanel() {
  const existing = document.getElementById('remoteSettingsPanel');
  if (existing) {
    existing.remove();
    return;
  }

  const panel = document.createElement('div');
  panel.id = 'remoteSettingsPanel';
  panel.className = 'max-w-2xl mx-auto bg-gray-900 border border-gray-700 rounded-lg p-4 mb-6';
  panel.innerHTML = `
    <p class="text-gray-400 text-xs mb-3">Your key is stored only in this browser and sent only to the provider you choose. In this mode your pasted text is sent to that provider.</p>
    <div class="space-y-3">
      <select id="providerSelect" class="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-gray-200 text-sm w-full">
        <option value="openrouter">OpenRouter (https://openrouter.ai/api/v1)</option>
        <option value="openai">OpenAI (https://api.openai.com/v1)</option>
        <option value="custom">Custom (enter below)</option>
      </select>
      <input id="baseUrlInput" type="text" placeholder="Base URL (for custom provider)" class="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-gray-200 text-sm w-full hidden">
      <input id="modelInput" type="text" placeholder="Model name (e.g. gpt-4o-mini)" class="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-gray-200 text-sm w-full">
      <input id="apiKeyInput" type="password" placeholder="API key" class="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-gray-200 text-sm w-full">
      <div class="flex gap-2">
        <button id="saveRemoteBtn" class="btn-primary text-xs px-4 py-2">Save</button>
        <button id="cancelRemoteBtn" class="btn-secondary text-xs px-4 py-2">Cancel</button>
      </div>
    </div>
  `;

  const header = document.querySelector('header');
  if (header) {
    header.parentNode.insertBefore(panel, header.nextSibling);
  }

  document.getElementById('providerSelect').addEventListener('change', (e) => {
    document.getElementById('baseUrlInput').classList.toggle('hidden', e.target.value !== 'custom');
  });

  document.getElementById('cancelRemoteBtn').addEventListener('click', () => {
    panel.remove();
  });

  document.getElementById('saveRemoteBtn').addEventListener('click', () => {
    const provider = document.getElementById('providerSelect').value;
    const baseUrl = provider === 'openrouter' ? 'https://openrouter.ai/api/v1' :
                    provider === 'openai' ? 'https://api.openai.com/v1' :
                    document.getElementById('baseUrlInput').value;
    const model = document.getElementById('modelInput').value;
    const apiKey = document.getElementById('apiKeyInput').value;

    if (baseUrl && model && apiKey) {
      window.configureRemote && window.configureRemote({ baseUrl, apiKey, model });
      panel.remove();
    }
  });
}
