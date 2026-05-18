/**
 * Color helpers used by all four visualizers. Cluster colors are derived
 * once from the cluster ordering and shared across styles so a feature's
 * color identity is consistent regardless of the visual theme.
 */

export function hslToRgb(h, s, l) {
  s /= 100; l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}

export function hslCss(h, s, l, a = 1) {
  return `hsla(${h}, ${s}%, ${l}%, ${a})`;
}

/** Resolve palette map entry (number legacy or { hue, variant }). */
export function paletteEntry(palette, cluster) {
  const raw = palette?.get(cluster);
  if (raw == null) return { hue: 0, variant: 0 };
  if (typeof raw === 'number') return { hue: raw, variant: 0 };
  return raw;
}

function variantShifts(variant) {
  const tier = variant % 5;
  const lightShifts = [0, 11, -9, 7, -5];
  const satShifts = [0, 14, -10, 18, -6];
  return {
    light: lightShifts[tier],
    sat: satShifts[tier],
  };
}

/**
 * Convert a cluster hue to a per-style color profile so each visualizer
 * can apply consistent identity while preserving its aesthetic.
 */
export function clusterColor(hue, style, variant = 0) {
  const { light, sat } = variantShifts(variant);
  switch (style) {
    case 'galaxy':
      return {
        core:   hslCss(hue, 95 + sat, 78 + light, 1),
        glow:   hslCss(hue, 90 + sat, 65 + light, 0.55),
        glowFar:hslCss(hue, 90 + sat, 55 + light, 0.18),
        edge:   hslCss(hue, 80 + sat, 70 + light, 0.34),
        ripple: hslCss(hue, 90 + sat, 75 + light, 0.85),
      };
    case 'organic':
      return {
        core:   hslCss(hue, 72 + sat, 58 + light, 0.88),
        glow:   hslCss(hue, 68 + sat, 46 + light, 0.28),
        glowFar:hslCss(hue, 62 + sat, 38 + light, 0.1),
        edge:   hslCss(hue, 58 + sat, 48 + light, 0.28),
        ripple: hslCss(hue, 75 + sat, 55 + light, 0.45),
      };
    case 'neural':
      return {
        core:   hslCss(hue, 100, 68 + light, 1),
        glow:   hslCss(hue, 95 + sat, 55 + light, 0.55),
        glowFar:hslCss(hue, 90 + sat, 45 + light, 0.18),
        edge:   hslCss(hue, 100, 58 + light, 0.55),
        ripple: hslCss(hue, 100, 72 + light, 0.85),
      };
    case 'minimal':
      return {
        core:   hslCss(hue, 42 + sat, 32 + light, 0.92),
        glow:   hslCss(hue, 38 + sat, 42 + light, 0.16),
        glowFar:hslCss(hue, 35 + sat, 50 + light, 0.06),
        edge:   hslCss(hue, 40 + sat, 38 + light, 0.34),
        ripple: hslCss(hue, 45 + sat, 36 + light, 0.48),
      };
    default:
      return clusterColor(hue, 'galaxy', variant);
  }
}

export function clusterColorFor(palette, cluster, style) {
  const { hue, variant } = paletteEntry(palette, cluster);
  return clusterColor(hue, style, variant);
}
