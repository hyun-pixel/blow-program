import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('./styles.css', import.meta.url), 'utf8');
const colors = Object.fromEntries(
  [...css.matchAll(/--([a-z-]+):\s*(#[0-9a-f]{6});/gi)].map(match => [match[1], match[2]]),
);
const luminance = (hex: string): number => {
  const rgb = [1, 3, 5].map(start => parseInt(hex.slice(start, start + 2), 16) / 255)
    .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return rgb[0]! * 0.2126 + rgb[1]! * 0.7152 + rgb[2]! * 0.0722;
};
const contrast = (foreground: string, background: string): number => {
  const values = [luminance(colors[foreground]!), luminance(colors[background]!)];
  return (Math.max(...values) + 0.05) / (Math.min(...values) + 0.05);
};

describe('BLOW green theme', () => {
  it('matches the approved logo and removes the previous blue accents', () => {
    expect(colors.primary).toBe('#087c3c');
    expect(css).not.toMatch(/#(?:2449c8|1939a8|1d4ed8|edf2ff)\b/i);
  });

  it('keeps normal text and primary actions readable across theme surfaces', () => {
    for (const background of ['canvas', 'canvas-shade', 'surface', 'surface-soft', 'surface-active', 'surface-mint']) {
      for (const foreground of ['text', 'text-muted', 'text-faint', 'primary']) {
        expect(contrast(foreground, background), `${foreground} on ${background}`).toBeGreaterThanOrEqual(4.5);
      }
      for (const foreground of ['focus', 'control']) {
        expect(contrast(foreground, background), `${foreground} on ${background}`).toBeGreaterThanOrEqual(3);
      }
    }
    for (const background of ['primary', 'primary-hover']) {
      expect(contrast('primary-ink', background)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('preserves error and warning colors instead of turning every state green', () => {
    expect(colors.danger).toBe('#b42318');
    expect(colors.warning).toBe('#b45309');
    expect(contrast('danger', 'danger-soft')).toBeGreaterThanOrEqual(4.5);
    expect(contrast('warning', 'warning-soft')).toBeGreaterThanOrEqual(4.5);
  });
});
