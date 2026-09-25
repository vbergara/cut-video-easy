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
let sourceWidth = 0;
let sourceHeight = 0;
let sourceObjectUrl = '';
let exportObjectUrl = '';

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

function getTargetResolution(mode) {
  if (mode === '720p') {
    return { width: 1280, height: 720 };
  }

  if (mode === '1080p') {
    return { width: 1920, height: 1080 };
  }

  return { width: sourceWidth, height: sourceHeight };
}

function waitForEvent(target, eventName) {
  return new Promise((resolve) => {
    target.addEventListener(eventName, resolve, { once: true });
  });
}

async function seekTo(timeInSeconds) {
  if (Math.abs(preview.currentTime - timeInSeconds) < EPSILON) {
    return;
  }

  preview.currentTime = timeInSeconds;
  await waitForEvent(preview, 'seeked');
}

function clearExportLink() {
  if (exportObjectUrl) {
    URL.revokeObjectURL(exportObjectUrl);
    exportObjectUrl = '';
  }
  downloadLink.hidden = true;
  downloadLink.removeAttribute('href');
}

function clearCurrentSource() {
  sourceFile = undefined;
  sourceDuration = 0;
  selectionStart = 0;
  selectionEnd = 0;
  controls.hidden = true;

  if (sourceObjectUrl) {
    URL.revokeObjectURL(sourceObjectUrl);
    sourceObjectUrl = '';
  }

  preview.pause();
  preview.removeAttribute('src');
  preview.load();
  clearExportLink();
}

function setPreviewSource(objectUrl) {
  if (!objectUrl.startsWith('blob:')) {
    throw new Error('Unexpected preview source URL');
  }
  preview.setAttribute('src', encodeURI(objectUrl));
}

function drawToCanvas(context, canvas, video, outputWidth, outputHeight) {
  const sourceRatio = video.videoWidth / video.videoHeight;
  const outputRatio = outputWidth / outputHeight;

  let drawWidth = outputWidth;
  let drawHeight = outputHeight;
  let offsetX = 0;
  let offsetY = 0;

  if (sourceRatio > outputRatio) {
    drawHeight = outputWidth / sourceRatio;
    offsetY = (outputHeight - drawHeight) / 2;
  } else {
    drawWidth = outputHeight * sourceRatio;
    offsetX = (outputWidth - drawWidth) / 2;
  }

  context.fillStyle = '#000';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(video, offsetX, offsetY, drawWidth, drawHeight);
}

videoFileInput.addEventListener('change', () => {
  const file = videoFileInput.files?.[0];
  if (!file) {
    return;
  }

  if (!file.type.startsWith('video/')) {
    clearCurrentSource();
    setStatus('Please choose a valid video file.');
    return;
  }

  clearCurrentSource();

  sourceFile = file;
  sourceObjectUrl = URL.createObjectURL(file);
  setPreviewSource(sourceObjectUrl);
  preview.load();
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

  if (typeof MediaRecorder === 'undefined') {
    setStatus('This browser does not support in-browser recording.');
    return;
  }

  exportBtn.disabled = true;
  setStatus('Preparing export…');

  let combinedStream;
  let recorder;
  let frameTimer = null;
  let stopDrawing = false;
  let finished;

  try {
    const { width: outputWidth, height: outputHeight } = getTargetResolution(resolutionMode.value);
    const canvas = document.createElement('canvas');
    canvas.width = outputWidth;
    canvas.height = outputHeight;
    const context = canvas.getContext('2d');

    if (!context) {
      throw new Error('Canvas 2D context unavailable');
    }

    await seekTo(selectionStart);

    const previewStream = preview.captureStream();
    const canvasStream = canvas.captureStream(30);
    const audioTracks = previewStream.getAudioTracks();
    combinedStream = new MediaStream([canvasStream.getVideoTracks()[0], ...audioTracks]);

    const mimeCandidates = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
    const mimeType = mimeCandidates.find((candidate) => MediaRecorder.isTypeSupported(candidate));
    if (!mimeType) {
      throw new Error('No supported recording format found');
    }

    const chunks = [];
    recorder = new MediaRecorder(combinedStream, { mimeType });

    finished = new Promise((resolve, reject) => {
      recorder.addEventListener('stop', resolve, { once: true });
      recorder.addEventListener('error', () => reject(new Error('Recording failed')), { once: true });
    });

    const finishRecording = () => {
      if (stopDrawing) {
        return;
      }
      stopDrawing = true;
      preview.pause();
      seekTo(selectionEnd)
        .then(() => {
          drawToCanvas(context, canvas, preview, outputWidth, outputHeight);
          recorder.requestData();
          recorder.stop();
        })
        .catch(() => {
          recorder.stop();
        });
    };

    const drawFrame = () => {
      if (stopDrawing) {
        return;
      }

      drawToCanvas(context, canvas, preview, outputWidth, outputHeight);
      if (preview.currentTime + 1 / 60 >= selectionEnd || preview.ended) {
        finishRecording();
        return;
      }
      frameTimer = requestAnimationFrame(drawFrame);
    };

    recorder.addEventListener('dataavailable', (event) => {
      if (event.data.size > 0) {
        chunks.push(event.data);
      }
    });

    setStatus('Export in progress…');
    recorder.start(200);
    try {
      await preview.play();
    } catch (playError) {
      finishRecording();
      if (finished) {
        await finished;
      }
      throw playError;
    }
    frameTimer = requestAnimationFrame(drawFrame);
    await finished;

    const outputName = `trimmed-${Date.now()}.webm`;
    const blob = new Blob(chunks, { type: mimeType });

    if (exportObjectUrl) {
      URL.revokeObjectURL(exportObjectUrl);
    }
    exportObjectUrl = URL.createObjectURL(blob);

    downloadLink.href = exportObjectUrl;
    downloadLink.download = outputName;
    downloadLink.textContent = `Download ${outputName}`;
    downloadLink.hidden = false;

    setStatus('Export completed. Download your trimmed video.');
  } catch (error) {
    console.error(error);
    setStatus('Export failed. Try a shorter clip or a different input format.');
  } finally {
    if (frameTimer) {
      cancelAnimationFrame(frameTimer);
    }
    if (recorder?.state === 'recording') {
      recorder.stop();
      if (finished) {
        await finished.catch(() => {});
      }
    }
    if (combinedStream) {
      combinedStream.getTracks().forEach((track) => track.stop());
    }
    preview.pause();
    exportBtn.disabled = false;
  }
});

window.addEventListener('beforeunload', () => {
  if (sourceObjectUrl) {
    URL.revokeObjectURL(sourceObjectUrl);
  }
  if (exportObjectUrl) {
    URL.revokeObjectURL(exportObjectUrl);
  }
});
