import { describe, expect, it } from 'vitest';
import { DEFAULTS, FEATURES, normalize, validEndpoint } from '../src/settings/schema.ts';
import { SettingsStore, type SettingsBackend } from '../src/settings/store.ts';

const memory = (initial: string | null = null) => {
  const writes: string[] = [];
  let text = initial;
  const backend: SettingsBackend = {
    read: async () => text,
    write: async (t) => { await new Promise((r) => setTimeout(r, 1)); writes.push(t); text = t; },
  };
  return { backend, writes, text: () => text };
};

describe('settings schema', () => {
  it('turns every feature on and reads the public service by default', () => {
    expect(Object.keys(DEFAULTS.show)).toEqual([...FEATURES]);
    expect(Object.values(DEFAULTS.show).every(Boolean)).toBe(true);
    expect(DEFAULTS.endpoint).toBe('https://smallol-api.chroniclecore.com/state.json');
    expect(DEFAULTS.views).toEqual({ draftGame: false, draftSeries: false, players: false, schedule: false });
  });

  it('reads back exactly what it wrote', () => {
    const s = normalize({ ...DEFAULTS, language: 'en', gold: 'totals', sizes: { 'size-game': { w: 420, h: 214 } } });
    expect(normalize(JSON.parse(JSON.stringify(s)))).toEqual(s);
  });

  it('a bad value falls back on its own, without losing the rest of the file', () => {
    const s = normalize({
      language: 'klingon', background: 'clear', endpoint: 'ftp://x', gold: 'gems', tickClock: 'yes',
      show: { towers: false, kills: 'no', bogus: true },
      views: { draftGame: true, draftSeries: 'open', extra: true },
      sizes: { 'size-game': { w: 420, h: 214 }, 'size-evil': { w: 'x', h: 1 }, __proto__: { w: 1, h: 1 } },
      extra: 1,
    });
    expect(s.language).toBe('auto');
    expect(s.background).toBe('clear');
    expect(s.endpoint).toBe(DEFAULTS.endpoint);
    expect(s.gold).toBe('diff');
    expect(s.tickClock).toBe(true);
    expect(s.show.towers).toBe(false);
    expect(s.show.kills).toBe(true);
    expect('bogus' in s.show).toBe(false);
    expect(s.views).toEqual({ draftGame: true, draftSeries: false, players: false, schedule: false });
    expect(s.sizes).toEqual({ 'size-game': { w: 420, h: 214 } });
    expect('extra' in s).toBe(false);
  });

  it('accepts a later VPS address', () => {
    expect(validEndpoint('https://lol.example.com/state.json')).toBe(true);
    expect(validEndpoint('http://127.0.0.1:8787/state.json')).toBe(true);
    expect(validEndpoint('javascript:alert(1)')).toBe(false);
    expect(validEndpoint('http://a b')).toBe(false);
  });
});

describe('settings store', () => {
  it('writes the defaults on first run and keeps the last of a burst', async () => {
    const m = memory();
    const store = await SettingsStore.open(m.backend, () => DEFAULTS);
    for (const g of ['totals', 'diff', 'totals'] as const) store.update((d) => { d.gold = g; });
    await store.flushed();
    expect(JSON.parse(m.text()!).gold).toBe('totals');
  });

  it('survives a broken file with a byte-order mark', async () => {
    const store = await SettingsStore.open(memory('﻿{"language":"en"').backend, () => DEFAULTS);
    expect(store.current).toEqual(DEFAULTS);
    const ok = await SettingsStore.open(memory('﻿{"language":"en"}').backend, () => DEFAULTS);
    expect(ok.current.language).toBe('en');
  });
});

describe('the service address moved (0.1.4)', () => {
  it('the old default saved by 0.1.0-0.1.3 becomes the new default; a user\'s own address stays', () => {
    expect(normalize({ endpoint: 'https://smallol.161.97.96.65.sslip.io/state.json' }).endpoint).toBe('https://smallol-api.chroniclecore.com/state.json');
    expect(normalize({ endpoint: 'http://127.0.0.1:8787/state.json' }).endpoint).toBe('http://127.0.0.1:8787/state.json');
  });
});
