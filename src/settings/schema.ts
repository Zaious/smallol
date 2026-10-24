// Every user setting, its default, and how a saved file is read back. Pure: tests run it on
// broken, old and hand-edited files. The file lives in the app config dir as settings.json.
// Copied from Basesmall's schema; the fields are SmalLoL's own.

import { DEFAULT_ENDPOINT, LEGACY_ENDPOINT } from '../data/streamcv/source.ts';

export const SETTINGS_VERSION = 1;

export type Background = 'solid' | 'semi' | 'clear';
export type Language = 'auto' | 'zh-Hant' | 'en';
export type GoldView = 'diff' | 'totals';
export type Size = { w: number; h: number };

/** Each piece of the widget can be turned off on its own. */
export const FEATURES = [
  'clock', 'kills', 'gold',
  'towers', 'nexusTimers', 'inhibitors',
  'dragons', 'soul', 'nextDragon',
  'barons', 'nextBaron', 'buffs',
  'voidgrubs', 'herald',
  'series', 'playerItems',
  'nextMatch',
] as const;
export type Feature = (typeof FEATURES)[number];

/** Views that open under the game, each on its own. */
export const VIEWS = ['draftGame', 'draftSeries', 'players', 'schedule'] as const;
export type ViewName = (typeof VIEWS)[number];

/** Windows the user opens and places (docs/UI_SPEC_v1.md §6): three panels and the data window. */
export const PANELS = ['minimap', 'draftGame', 'players', 'data'] as const;
export type PanelName = (typeof PANELS)[number];

/** Where an event goes (UI_SPEC §3): nowhere, the log only, a strip, or a card. */
export const CHANNELS = ['off', 'log', 'strip', 'card'] as const;
export type Channel = (typeof CHANNELS)[number];
/** The two presets, and custom (a preset plus the user's changes). */
export type NotifyMode = 'work' | 'companion' | 'custom';
/** What a custom setup started from; 'major' is the "big events only" template. */
export type NotifyBase = 'work' | 'companion' | 'major';
export const REMINDER_LEADS = [0, 5, 15, 30] as const;
export const SOON_LEADS = [15, 30, 60] as const;

export interface Settings {
  version: typeof SETTINGS_VERSION;
  language: Language;
  background: Background;
  /** Where the Stream CV service answers. Moves to a VPS later; the fields stay the same. */
  endpoint: string;
  show: Record<Feature, boolean>;
  /** Gold lead as one number, or both teams' totals. */
  gold: GoldView;
  /** Keep the clock and countdowns moving between the service's 5-second updates. */
  tickClock: boolean;
  /** Which views under the game are open. */
  views: Record<ViewName, boolean>;
  /** Hide series scores and winners (many watch the replay the next day). */
  spoilerFree: boolean;
  /** Window sizes per view ('size-game', 'size-settings'). */
  sizes: Record<string, Size>;
  /** Notifications: a preset, or custom (UI_SPEC §3). */
  mode: NotifyMode;
  /** Custom only: the preset it started from, and the user's changes by event kind. */
  modeBase: NotifyBase;
  custom: Record<string, Channel>;
  /** The one question on first launch has been answered. */
  asked: boolean;
  /** Which panels are open (each its own window). */
  panels: Record<PanelName, boolean>;
  /** The main window: the two-line bar, or the one-line dot. */
  barTier: 'bar' | 'dot';
  /** Minutes before a match to remind (0 = when it starts). */
  reminderLead: (typeof REMINDER_LEADS)[number];
  /** Where the notices stack: bottom-right (the spec), or top-right, clear of Windows' own notifications. */
  notifyCorner: 'br' | 'tr';
  /** Seconds before a drake, baron or elder spawns to say it is coming. */
  soonLead: (typeof SOON_LEADS)[number];
  /** Level and item milestones for every player, or only my team's. */
  milestones: 'all' | 'mine';
  /** My team's code: its events go one step up (log → strip → card). */
  myTeam: string | null;
  /** Low-key, turned on by hand: a small grey strip of numbers, no notices (batch 3 §2). Turned on by
   * presentation detection it is not saved. */
  lowKey: boolean;
  /** Terminalol: the bar drawn as a terminal window running a sync job, the game as its log lines. */
  terminal: boolean;
  /** The two global hotkeys (hide everything, low-key). */
  hotkeys: boolean;
  /** Go low-key by itself while Windows says not to disturb (full screen, presenting, quiet hours). */
  autoLowKey: boolean;
  /** A short tone with each card, two rising notes for a major one (off by default). */
  cardSound: boolean;
  soundVolume: 'low' | 'mid' | 'high';
  /** The user's own stream address, opened from a card's "▶ Watch" (empty: no button). */
  watchUrl: string;
  /** Ask GitHub once after start-up whether a newer version is out. */
  updateCheck: boolean;
}

export const DEFAULTS: Settings = {
  version: SETTINGS_VERSION,
  language: 'auto',
  background: 'solid',
  endpoint: DEFAULT_ENDPOINT,
  // Everything on: the widget is already small, and each piece is one glance.
  show: Object.fromEntries(FEATURES.map((f) => [f, true])) as Record<Feature, boolean>,
  gold: 'diff',
  tickClock: true,
  views: { draftGame: false, draftSeries: false, players: false, schedule: false },
  spoilerFree: true,
  sizes: {},
  mode: 'work',
  modeBase: 'work',
  custom: {},
  asked: false,
  panels: { minimap: false, draftGame: false, players: false, data: false },
  barTier: 'bar',
  reminderLead: 15,
  notifyCorner: 'br',
  soonLead: 30,
  milestones: 'all',
  myTeam: null,
  lowKey: false,
  terminal: false,
  hotkeys: true,
  autoLowKey: true,
  cardSound: false,
  soundVolume: 'mid',
  watchUrl: '',
  updateCheck: true,
};

const oneOf = <T extends string>(v: unknown, options: readonly T[], fallback: T): T =>
  (options as readonly unknown[]).includes(v) ? (v as T) : fallback;
const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/** An http(s) URL without spaces, at most 300 characters. */
export function validEndpoint(v: unknown): v is string {
  if (typeof v !== 'string' || v.length > 300 || /\s/.test(v)) return false;
  try { const u = new URL(v); return u.protocol === 'http:' || u.protocol === 'https:'; } catch { return false; }
}

/** Why a stream address is refused, or null when it is fine (empty is fine: no button). Same rules as
 * src-tauri's watch_url_ok: http or https, a host, no user name or password, at most 2048 characters. */
export function watchUrlProblem(v: string): 'scheme' | 'credentials' | 'long' | 'bad' | null {
  if (v === '') return null;
  if (v.length > 2048) return 'long';
  let u: URL;
  try { u = new URL(v); } catch { return 'bad'; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return 'scheme';
  if (u.username || u.password) return 'credentials';
  if (!u.hostname) return 'bad';
  return null;
}

function size(v: unknown): Size | undefined {
  const o = obj(v);
  const w = Number(o.w), h = Number(o.h);
  return Number.isFinite(w) && Number.isFinite(h) && w >= 100 && h >= 20 && w <= 10000 && h <= 10000
    ? { w: Math.round(w), h: Math.round(h) } : undefined;
}

/**
 * Read whatever was saved into a complete, valid Settings. Unknown fields are dropped, bad values
 * fall back to their defaults one by one, so a hand-edited typo never loses the rest of the file.
 */
export function normalize(raw: unknown): Settings {
  const o = obj(raw);
  const d = DEFAULTS;
  const show = obj(o.show), views = obj(o.views), panels = obj(o.panels);
  const custom: Record<string, Channel> = {};
  for (const [k, v] of Object.entries(obj(o.custom))) if (/^[a-zA-Z]{1,24}$/.test(k) && (CHANNELS as readonly unknown[]).includes(v)) custom[k] = v as Channel;
  const sizes: Record<string, Size> = {};
  for (const [k, v] of Object.entries(obj(o.sizes))) {
    const s = size(v);
    if (s && /^size-[a-z-]+$/.test(k)) sizes[k] = s;
  }
  return {
    version: SETTINGS_VERSION,
    language: oneOf(o.language, ['auto', 'zh-Hant', 'en'], d.language),
    background: oneOf(o.background, ['solid', 'semi', 'clear'], d.background),
    // The old default saved by 0.1.0–0.1.3 is the default, not a choice: it moves to the new address.
    endpoint: validEndpoint(o.endpoint) && o.endpoint !== LEGACY_ENDPOINT ? o.endpoint : d.endpoint,
    show: Object.fromEntries(FEATURES.map((f) => [f, bool(show[f], d.show[f])])) as Record<Feature, boolean>,
    gold: oneOf(o.gold, ['diff', 'totals'], d.gold),
    tickClock: bool(o.tickClock, d.tickClock),
    views: Object.fromEntries(VIEWS.map((v) => [v, bool(views[v], d.views[v])])) as Record<ViewName, boolean>,
    spoilerFree: bool(o.spoilerFree, d.spoilerFree),
    sizes,
    mode: oneOf(o.mode, ['work', 'companion', 'custom'], d.mode),
    modeBase: oneOf(o.modeBase, ['work', 'companion', 'major'], d.modeBase),
    custom,
    asked: bool(o.asked, d.asked),
    panels: Object.fromEntries(PANELS.map((p) => [p, bool(panels[p], d.panels[p])])) as Record<PanelName, boolean>,
    barTier: oneOf(o.barTier, ['bar', 'dot'], d.barTier),
    reminderLead: (REMINDER_LEADS as readonly unknown[]).includes(o.reminderLead) ? (o.reminderLead as Settings['reminderLead']) : d.reminderLead,
    notifyCorner: oneOf(o.notifyCorner, ['br', 'tr'], d.notifyCorner),
    soonLead: (SOON_LEADS as readonly unknown[]).includes(o.soonLead) ? (o.soonLead as Settings['soonLead']) : d.soonLead,
    milestones: oneOf(o.milestones, ['all', 'mine'], d.milestones),
    myTeam: typeof o.myTeam === 'string' && /^[A-Za-z0-9]{2,5}$/.test(o.myTeam) ? o.myTeam : null,
    lowKey: bool(o.lowKey, d.lowKey),
    terminal: bool(o.terminal, d.terminal),
    hotkeys: bool(o.hotkeys, d.hotkeys),
    autoLowKey: bool(o.autoLowKey, d.autoLowKey),
    cardSound: bool(o.cardSound, d.cardSound),
    soundVolume: oneOf(o.soundVolume, ['low', 'mid', 'high'], d.soundVolume),
    watchUrl: typeof o.watchUrl === 'string' && watchUrlProblem(o.watchUrl) === null ? o.watchUrl : d.watchUrl,
    updateCheck: bool(o.updateCheck, d.updateCheck),
  };
}
