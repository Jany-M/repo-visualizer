# Repo Visualizer

> A cinematic timeline of your codebase. Watch a repository grow from its first
> commit to its latest state — every feature blooming into existence, every
> import knitting the architecture together, every commit a pulse of light
> rippling through the system.

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

## Roadmap

The current build is a working prototype focused on visual quality and the
end-to-end flow (load → animate → export). Logical next steps:

- **WebGL renderer** for repos with 5,000+ nodes (currently fine up to ~1,500).
- **Click-to-inspect** a node to see its commit history and inbound/outbound deps.
- **AI feature labeling** — group commits into named features ("auth rewrite",
  "checkout v2") via an LLM pass over commit messages and diffs.
- **Branch-aware view** — show forks and merges as the graph diverges and rejoins.
- **GitHub URL input** — paste a public repo URL and analyze it server-side.

---

## License

MIT
