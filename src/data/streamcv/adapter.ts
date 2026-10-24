// Stream CV state.json -> MatchState. Pure and defensive: unknown values are dropped one by one,
// so one odd field never blanks the whole widget. Nothing outside src/data/ reads the raw JSON.

import {
  ELEMENTS, LANES, TEAMS, TOWER_SITES, other, isNexusTurret,
  ROLES, type Buff, type HeraldState, type PitNext, type Champion, type Player, type Role, type DraftGame, type DraftSide, type Element, type GameStatus, type InhibitorDown, type Lane, type MatchState, type Team, type TeamState, type Tower, type TowerSite,
} from '../../model/types.ts';
import type { RawState } from './contract.ts';

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const count = (v: unknown): number | null => { const n = num(v); return n !== null && n >= 0 ? Math.floor(n) : null; };
const team = (v: unknown): Team | null => (v === 'B' || v === 'R' ? v : null);
const element = (v: unknown): Element | null => ((ELEMENTS as readonly unknown[]).includes(v) ? (v as Element) : null);
const site = (v: unknown): TowerSite | null => ((TOWER_SITES as readonly unknown[]).includes(v) ? (v as TowerSite) : null);

/** "27:06" -> 1626. Minutes may run past 59 ("61:05"). */
export function parseClock(v: unknown): number | null {
  if (typeof v !== 'string') return null;
  const m = /^(\d{1,3}):([0-5]\d)$/.exec(v.trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** A time given as seconds, or failing that as "M:SS". */
const time = (sec: unknown, text: unknown): number | null => num(sec) ?? parseClock(text);

const STATUSES: readonly GameStatus[] = ['idle', 'waiting', 'in_game', 'finished'];

function emptyTeam(): TeamState {
  const towers = Object.fromEntries(TOWER_SITES.map((s) => [s, { site: s, down: false, lostAt: null, respawnAt: null }])) as Record<TowerSite, Tower>;
  return { kills: null, gold: null, barons: null, elders: null, dragons: [], towersDestroyed: null, towers, unnamedLost: 0, inhibitorsDown: [] };
}

export function emptyState(status: GameStatus = 'idle'): MatchState {
  return {
    status, gameId: null, updated: null, clock: null, teams: { B: emptyTeam(), R: emptyTeam() }, towersKnown: false,
    riftElement: null, soul: null, nextDragon: null, nextBaron: null, buffs: [], series: null, draft: null, players: null, playersAsOf: null, voidgrubs: null, pitNext: null, herald: null,
  };
}

/**
 * Which lanes the down inhibitors are in. An inhibitor can only fall after its lane's inhibitor
 * tower, so when exactly as many inhibitors are down as lanes have lost that tower, the lanes are
 * known. Which timer belongs to which lane is not, so the timers keep their own order.
 */
function placeInhibitors(t: TeamState, respawns: number[]): InhibitorDown[] {
  const sorted = [...respawns].sort((a, b) => a - b);
  const open = LANES.filter((l) => t.towers[`${l}_inhib_tower`].down);
  if (sorted.length === 0 || open.length !== sorted.length) return sorted.map((respawnAt) => ({ lane: null, respawnAt }));
  // Pair by time anyway (first tower lost, first respawn) so each lane gets one marker.
  const byLoss = [...open].sort((a, b) => (t.towers[`${a}_inhib_tower`].lostAt ?? 0) - (t.towers[`${b}_inhib_tower`].lostAt ?? 0));
  return sorted.map((respawnAt, i) => ({ lane: byLoss[i] as Lane, respawnAt }));
}

export function adapt(input: unknown): MatchState {
  const raw = obj(input) as RawState & Record<string, unknown>;
  const status = (STATUSES as readonly unknown[]).includes(raw.status) ? (raw.status as GameStatus) : 'idle';
  const s = emptyState(status);
  s.gameId = typeof raw.game === 'string' ? raw.game : null;
  s.updated = typeof raw.updated === 'string' ? raw.updated : null;
  if (raw.feed === 'missing') s.feedMissing = true;
  if (raw.paused === true && s.status === 'in_game') s.paused = true;
  if (status === 'idle') return s;
  s.clock = parseClock(raw.gameClock);

  const by = (field: unknown, t: Team) => obj(field)[t];
  for (const t of TEAMS) {
    const ts = s.teams[t];
    ts.kills = count(by(raw.kills, t));
    ts.gold = count(by(raw.gold, t));
    ts.barons = count(by(raw.barons, t));
    ts.elders = count(by(raw.elderKills, t));
    ts.towersDestroyed = count(by(raw.towersDestroyedBy, t));
    ts.dragons = arr(by(raw.dragons, t)).map(element).filter((e): e is Element => e !== null);
  }

  // Towers: which ones fell comes from screen reading (towersLost); nexus turrets also carry a respawn.
  const lost = obj(raw.towersLost);
  s.towersKnown = Array.isArray(lost.B) || Array.isArray(lost.R);
  for (const t of TEAMS) {
    for (const item of arr(lost[t])) {
      const o = obj(item);
      const at = site(o.site);
      if (!at) continue;
      const tower = s.teams[t].towers[at];
      tower.down = true;
      tower.lostAt = time(o.sec, o.gameTime);
    }
  }
  for (const item of arr(lost.nexusTurretsDown)) {
    const o = obj(item);
    const t = team(o.teamLost), at = site(o.site);
    if (!t || !at || !isNexusTurret(at)) continue;
    const tower = s.teams[t].towers[at];
    tower.down = true;
    tower.respawnAt = parseClock(o.respawnAt);
  }
  // A lane's turrets fall in order (outer, inner, inhibitor turret: each is untargetable until the one
  // in front of it is down). The screen reading sometimes names the wrong one (an inner down with the
  // outer standing, 2026-10-18 replay): keep its count per lane, and put the losses at the front.
  for (const t of TEAMS) {
    for (const l of LANES) {
      const order = [`${l}_outer`, `${l}_inner`, `${l}_inhib_tower`] as const;
      const ts = order.map((x) => s.teams[t].towers[x]);
      const down = ts.filter((x) => x.down);
      const times = down.map((x) => x.lostAt).sort((a, b) => (a ?? Infinity) - (b ?? Infinity));
      ts.forEach((x, i) => { x.down = i < down.length; x.lostAt = i < down.length ? times[i] ?? null : null; });
    }
  }
  for (const t of TEAMS) {
    const named = Object.values(s.teams[t].towers).filter((x) => x.down).length;
    const destroyed = s.teams[other(t)].towersDestroyed;
    s.teams[t].unnamedLost = s.towersKnown && destroyed !== null ? Math.max(0, destroyed - named) : 0;
    fillByRules(s.teams[t]);
  }

  const timers = obj(raw.timers);
  const respawns: Record<Team, number[]> = { B: [], R: [] };
  for (const item of arr(timers.inhibitorsDown)) {
    const o = obj(item);
    const t = team(o.teamLost), at = parseClock(o.respawnAt);
    if (t && at !== null) respawns[t].push(at);
  }
  for (const t of TEAMS) s.teams[t].inhibitorsDown = placeInhibitors(s.teams[t], respawns[t]);

  const nd = obj(timers.nextDragon);
  const ndAt = time(nd.sec, nd.spawnAt);
  const elementSource = nd.elementSource === 'broadcast' || nd.elementSource === 'rules' ? nd.elementSource : null;
  if (ndAt !== null) s.nextDragon = { elder: nd.kind === 'elder', element: element(nd.element), elementSource, at: ndAt };
  const nb = obj(timers.nextBaron);
  const nbAt = time(nb.sec, nb.spawnAt);
  if (nbAt !== null) s.nextBaron = { at: nbAt };
  s.buffs = arr(timers.activeBuffs).flatMap((item): Buff[] => {
    const o = obj(item);
    const t = team(o.team), until = time(o.untilSec, o.until);
    const kind = o.buff === 'baron' || o.buff === 'elder' ? o.buff : null;
    return t && kind && until !== null ? [{ kind, team: t, until }] : [];
  });

  s.riftElement = element(raw.riftElement);
  const soul = obj(raw.soul);
  const soulTeam = team(soul.team), soulEl = element(soul.element);
  s.soul = soulTeam && soulEl ? { team: soulTeam, element: soulEl } : null;
  readSeriesAndDraft(raw, s);
  readPlayers(raw, s);
  readObjectiveBox(raw, s);
  return s;
}

// ---------- series and draft: contract v0.1 ("系列賽與 BP"), after docs/CONTRACT_PROPOSAL.md ----------

const CODE = /^[A-Za-z0-9]{1,6}$/;
const CHAMP = /^[A-Za-z0-9]{2,30}$/;
const champion = (v: unknown): Champion | null => (typeof v === 'string' && CHAMP.test(v) ? v : null);
const slots = (v: unknown): (Champion | null)[] => Array.from({ length: 5 }, (_, i) => champion(arr(v)[i]));

function draftGame(v: unknown): DraftGame | null {
  const o = obj(v);
  const game = count(o.game);
  const sides = {} as Record<Team, DraftSide>;
  for (const t of TEAMS) {
    const side = obj(o[t]);
    const code = typeof side.team === 'string' && CODE.test(side.team) ? side.team : null;
    if (!code) return null;
    sides[t] = { team: code, bans: slots(side.bans), picks: slots(side.picks) };
  }
  if (!game) return null;
  const turn = obj(o.turn);
  const tt = team(turn.side), slot = count(turn.slot);
  const kind = turn.kind === 'ban' || turn.kind === 'pick' ? turn.kind : null;
  return { game, sides, turn: tt && kind && slot !== null && slot < 5 ? { side: tt, kind, slot } : null };
}

function readSeriesAndDraft(raw: Record<string, unknown>, s: MatchState): void {
  const series = obj(raw.series);
  const bestOf = count(series.bestOf), game = count(series.game);
  const teams = obj(series.teams);
  // wins is null when the service did not see the series before this game started (winsNote says why).
  const side = (t: Team) => { const o = obj(teams[t]); return typeof o.code === 'string' && CODE.test(o.code) ? { code: o.code, wins: count(o.wins) } : null; };
  const b = side('B'), r = side('R');
  const text = (v: unknown) => (typeof v === 'string' && v.length <= 300 ? v : null);
  if (bestOf && game && game <= bestOf && b && r) {
    const ss = series.sidesSource;
    const sidesSource = ss === 'api' || ss === 'broadcast' || ss === 'api_unconfirmed' ? ss : null;
    s.series = { bestOf, game, matchId: text(series.matchId), teams: { B: b, R: r }, winsNote: text(series.winsNote), sidesSource };
  }

  const draft = obj(raw.draft);
  if (!('current' in draft) && !('earlier' in draft)) return;
  const current = draftGame(draft.current);
  const earlier = arr(draft.earlier).map(draftGame).filter((g): g is DraftGame => g !== null && (!current || g.game < current.game));
  // Missing flags mean the proposal's reading: picks in draft order, bans and turn sent when known.
  s.draft = {
    current, earlier: earlier.sort((a, b2) => a.game - b2.game),
    picksOrder: draft.picksOrder === 'role' ? 'role' : 'draft',
    bansOrder: draft.bansOrder === 'ban' ? 'ban' : null,
    bansSupported: draft.bansSupported !== false,
    turnSupported: draft.turnSupported !== false,
  };
  if (!s.draft.turnSupported && current) current.turn = null;
}

// ---------- players: contract v0.2 ("選手"), after docs/CONTRACT_PROPOSAL.md ----------

const ROLE_OF: Record<string, Role> = { top: 'top', jungle: 'jungle', mid: 'mid', bottom: 'bot', bot: 'bot', support: 'support' };

function player(v: unknown, code: string | null): Player | null {
  const o = obj(v);
  if (typeof o.name !== 'string' || !o.name.trim() || o.name.length > 40) return null;
  // The feed writes "MVK Kratos": the team code is already on screen.
  const name = code && o.name.startsWith(`${code} `) ? o.name.slice(code.length + 1) : o.name.trim();
  // null: the service could not read the details frame. Not the same as "no items".
  const items = o.items === null || o.items === undefined ? null
    : arr(o.items).map((i) => (typeof i === 'number' ? i : typeof i === 'string' ? Number(i) : NaN))
      .filter((i) => Number.isInteger(i) && i > 0 && i < 100000).slice(0, 8);
  return {
    role: typeof o.role === 'string' ? ROLE_OF[o.role] ?? null : null,
    name, champion: champion(o.champion),
    level: count(o.level), kills: count(o.kills), deaths: count(o.deaths), assists: count(o.assists),
    cs: count(o.cs), gold: count(o.gold), hp: count(o.hp), maxHp: count(o.maxHp), items,
  };
}

function readPlayers(raw: Record<string, unknown>, s: MatchState): void {
  const ps = obj(raw.players);
  if (!Array.isArray(ps.B) && !Array.isArray(ps.R)) return;
  const out = {} as Record<Team, Player[]>;
  for (const t of TEAMS) {
    const code = s.series?.teams[t].code ?? s.draft?.current?.sides[t].team ?? null;
    const list = arr(ps[t]).map((p) => player(p, code)).filter((p): p is Player => p !== null);
    // Top to support, whatever order they came in; unknown roles last.
    out[t] = list.sort((a, b) => (a.role ? ROLES.indexOf(a.role) : 9) - (b.role ? ROLES.indexOf(b.role) : 9)).slice(0, 5);
  }
  s.players = out;
  s.playersAsOf = typeof ps.asOf === 'string' && ps.asOf.length <= 40 ? ps.asOf : null;
  // The score as the broadcast shows it: kills the players were credited with. The feed's team total
  // also counts deaths to towers, minions and monsters (2026-10-19, Day 4 game 2: the feed said 6:2,
  // the broadcast 6:1, one death was an execution).
  for (const t of TEAMS) {
    const ks = out[t].map((p) => p.kills);
    if (out[t].length === 5 && ks.every((k) => k !== null)) s.teams[t].kills = ks.reduce((a, b) => a! + b!, 0);
  }
}

/**
 * What the reading missed, by the game's rules (2026-10-19, Day 4 game 1: the nexus turrets fell with
 * every inhibitor turret drawn standing). A nexus turret down means an inhibitor turret is down: when
 * only one lane has its inner turret down, it is that lane's. Losses the feed counts that still have no
 * name mark the next tower of each lane with a "?" instead of drawing it standing.
 */
function fillByRules(team: TeamState): void {
  const tw = team.towers;
  const nexusDown = tw.nexus_t1.down || tw.nexus_t2.down;
  if (nexusDown && team.unnamedLost > 0 && !LANES.some((l) => tw[`${l}_inhib_tower`].down)) {
    const open = LANES.filter((l) => tw[`${l}_inner`].down);
    if (open.length === 1) { tw[`${open[0]!}_inhib_tower`].down = true; team.unnamedLost -= 1; }
  }
  if (team.unnamedLost <= 0) return;
  for (const l of LANES) {
    const next = ([`${l}_outer`, `${l}_inner`, `${l}_inhib_tower`] as const).map((x) => tw[x]).find((x) => !x.down);
    if (next) next.maybe = true;
  }
}

// ---------- the broadcast's objective box: contract v0.4 ("轉播畫面物件") ----------

const HERALD: readonly HeraldState['status'][] = ['upcoming', 'alive_or_upcoming', 'taken', 'taken_or_despawned'];
const PIT: readonly PitNext[] = ['grubs', 'herald', 'baron'];

function readObjectiveBox(raw: Record<string, unknown>, s: MatchState): void {
  const vg = obj(raw.voidgrubs);
  if ('B' in vg || 'R' in vg) {
    const grubs = (v: unknown) => { const n = count(v); return n !== null && n <= 3 ? n : null; };
    s.voidgrubs = { B: grubs(vg.B), R: grubs(vg.R) };
  }
  s.pitNext = (PIT as readonly unknown[]).includes(raw.pitNext) ? (raw.pitNext as PitNext) : null;
  const h = obj(raw.herald);
  if ((HERALD as readonly unknown[]).includes(h.status)) s.herald = { status: h.status as HeraldState['status'], at: time(h.sec, h.at), team: team(h.team) };
}
