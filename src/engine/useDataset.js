/**
 * Loads the repo's history JSON. Tries the analyzer-produced
 * `public/data/history.json` first; falls back to a bundled demo dataset.
 */

import { useEffect, useState } from 'react';
import { bundledDemo } from '../data/bundledDemo.js';

export function useDataset() {
  const [dataset, setDataset] = useState(null);
  const [source, setSource] = useState('loading');
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/data/history.json')
      .then((r) => {
        if (!r.ok) throw new Error('no analyzer output');
        return r.json();
      })
      .then((d) => {
        if (cancelled) return;
        setDataset(d);
        setSource('analyzer');
      })
      .catch(() => {
        if (cancelled) return;
        setDataset(bundledDemo);
        setSource('demo');
      });
    return () => { cancelled = true; };
  }, []);

  return { dataset, source, error };
}
