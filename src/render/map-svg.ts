// The tower map in 2.5D, after Basesmall's board: the ground is squashed and every building is a
// piece with a side, a top and a soft shadow. Standing towers are tall pillars in the team colour,
// fallen ones grey stumps; inhibitors are crystals, the nexus a two-tier block. Respawn countdowns
// sit on the building that will come back. Not a picture of the real minimap (no Riot art): lanes
// are straight lines on a 100x100 ground, blue base bottom-left, red top-right, as on the broadcast.
// Pure: state in, SVG out.

import { LANES, TEAMS, TOWER_SITES, isNexusTurret, type Lane, type MatchState, type Team, type TowerSite } from '../model/types.ts';
import { fmtClock, left, timersOn, towerDown } from '../model/clock.ts';
import { shade } from './colour.ts';
import { ELEMENT_COLOUR } from './dragons.ts';

type Pt = readonly [number, number];

/** Blue's buildings on the 100x100 ground. Red's are the mirror image, with top and bot swapped. */
const BLUE_TOWERS: Record<TowerSite, Pt> = {
  top_outer: [7, 28], top_inner: [7, 48], top_inhib_tower: [7, 66],
  mid_outer: [42, 58], mid_inner: [35, 65], mid_inhib_tower: [27, 73],
  bot_outer: [72, 93], bot_inner: [52, 93], bot_inhib_tower: [34, 93],
  nexus_t1: [10, 80], nexus_t2: [20, 90],
};
const BLUE_INHIBS: Record<Lane, Pt> = { top: [7, 74], mid: [21, 79], bot: [26, 93] };
const BLUE_NEXUS: Pt = [12, 88];

const mirror = ([x, y]: Pt): Pt => [100 - x, 100 - y];
const swapSite = (s: TowerSite): TowerSite => (s.startsWith('top_') ? s.replace('top_', 'bot_') : s.startsWith('bot_') ? s.replace('bot_', 'top_') : s) as TowerSite;
const swapLane = (l: Lane): Lane => (l === 'top' ? 'bot' : l === 'bot' ? 'top' : l);

export function towerAt(team: Team, s: TowerSite): Pt {
  return team === 'B' ? BLUE_TOWERS[s] : mirror(BLUE_TOWERS[swapSite(s)]);
}
export function inhibAt(team: Team, l: Lane): Pt {
  return team === 'B' ? BLUE_INHIBS[l] : mirror(BLUE_INHIBS[swapLane(l)]);
}
export const nexusAt = (team: Team): Pt => (team === 'B' ? BLUE_NEXUS : mirror(BLUE_NEXUS));

/** Team colours as hex, so sides can be shaded. The CSS uses the same values (--blue, --red). */
export const TEAM_HEX: Record<Team, string> = { B: '#4C93E6', R: '#E0574C' };
export const TEAM_COLOUR: Record<Team, string> = { B: 'var(--blue)', R: 'var(--red)' };

// ---------- projection ----------

/** Ground squash (Basesmall uses 0.5 for its field; a map wants a little more depth). */
const K = 0.64;
/**
 * The ground's scale: places are drawn at 85 % of the 100x100 plan while buildings keep their size, so the
 * two sides sit closer and the whole map is smaller (maintainer, 2026-10-19).
 */
const S = 0.85;
/** Room above the far edge for the tallest pieces. */
const TOP = 8;
/** Ellipse ratio of a round top seen from the camera. */
const ER = 0.5;
const SLAB = 3.2;
export const VIEW_W = +(102 * S).toFixed(2), VIEW_H = TOP + 100 * K * S + SLAB + 3;

const P = ([x, y]: Pt): Pt => [x * S, TOP + y * S * K];
const n = (v: number) => +v.toFixed(2);

// ---------- pieces ----------

interface Piece { y: number; svg: string }

function cylinder(x: number, y: number, r: number, h: number, top: string, side: string, extra = ''): string {
  const ry = r * ER;
  return `<path d="M${n(x - r)} ${n(y - h)} L${n(x - r)} ${n(y)} A${n(r)} ${n(ry)} 0 0 0 ${n(x + r)} ${n(y)} L${n(x + r)} ${n(y - h)} Z" fill="${side}" ${extra}/>`
    + `<ellipse cx="${n(x)}" cy="${n(y - h)}" rx="${n(r)}" ry="${n(ry)}" fill="${top}" ${extra}/>`;
}

const shadow = (x: number, y: number, r: number) =>
  `<ellipse cx="${n(x + 0.5)}" cy="${n(y + 0.6)}" rx="${n(r * 1.15)}" ry="${n(r * ER * 1.1)}" fill="rgba(0,0,0,.45)"/>`;
const gloss = (x: number, y: number, r: number) =>
  `<ellipse cx="${n(x - r * 0.25)}" cy="${n(y - r * ER * 0.25)}" rx="${n(r * 0.5)}" ry="${n(r * ER * 0.45)}" fill="#fff" fill-opacity=".22"/>`;

const RIM = 'stroke="rgba(10,12,16,.65)" stroke-width="0.35"';
const STUMP_RIM = 'stroke="#6B7280" stroke-opacity=".7" stroke-width="0.4" stroke-dasharray="0.9 0.7"';

function tower(at: Pt, team: Team, kind: 'tower' | 'nexusTurret', state: 'up' | 'down' | 'unknown' | 'maybe'): Piece {
  const [x, y] = P(at);
  const r = kind === 'tower' ? 2.5 : 1.9;
  if (state === 'down') {
    return { y, svg: `<g class="tower down">${shadow(x, y, r * 0.9)}${cylinder(x, y, r, 0.8, '#2C3038', '#1C1F25', STUMP_RIM)}</g>` };
  }
  const h = kind === 'tower' ? 5.2 : 3.8;
  const col = state === 'unknown' ? '#7A808C' : TEAM_HEX[team];
  const fade = state === 'unknown' ? ' opacity=".45"' : state === 'maybe' ? ' opacity=".5"' : '';
  // Maybe down: the feed counts a loss nobody named, and this tower could be it.
  const mark = state === 'maybe' ? `<text class="maybe" x="${n(x)}" y="${n(y - h - 1.4)}" text-anchor="middle" font-size="4.2" font-weight="700" fill="var(--text)">?</text>` : '';
  return { y, svg: `<g class="tower${state === 'unknown' ? ' unknown' : state === 'maybe' ? ' maybe' : ''}"${fade}>${shadow(x, y, r)}${cylinder(x, y, r, h, col, shade(col, 0.55), RIM)}${gloss(x, y - h, r)}${mark}</g>` };
}

function crystal(at: Pt, team: Team, down: boolean): Piece {
  const [x, y] = P(at);
  const r = 2.4, ry = r * ER;
  if (down) {
    return { y, svg: `<g class="inhib down"><path d="M${n(x - r)} ${n(y)} L${n(x)} ${n(y - ry)} L${n(x + r)} ${n(y)} L${n(x)} ${n(y + ry)} Z" fill="#1C1F25" ${STUMP_RIM}/></g>` };
  }
  const h = 2.6, c = shade(TEAM_HEX[team], 1.25);
  const top = `M${n(x - r)} ${n(y - h)} L${n(x)} ${n(y - h - ry)} L${n(x + r)} ${n(y - h)} L${n(x)} ${n(y - h + ry)} Z`;
  const leftFace = `M${n(x - r)} ${n(y - h)} L${n(x)} ${n(y - h + ry)} L${n(x)} ${n(y + ry)} L${n(x - r)} ${n(y)} Z`;
  const rightFace = `M${n(x)} ${n(y - h + ry)} L${n(x + r)} ${n(y - h)} L${n(x + r)} ${n(y)} L${n(x)} ${n(y + ry)} Z`;
  return { y, svg: `<g class="inhib">${shadow(x, y, r)}<path d="${leftFace}" fill="${shade(c, 0.7)}" ${RIM}/><path d="${rightFace}" fill="${shade(c, 0.5)}" ${RIM}/><path d="${top}" fill="${c}" ${RIM}/></g>` };
}

function nexus(at: Pt, team: Team): Piece {
  const [x, y] = P(at);
  const c = TEAM_HEX[team];
  return {
    y, svg: `<g class="nexus">${shadow(x, y, 4.6)}${cylinder(x, y, 4.6, 2.2, shade(c, 0.85), shade(c, 0.45), RIM)}${cylinder(x, y - 2.2, 2.7, 2.6, c, shade(c, 0.55), RIM)}${gloss(x, y - 4.8, 2.7)}</g>`,
  };
}

/** A countdown tag above a building (team colour), or above a pit (neutral). */
function tag(at: Pt, lift: number, text: string, team: Team | null): Piece {
  const [x, y0] = P(at);
  const y = y0 - lift;
  const w = text.length * 2.45 + 2.6;
  return {
    y: 1000 + y,
    svg: `<g class="tag"><rect x="${n(x - w / 2)}" y="${n(y - 4.6)}" width="${n(w)}" height="5.2" rx="2.6" fill="var(--panel)" stroke="${team ? TEAM_COLOUR[team] : 'var(--accent)'}" stroke-width="0.4"/>`
      + `<text x="${n(x)}" y="${n(y - 0.95)}" text-anchor="middle" font-size="3.9">${text}</text></g>`,
  };
}

// ---------- the map ----------

export interface MapOptions {
  /** Grey out inhibitors that are down (only where the lane can be told). */
  inhibitors: boolean;
  /** Countdown tags on inhibitors and the nexus (settings: inhibitors, nexusTimers). */
  inhibTimers: boolean;
  nexusTimers: boolean;
  /** Label for "the feed counts more lost towers than were named", e.g. "+1?". */
  unnamed: (n: number) => string;
  unnamedTitle: string;
  unknownTitle: string;
  /** The drakes each team took, as small coins along its edge of the board (minimap window). */
  drakes?: { titles: (e: string) => string };
  /** The two pits on the river (minimap window): the drake pit, and the top pit (grubs, herald, baron). */
  pits?: { dragon: boolean; top: boolean; titles: (k: 'baron' | 'herald' | 'grubs' | 'elder' | string) => string };
  /** Team codes at each team's edge of the board, at the head of its drake row (minimap window). */
  teams?: Record<Team, string>;
  /** Leave out the "+1 unread" notes (the minimap window: the feed counts a fallen tower 0–15 s before
   *  the screen reading names it, so the note flashed and went; the maintainer found it a distraction). */
  noUnnamed?: boolean;
}

/** A dragon's head seen from the front on a 20x20 box: two horns sweeping out, a wide brow, a narrowing snout. */
/** A drake head's width on the ground (4.45: 2 px bigger than 3.8 on the 220-wide minimap at 150 %, 2026-10-19). */
const DRAKE_W = 4.45;
const HEAD: Pt[] = [[10, 6], [13, 5], [17.5, 0.5], [16, 5.5], [18, 8], [16.5, 11], [14, 13], [12.5, 18], [10, 19.5], [7.5, 18], [6, 13], [3.5, 11], [2, 8], [4, 5.5], [2.5, 0.5], [7, 5]];

/** One drake as a dragon's head standing on the ledge, in the map's 2.5D style: a darker side below, eyes and nostrils. */
function drakeHead(x: number, y: number, w: number, col: string, rim: string): string {
  const k = w / 20, x0 = x - w / 2, y0 = y - w;
  const at = ([px, py]: Pt, dy = 0) => `${n(x0 + px * k)},${n(y0 + py * k + dy)}`;
  const depth = w * 0.13;
  const eyes = [7.6, 12.4].map((ex) => `<ellipse cx="${n(x0 + ex * k)}" cy="${n(y0 + 10.2 * k)}" rx="${n(0.95 * k)}" ry="${n(0.65 * k)}" fill="#141418"/>`).join('');
  const nose = [9, 11].map((nx) => `<circle cx="${n(x0 + nx * k)}" cy="${n(y0 + 17 * k)}" r="${n(0.45 * k)}" fill="${shade(col, 0.45)}"/>`).join('');
  return `<ellipse cx="${n(x + 0.3)}" cy="${n(y + 0.4)}" rx="${n(w * 0.42)}" ry="${n(w * 0.16)}" fill="rgba(0,0,0,.45)"/>`
    + `<polygon points="${HEAD.map((p) => at(p, depth)).join(' ')}" fill="${shade(col, 0.5)}" ${RIM}/>`
    + `<polygon points="${HEAD.map((p) => at(p)).join(' ')}" fill="${col}" ${rim}/>${eyes}${nose}`;
}

/**
 * A team's drakes as small dragon heads in the map's own 2.5D style (front view; the maintainer chose
 * it over a coin and a side view, 2026-10-18), on the ledge in front of the board like a scoreboard,
 * never among the towers: blue's from the left after its code, red's from the right before its code
 * (red's row behind the far edge sat among the top lane's towers). In the order taken; elders after
 * them. With the soul, a gold rim. Then the team's voidgrubs as small grub cylinders (0–3): the pit only
 * shows how many are left, so who took them was nowhere (maintainer, 2026-10-24 second Swiss game).
 */
function drakeCoins(s: MatchState, o: NonNullable<MapOptions['drakes']>): Piece[] {
  const out: Piece[] = [];
  for (const t of TEAMS) {
    const team = s.teams[t];
    const coins: string[] = [...team.dragons, ...Array<string>(team.elders ?? 0).fill('elder')];
    const soul = s.soul?.team === t;
    coins.forEach((e, i) => {
      const [x0, y] = P(t === 'B' ? [15, 105.5] : [87, 105.5]);
      const x = t === 'B' ? x0 + i * 5 : x0 - i * 5;
      const c = ELEMENT_COLOUR[e as keyof typeof ELEMENT_COLOUR] ?? '#999';
      const rim = soul && e !== 'elder' ? 'stroke="#E8B04A" stroke-width="0.45"' : RIM;
      out.push({ y: y + 200, svg: `<g class="drake"><title>${o.titles(e)}</title>${drakeHead(x, y, DRAKE_W, c, rim)}</g>` });
    });
    const grubs = s.voidgrubs?.[t] ?? 0;
    for (let i = 0; i < grubs; i++) {
      const [x0, y] = P(t === 'B' ? [15, 105.5] : [87, 105.5]);
      const k = coins.length * 5 + 1 + i * 3;
      const x = t === 'B' ? x0 + k : x0 - k;
      out.push({ y: y + 200, svg: `<g class="grub"><title>${o.titles('grubs')} ${grubs}</title>${cylinder(x, y, 1.25, 1.3, GRUB_COL, shade(GRUB_COL, 0.55), RIM)}</g>` });
    }
  }
  return out;
}

// ---------- the pits ----------

/** On the river: the top pit (grubs, then herald, then baron) up-left, the drake pit down-right. */
const PIT_TOP: Pt = [30, 30], PIT_BOT: Pt = [70, 70];
const BARON_COL = '#9A6AD8', HERALD_COL = '#4FB6C2', GRUB_COL = '#B58AE6';
/** When each top-pit monster comes and goes (patch 26.x; the service's RULES). */
const GRUBS_AT = 8 * 60, GRUBS_GONE = 14 * 60 + 45, HERALD_AT = 15 * 60, HERALD_GONE = 19 * 60 + 45, BARON_AT = 20 * 60;

/**
 * The herald, not a dragon: a low shell with one big eye on its front (its best-known feature), in the
 * map's 2.5D style (maintainer, 2026-10-19: the dragon-head herald read as another drake).
 */
function heraldShell(x: number, y: number, w: number, col: string): string {
  const r = w * 0.55, h = w * 0.5;
  const dome = `M${n(x - r)} ${n(y)} A${n(r)} ${n(h * 1.6)} 0 0 1 ${n(x + r)} ${n(y)} A${n(r)} ${n(r * ER)} 0 0 1 ${n(x - r)} ${n(y)} Z`;
  return `<ellipse cx="${n(x + 0.3)}" cy="${n(y + 0.4)}" rx="${n(r * 1.1)}" ry="${n(r * 0.4)}" fill="rgba(0,0,0,.45)"/>`
    + `<path d="${dome}" fill="${col}" ${RIM}/>`
    + `<path d="M${n(x - r)} ${n(y)} A${n(r)} ${n(r * ER)} 0 0 0 ${n(x + r)} ${n(y)}" fill="none" stroke="${shade(col, 0.5)}" stroke-width="0.5"/>`
    + `<ellipse cx="${n(x)}" cy="${n(y - h * 0.8)}" rx="${n(r * 0.48)}" ry="${n(r * 0.36)}" fill="#F2F4F7" ${RIM}/>`
    + `<ellipse cx="${n(x)}" cy="${n(y - h * 0.8)}" rx="${n(r * 0.2)}" ry="${n(r * 0.28)}" fill="#141418"/>`;
}

function plinth(x: number, y: number): string {
  return cylinder(x, y, 4, 0.9, '#2A2F38', '#16191F', 'stroke="rgba(10,12,16,.65)" stroke-width="0.3"');
}

/**
 * The pits: the monster standing there when it is up, an empty pit with a countdown when it is not
 * (drakes from the feed and the respawn rules; the top pit by the clock, or the broadcast's objective box).
 */
function pits(s: MatchState, clock: number | null, timing: boolean, o: NonNullable<MapOptions['pits']>): Piece[] {
  const out: Piece[] = [];
  const at = (pt: Pt) => P(pt);
  const wait = (pt: Pt, until: number) => {
    const rest = timing ? left(until, clock) : null;
    if (rest !== null) out.push(tag(pt, 3.2, fmtClock(rest), null));
  };
  if (o.dragon) {
    const [x, y] = at(PIT_BOT);
    const d = s.nextDragon;
    const up = d !== null && clock !== null && clock >= d.at;
    const col = d?.elder ? ELEMENT_COLOUR.elder : d?.element ? ELEMENT_COLOUR[d.element] : '#8B93A1';
    const name = d?.elder ? o.titles('elder') : d?.element ? o.titles(d.element) : '';
    out.push({ y, svg: `<g class="pit">${name ? `<title>${name}</title>` : ''}${plinth(x, y)}${up ? drakeHead(x, y - 0.9, DRAKE_W, col, RIM) : ''}</g>` });
    if (d && !up) wait(PIT_BOT, d.at);
  }
  if (o.top && clock !== null) {
    const [x, y] = at(PIT_TOP);
    const grubsLeft = 3 - ((s.voidgrubs?.B ?? 0) + (s.voidgrubs?.R ?? 0));
    const kind = s.pitNext ?? (clock < GRUBS_GONE ? 'grubs' : clock < HERALD_GONE ? 'herald' : 'baron');
    let body = '', title = o.titles(kind), until: number | null = null;
    if (kind === 'grubs') {
      if (clock < GRUBS_AT) until = GRUBS_AT;
      else if (grubsLeft > 0) body = Array.from({ length: grubsLeft }, (_, i) => cylinder(x + (i - (grubsLeft - 1) / 2) * 2.7, y - 0.9, 1.25, 1.3, GRUB_COL, shade(GRUB_COL, 0.55), RIM)).join('');
    } else if (kind === 'herald') {
      const gone = s.herald?.status === 'taken' || s.herald?.status === 'taken_or_despawned';
      if (clock < HERALD_AT) until = HERALD_AT;
      else if (!gone) body = heraldShell(x, y - 0.9, DRAKE_W, HERALD_COL);
    } else {
      const due = s.nextBaron?.at ?? BARON_AT;
      if (clock < due) until = due;
      else body = drakeHead(x, y - 0.9, DRAKE_W * 1.15, BARON_COL, RIM);
    }
    out.push({ y, svg: `<g class="pit"><title>${title}</title>${plinth(x, y)}${body}</g>` });
    if (until !== null) wait(PIT_TOP, until);
  }
  return out;
}

function ground(): string {
  const corner = (pts: Pt[]) => pts.map((p) => P(p).map(n).join(',')).join(' ');
  const [, y0] = P([0, 0]), [, y1] = P([0, 100]);
  const lanes = [[[7, 86], [7, 7], [86, 7]], [[14, 93], [93, 93], [93, 14]], [[16, 84], [84, 16]]] as Pt[][];
  // The base tint reaches past the inhibitor turrets (about 22 from the nexus), so the base reads as the area they guard (2026-10-19).
  const base = (t: Team) => { const [x, y] = P(nexusAt(t)); return `<ellipse cx="${x}" cy="${n(y)}" rx="${n(26 * S)}" ry="${n(26 * S * K)}" fill="${TEAM_HEX[t]}" fill-opacity=".09"/>`; };
  const board = `x="0.5" y="${n(y0)}" width="${n(101 * S)}" height="${n(y1 - y0 + 0.5)}" rx="6" ry="${n(6 * K)}"`;
  // The base tints stay on the board.
  return `<defs><clipPath id="lolmap-board"><rect ${board}/></clipPath></defs>`
    + `<rect x="0.5" y="${n(y1)}" width="${n(101 * S)}" height="${SLAB + 0.5}" rx="2" fill="#121418"/>`
    + `<rect ${board} fill="var(--board)" stroke="var(--border)" stroke-width="0.5"/>`
    + `<g clip-path="url(#lolmap-board)"><polyline points="${corner([[16, 16], [84, 84]])}" fill="none" stroke="var(--river)" stroke-width="${n(6 * S)}" stroke-linecap="round"/>`
    + `${base('B')}${base('R')}</g>`
    + lanes.map((l) => `<polyline points="${corner(l)}" fill="none" stroke="var(--lane)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`).join('');
}

export function mapSvg(s: MatchState, clock: number | null, o: MapOptions): string {
  const pieces: Piece[] = [];
  const timing = timersOn(s);
  for (const t of TEAMS) {
    const team = s.teams[t];
    const known = s.towersKnown;
    const downLanes = new Map<Lane, number>();
    for (const i of team.inhibitorsDown) if (i.lane && (!timing || left(i.respawnAt, clock) !== null)) downLanes.set(i.lane, i.respawnAt);
    for (const l of LANES) {
      const down = o.inhibitors && downLanes.has(l);
      pieces.push(crystal(inhibAt(t, l), t, down));
      const at = downLanes.get(l);
      const rest = at !== undefined && timing && o.inhibTimers ? left(at, clock) : null;
      if (down && rest !== null) pieces.push(tag(inhibAt(t, l), 2.4, fmtClock(rest), t));
    }
    pieces.push(nexus(nexusAt(t), t));
    const nexusBack: number[] = [];
    for (const site of TOWER_SITES) {
      const tw = team.towers[site];
      const down = known && towerDown(tw, s, clock);
      pieces.push(tower(towerAt(t, site), t, isNexusTurret(site) ? 'nexusTurret' : 'tower', !known ? 'unknown' : down ? 'down' : tw.maybe ? 'maybe' : 'up'));
      if (down && isNexusTurret(site) && tw.respawnAt !== null) nexusBack.push(tw.respawnAt);
    }
    // Both nexus turrets usually fall together: one tag on the nexus, for the first to come back.
    const soonest = nexusBack.length ? Math.min(...nexusBack) : null;
    const rest = soonest !== null && timing && o.nexusTimers ? left(soonest, clock) : null;
    if (rest !== null) pieces.push(tag(nexusAt(t), 8.4, fmtClock(rest), t));
  }
  if (o.drakes) pieces.push(...drakeCoins(s, o.drakes));
  if (o.pits) pieces.push(...pits(s, clock, timing, o.pits));
  if (o.teams) {
    // On the front ledge: blue's code at the left end, red's at the right, each beside its drakes.
    const [bx, by] = P([1.5, 105.5]), [rx, ry] = P([100.5, 105.5]);
    pieces.push({ y: 999, svg: `<text class="tcode" x="${n(bx)}" y="${n(by)}" text-anchor="start" font-size="4.2" fill="${TEAM_HEX.B}">${o.teams.B}</text>` });
    pieces.push({ y: 999, svg: `<text class="tcode" x="${n(rx)}" y="${n(ry)}" text-anchor="end" font-size="4.2" fill="${TEAM_HEX.R}">${o.teams.R}</text>` });
  }
  pieces.sort((a, b) => a.y - b.y);

  const notes: string[] = [];
  for (const t of TEAMS) {
    const u = s.teams[t].unnamedLost;
    if (!s.towersKnown || u <= 0 || o.noUnnamed) continue;
    const [x, y, anchor] = t === 'B' ? [3, VIEW_H - 1.5, 'start'] : [99 * S, 5, 'end'];
    notes.push(`<text class="unnamed" x="${x}" y="${n(y)}" text-anchor="${anchor}" font-size="4.6"><title>${o.unnamedTitle}</title>${o.unnamed(u)}</text>`);
  }
  const title = s.towersKnown ? '' : `<title>${o.unknownTitle}</title>`;
  return `<svg class="map${s.towersKnown ? '' : ' unknown'}" viewBox="-0.5 0 ${VIEW_W} ${n(VIEW_H)}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="towers">${title}`
    + `${ground()}${pieces.map((p) => p.svg).join('')}${notes.join('')}</svg>`;
}
