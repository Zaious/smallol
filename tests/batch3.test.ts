import { describe, expect, it } from 'vitest';
import { BAR_STRINGS, macKeys } from '../src/i18n/bar.ts';
import { STRINGS } from '../src/i18n/index.ts';
import { DEFAULTS, normalize, watchUrlProblem } from '../src/settings/schema.ts';
import { settingsView } from '../src/ui/settings-view.ts';

const B = BAR_STRINGS['zh-Hant'];
const S = STRINGS['zh-Hant'];

describe('stream address (batch 3 §4)', () => {
  it('only http and https, no credentials, at most 2048 characters; empty is fine (no button)', () => {
    expect(watchUrlProblem('https://www.twitch.tv/riotgames')).toBeNull();
    expect(watchUrlProblem('http://example.com/live')).toBeNull();
    expect(watchUrlProblem('')).toBeNull();
    expect(watchUrlProblem('ftp://example.com/')).toBe('scheme');
    expect(watchUrlProblem('javascript:alert(1)')).toBe('scheme');
    expect(watchUrlProblem('file:///C:/x.html')).toBe('scheme');
    expect(watchUrlProblem('https://user:pass@example.com/')).toBe('credentials');
    expect(watchUrlProblem(`https://example.com/${'a'.repeat(2048)}`)).toBe('long');
    expect(watchUrlProblem('not a url')).toBe('bad');
  });

  it('a saved file with a bad address reads back as none', () => {
    expect(normalize({ watchUrl: 'javascript:alert(1)' }).watchUrl).toBe('');
    expect(normalize({ watchUrl: 'https://youtube.com/@lolesports' }).watchUrl).toBe('https://youtube.com/@lolesports');
  });

  it('the settings tab says why an address was refused', () => {
    expect(settingsView(DEFAULTS, S, B, false, { lowNow: false, hotkeyBusy: [], watchError: 'credentials' })).toContain(B.b3.watchBad.credentials);
  });
});

describe('hotkeys and low-key in the settings tab (batch 3 §1–2)', () => {
  it('a hotkey another program holds is named; none held, no note', () => {
    // The labels as this machine writes them (⌃⌥⇧ on a Mac, where the release's macOS job runs the tests).
    const busy = settingsView(DEFAULTS, S, B, false, { lowNow: false, hotkeyBusy: [macKeys('Ctrl+Alt+Shift+H')], watchError: null });
    // Beside the taken one only, in the accent colour.
    expect(busy).toContain(`${macKeys(B.b3.hotkeyHide)} <span class="busy">${B.b3.hotkeyTaken}</span>`);
    expect(busy).not.toContain(`${macKeys(B.b3.hotkeyLow)} <span class="busy">`);
    expect(settingsView(DEFAULTS, S, B, false, { lowNow: false, hotkeyBusy: [], watchError: null })).not.toContain('class="busy"');
  });

  it('the low-key box shows low-key now, whichever way it came on', () => {
    expect(settingsView(DEFAULTS, S, B, false, { lowNow: true, hotkeyBusy: [], watchError: null })).toMatch(/data-toggle="lowKey" checked/);
    expect(settingsView(DEFAULTS, S, B, false, { lowNow: false, hotkeyBusy: [], watchError: null })).not.toMatch(/data-toggle="lowKey" checked/);
  });

  it('new settings read back with defaults: hotkeys and detection on, sound off, low-key off', () => {
    const n = normalize({});
    expect([n.hotkeys, n.autoLowKey, n.cardSound, n.lowKey, n.soundVolume]).toEqual([true, true, false, false, 'mid']);
    expect(normalize({ soundVolume: 'loud' }).soundVolume).toBe('mid');
  });
});

describe('official feed down (2026-10-19)', () => {
  it('the service saying the feed is missing reaches the state; otherwise it is not set', async () => {
    const { adapt } = await import('../src/data/streamcv/adapter.ts');
    expect(adapt({ status: 'waiting', feed: 'missing' }).feedMissing).toBe(true);
    expect(adapt({ status: 'waiting' }).feedMissing).toBeUndefined();
  });
});

describe('the score as the broadcast shows it (2026-10-19)', () => {
  it('team kills are the players\' kills, not the feed total that also counts executions', async () => {
    const { adapt } = await import('../src/data/streamcv/adapter.ts');
    const p = (kills: number, deaths: number, role: string) => ({ name: 'X', role, kills, deaths, assists: 0, level: 9 });
    const roles = ['top', 'jungle', 'mid', 'bot', 'support'];
    const s = adapt({
      status: 'in_game', kills: { B: 6, R: 2 },
      players: { B: [4, 2, 0, 0, 0].map((k, i) => p(k, i === 1 || i === 2 ? 1 : 0, roles[i]!)), R: [0, 0, 1, 0, 0].map((k, i) => p(k, 1, roles[i]!)) },
    });
    expect([s.teams.B.kills, s.teams.R.kills]).toEqual([6, 1]);
    // No players: the feed's totals stay.
    expect(adapt({ status: 'in_game', kills: { B: 6, R: 2 } }).teams.R.kills).toBe(2);
  });
});

describe('the clock only moves on (2026-10-19)', () => {
  it('a snapshot repeating an earlier time keeps the ticked clock; a later one is taken; a big step back is taken', async () => {
    const { steadyClock } = await import('../src/model/clock.ts');
    const { emptyState } = await import('../src/data/streamcv/adapter.ts');
    const st = (clock: number) => ({ ...emptyState('in_game'), gameId: 'g', clock });
    // Shown 16 at t=0, ticked to 21 by t=5 s; the feed still says 16: keep 21.
    expect(steadyClock(st(16), 0, st(16), 5000)).toBe(21);
    // The feed moves to 27: take it.
    expect(steadyClock(st(16), 0, st(27), 5000)).toBe(27);
    // 40 s back (a pause, a restart): take it.
    expect(steadyClock(st(100), 0, st(60), 5000)).toBe(60);
    // Another game: take it.
    expect(steadyClock({ ...st(900), gameId: 'h' }, 0, st(10), 5000)).toBe(10);
  });
});
