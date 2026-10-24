// 0.1.3: a team's games, a player's champions, the champions tab (picks and bans this event), from the
// service's recorded history (19 Play-In games, 2026-10-15 to 10-17).
import { describe, expect, it } from 'vitest';
import { adaptRoster } from '../src/data/streamcv/roster.ts';
import { adaptPlayers, adaptTeams, championStats } from '../src/data/streamcv/history.ts';
import { adapt } from '../src/data/streamcv/adapter.ts';
import { STRINGS } from '../src/i18n/index.ts';
import { BAR_STRINGS } from '../src/i18n/bar.ts';
import { DEFAULTS } from '../src/settings/schema.ts';
import { teamFile } from '../src/ui/profile-views.ts';
import { championsView } from '../src/ui/champion-views.ts';
import type { ViewCtx } from '../src/ui/views.ts';
import teamsJson from '../fixtures/streamcv/teams.json' with { type: 'json' };
import realTeams from '../fixtures/streamcv/history_teams.json' with { type: 'json' };
import realPlayers from '../fixtures/streamcv/history_players.json' with { type: 'json' };
import day2 from '../fixtures/streamcv/state_v05_kc_mvk_g2.json' with { type: 'json' };

const roster = adaptRoster(teamsJson);
const B = BAR_STRINGS['zh-Hant'];
const teams = adaptTeams(realTeams);
const ctx = (over: Partial<ViewCtx> = {}): ViewCtx => ({
  s: adapt(day2), clock: null, show: { ...DEFAULTS.show }, gold: 'diff', S: STRINGS['zh-Hant'], lang: 'zh-Hant', conn: 'ok', sample: false,
  schedule: null, now: Date.parse('2026-10-18T10:00:00Z'), spoilerFree: true, history: { teams, players: adaptPlayers(realPlayers) },
  pickedMatch: null, roster, ...over,
});

describe('champion statistics', () => {
  it('counts each game once, though it is in both teams\' lists', () => {
    const { games, rows } = championStats(teams);
    expect(games).toBe(19);
    const noc = rows.find((r) => r.champion === 'Nocturne')!;
    expect(noc.bans).toBe(18);
    const rumble = rows.find((r) => r.champion === 'Rumble')!;
    expect(rumble.picks).toBe(5);
    expect(rumble.wins).toBeLessThanOrEqual(rumble.decided);
    expect(rows.every((r) => r.picks + r.bans <= games)).toBe(true);
  });

  it('the tab: presence first; win rates only while scores may show', () => {
    const hidden = championsView(ctx(), B, 'presence');
    expect(hidden).toContain('世界賽選禁 · 19 局');
    expect(hidden).not.toContain('data-champ-sort="win"');
    // Nocturne: picked or banned in every game of the 19 but one.
    expect(hidden.indexOf('夜曲')).toBeLessThan(hidden.indexOf('藍寶'));
    const shown = championsView(ctx({ spoilerFree: false }), B, 'win');
    expect(shown).toContain('data-champ-sort="win"');
    expect(shown).toMatch(/\d+%<i class="muted"> \d+-\d+<\/i>/);
  });

  it('with no history: says so', () => {
    expect(championsView(ctx({ history: { teams: null, players: null } }), B, 'presence')).toContain(B.rec.none);
  });
});

describe('a team\'s games', () => {
  it('newest first, opponent and side; results only while scores may show', () => {
    const hidden = teamFile(ctx(), B, roster.KC!, null);
    expect(hidden).toContain('本屆每局');
    expect(hidden).toContain('對 C9');
    expect(hidden).not.toMatch(/class="g[wl]"/);
    const shown = teamFile(ctx({ spoilerFree: false }), B, roster.KC!, null);
    expect(shown).toMatch(/class="g[wl]"/);
    // The first game (10/15 vs C9) is the last line.
    const first = shown.lastIndexOf('<details class="tgame">');
    expect(shown.slice(first)).toContain('對 C9');
    expect(shown.slice(first)).toContain('藍寶');
  });
});
