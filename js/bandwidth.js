export async function measureBandwidth() {
  const testUrl = 'https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.83/package.json';
  const testSize = 5000;
  const samples = 2;
  let totalBps = 0;
  let successCount = 0;

  for (let i = 0; i < samples; i++) {
    try {
      const start = performance.now();
      const resp = await fetch(testUrl + '?t=' + Date.now(), { cache: 'no-store' });
      const data = await resp.arrayBuffer();
      const end = performance.now();
      const duration = (end - start) / 1000;
      const bytes = data.byteLength || testSize;
      const bps = (bytes * 8) / duration;
      totalBps += bps;
      successCount++;
    } catch {
      continue;
    }
  }

  if (successCount === 0) {
    return null;
  }

  return totalBps / successCount;
}

export function formatTime(seconds) {
  if (seconds < 60) {
    return `${Math.round(seconds)} seconds`;
  }
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  if (secs === 0) return `${mins} minute${mins > 1 ? 's' : ''}`;
  return `${mins} minute${mins > 1 ? 's' : ''} ${secs} second${secs > 1 ? 's' : ''}`;
}

export function estimateDownloadTime(sizeGB, bandwidthBps) {
  if (!bandwidthBps) return null;
  const sizeBits = sizeGB * 8 * 1024 * 1024 * 1024;
  return sizeBits / bandwidthBps;
}
