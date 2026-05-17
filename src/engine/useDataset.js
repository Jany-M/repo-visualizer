/**
 * Loads history JSON or falls back to bundled demo.
 */

import { useEffect, useState } from 'react';
import { bundledDemo } from '../data/bundledDemo.js';

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
      .then((d) => {
        if (cancelled) return;
        setDataset(d);
        setSource('analyzer');
        setError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setDataset(bundledDemo);
        setSource('demo');
        setError(err.message);
      });

    return () => { cancelled = true; };
  }, []);

  return { dataset, source, error, loading: source === 'loading' };
}
