// Terminalol (0.1.6): the terminal pane's lines for a draft, a game and no game, from recorded states.
import { describe, expect, it } from 'vitest';
import { adapt } from '../src/data/streamcv/adapter.ts';
import { STRINGS } from '../src/i18n/index.ts';
import { BAR_STRINGS } from '../src/i18n/bar.ts';
import { DEFAULTS } from '../src/settings/schema.ts';
import { hpBar, terminalView, type TermCtx } from '../src/ui/terminal-view.ts';
import type { Team } from '../src/model/types.ts';
import game from '../fixtures/streamcv/state_v05_kc_mvk_g2.json' with { type: 'json' };
import waiting from '../fixtures/streamcv/state_v04_kc_mvk_g2_waiting.json' with { type: 'json' };

// The recording ends at the finished game; as in the app's --demo, it is treated as a game in progress.
const live = () => ({ ...adapt(game), status: 'in_game' as const });
const ctx = (s: ReturnType<typeof adapt>, over: Partial<TermCtx> = {}): TermCtx => ({
  s, clock: s.clock, log: [], opts: { ...DEFAULTS.term }, code: (t: Team) => s.series?.teams[t].code ?? t,
  starters: (code) => (code === 'KC' ? ['Canna', 'Yike', 'kyeahoo', 'Caliste', 'Busio'] : []), idleText: 'next match',
  S: STRINGS.en, B: BAR_STRINGS.en, ...over,
});

describe('Terminalol', () => {
  it('in a game: the players with level, K/D/A and health, towers, a status line; wide', () => {
    const s = live();
    const v = terminalView(ctx(s));
    expect(v.wide).toBe(true);
    expect(v.html).toContain('TEAM');
    expect(v.html).toContain('Galio');
    expect(v.html).toContain('>CS<');
    expect(v.html).toContain('>GOLD<');
    expect(v.html).toMatch(/[#-]{10}\s+\d+%/);
    expect(v.html).toContain('tower');
    expect(v.html).not.toContain('>ban<');
    // prompt, header, ten players, two tower lines, status
    expect(v.lines).toBe(15);
  });

  it('the draft kept during the game adds the bans; Chinese names on request', () => {
    const s = live();
    const v = terminalView(ctx(s, { opts: { ...DEFAULTS.term, draftInGame: true, zh: true }, S: STRINGS['zh-Hant'], B: BAR_STRINGS['zh-Hant'] }));
    expect(v.html).toContain('>ban<');
    expect(v.html).toContain('加里歐');
  });

  it('during the draft: the roster\'s names beside the picks, then the bans', () => {
    const s = adapt(waiting);
    expect(s.status).toBe('waiting');
    const v = terminalView(ctx(s));
    expect(v.html).toContain('Canna');
    expect(v.html).toContain('>ban<');
    expect(v.html).not.toContain('K/ D/ A');
  });

  it('no game: small, the status line from the bar', () => {
    const s = { ...adapt(game), status: 'idle' as const };
    const v = terminalView(ctx(s));
    expect(v.wide).toBe(false);
    expect(v.html).toContain('next match');
    expect(v.lines).toBe(6);
  });

  it('a health bar in ten characters', () => {
    const p = { role: null, name: 'x', champion: null, level: 1, kills: 0, deaths: 0, assists: 0, cs: 0, gold: 0, hp: 500, maxHp: 1000, items: null };
    expect(hpBar(p)).toBe('#####-----  50%');
    expect(hpBar({ ...p, hp: 0 })).toBe('----------   0%');
  });
});
