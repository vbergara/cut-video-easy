# Cut Video Easy

A private, client-side video trimmer. Open `index.html` in a modern browser; no build, account, upload, or backend is required. All scripts, styles, thumbnails, and video processing run locally, with no external dependencies or network requests.

## Editing a clip

1. **Load video** or drop a video into the preview.
2. Choose a **5s, 10s, or 15s** clip length, or enter any custom length.
3. **Drag the middle** of the highlighted timeline selection to move it while keeping its length. Video frames help locate the moment.
4. Choose a trim amount (**5, 10, 15 seconds, or a custom value**) and remove it **from the beginning or end** of the current selection.
5. **Drag either edge** to resize freely, or enter precise start/end times.
6. **Preview clip**, then **Export clip** and download the WebM file.

The **15s length preset selects 14.9 seconds**. Trimming 5 seconds from it leaves 9.9 seconds. Moving the selection preserves this exact length; manually resizing it can make it longer. Export measures the encoded file before offering a download and rejects output at or above 15 seconds when the requested selection was under 15 seconds. This is a browser duration check, not a guarantee about every external service's rounding rules.

Use **Undo** to reverse an edit, or **Reset selection** to select the whole video. Focus the selection or either handle and use arrow keys for 0.1-second adjustments, Shift + arrow for 1-second adjustments, or Home/End to reach a boundary. Trims that would remove the entire selection are disabled. The minimum clip length is 0.1 seconds (or the whole source if shorter).

## Export

- Uses native Canvas, Web Audio, and MediaRecorder APIs; exports WebM with source audio.
- Original resolution, 1280 × 720, or 1920 × 1080. Fit modes preserve aspect ratio with black padding.
- Records in real time: keep the tab visible. Switching away cancels recording to avoid a background-throttled export. A cancel button is also available.
- Browser recording re-encodes video and is not frame-accurate or lossless. Actual output duration is checked and displayed before download.
- Input format support depends on your browser. Chrome and Edge are the primary tested targets. MP4 export is not currently provided.

## Validation

Run selection boundary and workflow tests with Node:

```sh
node --test tests/trim.test.cjs
```

The browser integration test needs Playwright and installed Chrome:

```sh
node tests/browser.cjs
```

If Playwright is installed outside this project, set `PLAYWRIGHT_MODULE` to its module path. The test starts a temporary local static server, creates a real video with audio, exercises dragging/resizing/presets/trimming/undo/keyboard controls, checks export duration and audible audio, tests repeat export/cancellation, and checks mobile layout. It saves screenshots under `tests/` (ignored by Git). No server is needed to use the app.
