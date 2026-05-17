/**
 * Canvas recorder. Captures the active visualizer canvas to a WebM stream
 * via MediaRecorder, or saves a PNG snapshot of the current frame.
 *
 * GIF export is exposed via the same API but requires the gif.js library;
 * if it's not present we fall back to WebM with a console hint.
 */

export async function startRecording({ canvas, opts, onProgress, isComplete, repo }) {
  if (opts.format === 'png') {
    return savePngSnapshot(canvas, repo);
  }

  if (opts.format === 'gif') {
    return recordGif(canvas, opts, onProgress, isComplete, repo);
  }

  return recordWebm(canvas, opts, onProgress, isComplete, repo);
}

// ---------- WebM via MediaRecorder ----------------------------------------

async function recordWebm(canvas, opts, onProgress, isComplete, repo) {
  if (typeof canvas.captureStream !== 'function') {
    throw new Error('canvas.captureStream is not supported in this browser');
  }
  const stream = canvas.captureStream(opts.fps);
  const mimeCandidates = [
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
  ];
  const mimeType = mimeCandidates.find((m) => MediaRecorder.isTypeSupported(m)) || 'video/webm';

  const recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: opts.resolution >= 1440 ? 14_000_000 : opts.resolution >= 1080 ? 9_000_000 : 5_000_000,
  });

  const chunks = [];
  recorder.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };

  await new Promise((resolve) => {
    recorder.onstart = resolve;
    recorder.start(250);
  });

  // Wait for the timeline to complete
  const start = performance.now();
  const maxMs = 5 * 60 * 1000;
  await new Promise((resolve) => {
    const check = () => {
      const elapsed = performance.now() - start;
      onProgress(Math.min(1, elapsed / (60 * 1000))); // crude progress until isComplete
      if (isComplete() || elapsed > maxMs) {
        resolve();
      } else {
        setTimeout(check, 200);
      }
    };
    check();
  });

  // Give the visualizer a beat to settle and capture the final state
  await new Promise((r) => setTimeout(r, 1500));

  await new Promise((resolve) => {
    recorder.onstop = resolve;
    recorder.stop();
    stream.getTracks().forEach((t) => t.stop());
  });

  onProgress(1);
  const blob = new Blob(chunks, { type: mimeType });
  downloadBlob(blob, `${repo || 'repo-visualizer'}-timeline.webm`);
}

// ---------- PNG snapshot ---------------------------------------------------

async function savePngSnapshot(canvas, repo) {
  const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
  downloadBlob(blob, `${repo || 'repo-visualizer'}-frame.png`);
}

// ---------- GIF (optional, requires gif.js loaded externally) -------------

async function recordGif(canvas, opts, onProgress, isComplete, repo) {
  // Try to dynamically import gif.js from CDN
  let GIF;
  try {
    // eslint-disable-next-line no-new-func
    await new Promise((resolve, reject) => {
      if (window.GIF) return resolve();
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/gif.js/0.2.0/gif.js';
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
    GIF = window.GIF;
  } catch (e) {
    console.warn('Could not load gif.js — falling back to WebM');
    return recordWebm(canvas, opts, onProgress, isComplete, repo);
  }

  const gif = new GIF({
    workers: 2,
    quality: 8,
    width: canvas.width,
    height: canvas.height,
    workerScript: 'https://cdnjs.cloudflare.com/ajax/libs/gif.js/0.2.0/gif.worker.js',
  });

  const frameInterval = 1000 / opts.fps;
  let lastFrame = 0;
  let frameCount = 0;
  const maxFrames = 600;

  const captureLoop = setInterval(() => {
    const now = performance.now();
    if (now - lastFrame >= frameInterval) {
      gif.addFrame(canvas, { copy: true, delay: frameInterval });
      lastFrame = now;
      frameCount++;
      onProgress(Math.min(0.5, frameCount / maxFrames));
    }
    if (isComplete() || frameCount >= maxFrames) {
      clearInterval(captureLoop);
      gif.on('progress', (p) => onProgress(0.5 + p * 0.5));
      gif.on('finished', (blob) => {
        onProgress(1);
        downloadBlob(blob, `${repo || 'repo-visualizer'}-timeline.gif`);
      });
      gif.render();
    }
  }, frameInterval);
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
