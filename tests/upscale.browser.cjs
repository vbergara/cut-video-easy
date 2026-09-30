// Verify the dimensions of real MP4 exports in both orientations.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const assert = require('node:assert/strict');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 1100 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(pathToFileURL(path.resolve(__dirname, '..', 'index.html')).href);

    for (const [width, height] of [[640, 360], [360, 640]]) {
      const bytes = await page.evaluate(async ({ width, height }) => {
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        const context = canvas.getContext('2d');
        const draw = () => {
          context.fillStyle = '#d2f89a'; context.fillRect(0, 0, width, height);
          context.fillStyle = '#101211'; context.fillRect(width / 4, height / 4, width / 2, height / 2);
        };
        draw();
        const stream = canvas.captureStream(30);
        const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
        const chunks = [];
        recorder.ondataavailable = event => chunks.push(event.data);
        const done = new Promise(resolve => { recorder.onstop = resolve; });
        const timer = setInterval(draw, 1000 / 30);
        recorder.start();
        await new Promise(resolve => setTimeout(resolve, 1000));
        recorder.stop(); await done;
        clearInterval(timer); stream.getTracks().forEach(track => track.stop());
        return Array.from(new Uint8Array(await new Blob(chunks).arrayBuffer()));
      }, { width, height });
      await page.locator('#videoFile').setInputFiles({ name: `${width}x${height}.webm`, mimeType: 'video/webm', buffer: Buffer.from(bytes) });
      await page.waitForFunction(() => !document.querySelector('#controls').hidden);
      await page.locator('#durationInput').fill('0.5');
      await page.locator('#durationInput').press('Tab');

      for (const multiplier of [1, 2, 3, 4]) {
        const value = multiplier === 1 ? 'source' : String(multiplier);
        const label = multiplier === 1 ? 'Original' : `Upscale ${multiplier}×`;
        const expected = `${label} · ${width * multiplier} × ${height * multiplier}`;
        assert.equal(await page.locator(`#resolutionMode option[value="${value}"]`).innerText(), expected);
        await page.locator('#resolutionMode').selectOption(value);
        await page.locator('#exportBtn').click();
        await page.waitForFunction(() => !document.querySelector('#controls').disabled, null, { timeout: 20000 });
        const message = await page.locator('#status').innerText();
        assert.equal(await page.locator('#downloadLink').isVisible(), true, message);
        const actual = await page.evaluate(async () => {
          const video = document.createElement('video');
          try {
            const ready = new Promise((resolve, reject) => { video.onloadedmetadata = resolve; video.onerror = reject; });
            video.src = document.querySelector('#downloadLink').href;
            await ready;
            return [video.videoWidth, video.videoHeight];
          } finally { video.removeAttribute('src'); video.load(); }
        });
        assert.deepEqual(actual, [width * multiplier, height * multiplier]);
        console.log(`PASS ${width} × ${height} at ${multiplier}×: MP4 ${actual.join(' × ')}`);
      }
    }
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
