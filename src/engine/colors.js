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

/**
 * Convert a cluster hue to a per-style color profile so each visualizer
 * can apply consistent identity while preserving its aesthetic.
 */
export function clusterColor(hue, style) {
  switch (style) {
    case 'galaxy':
      // Bright stars with cool/warm bias — saturated, high luminance core
      return {
        core:   hslCss(hue, 95, 78, 1),
        glow:   hslCss(hue, 90, 65, 0.55),
        glowFar:hslCss(hue, 90, 55, 0.18),
        edge:   hslCss(hue, 80, 70, 0.34),
        ripple: hslCss(hue, 90, 75, 0.85),
      };
    case 'organic':
      // Bioluminescent — cyan/green/aqua biased even off-hue
      return {
        core:   hslCss((hue * 0.4 + 160) % 360, 90, 70, 1),
        glow:   hslCss((hue * 0.4 + 160) % 360, 85, 55, 0.5),
        glowFar:hslCss((hue * 0.4 + 160) % 360, 85, 45, 0.18),
        edge:   hslCss((hue * 0.4 + 160) % 360, 70, 60, 0.42),
        ripple: hslCss((hue * 0.4 + 160) % 360, 95, 70, 0.9),
      };
    case 'neural':
      // Sharp neon — magenta/cyan binary
      const accent = (hue % 360 < 180) ? 320 : 175;
      return {
        core:   hslCss(accent, 100, 70, 1),
        glow:   hslCss(accent, 100, 60, 0.6),
        glowFar:hslCss(accent, 100, 50, 0.2),
        edge:   hslCss(accent, 100, 60, 0.6),
        ripple: hslCss(accent, 100, 75, 1),
      };
    case 'minimal':
      // Editorial — restrained ink palette
      const inks = [
        'rgba(15, 17, 22, 0.92)',
        'rgba(195, 84, 49, 0.92)',
        'rgba(40, 78, 138, 0.92)',
        'rgba(120, 89, 32, 0.92)',
        'rgba(75, 95, 70, 0.92)',
        'rgba(110, 50, 110, 0.92)',
      ];
      const idx = Math.floor((hue / 360) * inks.length) % inks.length;
      return {
        core:   inks[idx],
        glow:   inks[idx].replace('0.92', '0.18'),
        glowFar:inks[idx].replace('0.92', '0.06'),
        edge:   inks[idx].replace('0.92', '0.32'),
        ripple: inks[idx].replace('0.92', '0.5'),
      };
    default:
      return clusterColor(hue, 'galaxy');
  }
}
