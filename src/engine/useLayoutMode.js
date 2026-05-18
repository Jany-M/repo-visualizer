import { useEffect, useState } from 'react';

export const LAYOUT_BREAKPOINTS = {
  tablet: 768,
  desktop: 1024,
};

function modeFromWidth(width) {
  if (width >= LAYOUT_BREAKPOINTS.desktop) return 'desktop';
  if (width >= LAYOUT_BREAKPOINTS.tablet) return 'tablet';
  return 'mobile';
}

/** @returns {'mobile' | 'tablet' | 'desktop'} */
export function useLayoutMode() {
  const [mode, setMode] = useState(() => modeFromWidth(
    typeof window !== 'undefined' ? window.innerWidth : LAYOUT_BREAKPOINTS.desktop,
  ));

  useEffect(() => {
    const update = () => setMode(modeFromWidth(window.innerWidth));
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  return mode;
}

export function isCompactLayout(mode) {
  return mode === 'mobile' || mode === 'tablet';
}
