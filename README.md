# Repo Visualizer

> A cinematic timeline of your codebase. Watch a repository grow from its first
> commit to its latest state — every feature blooming into existence, every
> import knitting the architecture together, every commit a pulse of light
> rippling through the system.

**Live demo** [repovisualizer.netlify.app](https://repovisualizer.netlify.app/) ships the bundled demo dataset only.

[![Netlify Status](https://api.netlify.com/api/v1/badges/ed135e10-b4bd-4683-ae2a-8d3e46ff95ac/deploy-status)](https://app.netlify.com/projects/repovisualizer/deploys)

Repo Visualizer reads a git repository's full history, extracts the import
graph between files at every commit, and renders the evolving structure as
an animated force-directed network. Each top-level directory is a feature
cluster; each file is a node sized by code churn; each import is an edge.
A commit advances the timeline and triggers a ripple from every touched file.

Four visual themes are included, all switchable live:

- **Galaxy** — Deep space, glowing stars, supernova ripples. The default.
- **Organic** — Bioluminescent cells breathing in soft cyan, light particles
  flowing along filaments, sonar shockwaves on commit.
- **Neural** — Sharp neon geometry on a circuit-board grid, octagonal nodes,
  hexagonal shockwaves, data pulses traveling along Manhattan-routed wires.
- **Minimal** — Cream paper, restrained ink, hairline strokes, fine typography.
  Reads like a New York Times Upshot piece.

The timeline plays automatically, or you can scrub through history,
adjust playback speed, and **export the whole animation as a WebM video**
or **GIF** for sharing.

![Repo Visualizer - Themes](repo_visualizer_four_themes_preview.svg "Repo Visualizer Themes")

---

## Quick start

```bash
npm install
npm run dev
```

That's it. The app boots with a built-in **demo dataset** (a synthetic SaaS
codebase across ~45 commits) so you can explore all four visual themes
without configuring anything.

Visit <http://localhost:5173> and press **play**.

---

## Visualize your own repo

To replace the demo dataset with a real one, point the analyzer at any local
git repository:

```bash
npm run analyze -- /path/to/your/repo
```

This walks the entire commit history, parses imports for every changed file
in every commit, and writes the result to `public/data/history.json`. The
web app picks it up automatically — refresh the browser and you'll see
your repo's full history.

For very large repos, limit to recent commits:

```bash
npm run analyze -- /path/to/your/repo --max=300
```

Supported languages for import-graph extraction (lightweight regex parsers):

| Language | Extensions |
| --- | --- |
| JavaScript / TypeScript | `.js .jsx .ts .tsx .mjs .cjs .vue .svelte` |
| Python | `.py` |
| Go | `.go` |
| Rust | `.rs` |
| Java / Kotlin | `.java .kt` |
| Ruby | `.rb` |
| PHP | `.php` |
| CSS / SCSS | `.css .scss` |

Files in other languages still appear as nodes (sized by churn) — they just
don't contribute edges to the import graph.

Documentation paths are **skipped** (`.md`, `.mdx`, `.rst`, and similar) so the graph focuses on code evolution, not README or docs churn. The `.github` folder (workflows, issue templates, etc.) is also excluded.

### Custom exclude paths

Copy `repovisualizer.config.example.json` into the **repository you analyze** as `repovisualizer.config.json` and list paths or globs to skip:

```json
{
  "exclude": [
    "dist/**",
    "build/**",
    "**/*.test.ts",
    "**/*.generated.ts",
    "legacy/**"
  ]
}

Patterns match repo-relative paths: plain entries like `vendor` or `legacy/` match that folder prefix; `*` matches one path segment; `**` matches any depth.

The analyzer loads this automatically from the target repo root. Override the file location with:

```bash
npm run analyze -- /path/to/your/repo --config=/path/to/repovisualizer.config.json
```

---

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| `Space` | Play / pause |
| `←` / `→` | Step backward / forward one commit |
| `1` | Galaxy theme |
| `2` | Organic theme |
| `3` | Neural theme |
| `4` | Minimal theme |
| `Esc` | Clear node selection |

**Canvas:** scroll to zoom, drag to pan. Use **Auto fit** (on by default) to keep the growing graph in view while playing. Click a node to inspect its imports and commit history.

---

## Export to video

Click **Export** in the bottom-right. Choose format, frame rate, and
resolution. The app restarts the timeline and records the active canvas
directly via `MediaRecorder` (for WebM) or `gif.js` (for animated GIF).

**WebM** is the most reliable format and is supported by every modern player
including VLC, QuickTime (10.7+), and the macOS / Windows media stack. To
convert to MP4 if you need it:

```bash
ffmpeg -i repo-visualizer-timeline.webm -c:v libx264 -crf 18 output.mp4
```

**Animated GIF** export loads gif.js from CDN on demand and supports up to
600 frames. Best for short, shareable clips at 720p.

---

## How it works

1. **`scripts/analyze.mjs`** walks the git log in chronological order. For
   every commit it computes a diff summary, then for every changed file it
   parses imports (regex-based per-language). The output is a JSON document
   describing each commit as a list of `changes` with `resolvedImports`
   pointing to other paths in the repo.

2. **`src/engine/graphState.js`** maintains an incremental graph state: a
   `Map<path, node>` and a `Map<key, edge>`. Each `applyCommit` updates the
   state in place. Seeking backward replays from scratch up to the target.

3. **`src/engine/layout.js`** wraps `d3-force` with cluster forces that pull
   each node toward its top-level directory's center on a ring. The simulation
   runs continuously and warm-restarts when nodes are added.

4. **`src/visualizers/`** contains four `<canvas>`-based renderers that share
   a common `useVisualizerCore` hook for canvas setup, RAF loop, and ripple
   tracking. Each visualizer just provides a `draw(ctx, frame)` function.

5. **`src/engine/recorder.js`** records the active canvas to WebM via
   `canvas.captureStream()` + `MediaRecorder`, or to GIF via gif.js.

---

## Project structure

```
repo-visualizer/
├── scripts/
│   ├── analyze.mjs         # Git history analyzer (Node CLI)
│   └── make-demo.mjs       # Regenerate the demo dataset
├── src/
│   ├── App.jsx             # Main app shell
│   ├── main.jsx            # React entry
│   ├── styles.css          # Global styles
│   ├── components/         # Header, ControlBar, Timeline, etc.
│   ├── engine/
│   │   ├── graphState.js   # Incremental node + edge state
│   │   ├── layout.js       # d3-force simulation wrapper
│   │   ├── useTimeline.js  # Playback hook
│   │   ├── useDataset.js   # Loads history.json or demo
│   │   ├── colors.js       # Per-style color palettes
│   │   └── recorder.js     # Canvas → WebM / GIF
│   ├── visualizers/
│   │   ├── useVisualizerCore.js  # Shared canvas + RAF + ripple plumbing
│   │   ├── GalaxyVisualizer.jsx
│   │   ├── OrganicVisualizer.jsx
│   │   ├── NeuralVisualizer.jsx
│   │   └── MinimalVisualizer.jsx
│   └── data/
│       └── bundledDemo.js  # Out-of-the-box demo dataset
├── public/
│   └── data/               # history.json written here by the analyzer
├── index.html
├── vite.config.js
└── package.json
```

---

## Deployment

| Target | What runs |
| --- | --- |
| **Netlify** | Static build (`npm run build`) with the bundled demo. See `netlify.toml`. |
| **Local** | Full app: `npm run analyze -- /path/to/your/repo` then `npm run dev`. No server or in-project cloning required. |

---

## Roadmap

Shipped in this build:

- Growth visibility (nodes appear as commits advance), faster timeline seek, virtualized scrubber
- Canvas zoom/pan and auto-fit while playing
- Click-to-inspect nodes (imports + commit touches)
- Optional WebGL renderer when node count is high (Canvas fallback if unavailable)
- Branch-aware layout toggle (re-analyze repo to include parent metadata)

Still open:

- **AI feature labeling** — group commits into named features via an LLM pass

---

## License

MIT

---

## Author

Jany Martelli

- https://www.shambix.com
- info@shambix.com
- https://www.linkedin.com/in/janymartelli/

---

Check out our latest product: [Patcherly](https://patcherly.com), catch live production bugs & fix them in real time, in seconds.

**Currently in Free Private Beta!**