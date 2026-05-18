/**
 * Loads history JSON or falls back to bundled demo.
 */

import { useEffect, useState } from 'react';
import { bundledDemo } from '../data/bundledDemo.js';

function normalizeExcludeList(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(
    value
      .filter((v) => typeof v === 'string')
      .map((v) => v.trim().replace(/\\/g, '/').replace(/^\.\//, ''))
      .filter(Boolean),
  )];
}

async function loadConfigExclude() {
  try {
    const r = await fetch('/repovisualizer.config.json');
    if (!r.ok) return [];
    const data = await r.json();
    return normalizeExcludeList(data?.exclude);
  } catch {
    return [];
  }
}

async function enrichDataset(raw) {
  let exclude = normalizeExcludeList(raw?.exclude);
  if (!exclude.length) {
    exclude = await loadConfigExclude();
  }
  return { ...raw, exclude };
}

export function useDataset() {
  const [dataset, setDataset] = useState(null);
  const [source, setSource] = useState('loading');
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setSource('loading');

    fetch('/data/history.json')
      .then((r) => {
        if (!r.ok) throw new Error('no analyzer output');
        return r.json();
      })
      .then((d) => enrichDataset(d))
      .then((d) => {
        if (cancelled) return;
        setDataset(d);
        setSource('analyzer');
        setError(null);
      })
      .catch(async (err) => {
        if (cancelled) return;
        const demo = await enrichDataset(bundledDemo);
        setDataset(demo);
        setSource('demo');
        setError(err.message);
      });

    return () => { cancelled = true; };
  }, []);

  return { dataset, source, error, loading: source === 'loading' };
}
