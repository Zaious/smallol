// The team and player profiles in the data window (docs/UI_SPEC_v1.md §6): an index of every team
// (playing today, my team, then by league and seed) with a search over teams and players, a team's
// page (seed, how it qualified, coaches, starters and substitutes, this event's draft habits) and a
// player's page (titles, Worlds, this event's champions). Pure: context in, HTML out. Clicks carry
// data-team="CODE", data-player="CODE|id", data-star="CODE", data-action="profile-back".

import type { BarStrings } from '../i18n/bar.ts';
import type { RosterPlayer, RosterTeam } from '../model/roster.ts';
import { findPlayer, kda, tally } from '../data/streamcv/history.ts';
import type { TeamGame } from '../model/history.ts';
import { championName } from '../data/champions.ts';
import { esc, type ViewCtx } from './views.ts';

export interface ProfileNav { team: string | null; player: string | null }

/** Leagues in a fixed order (the four big regions first), then any other. */
const LEAGUE_ORDER = ['LCK', 'LPL', 'LEC', 'LTA', 'LCP', 'CBLOL'];
const byLeague = (a: string, b: string) => (LEAGUE_ORDER.indexOf(a) + 1 || 99) - (LEAGUE_ORDER.indexOf(b) + 1 || 99) || a.localeCompare(b);

const cell = (code: string) => `<button class="tcell" data-team="${esc(code)}">${esc(code)}</button>`;

/**
 * Teams playing "today": matches from 6 hours ago to 18 hours ahead. Not the calendar day: a match at
 * 02:00 is tonight's at 22:00, and this morning's 02:00 match was last night's (2026-10-18 report:
 * at 22:00 it listed the 02:00 match already played, not the one coming).
 */
export function todayTeams(schedule: ViewCtx['schedule'], now: number): string[] {
  if (!schedule) return [];
  const from = now - 6 * 3600_000, to = now + 18 * 3600_000;
  return [...new Set(schedule.matches.filter((m) => m.start >= from && m.start <= to).flatMap((m) => m.teams.map((t) => t.code)).filter((x) => x !== 'TBD'))];
}
const today = (c: ViewCtx) => todayTeams(c.schedule, c.now);

const matches = (q: string, ...fields: (string | null)[]) => fields.some((f) => f && f.toLowerCase().includes(q));

/** The search field, then the index (or the results): the field stays while the results under it change. */
export function teamIndex(c: ViewCtx, B: BarStrings, myTeam: string | null, query: string): string {
  return `<input class="search" data-input="search" value="${esc(query)}" placeholder="${esc(B.prof.search)}" spellcheck="false"/><div class="tresults">${teamResults(c, B, myTeam, query)}</div>`;
}

/** The index, or search results when there is a query. */
export function teamResults(c: ViewCtx, B: BarStrings, myTeam: string | null, query: string): string {
  const roster = c.roster;
  if (!roster) return `<p class="none muted">${esc(c.S.ui.noHistory)}</p>`;
  const teams = Object.values(roster);
  const q = query.trim().toLowerCase();
  if (q) {
    const ts = teams.filter((t) => matches(q, t.code, t.name));
    const ps = teams.flatMap((t) => t.players.filter((p) => matches(q, p.id, p.realName, p.nativeName)).map((p) => ({ t, p })));
    const rows = [
      ts.length ? `<h4>${esc(B.prof.teams)}</h4><div class="tgrid">${ts.map((t) => cell(t.code)).join('')}</div>` : '',
      ps.length ? `<h4>${esc(B.prof.players)}</h4>${ps.slice(0, 30).map(({ t, p }) => `<button class="prow2" data-player="${esc(t.code)}|${esc(p.id)}"><b>${esc(p.id)}</b><span class="muted">${esc(t.code)}${p.realName ? ` · ${esc(p.realName)}` : ''}</span></button>`).join('')}` : '',
    ].join('');
    return rows || `<p class="none muted">${esc(B.prof.noMatch)}</p>`;
  }
  const groups: [string, string[]][] = [];
  const t0 = today(c).filter((x) => roster[x]);
  if (t0.length) groups.push([B.prof.today, t0]);
  if (myTeam && roster[myTeam]) groups.push([B.prof.mine, [myTeam]]);
  const leagues = [...new Set(teams.map((t) => t.league ?? '—'))].sort(byLeague);
  for (const l of leagues) groups.push([l, teams.filter((t) => (t.league ?? '—') === l).sort((a, b) => (a.seed ?? 99) - (b.seed ?? 99)).map((t) => t.code)]);
  return groups.map(([label, codes]) => `<div class="tgroup"><span class="k">${esc(label)}</span><div class="tgrid">${codes.map(cell).join('')}</div></div>`).join('');
}

const ROLE_KEYS = ['top', 'jungle', 'mid', 'bot', 'support'] as const;
const roleOf = (c: ViewCtx, p: RosterPlayer) => (p.role ? c.S.role[p.role] : '');

/** A team's page. */
export function teamFile(c: ViewCtx, B: BarStrings, t: RosterTeam, myTeam: string | null): string {
  const mine = myTeam === t.code;
  const head = `<div class="phead"><button class="back" data-action="profile-back">${esc(B.prof.back)}</button><b class="pcode">${esc(t.code)}</b><span class="grow"></span>`
    + `<button class="star${mine ? ' on' : ''}" data-star="${esc(t.code)}" title="${esc(mine ? B.prof.unstar : B.prof.star)}">${mine ? '★' : '☆'}</button></div>`;
  const facts = [t.name, [t.region, t.league].filter(Boolean).join(' · ')].filter(Boolean).map(esc).join('<br>');
  const tags = [t.seedLabel ? `<span class="tagx">${esc(t.seedLabel)}</span>` : '', t.startStage ? `<span class="muted">${esc(t.startStage)}</span>` : ''].join('');
  const path = t.qualificationPath ? `<p class="qual">${esc(t.qualificationPath)}</p>` : '';
  const coaches = t.coaches.length ? `<div class="coach"><span class="k">${esc(B.prof.coaches)}</span>${t.coaches.map((x) => `${esc(x.id)}${x.role ? ` · ${esc(x.role)}` : ''}${x.nationality ? ` · ${esc(x.nationality)}` : ''}`).join('<br>')}</div>` : '';
  const order = (p: RosterPlayer) => (p.role ? ROLE_KEYS.indexOf(p.role as (typeof ROLE_KEYS)[number]) : 9);
  const players = [...t.players].sort((a, b) => Number(b.starter) - Number(a.starter) || order(a) - order(b));
  const rows = players.map((p) => `<button class="mrow" data-player="${esc(t.code)}|${esc(p.id)}"><span class="k">${p.starter ? esc(roleOf(c, p)) : esc(B.prof.sub)}</span><b>${esc(p.id)}</b>`
    + `<span class="muted">${[p.nationality, p.age === null ? null : c.S.age(p.age)].filter(Boolean).map((x) => esc(String(x))).join(' · ')}</span></button>`).join('');
  const games = c.history.teams?.[t.code] ?? [];
  const chips = (what: 'bans' | 'picks') => tally(games, what).map(([id, n]) => `<span class="tchip">${esc(championName(id, c.lang))}<i>×${n}</i></span>`).join('');
  const bp = games.length
    ? `<details class="bp"><summary>${esc(B.prof.bp)} · ${esc(c.S.eventGames(games.length))}</summary><div class="tl"><span class="k">${esc(c.S.ui.tendBans)}</span>${chips('bans')}</div><div class="tl"><span class="k">${esc(c.S.ui.tendPicks)}</span>${chips('picks')}</div></details>`
    : '';
  return `${head}<div class="pfacts">${facts}</div><div class="ptags">${tags}</div>${path}${coaches}<div class="roster">${rows}</div>${bp}${teamGames(c, B, games)}`;
}

const day = (t: number, lang: ViewCtx['lang']) => new Date(t).toLocaleDateString(lang === 'zh-Hant' ? 'zh-TW' : 'en-GB', { month: 'numeric', day: 'numeric' });
const stageName = (c: ViewCtx, s: string) => (c.S.stage as Record<string, string>)[s] ?? s;

/**
 * The team's games this event, newest first: one line per game (day, stage, opponent, side, result),
 * opening to its five picks (role, player, champion) and its bans. Results are spoilers: shown only
 * while scores are shown, like the player's champions.
 */
function teamGames(c: ViewCtx, B: BarStrings, games: TeamGame[]): string {
  if (!games.length) return '';
  const winsShown = !c.spoilerFree;
  const rows = [...games].reverse().map((g) => {
    const res = winsShown && g.win !== null ? `<b class="${g.win ? 'gw' : 'gl'}">${esc(g.win ? B.rec.win : B.rec.loss)}</b>` : '';
    const sum = `<span class="mono muted">${esc(day(g.start, c.lang))}</span><span class="muted">${esc(stageName(c, g.stage))}${g.game ? ` G${g.game}` : ''}</span>`
      + `<b>${esc(B.rec.vs(g.opponent ?? '?'))}</b>${g.side ? `<span class="sd ${g.side}">${esc(B.rec.side[g.side])}</span>` : ''}<span class="grow"></span>${res}`;
    const picks = g.picks.map((p) => `<div class="gpick"><span class="k">${esc(p.role ? c.S.role[p.role] : '')}</span><span>${esc(p.player.replace(/^\S+\s/, ''))}</span><b>${esc(p.champion ? championName(p.champion, c.lang) : '?')}</b></div>`).join('');
    const bans = g.bans.some(Boolean) ? `<div class="gbans"><span class="k">${esc(B.rec.bans)}</span>${g.bans.map((b) => `<span class="tchip">${esc(b ? championName(b, c.lang) : '?')}</span>`).join('')}</div>` : '';
    return `<details class="tgame"><summary>${sum}</summary>${picks}${bans}</details>`;
  }).join('');
  return `<div class="poolh"><span class="k">${esc(B.rec.games)}</span><span class="grow"></span><button class="mini" data-toggle-spoiler="1">${esc(winsShown ? B.prof.hideWins : B.prof.showWins)}</button></div><div class="tgames">${rows}</div>`;
}

/** A player's page. */
export function playerFile(c: ViewCtx, B: BarStrings, t: RosterTeam, p: RosterPlayer): string {
  // No bio paragraph: it repeated the names, titles and Worlds lines below (review P1); it is the id's tooltip.
  const head = `<div class="phead"><button class="back" data-action="profile-back">${esc(B.prof.back)}</button><span class="crumb muted">${esc(t.code)} ›</span><b class="pcode"${p.bio ? ` title="${esc(p.bio)}"` : ''}>${esc(p.id)}</b>`
    + `<span class="grow"></span><span class="muted">${esc(roleOf(c, p))}${roleOf(c, p) ? ' · ' : ''}${esc(p.starter ? B.prof.starter : B.prof.sub)}</span></div>`;
  const names = [p.realName, p.nativeName && p.nativeName !== p.realName ? p.nativeName : null, p.nationality, p.age === null ? null : c.S.age(p.age), p.debutYear ? B.prof.debut(p.debutYear) : null]
    .filter(Boolean).map((x) => esc(String(x))).join(' · ');
  const worlds = p.titles['世界賽'] ?? 0, msi = p.titles.MSI ?? 0;
  const leagueEntries = Object.entries(p.titles).filter(([k]) => k !== '世界賽' && k !== 'MSI');
  const league = leagueEntries.reduce((n, [, v]) => n + v, 0);
  const box = (label: string, n: number, title = '') => `<div class="tbox"${title ? ` title="${esc(title)}"` : ''}><span class="k">${esc(label)}</span><b>${n}</b></div>`;
  const boxes = `<div class="tboxes">${box(B.prof.worlds, worlds)}${box(B.prof.msi, msi)}${box(B.prof.league, league, leagueEntries.map(([k, v]) => `${k} ×${v}`).join('、'))}</div>`;
  const ys = p.worldsYears;
  const wline = p.worldsAppearances ? `<details class="wy"><summary>${esc(B.prof.worldsTimes(p.worldsAppearances, ys.length ? ys[ys.length - 1]! : null))}</summary><span class="muted">${ys.join('、')}</span></details>` : '';
  const played = p.gamesThisWorlds ? `<p class="muted">${esc(B.prof.played(p.gamesThisWorlds))}</p>` : '';
  const ph = findPlayer(c.history.players, t.code, p.id);
  const winsShown = !c.spoilerFree;
  // Every champion played this event: games, wins and losses (spoilers), KDA.
  const pool = ph && ph.pool.length
    ? `<div class="poolh"><span class="k">${esc(B.prof.pool)}</span><span class="grow"></span><button class="mini" data-toggle-spoiler="1">${esc(winsShown ? B.prof.hideWins : B.prof.showWins)}</button></div>`
      + `<div class="ptable">${ph.pool.map((e) => `<div class="prow3"><b>${esc(championName(e.champion, c.lang))}</b><span class="muted">${esc(B.rec.pickedTimes(e.games))}</span>`
        + `<span class="muted">${winsShown && e.wins !== null ? esc(B.rec.wl(e.wins, e.games - e.wins)) : ''}</span><span class="mono">${esc(B.rec.kda)} ${kda(e).toFixed(1)}</span></div>`).join('')}</div>`
    : `<p class="muted">${esc(B.prof.noPool)}</p>`;
  return `${head}<p class="names">${names}</p>${boxes}${wline}${played}${pool}`;
}
