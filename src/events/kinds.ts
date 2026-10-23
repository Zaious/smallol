// What can happen in a game, how much it matters, and where each preset sends it (docs/UI_SPEC_v1.md §3).
// Batch 1 kinds come straight from the service's state; batch 2 kinds are worked out from timers, the
// players and the gold. Pure data and lookups.

import type { Channel, NotifyBase, Settings } from '../settings/schema.ts';
import type { Element, Lane, Team } from '../model/types.ts';

export const EVENT_KINDS = [
  'reminder', 'bpStart', 'ban', 'pick', 'bpDone', 'gameStart', 'gameEnd', 'seriesEnd',
  'tower', 'inhibTower', 'nexusTower', 'inhibitor', 'inhibRespawn', 'nexusRespawn',
  'drake', 'herald', 'grubs', 'soulPoint', 'soul', 'elder', 'baron',
  'dragonSoon', 'bossSoon', 'baronBuffEnding',
  'kill', 'goldLead5k', 'goldLead10k', 'goldFlip',
  'level6', 'level11', 'firstLegendary',
] as const;
export type EventKind = (typeof EVENT_KINDS)[number];

/** How much it matters: how long it holds the log line, and whether the bar glows (§1). */
export type Level = 'major' | 'important' | 'normal';

export interface GameEvent {
  kind: EventKind;
  /** The team that did it (took the drake, pushed the tower); null for neutral events. */
  team: Team | null;
  /** The team it happened to (lost the tower or inhibitor). */
  victim?: Team;
  /** Game clock (seconds), when known. */
  at: number | null;
  /** Kind-specific details. */
  lane?: Lane | null;
  tower?: 'outer' | 'inner';
  element?: Element;
  /** The team's nth drake, total grubs, the game number. */
  n?: number;
  champion?: string;
  /** Series score after the game, for seriesEnd. */
  score?: [number, number];
  /** Picks per side for bpDone, in slot order. */
  picks?: Record<Team, string[]>;
  /** Players: who (short name) and where they play; the victim of a kill. */
  player?: string;
  role?: string | null;
  victimPlayer?: string;
  /** A kill nobody else had a hand in (one death, one killer, no assists). */
  solo?: boolean;
  /** Gold lead in thousands; seconds to go for countdowns; which boss spawns; the item finished. */
  lead?: number;
  secondsLeft?: number;
  boss?: 'baron' | 'elder';
  item?: number;
  /** For a card's second line (UI_SPEC §2 rev.): buff time left, the gold lead, an inhibitor's respawn, a game's length. */
  buffLeft?: number;
  gold?: { team: Team; amount: number };
  respawnIn?: number;
  duration?: number;
  /** Reminder: minutes to go, and the two teams. */
  minutes?: number;
  teams?: [string, string];
  stage?: string;
}

export const LEVEL: Record<EventKind, Level> = {
  reminder: 'major', ban: 'normal', pick: 'normal', bpDone: 'important',
  gameStart: 'major', gameEnd: 'major', seriesEnd: 'major',
  tower: 'normal', inhibTower: 'important', nexusTower: 'important', inhibitor: 'major',
  drake: 'important', herald: 'important', grubs: 'normal', soul: 'major', elder: 'major', baron: 'major',
  bpStart: 'normal', inhibRespawn: 'normal', nexusRespawn: 'normal', soulPoint: 'important',
  dragonSoon: 'normal', bossSoon: 'normal', baronBuffEnding: 'normal',
  kill: 'normal', goldLead5k: 'normal', goldLead10k: 'normal', goldFlip: 'important',
  level6: 'normal', level11: 'normal', firstLegendary: 'normal',
};

/** Batch 2 kinds (UI_SPEC §3): the same rows in every preset. */
const B2: Record<'work' | 'companion' | 'major', Partial<Record<EventKind, Channel>>> = {
  work: { bpStart: 'strip', inhibRespawn: 'log', nexusRespawn: 'log', soulPoint: 'card', dragonSoon: 'off', bossSoon: 'off', baronBuffEnding: 'off',
    kill: 'log', goldLead5k: 'log', goldLead10k: 'log', goldFlip: 'strip', level6: 'off', level11: 'off', firstLegendary: 'off' },
  companion: { bpStart: 'log', inhibRespawn: 'log', nexusRespawn: 'log', soulPoint: 'strip', dragonSoon: 'strip', bossSoon: 'strip', baronBuffEnding: 'strip',
    kill: 'log', goldLead5k: 'log', goldLead10k: 'strip', goldFlip: 'strip', level6: 'strip', level11: 'log', firstLegendary: 'strip' },
  major: { bpStart: 'log', inhibRespawn: 'log', nexusRespawn: 'log', soulPoint: 'off', dragonSoon: 'off', bossSoon: 'off', baronBuffEnding: 'off',
    kill: 'log', goldLead5k: 'off', goldLead10k: 'off', goldFlip: 'off', level6: 'off', level11: 'off', firstLegendary: 'off' },
};

/** Work: not watching, the app is the game. Companion: watching, only what the broadcast does not say. */
export const PRESETS = {
  work: {
    reminder: 'card', ban: 'log', pick: 'strip', bpDone: 'card', gameStart: 'card', gameEnd: 'card', seriesEnd: 'card',
    tower: 'strip', inhibTower: 'strip', nexusTower: 'strip', inhibitor: 'card',
    drake: 'strip', herald: 'strip', grubs: 'strip', soul: 'card', elder: 'card', baron: 'card',
  },
  companion: {
    reminder: 'card', ban: 'log', pick: 'log', bpDone: 'log', gameStart: 'log', gameEnd: 'log', seriesEnd: 'log',
    tower: 'log', inhibTower: 'log', nexusTower: 'log', inhibitor: 'log',
    drake: 'log', herald: 'log', grubs: 'log', soul: 'log', elder: 'log', baron: 'log',
  },
  major: {
    reminder: 'card', ban: 'off', pick: 'off', bpDone: 'log', gameStart: 'card', gameEnd: 'card', seriesEnd: 'card',
    tower: 'log', inhibTower: 'log', nexusTower: 'log', inhibitor: 'card',
    drake: 'log', herald: 'log', grubs: 'off', soul: 'card', elder: 'card', baron: 'card',
  },
} as Record<NotifyBase, Record<EventKind, Channel>>;
for (const b of ['work', 'companion', 'major'] as const) Object.assign(PRESETS[b], B2[b]);

/** Where this event goes under the user's settings. */
export function channelOf(kind: EventKind, s: Pick<Settings, 'mode' | 'modeBase' | 'custom'>): Channel {
  if (s.mode !== 'custom') return PRESETS[s.mode][kind];
  return s.custom[kind] ?? PRESETS[s.modeBase][kind];
}

/**
 * "My team" (UI_SPEC §3 rev. after batch 2): an important or major event that touches it goes up to a
 * strip at most (log → strip); cards stay cards, normal events (towers, kills, levels) stay where they
 * are. Raising everything turned every tower and death of my team into a card or a strip.
 */
export function raise(ch: Channel, level: Level): Channel {
  return level !== 'normal' && ch === 'log' ? 'strip' : ch;
}
