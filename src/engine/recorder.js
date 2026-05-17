import GIF from 'gif.js/dist/gif.js';
import gifWorkerUrl from 'gif.js/dist/gif.worker.js?url';

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function waitForEvent(target, event) {
  return new Promise((resolve) => target.addEventListener(event, resolve, { once: true }));
}

function waitMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function waitUntil(check, intervalMs = 100) {
  return new Promise((resolve) => {
    const tick = () => {
      if (check()) resolve();
      else setTimeout(tick, intervalMs);
    };
    tick();
  });
}

function captureFrame(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Failed to capture frame'));
    }, 'image/png');
  });
}

/** Canvas context tuned for repeated getImageData (gif.js). */
function createReadbackContext(width, height) {
  const el = document.createElement('canvas');
  el.width = width;
  el.height = height;
  const ctx = el.getContext('2d', { willReadFrequently: true });
  return { el, ctx };
}

async function recordWebm(canvas, opts, onCaptureProgress, onEncodeProgress, onEncodingStart, shouldStop, repo) {
  const stream = canvas.captureStream(opts.fps);
  const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
    ? 'video/webm;codecs=vp9'
    : 'video/webm';
  const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8_000_000 });
  const chunks = [];

  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  recorder.start(200);

  const progressTimer = setInterval(() => onCaptureProgress?.(), 100);
  await waitUntil(() => shouldStop(), 100);
  clearInterval(progressTimer);
  onCaptureProgress?.();

  onEncodingStart?.('webm');
  onEncodeProgress?.(0.08);

  recorder.stop();
  await waitForEvent(recorder, 'stop');
  onEncodeProgress?.(0.55);

  const blob = new Blob(chunks, { type: mime });
  onEncodeProgress?.(0.92);
  downloadBlob(blob, `${repo?.name || 'repo'}-history.webm`);
  onEncodeProgress?.(1);
}

async function recordGif(canvas, opts, onCaptureProgress, onEncodeProgress, onEncodingStart, shouldStop, repo) {
  const gif = new GIF({
    workers: 2,
    quality: 10,
    width: canvas.width,
    height: canvas.height,
    workerScript: gifWorkerUrl,
  });

  const { ctx: readbackCtx } = createReadbackContext(canvas.width, canvas.height);
  const frameDelay = Math.round(1000 / opts.fps);
  const maxFrames = 300;
  let frames = 0;

  while (!shouldStop() && frames < maxFrames) {
    readbackCtx.drawImage(canvas, 0, 0);
    gif.addFrame(readbackCtx, { copy: true, delay: frameDelay });
    frames += 1;
    onCaptureProgress?.();
    await waitMs(frameDelay);
  }

  if (frames === 0) {
    throw new Error('No frames captured');
  }

  onEncodingStart?.('gif');

  return new Promise((resolve, reject) => {
    gif.on('progress', (p) => onEncodeProgress?.(p));
    gif.on('finished', (blob) => {
      onEncodeProgress?.(1);
      downloadBlob(blob, `${repo?.name || 'repo'}-history.gif`);
      resolve();
    });
    gif.on('error', reject);
    onEncodeProgress?.(0);
    gif.render();
  });
}

/**
 * Record or snapshot the stage canvas.
 * @param {() => void} [params.onCaptureProgress] - timeline capture ticks
 * @param {(n: number) => void} [params.onEncodeProgress] - 0–1 while building file
 * @param {(format: 'webm'|'gif') => void} [params.onEncodingStart] - capture finished, encode begun
 */
export async function startRecording({
  canvas,
  opts,
  onCaptureProgress,
  onEncodeProgress,
  onEncodingStart,
  shouldStop,
  repo,
}) {
  if (!canvas) throw new Error('No canvas found on stage');

  if (opts.format === 'png') {
    const blob = await captureFrame(canvas);
    downloadBlob(blob, `${repo?.name || 'repo'}-frame.png`);
    return;
  }

  if (opts.format === 'gif') {
    await recordGif(canvas, opts, onCaptureProgress, onEncodeProgress, onEncodingStart, shouldStop, repo);
    return;
  }

  await recordWebm(canvas, opts, onCaptureProgress, onEncodeProgress, onEncodingStart, shouldStop, repo);
}
