// Run with PLAYWRIGHT_MODULE pointing to an installed Playwright module if needed.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
(async () => {
  const root = path.resolve(__dirname, '..');
  const server = http.createServer((req, res) => {
    const file = path.join(root, req.url === '/' ? 'index.html' : req.url.split('?')[0]);
    if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    fs.readFile(file, (error, data) => { if (error) { res.writeHead(404).end(); return; } res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html'); res.end(data); });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({channel: 'chrome', headless: true, args: ['--autoplay-policy=no-user-gesture-required']});
    const page = await browser.newPage({viewport: {width: 1280, height: 1100}});
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.screenshot({path: path.join(root, 'tests/empty-state.png'), fullPage: true});
    // Generate a real, changing video with an audible tone entirely in the browser.
    const bytes = await page.evaluate(async () => {
      const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 360;
      const context = canvas.getContext('2d'); const audio = new AudioContext(); await audio.resume();
      const tone = audio.createOscillator(); const gain = audio.createGain(); gain.gain.value = .15;
      const dest = audio.createMediaStreamDestination(); tone.connect(gain).connect(dest); tone.start();
      const stream = canvas.captureStream(30); stream.addTrack(dest.stream.getAudioTracks()[0]);
      const recorder = new MediaRecorder(stream, {mimeType: 'video/webm;codecs=vp8,opus'}); const chunks = [];
      recorder.ondataavailable = event => chunks.push(event.data);
      const done = new Promise(resolve => recorder.onstop = resolve);
      let frame = 0; const draw = () => { context.fillStyle = `hsl(${frame / 2}, 50%, 30%)`; context.fillRect(0, 0, 640, 360); context.fillStyle = '#d2f89a'; context.fillRect((frame * 3) % 500, 210, 140, 70); context.font = '36px sans-serif'; context.fillStyle = '#fff'; context.fillText('Find your moment', 50, 90); context.fillText((frame / 30).toFixed(1) + ' seconds', 50, 150); frame++; };
      draw(); recorder.start(100); const interval = setInterval(draw, 1000 / 30);
      await new Promise(resolve => setTimeout(resolve, 17000)); recorder.stop(); await done;
      clearInterval(interval); tone.stop(); stream.getTracks().forEach(track => track.stop()); await audio.close();
      return Array.from(new Uint8Array(await new Blob(chunks, {type: 'video/webm'}).arrayBuffer()));
    });
    await page.locator('#videoFile').setInputFiles({name: 'sample-video.webm', mimeType: 'video/webm', buffer: Buffer.from(bytes)});
    await page.waitForFunction(() => !document.querySelector('#controls').hidden, {timeout: 20000});
    await page.waitForFunction(() => document.querySelectorAll('#thumbnails img').length === 12);
    await page.locator('.preset[data-seconds="15"]').click();
    assert.equal(await page.locator('#durationInput').inputValue(), '14.90');
    const before = Number(await page.locator('#startInput').inputValue());
    const selection = await page.locator('#moveSelection').boundingBox();
    await page.mouse.move(selection.x + selection.width / 2, selection.y + 30); await page.mouse.down(); await page.mouse.move(selection.x + selection.width / 2 + 70, selection.y + 30, {steps: 5}); await page.mouse.up();
    assert.ok(Number(await page.locator('#startInput').inputValue()) > before);
    assert.equal(await page.locator('#durationInput').inputValue(), '14.90');
    await page.locator('#trimFromStart').click(); assert.equal(await page.locator('#durationInput').inputValue(), '9.90');
    const handle = await page.locator('#endHandle').boundingBox();
    await page.mouse.move(handle.x + 7, handle.y + 25); await page.mouse.down(); await page.mouse.move(handle.x - 60, handle.y + 25, {steps: 5}); await page.mouse.up();
    assert.ok(Number(await page.locator('#durationInput').inputValue()) < 9.9);
    await page.locator('#undoBtn').click(); assert.equal(await page.locator('#durationInput').inputValue(), '9.90');
    await page.locator('#endHandle').focus(); await page.keyboard.press('ArrowLeft'); assert.equal(await page.locator('#durationInput').inputValue(), '9.80');
    await page.locator('.preset[data-seconds="15"]').click();
    await page.screenshot({path: path.join(root, 'tests/editor-desktop.png'), fullPage: true});
    await page.locator('#exportBtn').click();
    await page.waitForFunction(() => !document.querySelector('#controls').disabled, {timeout: 30000});
    const message = await page.locator('#status').innerText(); console.log('15-second export:', message);
    assert.equal(await page.locator('#downloadLink').isVisible(), true, message);
    assert.match(message, /verified under 15s/);
    const output = await page.evaluate(async () => {
      const blob = await (await fetch(document.querySelector('#downloadLink').href)).blob();
      const context = new AudioContext();
      try {
        const audio = await context.decodeAudioData(await blob.arrayBuffer());
        const samples = audio.getChannelData(0);
        return {audioDuration: audio.duration, peak: samples.reduce((max, value) => Math.max(max, Math.abs(value)), 0)};
      } finally { await context.close(); }
    });
    assert.ok(output.audioDuration < 15 && output.audioDuration > 14.5, JSON.stringify(output));
    assert.ok(output.peak > .05, 'Export must preserve audible source audio');
    console.log('Encoded audio:', output);
    // Repeated export and audio graph reuse.
    await page.locator('#durationInput').fill('1.5'); await page.locator('#durationInput').press('Tab');
    await page.locator('#exportBtn').click(); await page.waitForFunction(() => !document.querySelector('#controls').disabled, {timeout: 20000});
    assert.equal(await page.locator('#downloadLink').isVisible(), true, await page.locator('#status').innerText());
    console.log('Repeated export:', await page.locator('#status').innerText());
    await page.locator('#trimSeconds').fill('0.25');
    await page.locator('#trimFromEnd').click();
    assert.equal(await page.locator('#durationInput').inputValue(), '1.25');
    await page.locator('#playSelection').click();
    await page.waitForFunction(() => document.querySelector('#preview').paused);
    const previewRange = await page.evaluate(() => ({current: document.querySelector('#preview').currentTime, end: Number(document.querySelector('#endInput').value)}));
    assert.ok(Math.abs(previewRange.current - previewRange.end) < .02);
    await page.locator('#exportBtn').click(); await page.locator('#cancelExport').click();
    await page.waitForFunction(() => !document.querySelector('#controls').disabled);
    assert.equal(await page.locator('#downloadLink').isVisible(), false);
    await page.setViewportSize({width: 390, height: 844});
    await page.screenshot({path: path.join(root, 'tests/editor-mobile.png'), fullPage: true});
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.deepEqual(errors, []);
    console.log('PASS: thumbnails, presets, drag, resize, trim, undo, keyboard, export, repeat export, cancel, mobile.');
  } finally { await browser?.close(); server.close(); }
})().catch(error => {console.error(error); process.exitCode = 1;});
