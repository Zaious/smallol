// /history/teams.json and /history/players.json -> the history model, plus the tallies the views
// show: a team's most banned and most picked champions this event, a player's champion pool.
// Defensive like the other adapters: a broken entry is dropped, the rest stays.

import { ROLES, type Champion, type Role, type Team } from '../../model/types.ts';
import type { PlayerHistory, PoolEntry, TeamGame } from '../../model/history.ts';

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const count = (v: unknown): number | null => (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < 10000 ? v : null);
const text = (v: unknown, max = 40): string | null => (typeof v === 'string' && v.trim() && v.length <= max ? v.trim() : null);
const CHAMP = /^[A-Za-z0-9]{2,30}$/;
const champion = (v: unknown): Champion | null => (typeof v === 'string' && CHAMP.test(v) ? v : null);
const ROLE_OF: Record<string, Role> = { top: 'top', jungle: 'jungle', mid: 'mid', bottom: 'bot', bot: 'bot', support: 'support' };
const role = (v: unknown): Role | null => (typeof v === 'string' ? ROLE_OF[v] ?? null : null);
const side = (v: unknown): Team | null => (v === 'B' || v === 'R' ? v : null);
const bool = (v: unknown): boolean | null => (typeof v === 'boolean' ? v : null);

/** The history endpoints live next to state.json on the same service. */
export const historyUrl = (stateEndpoint: string, what: 'teams' | 'players') => new URL(`history/${what}.json`, stateEndpoint).href;

function teamGame(v: unknown): TeamGame | null {
  const o = obj(v);
  const gameId = text(o.gameId);
  const start = typeof o.start === 'string' ? Date.parse(o.start) : NaN;
  if (!gameId || !Number.isFinite(start)) return null;
  return {
    gameId, start, stage: text(o.stage) ?? '', game: count(o.game), side: side(o.side), opponent: text(o.opponent, 8), win: bool(o.win),
    bans: arr(o.bans).slice(0, 5).map(champion),
    picks: arr(o.picks).slice(0, 5).map((p) => { const q = obj(p); return { role: role(q.role), player: text(q.player) ?? '', champion: champion(q.champion) }; }),
  };
}

export function adaptTeams(input: unknown): Record<string, TeamGame[]> {
  const out: Record<string, TeamGame[]> = {};
  for (const [code, games] of Object.entries(obj(obj(input).teams))) {
    if (!/^[A-Za-z0-9]{1,8}$/.test(code)) continue;
    out[code] = arr(games).map(teamGame).filter((g): g is TeamGame => g !== null).sort((a, b) => a.start - b.start);
  }
  return out;
}

export function adaptPlayers(input: unknown): Record<string, PlayerHistory> {
  const out: Record<string, PlayerHistory> = {};
  for (const [raw, v] of Object.entries(obj(obj(input).players))) {
    // Trimmed like the names in teams.json and state.json: the service has sent "C9 Loki " (2026-10-17).
    const name = raw.trim();
    if (!name || name.length > 40) continue;
    const o = obj(v);
    const pool: PoolEntry[] = [];
    for (const [ch, e] of Object.entries(obj(o.pool))) {
      const q = obj(e);
      const c = champion(ch), games = count(q.games);
      if (!c || !games) continue;
      pool.push({ champion: c, games, wins: count(q.wins), k: count(q.k) ?? 0, d: count(q.d) ?? 0, a: count(q.a) ?? 0 });
    }
    pool.sort((a, b) => b.games - a.games || a.champion.localeCompare(b.champion));
    out[name] = { name, team: text(o.team, 8), role: role(o.role), games: arr(o.games).length || pool.reduce((n, p) => n + p.games, 0), pool };
  }
  return out;
}

/** A team's most banned (or picked) champions this event: [champion, times], most first. */
export function tally(games: TeamGame[], what: 'bans' | 'picks', top = 5): [Champion, number][] {
  const n = new Map<Champion, number>();
  for (const g of games) {
    const list = what === 'bans' ? g.bans : g.picks.map((p) => p.champion);
    for (const c of list) if (c) n.set(c, (n.get(c) ?? 0) + 1);
  }
  return [...n].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, top);
}

/** A player by team code and the name on screen ("KC" + "Canna" -> "KC Canna"). */
export function findPlayer(players: Record<string, PlayerHistory> | null, code: string | null, shortName: string): PlayerHistory | null {
  if (!players) return null;
  if (code && players[`${code} ${shortName}`]) return players[`${code} ${shortName}`]!;
  if (players[shortName]) return players[shortName]!;
  const hits = Object.values(players).filter((p) => p.name.endsWith(` ${shortName}`) && (!code || p.team === code));
  return hits.length === 1 ? hits[0]! : null;
}

/** A team's players, top to support. */
export function teamPlayers(players: Record<string, PlayerHistory> | null, code: string): PlayerHistory[] {
  if (!players) return [];
  const order = (r: Role | null) => (r ? ROLES.indexOf(r) : 9);
  return Object.values(players).filter((p) => p.team === code).sort((a, b) => order(a.role) - order(b.role));
}

export interface ChampStat {
  champion: Champion;
  picks: number;
  bans: number;
  /** Picks whose game has a known result, and how many of those were won (spoilers). */
  decided: number;
  wins: number;
}

/**
 * This event's picks and bans per champion, from the teams' games (each game is in two teams' lists;
 * a champion is picked or banned at most once per game, so counting each team's own picks and bans
 * counts each game once). `games` is the number of distinct games.
 */
export function championStats(teams: Record<string, TeamGame[]> | null): { games: number; rows: ChampStat[] } {
  const ids = new Set<string>(); const m = new Map<Champion, ChampStat>();
  const row = (c: Champion) => { let r = m.get(c); if (!r) m.set(c, (r = { champion: c, picks: 0, bans: 0, decided: 0, wins: 0 })); return r; };
  for (const games of Object.values(teams ?? {})) {
    for (const g of games) {
      ids.add(g.gameId);
      for (const b of g.bans) if (b) row(b).bans++;
      for (const p of g.picks) {
        if (!p.champion) continue;
        const r = row(p.champion); r.picks++;
        if (g.win !== null) { r.decided++; if (g.win) r.wins++; }
      }
    }
  }
  return { games: ids.size, rows: [...m.values()] };
}

/** (K + A) / D, with D at least 1. */
export const kda = (e: { k: number; d: number; a: number }) => (e.k + e.a) / Math.max(1, e.d);
