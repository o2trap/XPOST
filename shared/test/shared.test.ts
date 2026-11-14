import { describe, expect, it } from 'vitest';
import { PLATFORMS, isPlatform } from '../src/index';

describe('platforms', () => {
  it('lists the six platforms', () => {
    expect([...PLATFORMS]).toEqual(['tiktok', 'instagram', 'youtube', 'x', 'facebook', 'snapchat']);
  });
  it('isPlatform narrows only known names', () => {
    expect(isPlatform('x')).toBe(true);
    expect(isPlatform('myspace')).toBe(false);
    expect(isPlatform(42)).toBe(false);
  });
});
