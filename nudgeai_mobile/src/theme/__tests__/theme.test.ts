import { colors, fonts, fontAssets, typography } from '..';

describe('theme tokens', () => {
  it('uses the sampled brand purple as primary', () => {
    expect(colors.primary).toBe('#C15EFF');
  });

  it('registers an asset for every font family', () => {
    for (const family of Object.values(fonts)) {
      expect(fontAssets[family]).toBeDefined();
    }
  });

  it('only references registered font families in typography', () => {
    const families = new Set<string>(Object.values(fonts));
    for (const style of Object.values(typography)) {
      expect(families.has(style.fontFamily as string)).toBe(true);
    }
  });
});
