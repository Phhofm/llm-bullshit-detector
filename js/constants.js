export const SEARCH_PROXY_URL = 'https://bullshit-detector-search-proxy.philiphofmann.workers.dev';

export const LOADING_MESSAGES = [
  'Downloading a tiny brain. It\'s not much, but it\'s honest work.',
  'Our bullshit detector is smaller than most interns\' attention spans.',
  'Loading the world\'s most skeptical language model.',
  'This model has trust issues. You\'ll like it.',
  'Teaching a model to be suspicious. It\'s a fast learner.',
  'Calibrating cynicism levels...',
  'The model is judging your input already. It\'s not impressed.',
  'Loading. Go ahead, doubt this progress bar. The model would.',
  'Downloading. Size: approximately 500 million \'I don\'t know\' parameters.',
  'This download is still faster than an LLM realizing it hallucinated.',
  'The model weighs less than a AAA game\'s day-one patch.',
  'If this takes too long, your internet is the problem, not us.',
  'Still loading. The model is already skeptical of your connection speed.'
];

export const SNIFFING_MESSAGES = [
  'Isolating confident-sounding lies...',
  'Separating facts from vibes...',
  'Checking the actual, live internet (not the cached one)...',
  'Sniffing out the hallucinations...',
  'Comparing claims against reality...',
  'Asking DuckDuckGo what it thinks...',
  'Cross-referencing with sources that actually exist...',
  'The model found something suspicious. Investigating...',
  'One of these claims smells funny. The model agrees.',
  'Compiling your bullshit report. It\'s... not great.'
];

export const NO_WEBGPU_MESSAGE =
  'Your browser doesn\'t support WebGPU, which means it can\'t run language models locally. ' +
  'This isn\'t your fault — your hardware just wasn\'t invited to the AI party. ' +
  'Try Chrome, Edge, or Firefox on a device manufactured in the last 5 years.';

export const FIREFOX_FLAG_MESSAGE =
  'Firefox hides WebGPU behind a flag, like a bouncer at an exclusive club. ' +
  'Go to about:config, search for "dom.webgpu.enabled", set it to true, and refresh. ' +
  'Or just use Chrome — it lets anyone in.';

export const FIREFOX_UNSTABLE_MESSAGE =
  'You\'re running Firefox with WebGPU enabled. It\'s experimental here and will likely crash during inference. ' +
  'Seriously, use Chrome or Edge — Firefox\'s WebGPU isn\'t production-ready yet. ' +
  'We\'ll let you try anyway, but don\'t say we didn\'t warn you.';

export const NO_GPU_ADAPTER_MESSAGE =
  'WebGPU is available in your browser, but no compatible graphics adapter was found. ' +
  'This usually means your GPU drivers are missing, outdated, or your GPU predates WebGPU support. ' +
  'Try updating your graphics drivers, or try a different device.';

export const WEBSOCKET_WEBGPU_MESSAGE =
  'Run chromium with --enable-unsafe-webgpu to switch to software rendering, or a different device.';

export const NO_CLAIMS_MESSAGE =
  'This text contains zero verifiable claims. It\'s either an opinion piece, poetry, or the most ' +
  'carefully worded corporate statement we\'ve ever seen. Either way, nothing to fact-check here.';

export const ALL_CLEAN_MESSAGE =
  'Surprisingly, everything checks out. The AI output appears to be... actually correct? ' +
  'We\'re as shocked as you are. Maybe buy a lottery ticket today.';

export const CLAIM_NOT_FOUND_EXPLANATION =
  'DuckDuckGo\'s instant answers came up empty for this one. Deploy the search proxy for real web search coverage.';

export const WEBGPU_INFO_TEXT =
  'This tool runs an AI model in your browser via WebGPU. ' +
  'Chrome or Edge on desktop recommended. Firefox users: enable dom.webgpu.enabled in about:config. ' +
  'Safari and mobile browsers not yet supported.';

export const DUCK_EVOLVED_MESSAGE =
  'DuckDuckGo changed their HTML again. The duck has evolved beyond our parser. We\'ll adapt. Eventually.';

export const SCORE_LABELS = [
  { max: 10, text: 'Suspiciously accurate. Almost too accurate...' },
  { max: 30, text: 'Mostly fresh. A slight whiff of bullshit.' },
  { max: 60, text: 'Something definitely smells in here.' },
  { max: 90, text: 'Strong bullshit odor detected. Open a window.' },
  { max: 100, text: 'This text is 100% organic, free-range bullshit.' }
];

export const MODEL_TIERS = [
  {
    id: 'deep',
    label: 'Deep Dive',
    modelId: 'Qwen2-1.5B-Instruct-q4f16_1-MLC',
    sizeGB: 1.5,
    tagline: 'Best balance of speed and accuracy. Recommended for most people.',
    loadingLine: 'A medium-sized skeptic incoming. Go grab a coffee.'
  },
  {
    id: 'autopsy',
    label: 'Full Autopsy',
    modelId: 'Phi-3-mini-4k-instruct-q4f16_1-MLC',
    sizeGB: 2.5,
    tagline: 'Most thorough and reliable reasoning. Slower and heavier on memory.',
    loadingLine: 'Loading a proper bullshit detector. This might take a bit.'
  }
];
