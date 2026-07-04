export async function measureBandwidth() {
  if (navigator.connection && navigator.connection.downlink > 0) {
    const estimatedMbps = navigator.connection.downlink;
    return estimatedMbps * 1000 * 1000;
  }

  const testUrl = 'https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.83/lib/index.js';
  try {
    const start = performance.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    const resp = await fetch(testUrl + '?t=' + Date.now(), {
      cache: 'no-store',
      signal: controller.signal
    });

    const reader = resp.body.getReader();
    let bytes = 0;
    const deadline = start + 2000;

    while (performance.now() < deadline) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
    }

    reader.cancel();
    clearTimeout(timeout);

    const duration = (performance.now() - start) / 1000;
    if (duration < 0.5 || bytes < 50000) return null;

    return (bytes * 8) / duration;
  } catch {
    return null;
  }
}

export function formatTime(seconds) {
  if (seconds < 60) {
    return `${Math.round(seconds)} seconds`;
  }
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  if (mins < 60) {
    if (secs === 0) return `${mins} minute${mins > 1 ? 's' : ''}`;
    return `${mins}m ${secs}s`;
  }
  const hours = Math.floor(mins / 60);
  const remainingMins = mins % 60;
  if (remainingMins === 0) return `${hours} hour${hours > 1 ? 's' : ''}`;
  return `${hours}h ${remainingMins}m`;
}

export function estimateDownloadTime(sizeGB, bandwidthBps) {
  if (!bandwidthBps) return null;
  const sizeBits = sizeGB * 8 * 1024 * 1024 * 1024;
  return sizeBits / bandwidthBps;
}
