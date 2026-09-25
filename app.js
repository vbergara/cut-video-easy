const $ = id => document.getElementById(id);
const preview = $('preview');
let sourceFile, sourceUrl = '', exportUrl = '', duration = 0, start = 0, end = 0;
let generation = 0, history = [], dragging = null, clipPlayback = false, exporting = false, cancelRecording;
let audioContext, audioSource, audioDestination;
const fmt = n => n.toFixed(2);
const timestamp = n => {
  const tenths = Math.round(n * 10);
  return `${Math.floor(tenths / 600)}:${((tenths % 600) / 10).toFixed(1).padStart(4, '0')}`;
};
const status = message => { $('status').textContent = message; };
function clearDownload() {
  if (exportUrl) URL.revokeObjectURL(exportUrl);
  exportUrl = ''; $('downloadLink').hidden = true; $('downloadLink').removeAttribute('href');
}
function remember() { history.push([start, end]); if (history.length > 80) history.shift(); }
function sync() {
  $('startInput').value = fmt(start); $('endInput').value = fmt(end); $('durationInput').value = fmt(end - start);
  $('startInput').max = String(end - Math.min(Trim.MIN, duration)); $('endInput').max = String(duration); $('durationInput').max = String(duration);
  $('selectionBadge').textContent = `${fmt(end - start)}s`;
  $('selection').style.left = `${start / duration * 100}%`; $('selection').style.width = `${(end - start) / duration * 100}%`;
  $('shadeBefore').style.width = `${start / duration * 100}%`; $('shadeAfter').style.width = `${(duration - end) / duration * 100}%`;
  for (const [id, value, min, max] of [['startHandle', start, 0, end - Math.min(Trim.MIN, duration)], ['endHandle', end, start + Math.min(Trim.MIN, duration), duration], ['moveSelection', start, 0, duration - (end - start)]]) {
    const el = $(id); el.setAttribute('aria-valuemin', fmt(min)); el.setAttribute('aria-valuemax', fmt(max)); el.setAttribute('aria-valuenow', fmt(value)); el.setAttribute('aria-valuetext', `${fmt(value)} seconds`);
  }
  document.querySelectorAll('.preset').forEach(button => { const active = Math.abs(end - start - Trim.presetDuration(button.dataset.seconds)) < .005; button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active)); });
  $('undoBtn').disabled = history.length === 0;
  const amount = Number($('trimSeconds').value);
  $('trimFromStart').disabled = $('trimFromEnd').disabled = !(amount > 0 && amount <= end - start - Math.min(Trim.MIN, duration) + 1e-8);
}
function change(range, seekTime = range[0], save = true) {
  if (exporting || !duration || !range.every(Number.isFinite)) return;
  if (save && (Math.abs(start - range[0]) > 1e-8 || Math.abs(end - range[1]) > 1e-8)) remember();
  [start, end] = range; clipPlayback = false; preview.pause(); clearDownload(); sync();
  preview.currentTime = Trim.clamp(seekTime, 0, duration);
  status(`Selection: ${fmt(start)}s – ${fmt(end)}s · ${fmt(end - start)} seconds.`);
}
function waitEvent(target, name, timeout = 15000) {
  return new Promise((resolve, reject) => {
    const cleanup = () => { clearTimeout(timer); target.removeEventListener(name, done); target.removeEventListener('error', fail); };
    const done = () => { cleanup(); resolve(); }; const fail = () => { cleanup(); reject(new Error('This video could not be decoded. Try another file.')); };
    const timer = setTimeout(() => { cleanup(); reject(new Error('The video took too long to respond.')); }, timeout);
    target.addEventListener(name, done, { once: true }); target.addEventListener('error', fail, { once: true });
  });
}
async function seek(video, time) {
  if (Math.abs(video.currentTime - time) < .001 && video.readyState >= 2) return;
  const ready = waitEvent(video, 'seeked'); video.currentTime = time; await ready;
}
async function loadFile(file) {
  if (!file || exporting) return;
  if (file.type && !file.type.startsWith('video/')) { status('Choose a video file to get started.'); return; }
  const token = ++generation;
  preview.pause(); clipPlayback = false; duration = 0; history = []; clearDownload();
  $('controls').hidden = true; $('preview').hidden = true; $('emptyState').hidden = false;
  if (sourceUrl) URL.revokeObjectURL(sourceUrl);
  sourceFile = file; sourceUrl = URL.createObjectURL(file);
  status('Opening your video…');
  try {
    const metadata = waitEvent(preview, 'loadedmetadata'); preview.src = sourceUrl; preview.load(); await metadata;
    if (token !== generation) return;
    if (!Number.isFinite(preview.duration)) { await seek(preview, 1e10); await seek(preview, 0); }
    if (token !== generation) return;
    if (!Number.isFinite(preview.duration) || preview.duration <= 0) throw new Error('This file has no readable duration. Try a video with duration metadata.');
    duration = preview.duration; start = 0; end = duration;
    $('fileName').textContent = file.name; $('fileMeta').textContent = `${timestamp(duration)} · ${preview.videoWidth} × ${preview.videoHeight} · ${(file.size / 1048576).toFixed(1)} MB`;
    $('preview').hidden = false; $('emptyState').hidden = true; $('controls').hidden = false;
    $('ruler').replaceChildren(...Array.from({ length: 7 }, (_, i) => { const span = document.createElement('span'); span.textContent = timestamp(duration * i / 6); return span; }));
    sync(); status('Ready. Choose a clip length, then drag your selection to find the moment.');
    makeThumbnails(sourceUrl, duration, token);
  } catch (error) { if (token === generation) status(error.message); }
}
async function makeThumbnails(url, length, token) {
  const video = document.createElement('video'); video.muted = true; video.preload = 'auto'; video.playsInline = true;
  const canvas = document.createElement('canvas'); canvas.width = 180; canvas.height = 104;
  const ctx = canvas.getContext('2d'); $('thumbnails').replaceChildren(); $('thumbnailStatus').textContent = 'Reading frames…';
  try {
    const ready = waitEvent(video, 'loadeddata'); video.src = url; await ready;
    for (let i = 0; i < 12; i++) {
      if (token !== generation) return;
      await seek(video, Math.min(length * (i + .5) / 12, Math.max(0, length - .05)));
      if (token !== generation) return;
      const scale = Math.max(canvas.width / video.videoWidth, canvas.height / video.videoHeight);
      ctx.drawImage(video, (canvas.width - video.videoWidth * scale) / 2, (canvas.height - video.videoHeight * scale) / 2, video.videoWidth * scale, video.videoHeight * scale);
      const img = new Image(); img.alt = ''; img.src = canvas.toDataURL('image/jpeg', .65); $('thumbnails').append(img);
    }
    if (token === generation) $('thumbnailStatus').textContent = 'Click outside the selection to scrub';
  } catch { if (token === generation) $('thumbnailStatus').textContent = 'Frame previews unavailable · video preview still works'; }
  finally { video.removeAttribute('src'); video.load(); }
}
$('videoFile').addEventListener('change', event => { loadFile(event.target.files[0]); event.target.value = ''; });
for (const event of ['dragenter', 'dragover']) $('dropZone').addEventListener(event, e => { e.preventDefault(); if (!exporting) $('dropZone').classList.add('drag-over'); });
$('dropZone').addEventListener('dragleave', () => $('dropZone').classList.remove('drag-over'));
$('dropZone').addEventListener('drop', e => { e.preventDefault(); $('dropZone').classList.remove('drag-over'); loadFile(e.dataTransfer.files[0]); });
document.querySelectorAll('.preset').forEach(button => button.addEventListener('click', () => change(Trim.length(start, Trim.presetDuration(button.dataset.seconds), duration))));
function trimAmountSync() {
  document.querySelectorAll('.trim-preset').forEach(button => { const active = Number(button.dataset.seconds) === Number($('trimSeconds').value); button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active)); });
  if (duration) sync();
}
document.querySelectorAll('.trim-preset').forEach(button => button.addEventListener('click', () => { $('trimSeconds').value = button.dataset.seconds; trimAmountSync(); }));
$('trimSeconds').addEventListener('input', trimAmountSync);
for (const side of ['Start', 'End']) $('trimFrom' + side).addEventListener('click', () => { const amount = Number($('trimSeconds').value); if (amount > 0 && amount <= end - start - Math.min(Trim.MIN, duration) + 1e-8) change(side === 'Start' ? [start + amount, end] : [start, end - amount]); });
for (const side of ['start', 'end']) $(side + 'Input').addEventListener('change', e => { if (e.target.value === '' || !Number.isFinite(e.target.valueAsNumber)) { sync(); return; } const range = Trim.edge(start, end, e.target.valueAsNumber, side, duration); change(range, side === 'start' ? range[0] : range[1]); });
$('durationInput').addEventListener('change', e => { const value = e.target.valueAsNumber; if (!(value > 0)) { sync(); return; } change(Trim.length(start, value, duration)); });
$('resetBtn').addEventListener('click', () => change([0, duration]));
$('undoBtn').addEventListener('click', () => { if (history.length) { const range = history.pop(); change(range, range[0], false); } });
for (const [id, mode] of [['moveSelection', 'move'], ['startHandle', 'start'], ['endHandle', 'end']]) {
  const element = $(id);
  element.addEventListener('pointerdown', e => {
    if (exporting || e.button !== 0 || dragging) return;
    e.preventDefault(); e.stopPropagation(); element.focus();
    dragging = { mode, x: e.clientX, start, end, width: $('timeline').getBoundingClientRect().width, pointer: e.pointerId }; remember(); element.setPointerCapture(e.pointerId);
  });
  element.addEventListener('pointermove', e => {
    if (!dragging || e.pointerId !== dragging.pointer) return;
    const d = dragging; const delta = (e.clientX - d.x) / d.width * duration;
    const range = d.mode === 'move' ? Trim.move(d.start, d.end, delta, duration) : Trim.edge(d.start, d.end, (d.mode === 'start' ? d.start : d.end) + delta, d.mode, duration);
    change(range, d.mode === 'end' ? range[1] : range[0], false);
  });
  const finish = () => { dragging = null; };
  element.addEventListener('pointerup', finish); element.addEventListener('pointercancel', finish); element.addEventListener('lostpointercapture', finish);
  element.addEventListener('keydown', e => {
    if (exporting || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault(); let delta = (e.key === 'ArrowLeft' ? -1 : 1) * (e.shiftKey ? 1 : .1);
    if (e.key === 'Home') delta = -duration; if (e.key === 'End') delta = duration;
    const range = mode === 'move' ? Trim.move(start, end, delta, duration) : Trim.edge(start, end, (mode === 'start' ? start : end) + delta, mode, duration);
    change(range, mode === 'end' ? range[1] : range[0]);
  });
}
$('timeline').addEventListener('pointerdown', e => { if (exporting || !duration || e.target.closest('#selection')) return; const rect = $('timeline').getBoundingClientRect(); clipPlayback = false; preview.pause(); preview.currentTime = Trim.clamp((e.clientX - rect.left) / rect.width * duration, 0, duration); });
$('playSelection').addEventListener('click', async () => {
  if (clipPlayback && !preview.paused) { clipPlayback = false; preview.pause(); return; }
  const token = generation, expectedStart = start, expectedEnd = end;
  try {
    await seek(preview, start);
    if (exporting || token !== generation || start !== expectedStart || end !== expectedEnd) return;
    clipPlayback = true; await preview.play();
  } catch (error) { status(error.message); }
});
function playbackTick() {
  if (duration) $('playhead').style.left = `${Trim.clamp(preview.currentTime / duration, 0, 1) * 100}%`;
  if (clipPlayback && preview.currentTime >= end) { preview.pause(); clipPlayback = false; preview.currentTime = end; }
  if (!preview.paused) requestAnimationFrame(playbackTick);
}
preview.addEventListener('play', () => { $('playSelection').textContent = clipPlayback ? 'Ⅱ Pause clip' : '▶ Preview clip'; playbackTick(); });
preview.addEventListener('pause', () => { $('playSelection').textContent = '▶ Preview clip'; });
preview.addEventListener('timeupdate', () => { if (preview.paused) playbackTick(); });
preview.addEventListener('seeked', () => { if (preview.paused) playbackTick(); });
function drawFrame(context, canvas) {
  const scale = Math.min(canvas.width / preview.videoWidth, canvas.height / preview.videoHeight);
  context.fillStyle = '#000'; context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(preview, (canvas.width - preview.videoWidth * scale) / 2, (canvas.height - preview.videoHeight * scale) / 2, preview.videoWidth * scale, preview.videoHeight * scale);
}
// Measure encoded output; recording WebM can lack duration metadata until EOF is read.
async function measureOutput(blob) {
  const video = document.createElement('video'); video.muted = true; video.preload = 'auto'; const url = URL.createObjectURL(blob);
  try {
    const metadata = waitEvent(video, 'loadedmetadata'); video.src = url; await metadata;
    if (!Number.isFinite(video.duration)) await seek(video, 1e10);
    const measured = Number.isFinite(video.duration) ? video.duration : video.currentTime;
    if (!Number.isFinite(measured) || measured <= 0 || measured > 1e8) throw new Error('Could not verify the exported duration.');
    return measured;
  } finally { video.removeAttribute('src'); video.load(); URL.revokeObjectURL(url); }
}
function setBusy(busy) {
  exporting = busy; $('controls').disabled = busy; $('videoFile').disabled = busy; preview.controls = !busy;
  for (const id of ['moveSelection', 'startHandle', 'endHandle']) $(id).tabIndex = busy ? -1 : 0;
  $('cancelExport').hidden = !busy; $('exportProgress').hidden = !busy;
}
$('cancelExport').addEventListener('click', () => cancelRecording?.());
$('resolutionMode').addEventListener('change', clearDownload);
$('exportBtn').addEventListener('click', async () => {
  if (!duration || exporting) return;
  if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream || !(window.AudioContext || window.webkitAudioContext)) { status('Export is unavailable in this browser. Try a current desktop Chrome or Edge.'); return; }
  const clipStart = start, clipEnd = end, clipLength = end - start;
  let recorder, stream, timer, frame, watchdog, cancelled = false, finished;
  const previousMuted = preview.muted, previousRate = preview.playbackRate, previousVolume = preview.volume;
  setBusy(true); clearDownload(); clipPlayback = false; preview.pause(); $('exportProgress').value = 0; status('Preparing export… Keep this tab visible while it records.');
  cancelRecording = () => { cancelled = true; };
  try {
    // Keep the media element audio source for repeat exports; connect the recording destination only while exporting.
    if (!audioContext) {
      audioContext = new (window.AudioContext || window.webkitAudioContext)(); audioSource = audioContext.createMediaElementSource(preview); audioDestination = audioContext.createMediaStreamDestination();
      audioSource.connect(audioContext.destination);
    }
    await audioContext.resume(); await seek(preview, clipStart);
    if (cancelled) { status('Export cancelled.'); return; }
    const canvas = document.createElement('canvas'); const mode = $('resolutionMode').value;
    canvas.width = mode === '720p' ? 1280 : mode === '1080p' ? 1920 : preview.videoWidth;
    canvas.height = mode === '720p' ? 720 : mode === '1080p' ? 1080 : preview.videoHeight;
    const context = canvas.getContext('2d'); drawFrame(context, canvas);
    stream = canvas.captureStream(30); audioSource.connect(audioDestination);
    audioDestination.stream.getAudioTracks().forEach(track => stream.addTrack(track.clone()));
    const mimeType = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'].find(type => MediaRecorder.isTypeSupported(type));
    if (!mimeType) throw new Error('WebM export is unavailable in this browser. Try Chrome or Edge.');
    recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 8000000 });
    const chunks = [];
    recorder.addEventListener('dataavailable', e => { if (e.data.size) chunks.push(e.data); });
    finished = new Promise((resolve, reject) => { recorder.addEventListener('stop', resolve, { once: true }); recorder.addEventListener('error', () => reject(new Error('Recording failed.')), { once: true }); });
    finished.catch(() => {});
    const stop = () => { clearTimeout(timer); clearInterval(watchdog); cancelAnimationFrame(frame); preview.pause(); if (recorder.state !== 'inactive') recorder.stop(); };
    cancelRecording = () => { cancelled = true; stop(); };
    preview.playbackRate = 1; preview.muted = false; preview.volume = 1;
    recorder.start(100); timer = setTimeout(stop, clipLength * 1000);
    watchdog = setInterval(() => { if (document.hidden || preview.error) { cancelled = true; stop(); } }, 50);
    await preview.play();
    const paint = () => {
      if (recorder.state === 'inactive') return;
      drawFrame(context, canvas); $('exportProgress').value = Math.min(1, (preview.currentTime - clipStart) / clipLength);
      if (preview.currentTime >= clipEnd - 1 / 60 || preview.ended) { stop(); return; }
      frame = requestAnimationFrame(paint);
    };
    paint(); status('Exporting in real time… Keep this tab visible.'); await finished;
    if (cancelled) { status('Export cancelled. Keep this tab visible to export again.'); return; }
    status('Checking the exported duration…');
    const blob = new Blob(chunks, { type: mimeType });
    if (!blob.size) throw new Error('The browser produced an empty video. Please try again.');
    const measured = await measureOutput(blob);
    if (cancelled) { status('Export cancelled.'); return; }
    if (clipLength < 15 && measured >= 15) throw new Error('The recording reached 15 seconds. Shorten the selection slightly and export again; this file has not been offered for download.');
    if (Math.abs(measured - clipLength) > .3) throw new Error('The recording timing drifted. Keep this tab active and try exporting again.');
    exportUrl = URL.createObjectURL(blob); const link = $('downloadLink'); link.href = exportUrl; link.download = `${sourceFile.name.replace(/\.[^.]+$/, '')}-trimmed.webm`; link.hidden = false;
    link.textContent = 'Download clip ↓'; status(`Ready to download · ${fmt(measured)}s · ${(blob.size / 1048576).toFixed(1)} MB${measured < 15 ? ' · verified under 15s' : ''}.`);
  } catch (error) { status(`Export failed. ${error.message}`); }
  finally {
    clearTimeout(timer); clearInterval(watchdog); cancelAnimationFrame(frame);
    if (recorder && recorder.state !== 'inactive') { recorder.stop(); await finished?.catch(() => {}); }
    stream?.getTracks().forEach(track => track.stop());
    if (audioSource && audioDestination) { try { audioSource.disconnect(audioDestination); } catch {} }
    preview.pause(); preview.muted = previousMuted; preview.playbackRate = previousRate; preview.volume = previousVolume;
    cancelRecording = null; setBusy(false); sync();
  }
});
window.addEventListener('beforeunload', () => { if (sourceUrl) URL.revokeObjectURL(sourceUrl); if (exportUrl) URL.revokeObjectURL(exportUrl); });
