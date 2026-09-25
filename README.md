# cut-video-easy

A simple, local, client-side video trimmer and cutter tool.

## Features

- Load a local video and preview it in-browser
- Manually select start and end times with sliders and numeric fields
- Directional trimming using customizable seconds (for example, trim 5 seconds from beginning/end)
- Final-duration presets (5s, 10s, 15s)
- Compound adjustments: combine presets, directional trims, and manual selection
- Export trimmed output in-browser (WebM)
- Keep source resolution or force upscale to 1280x720 / 1920x1080

## Usage

1. Open `index.html` directly in a modern browser (or serve it from a local HTTP server if preferred).
2. Load a video file.
3. Adjust the clip range manually or use trim buttons/presets.
4. Choose export resolution mode.
5. Click **Export video** and download the resulting file.

## Notes

- All processing is done in the browser (no backend).
- Export uses native browser recording APIs (MediaRecorder + Canvas).
