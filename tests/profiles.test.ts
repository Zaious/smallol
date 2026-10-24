import { describe, expect, it } from 'vitest';
import { adaptRoster } from '../src/data/streamcv/roster.ts';
import { adaptPlayers, adaptTeams } from '../src/data/streamcv/history.ts';
import { adapt } from '../src/data/streamcv/adapter.ts';
import { STRINGS } from '../src/i18n/index.ts';
import { BAR_STRINGS } from '../src/i18n/bar.ts';
import { DEFAULTS } from '../src/settings/schema.ts';
import { playerFile, teamFile, teamIndex, teamResults } from '../src/ui/profile-views.ts';
import type { ViewCtx } from '../src/ui/views.ts';
import teamsJson from '../fixtures/streamcv/teams.json' with { type: 'json' };
import realTeams from '../fixtures/streamcv/history_teams.json' with { type: 'json' };
import realPlayers from '../fixtures/streamcv/history_players.json' with { type: 'json' };
import day2 from '../fixtures/streamcv/state_v05_kc_mvk_g2.json' with { type: 'json' };

const roster = adaptRoster(teamsJson);
const B = BAR_STRINGS['zh-Hant'];
const live = adapt(day2);
const ctx = (over: Partial<ViewCtx> = {}): ViewCtx => ({
  s: live, clock: null, show: { ...DEFAULTS.show }, gold: 'diff', S: STRINGS['zh-Hant'], lang: 'zh-Hant', conn: 'ok', sample: false,
  schedule: null, now: Date.parse('2026-10-18T10:00:00Z'), spoilerFree: true, history: { teams: adaptTeams(realTeams), players: adaptPlayers(realPlayers) },
  pickedMatch: null, roster, ...over,
});

describe('team and player profiles', () => {
  it('reads the fields the service sends for profiles', () => {
    const canyon = roster.GEN!.players.find((p) => p.id === 'Canyon')!;
    expect(canyon).toMatchObject({ realName: 'Kim Geon-bu', debutYear: 2019, worldsAppearances: 8 });
    expect(canyon.titles).toEqual({ 世界賽: 1, MSI: 2, LCK: 6 });
    expect(roster.GEN).toMatchObject({ region: 'Korea', seed: 1 });
  });

  it('the index groups teams by league, seeds first, LCK before LPL; my team gets its own row', () => {
    const html = teamIndex(ctx(), B, 'KC', '');
    expect(html).toContain('data-input="search"');
    expect(html.indexOf('>LCK<')).toBeLessThan(html.indexOf('>LPL<'));
    expect(html).toContain(`<span class="k">${B.prof.mine}</span>`);
    const lck = html.slice(html.indexOf('>LCK<'), html.indexOf('>LPL<'));
    expect(lck.indexOf('data-team="GEN"')).toBeLessThan(lck.indexOf('data-team="T1"') === -1 ? Infinity : lck.indexOf('data-team="T1"'));
  });

  it('search finds teams by code and players by id, real name or native name', () => {
    expect(teamResults(ctx(), B, null, 'gen')).toContain('data-team="GEN"');
    expect(teamResults(ctx(), B, null, 'canyon')).toContain('data-player="GEN|Canyon"');
    expect(teamResults(ctx(), B, null, '김건부')).toContain('data-player="GEN|Canyon"');
    expect(teamResults(ctx(), B, null, 'zzzz')).toContain(B.prof.noMatch);
  });

  it('a team page: seed, how it qualified, coaches, starters then substitutes, and the star', () => {
    const html = teamFile(ctx(), B, roster.GEN!, 'GEN');
    expect(html).toContain('LCK #1');
    expect(html).toContain('LCK 2026 Season Playoffs Champion');
    expect(html).toContain(B.prof.coaches);
    expect(html).toContain('class="star on"');
    const starters = roster.GEN!.players.filter((p) => p.starter).length;
    expect(html.match(/class="mrow"/g)).toHaveLength(roster.GEN!.players.length);
    expect(starters).toBe(5);
  });

  it('a player page: titles, Worlds, and wins only when scores may show', () => {
    const canyon = roster.GEN!.players.find((p) => p.id === 'Canyon')!;
    const html = playerFile(ctx(), B, roster.GEN!, canyon);
    expect(html).toContain('Kim Geon-bu · 김건부');
    expect(html).toContain('世界賽 8 次 · 最近 2026');
    expect(html).toMatch(/世界賽冠軍<\/span><b>1<\/b>/);
    expect(html).toMatch(/聯賽冠軍<\/span><b>6<\/b>/);
    // KC Canna has recorded games: the pool shows games; wins only with scores shown.
    const canna = roster.KC!.players.find((p) => p.id === 'Canna')!;
    // Every champion with games and KDA; wins and losses only while scores may show.
    expect(playerFile(ctx(), B, roster.KC!, canna)).not.toMatch(/\d 勝 \d 負/);
    expect(playerFile(ctx(), B, roster.KC!, canna)).toContain('KDA 2.8');
    expect(playerFile(ctx({ spoilerFree: false }), B, roster.KC!, canna)).toContain('2 勝 0 負');
  });
});

describe('today\'s teams (2026-10-18 report)', () => {
  it('at 22:00, tonight\'s 02:00 match counts; this morning\'s 02:00 match does not', async () => {
    const { todayTeams } = await import('../src/ui/profile-views.ts');
    const at = (s: string) => Date.parse(s);
    const sched = { matches: [
      { start: at('2026-10-17T18:00:00Z'), teams: [{ code: 'MVK' }, { code: 'FUR' }] },
      { start: at('2026-10-18T18:00:00Z'), teams: [{ code: 'KC' }, { code: 'MVK' }] },
      { start: at('2026-10-23T17:00:00Z'), teams: [{ code: 'TBD' }, { code: 'TBD' }] },
    ] } as never;
    // 22:00 in Taiwan = 14:00 UTC.
    expect(todayTeams(sched, at('2026-10-18T14:00:00Z'))).toEqual(['KC', 'MVK']);
  });
});
