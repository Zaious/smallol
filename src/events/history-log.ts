// The log history (docs/UI_SPEC_v1.md §5): every event that reached the log, the last five games,
// grouped by game, filtered by importance or team. Each tower is its own row (no streak merging
// here). Pure: entries in, HTML out; main.ts keeps the list and saves it to log-history.json.

import { TEAM_COLOUR } from '../render/map-svg.ts';
import type { BarStrings } from '../i18n/bar.ts';
import type { Team } from '../model/types.ts';
import type { Level } from './kinds.ts';

export interface LogEntry {
  /** Game id, or the match and game number for draft events (no game id yet). */
  game: string;
  /** Game number in the series, and the two teams (blue, red) for the group's header. */
  n: number | null;
  teams: [string, string];
  /** Game clock, when the event has one. */
  at: number | null;
  text: string;
  /** The same in English, for Terminalol's English log (since 0.1.6; older entries have none). */
  en?: string;
  level: Level;
  /** The doer's side and code, and the code of the team it happened to. */
  side: Team | null;
  code: string | null;
  victim: string | null;
  /** Players named in the text (as the feed spells them), to link to their profiles when the roster knows them. */
  player?: string;
  victimPlayer?: string;
  /** When it was logged (ms), for order. */
  t: number;
}

export const KEEP_GAMES = 5;

/** Add entries, keeping the last five games. The same event twice (same game, game time and text: a game
 * replayed, or the app restarted mid-game) is kept once. */
export function addEntries(list: LogEntry[], add: LogEntry[]): LogEntry[] {
  const all = dedupe([...list, ...add]);
  const games: string[] = [];
  for (let i = all.length - 1; i >= 0; i--) if (!games.includes(all[i]!.game)) games.push(all[i]!.game);
  const keep = new Set(games.slice(0, KEEP_GAMES));
  return all.filter((e) => keep.has(e.game)).slice(-2000);
}

function dedupe(list: LogEntry[]): LogEntry[] {
  const seen = new Set<string>();
  return list.filter((e) => {
    if (e.at === null) return true;
    const k = `${e.game}|${e.at}|${e.text}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** Read a saved history back; anything malformed is dropped entry by entry, and doubles kept once
 * (a file written before they were, 2026-10-18: four "推倒 MVK 主堡塔" at 36:25 from replays). */
export function parseEntries(text: string | null): LogEntry[] {
  if (!text) return [];
  try {
    const v = JSON.parse(text) as unknown;
    if (!Array.isArray(v)) return [];
    return dedupe(v.filter((e): e is LogEntry => !!e && typeof e === 'object' && typeof (e as LogEntry).text === 'string' && typeof (e as LogEntry).game === 'string'
      && Array.isArray((e as LogEntry).teams) && ['major', 'important', 'normal'].includes((e as LogEntry).level)));
  } catch { return []; }
}

export type HistFilter = 'all' | 'big' | string;

/** A player's roster id for a name in the text, or null (no link: a name the roster does not know would be a dead link). */
export type PlayerLink = (code: string, name: string) => string | null;

/**
 * Within a game, by game time (review H1). Entries without one (the draft, the start) come before the
 * clock, among themselves by when they were logged: comparing them by log time against timed entries
 * put a late-logged draft row between two plays.
 */
function byGameTime(a: LogEntry, b: LogEntry): number {
  if ((a.at === null) !== (b.at === null)) return a.at === null ? -1 : 1;
  if (a.at !== null && b.at !== null && a.at !== b.at) return a.at - b.at;
  return a.t - b.t;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const clock = (sec: number) => `${Math.floor(Math.max(0, sec) / 60)}:${String(Math.floor(Math.max(0, sec)) % 60).padStart(2, '0')}`;

/**
 * The list. `newestFirst` when it opens downward (the newest row is next to the bar); upward, the
 * newest is at the bottom, still next to the bar. The filter row is at the end away from the bar.
 */
export function historyView(list: LogEntry[], filter: HistFilter, B: BarStrings, newestFirst: boolean, link: PlayerLink = () => null, skipText: string | null = null): string {
  const teams = list.length ? list[list.length - 1]!.teams : null;
  const pick = (e: LogEntry) => filter === 'all' || (filter === 'big' ? e.level !== 'normal' : e.code === filter || e.victim === filter);
  const shown = list.filter(pick);
  // The newest row says what the bar's line already says: leave it out, not the same line twice (review H2).
  if (skipText && shown.length && shown[shown.length - 1]!.text === skipText) shown.pop();
  const groups: { head: string; rows: LogEntry[] }[] = [];
  for (const e of shown) {
    const g = groups[groups.length - 1];
    if (g && g.head === e.game) g.rows.push(e);
    else groups.push({ head: e.game, rows: [e] });
  }
  // The subject column is the first team the text names (the team that died, for "倒下"), and the text
  // drops that leading code, so a code never shows twice and the columns line up (review H2).
  const row = (e: LogEntry) => {
    const subject = e.code ?? e.victim;
    const side: Team | null = e.code ? e.side : e.victim ? (e.victim === e.teams[0] ? 'B' : 'R') : null;
    const body = subject && e.text.startsWith(`${subject} `) ? e.text.slice(subject.length + 1) : e.text;
    let html = esc(body);
    for (const [code, name] of [[e.code, e.player], [e.victim, e.victimPlayer]] as const) {
      const id = code && name ? link(code, name) : null;
      if (id && code) html = html.replace(esc(name!), `<button class="pl" data-player="${esc(code)}|${esc(id)}">${esc(name!)}</button>`);
    }
    return `<div class="hrow${e.level === 'major' ? ' major' : ''}"><span class="t">${e.at === null ? '' : clock(e.at)}</span>`
      + `<span class="who">${side ? `<i class="dot" style="background:${TEAM_COLOUR[side]}"></i>` : ''}${subject ? `<button class="code" data-team="${esc(subject)}">${esc(subject)}</button>` : ''}</span>`
      + `<span class="x" title="${esc(e.text)}">${html}</span></div>`;
  };
  const block = (g: { rows: LogEntry[] }) => {
    // The header names the sides as they ended up (the draft can carry the official sides the wrong way round).
    const f = g.rows[g.rows.length - 1]!;
    const sorted = [...g.rows].sort(byGameTime);
    const rows = newestFirst ? sorted.reverse() : sorted;
    return `<div class="hgroup"><div class="hhead">${esc(f.n === null ? `${f.teams[0]} vs ${f.teams[1]}` : B.hist.game(f.n, f.teams[0], f.teams[1]))}</div>${rows.map(row).join('')}</div>`;
  };
  const ordered = newestFirst ? [...groups].reverse() : groups;
  const body = shown.length ? ordered.map(block).join('') : `<p class="hempty">${esc(B.hist.empty)}</p>`;
  const opt = (v: string, label: string) => `<button data-hfilter="${esc(v)}" aria-pressed="${filter === v}">${esc(label)}</button>`;
  const filters = `<div class="hfilter">${opt('all', B.hist.all)}${opt('big', B.hist.big)}${teams ? opt(teams[0], teams[0]) + opt(teams[1], teams[1]) : ''}</div>`;
  const listHtml = `<div class="hlist${newestFirst ? '' : ' up'}">${body}</div>`;
  return newestFirst ? listHtml + filters : filters + listHtml;
}
