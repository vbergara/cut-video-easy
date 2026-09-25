const videoFileInput = document.getElementById('videoFile');
const preview = document.getElementById('preview');
const controls = document.getElementById('controls');
const startRange = document.getElementById('startRange');
const endRange = document.getElementById('endRange');
const startInput = document.getElementById('startInput');
const endInput = document.getElementById('endInput');
const durationInput = document.getElementById('durationInput');
const trimSecondsInput = document.getElementById('trimSeconds');
const trimFromStartBtn = document.getElementById('trimFromStart');
const trimFromEndBtn = document.getElementById('trimFromEnd');
const presetButtons = document.querySelectorAll('.preset');
const resolutionMode = document.getElementById('resolutionMode');
const exportBtn = document.getElementById('exportBtn');
const statusEl = document.getElementById('status');
const downloadLink = document.getElementById('downloadLink');

let sourceFile;
let sourceDuration = 0;
let selectionStart = 0;
let selectionEnd = 0;
let ffmpeg;
let ffmpegLoadingPromise;
let sourceWidth = 0;
let sourceHeight = 0;

const EPSILON = 0.01;

function setStatus(message) {
  statusEl.textContent = message;
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

function clampSelection() {
  selectionStart = Math.max(0, Math.min(selectionStart, sourceDuration));
  selectionEnd = Math.max(0, Math.min(selectionEnd, sourceDuration));

  if (selectionEnd - selectionStart < EPSILON) {
    if (selectionEnd >= sourceDuration) {
      selectionStart = Math.max(0, selectionEnd - EPSILON);
    } else {
      selectionEnd = Math.min(sourceDuration, selectionStart + EPSILON);
    }
  }
}

function syncUI() {
  clampSelection();

  startRange.max = String(sourceDuration);
  endRange.max = String(sourceDuration);

  startRange.value = String(selectionStart);
  endRange.value = String(selectionEnd);
  startInput.value = String(round2(selectionStart));
  endInput.value = String(round2(selectionEnd));
  durationInput.value = String(round2(selectionEnd - selectionStart));

  if (preview.duration) {
    preview.currentTime = selectionStart;
  }
}

function applyPreset(seconds) {
  const requested = Number(seconds);
  if (!Number.isFinite(requested) || requested <= 0 || !sourceDuration) {
    return;
  }

  let nextStart = selectionStart;
  let nextEnd = nextStart + requested;

  if (nextEnd > sourceDuration) {
    nextEnd = sourceDuration;
    nextStart = Math.max(0, nextEnd - requested);
  }

  selectionStart = nextStart;
  selectionEnd = nextEnd;
  syncUI();
}

function applyTrimFromStart(amount) {
  const seconds = Number(amount);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return;
  }

  selectionStart = Math.min(selectionEnd - EPSILON, selectionStart + seconds);
  syncUI();
}

function applyTrimFromEnd(amount) {
  const seconds = Number(amount);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return;
  }

  selectionEnd = Math.max(selectionStart + EPSILON, selectionEnd - seconds);
  syncUI();
}

function getScaleFilter(mode) {
  if (mode === '720p') {
    return 'scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2';
  }

  if (mode === '1080p') {
    return 'scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2';
  }

  return '';
}

async function ensureFFmpegLoaded() {
  if (ffmpeg) {
    return ffmpeg;
  }

  if (!ffmpegLoadingPromise) {
    const { FFmpeg } = window.FFmpeg;
    ffmpeg = new FFmpeg();
    ffmpegLoadingPromise = ffmpeg.load({
      coreURL: 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.js',
      wasmURL: 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.wasm'
    });
  }

  await ffmpegLoadingPromise;
  return ffmpeg;
}

videoFileInput.addEventListener('change', () => {
  const file = videoFileInput.files?.[0];
  if (!file) {
    return;
  }

  sourceFile = file;
  preview.src = URL.createObjectURL(file);
  preview.load();
  downloadLink.hidden = true;
  setStatus('Loaded video. Reading metadata…');
});

preview.addEventListener('loadedmetadata', () => {
  sourceDuration = Number.isFinite(preview.duration) ? preview.duration : 0;
  sourceWidth = preview.videoWidth;
  sourceHeight = preview.videoHeight;

  selectionStart = 0;
  selectionEnd = sourceDuration;

  controls.hidden = false;
  syncUI();

  setStatus(
    `Video ready (${round2(sourceDuration)}s, ${sourceWidth}×${sourceHeight}). Use sliders, trims and presets to compound edits.`
  );
});

startRange.addEventListener('input', () => {
  selectionStart = Number(startRange.value);
  if (selectionStart >= selectionEnd) {
    selectionEnd = Math.min(sourceDuration, selectionStart + EPSILON);
  }
  syncUI();
});

endRange.addEventListener('input', () => {
  selectionEnd = Number(endRange.value);
  if (selectionEnd <= selectionStart) {
    selectionStart = Math.max(0, selectionEnd - EPSILON);
  }
  syncUI();
});

startInput.addEventListener('change', () => {
  selectionStart = Number(startInput.value);
  syncUI();
});

endInput.addEventListener('change', () => {
  selectionEnd = Number(endInput.value);
  syncUI();
});

trimFromStartBtn.addEventListener('click', () => {
  applyTrimFromStart(trimSecondsInput.value);
});

trimFromEndBtn.addEventListener('click', () => {
  applyTrimFromEnd(trimSecondsInput.value);
});

presetButtons.forEach((button) => {
  button.addEventListener('click', () => {
    applyPreset(button.dataset.seconds);
  });
});

exportBtn.addEventListener('click', async () => {
  if (!sourceFile || sourceDuration <= 0) {
    setStatus('Load a video first.');
    return;
  }

  exportBtn.disabled = true;
  setStatus('Preparing ffmpeg… This may take a moment the first time.');

  try {
    const ffmpegInstance = await ensureFFmpegLoaded();
    const { fetchFile } = window.FFmpegUtil;

    const inputName = `input-${Date.now()}-${sourceFile.name}`;
    const outputName = `trimmed-${Date.now()}.mp4`;

    await ffmpegInstance.writeFile(inputName, await fetchFile(sourceFile));

    const trimStart = String(round2(selectionStart));
    const trimEnd = String(round2(selectionEnd));

    const args = ['-ss', trimStart, '-to', trimEnd, '-i', inputName];

    const filter = getScaleFilter(resolutionMode.value);
    if (filter) {
      args.push('-vf', filter);
    }

    args.push('-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-c:a', 'aac', '-movflags', '+faststart', outputName);

    setStatus('Export in progress…');
    await ffmpegInstance.exec(args);

    const fileData = await ffmpegInstance.readFile(outputName);
    const blob = new Blob([fileData.buffer], { type: 'video/mp4' });
    const url = URL.createObjectURL(blob);

    downloadLink.href = url;
    downloadLink.download = outputName;
    downloadLink.textContent = `Download ${outputName}`;
    downloadLink.hidden = false;

    await ffmpegInstance.deleteFile(inputName);
    await ffmpegInstance.deleteFile(outputName);

    setStatus('Export completed. Download your trimmed video.');
  } catch (error) {
    console.error(error);
    setStatus('Export failed. Try a shorter clip or a different input format.');
  } finally {
    exportBtn.disabled = false;
  }
});
