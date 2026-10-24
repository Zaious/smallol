// The main window: the sentinel bar (docs/UI_SPEC_v1.md). Two rows — the game's status and one log
// line — and, in the corner of the screen, cards and strips when something happens. Everything
// else (minimap, this game's draft, players, the data window) opens as its own window.
// Runs in a plain browser too (no windows or notifications there), which is how the bar is checked headless.
// Checking aids (launch args in the app, ?query in a browser), never saved:
//   --sample       show the bundled sample instead of asking the service (dev builds only)
//   --demo         with the sample: treat it as a game in progress, so countdowns run
//   --set=path:value,...  change settings in memory (e.g. language:en,mode:companion)
//   --open=history|mode|panels|ask   open that popover once started (screenshots without clicking)
//   --tab=teams|schedule|series|settings, --team=GEN, --player=GEN:Canyon   open the data window there
//   --match=<matchId>|next   with --tab=schedule: that match picked (both teams, their links)
//   --anim-log=<file>   every animation's start, end and cancel (bar and notices) into that file in the config folder
//   --press=hide|lowkey[:seconds],...   run what a hotkey runs, at those seconds after start (else one every 3 s; no keys sent)
//   --notify-state=busy|d3d|presentation|quiet|app|away|ok[:seconds],...   stand in for Windows' answer
//   --drag=main|minimap|draftGame|players|data,<x>,<y>[,alt][,held]   move that window there (logical px) and let
//                  it go (held: as if the button stayed down for a second first)
//   --scroll=general   with --tab=settings: the settings tab scrolled to that section
//   --inject=<event kind>[+kind][:seconds],...   feed those events (team blue) in one step at those seconds, as if the game made them
//   --click=watch|body[:seconds],...   click the newest card's "▶ 看" or its body in the notification window
//   --devlog       each step's notices, quiet state and tones into the dev log
//   --no-tray      (read by the shell too) no tray icon: hiding everything is refused unless a hotkey can undo it

import { getCurrentWindow, currentMonitor } from '@tauri-apps/api/window';
import { LogicalPosition, LogicalSize, PhysicalPosition } from '@tauri-apps/api/dpi';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { emitTo, listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { DEFAULT_ENDPOINT, LEGACY_ENDPOINT, Poller, StateSource, type Connection } from '../data/streamcv/source.ts';
import { adaptSchedule, nextMatch, scheduleUrl } from '../data/streamcv/schedule.ts';
import { adaptPlayers, adaptTeams, historyUrl } from '../data/streamcv/history.ts';
import type { History } from '../model/history.ts';
import { adaptRoster, rosterPlayer, rosterUrl } from '../data/streamcv/roster.ts';
import type { RosterTeam } from '../model/roster.ts';
import type { Schedule } from '../model/schedule.ts';
import { adapt, emptyState } from '../data/streamcv/adapter.ts';
import { clockNow, fmtClock, steadyClock } from '../model/clock.ts';
import { LANES, TEAMS, type Lane, type MatchState, type Team, type TowerSite } from '../model/types.ts';
import { championName } from '../data/champions.ts';
import { detectLang, STRINGS, type Lang } from '../i18n/index.ts';
import { BAR_STRINGS, macKeys, type DataTab } from '../i18n/bar.ts';
import { DEFAULTS, normalize, PANELS, watchUrlProblem, type NotifyBase, type PanelName, type Settings, type Size } from '../settings/schema.ts';
import { SettingsStore, type SettingsBackend } from '../settings/store.ts';
import { Announced, deriveEvents, dueReminders, winnerOf } from '../events/derive.ts';
import { deriveMore, Memory } from '../events/derive2.ts';
import { Dispatcher, replacesLine, type LineUpdate } from '../events/dispatch.ts';
import { channelOf, EVENT_KINDS, LEVEL, type EventKind, type GameEvent, type Level } from '../events/kinds.ts';
import { eventText } from '../events/text.ts';
import { addEntries, historyView, parseEntries, type HistFilter, type LogEntry } from '../events/history-log.ts';
import { Notifier } from '../notify/notifier.ts';
import { Panels } from '../panels/manager.ts';
import { panelLabel, PANEL_SIZE, type PanelFrame } from '../panels/frame.ts';
import { TEAM_COLOUR } from '../render/map-svg.ts';
import { ELEMENT_COLOUR } from '../render/dragons.ts';
import { fmtStart } from './schedule-views.ts';
import { modeLabel } from './settings-view.ts';
import { AutoLow, detectionMode, OS_STATES, type OsState } from './autolow.ts';
import { playTone } from './sound.ts';
import { findNewer, installNewer, openReleasePage, type Newer } from './updates.ts';
import { getVersion } from '@tauri-apps/api/app';
import { LET_GO_MS, letGo, RECHECK_MS, snap, type Target } from './snap.ts';
import { esc, fmtGold } from './views.ts';

const inTauri = '__TAURI_INTERNALS__' in window;
const win = inTauri ? getCurrentWindow() : null;
const bar = document.getElementById('bar')!;
const rowA = document.getElementById('rowA')!;
const rowB = document.getElementById('rowB')!;
const icons = document.getElementById('icons')!;
const pop = document.getElementById('pop')!;

// ---------- settings ----------

const local = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* none */ } },
};
const backend: SettingsBackend = inTauri
  ? { read: () => invoke<string | null>('read_settings'), write: (text) => invoke('write_settings', { text }) }
  : { read: async () => local.get('settings'), write: async (text) => local.set('settings', text) };

let settings = new SettingsStore(backend, DEFAULTS);
settings.persist = false;
const cfg = () => settings.current;

let lang: Lang = 'en';
let S = STRINGS.en;
let B = BAR_STRINGS.en;
function applyLanguage(): void {
  const l = cfg().language;
  lang = l === 'auto' ? detectLang(navigator.language) : l;
  S = STRINGS[lang];
  B = BAR_STRINGS[lang];
  document.documentElement.lang = lang;
  notifier.more = B.more;
  notifier.corner = cfg().notifyCorner;
}
function applyBackground(): void {
  for (const el of [bar, pop]) { el.classList.remove('bg-solid', 'bg-semi', 'bg-clear'); el.classList.add(`bg-${cfg().background}`); }
}

function setPath(path: string, value: unknown): void {
  settings.update((d) => {
    const keys = path.split('.');
    let o = d as unknown as Record<string, unknown>;
    for (const k of keys.slice(0, -1)) {
      const next = o[k];
      if (!next || typeof next !== 'object') return;
      o = next as Record<string, unknown>;
    }
    const last = keys[keys.length - 1]!;
    if (last in o) o[last] = typeof o[last] === 'number' ? Number(value) : value;
  });
}

// ---------- window size ----------

// 380 wide by default: score, clock, gold lead and two countdowns fit (340 dropped the gold lead in play;
// maintainer and interaction designer, 2026-10-18). The user can still pull it from 300 to 600.
const BAR_SIZE: Record<'bar' | 'dot', Size> = { bar: { w: 380, h: 48 }, dot: { w: 220, h: 28 } };
const WIDTH_RANGE: Record<'bar' | 'dot', [number, number]> = { bar: [300, 600], dot: [180, 600] };
const tier = () => cfg().barTier;
const barWidth = () => cfg().sizes[`size-${tier()}`]?.w ?? BAR_SIZE[tier()].w;
/** Low-key (batch 3 §2): one grey line of numbers, 150×24, top-left where the bar was. Never saved as the bar's size. */
const LOW_SIZE: Size = { w: 150, h: 24 };
/**
 * Terminalol (2026-10-24): the bar as a terminal pane. Six lines; during a draft and a game four more,
 * the draft and the towers (the game windows stay shut in this look, so their news goes in here).
 * Never saved as the bar's size.
 */
const TERM_SIZE: Size = { w: 470, h: 120 }, TERM_TALL: Size = { w: 560, h: 188 };
const termTall = () => state.status === 'waiting' || state.status === 'in_game';
const termSize = () => (termTall() ? TERM_TALL : TERM_SIZE);
const winWidth = () => (lowKeyOn() ? LOW_SIZE.w : termOn() ? termSize().w : barWidth());
type Pop = null | 'mode' | 'panels' | 'ask' | 'history';
let popKind: Pop = null;
let popH = 0;
/** The bar's top-left while a popover opens upward, to put the window back after. */
let restoreY: number | null = null;

let resizingTo = false;
async function resizeTo(w: number, h: number): Promise<void> {
  if (!win) return;
  resizingTo = true;
  selfMoveUntil.set('main', Date.now() + 500);
  await win.setSize(new LogicalSize(w, h)).catch(() => undefined);
  setTimeout(() => { resizingTo = false; }, 300);
}
const wantedHeight = () => (lowKeyOn() ? LOW_SIZE.h : termOn() ? termSize().h : BAR_SIZE[tier()].h + (popKind ? popH + 4 : 0));
async function fitWindow(): Promise<void> { await resizeTo(winWidth(), wantedHeight()); }
/** Position and size together (src-tauri set_bounds): two calls made the bar flicker as a popover opened upward. */
async function setBounds(x: number, y: number, h: number): Promise<void> {
  resizingTo = true;
  // The app's own moves (a popover opening upward and closing) are not the user letting go: no snapping.
  selfMoveUntil.set('main', Date.now() + 500);
  await invoke('set_bounds', { label: 'main', x, y, w: winWidth(), h, show: false }).catch(() => undefined);
  setTimeout(() => { resizingTo = false; }, 300);
}

/** Until when a window's moves are the app's own (ms), per window label. */
const selfMoveUntil = new Map<string, number>();

let saveTimer: ReturnType<typeof setTimeout> | null = null;
window.addEventListener('resize', () => {
  render();
  if (!win || resizingTo) return;
  // Only the width is the user's: the bar's height is fixed (UI_SPEC §1).
  if (Math.abs(window.innerHeight - wantedHeight()) > 1) void resizeTo(window.innerWidth, wantedHeight());
  if (popKind || lowKeyOn() || termOn()) return;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const [lo, hi] = WIDTH_RANGE[tier()];
    const w = Math.max(lo, Math.min(hi, window.innerWidth));
    settings.update((d) => { d.sizes[`size-${tier()}`] = { w, h: BAR_SIZE[tier()].h }; });
  }, 600);
});

/** Open a popover under the bar, or above it when the bar sits low on the screen. */
async function openPop(kind: Pop): Promise<void> {
  if (popKind === kind) { await closePop(); return; }
  if (popKind) await closePop();
  popKind = kind;
  render();
  pop.hidden = false;
  popH = Math.ceil(pop.scrollHeight);
  pop.classList.toggle('hist', kind === 'history');
  document.body.classList.add('has-pop');
  if (win) {
    const mon = await currentMonitor();
    const scale = await win.scaleFactor();
    const pos = (await win.outerPosition()).toLogical(scale);
    const bottom = mon ? (mon.workArea.position.y + mon.workArea.size.height) / mon.scaleFactor : Infinity;
    const up = pos.y + BAR_SIZE[tier()].h + popH + 4 > bottom;
    document.body.classList.toggle('up', up);
    if (kind === 'history' && up !== histUp) { histUp = up; delete pop.dataset.html; render(); }
    if (up) restoreY = pos.y;
    await setBounds(pos.x, up ? pos.y - popH - 4 : pos.y, wantedHeight());
  }
}
async function closePop(): Promise<void> {
  if (!popKind) return;
  popKind = null;
  pop.hidden = true;
  pop.innerHTML = '';
  // Forget what was drawn: the same menu opened again must be drawn again (it came up empty the second time).
  delete pop.dataset.html;
  document.body.classList.remove('has-pop');
  if (win) {
    const scale = await win.scaleFactor();
    const pos = (await win.outerPosition()).toLogical(scale);
    await setBounds(pos.x, restoreY ?? pos.y, wantedHeight());
  }
  restoreY = null;
  document.body.classList.remove('up');
}

// ---------- data ----------

let state: MatchState = emptyState();
let prevState: MatchState | null = null;
let receivedAt = Date.now();
let conn: Connection = 'connecting';
let sample = false;
let haveLive = false;
const flags = { sample: false, demo: false };

const announced = new Announced();
const memory = new Memory();
const dispatcher = new Dispatcher();
const notifier = new Notifier();
const reminded = new Set<string>();
let pausedUntil = 0;
const paused = () => Date.now() < pausedUntil;
/** Low-key turned on by presentation detection (never saved); by hand it is the lowKey setting. */
const auto = new AutoLow();
const lowKeyOn = () => cfg().lowKey || auto.on;
/** Terminalol on (low-key, when on too, wins: it is smaller still). */
const termOn = () => cfg().terminal && !lowKeyOn();
/** Every window put away by the hide hotkey (never saved: each start shows them). */
let hiddenByKey = false;
/** No cards, strips or sounds: paused, low-key, or hidden. The log line and the history go on. */
const quiet = () => paused() || lowKeyOn() || termOn() || hiddenByKey;

/** The log history (UI_SPEC §5): the last five games, saved to log-history.json. */
let logList: LogEntry[] = [];
let histFilter: HistFilter = 'all';
/** The history opened upward (the bar low on the screen): newest at the bottom, next to the bar. */
let histUp = false;
let saveHistTimer: ReturnType<typeof setTimeout> | null = null;
function saveHistory(): void {
  if (saveHistTimer) clearTimeout(saveHistTimer);
  saveHistTimer = setTimeout(() => {
    const text = JSON.stringify(logList);
    if (inTauri) void invoke('write_history', { text }).catch(() => undefined); else local.set('log-history', text);
  }, 2000);
}
function logEvents(events: GameEvent[], s: MatchState): void {
  const code = codeOf(s);
  // One group per game of the series: the draft (no game id yet) and the game itself together.
  const game = s.series?.matchId ? `${s.series.matchId}-${s.series.game}` : s.gameId ?? `m-${s.draft?.current?.game ?? 0}`;
  const add = events.filter((e) => e.kind !== 'reminder' && channelOf(e.kind, cfg()) !== 'off').map((e): LogEntry => ({
    game, n: s.series?.game ?? s.draft?.current?.game ?? null, teams: [code('B'), code('R')], at: e.at, text: eventText(e, code, lang, cfg().spoilerFree).title,
    level: LEVEL[e.kind], side: e.team, code: e.team ? code(e.team) : null, victim: e.victim ? code(e.victim) : null, t: Date.now(),
    player: e.player, victimPlayer: e.victimPlayer,
  }));
  if (!add.length) return;
  logList = addEntries(logList, add);
  saveHistory();
}

/** The log line on the bar, and how long it has held. */
interface Line extends LineUpdate { shownAt: number; game: string | null; quiet?: boolean }
let line: Line | null = null;
/** A 3-second note (mode changed, paused) that never enters the log. */
let note: { text: string; until: number } | null = null;

const codeOf = (s: MatchState) => (t: Team) => s.series?.teams[t].code ?? S.team[t];

function onEvents(events: ReturnType<typeof deriveEvents>, s: MatchState): void {
  if (!events.length) return;
  const now = Date.now();
  logEvents(events, s);
  const res = dispatcher.step(events, now, cfg(), codeOf(s), lang, quiet());
  if (res.line && replacesLine(line, res.line.level, now)) showLine({ ...res.line, shownAt: now, game: s.gameId });
  if (res.notices.length && inTauri && !quiet()) {
    notifier.watch = cfg().watchUrl ? B.b3.watch : null;
    void notifier.push(res.notices);
    // One tone per card, from this page (a hidden notification window would have it throttled).
    const card = res.notices.find((n) => n.kind === 'card');
    if (card && cfg().cardSound && card.level !== 'normal') { soundCalls++; playTone(card.level, cfg().soundVolume); }
  }
  if (devlog) void invoke('dev_log', { text: `step kinds=${events.map((e) => e.kind).join('+')} notices=${res.notices.map((n) => n.kind).join('+') || '-'} sent=${!quiet() && res.notices.length > 0} quiet=${quiet()} (paused ${paused()} low ${lowKeyOn()} hidden ${hiddenByKey}) tones=${soundCalls}` });
}

/** Tones played, for the checking runs (low-key, paused and hidden must play none). */
let soundCalls = 0;
let devlog = false;

let lineEl: HTMLElement | null = null;
/** Each log line's number, so the animation log can tell lines apart. */
let lineSeq = 0;
function lineHtml(l: { text: string; at: number | null; team: Team | null }): string {
  const t = l.at === null ? '' : `<span class="t">${fmtClock(l.at)}</span>`;
  return `${t}<i class="mark" style="--c:${l.team ? TEAM_COLOUR[l.team] : 'var(--accent)'}"></i><span class="x">${esc(l.text)}</span>`;
}
/** Swap the log line: the old one leaves upward, the new one slides in (UI_SPEC §1). */
function showLine(l: Line): void {
  line = l;
  swapLine(lineHtml(l), l.level, !!l.quiet);
  // Something happened: light the bar up, then let it settle back over 10 s.
  bar.classList.add('lit');
  requestAnimationFrame(() => requestAnimationFrame(() => bar.classList.remove('lit')));
  bar.style.setProperty('--c', l.team ? TEAM_COLOUR[l.team] : 'var(--accent)');
  if (l.level === 'major' && !lowKeyOn()) { bar.classList.remove('glow'); void bar.offsetWidth; bar.classList.add('glow'); }
}
function swapLine(html: string, level: Level | null, quiet: boolean): void {
  if (lineEl && lineEl.dataset.html === html) return;
  const old = lineEl;
  const el = document.createElement('div');
  el.className = `line in${level && level !== 'normal' ? ' flash' : ''}${quiet ? ' quiet' : ''}`;
  el.dataset.n = String(++lineSeq);
  el.innerHTML = html;
  el.dataset.html = html;
  rowB.appendChild(el);
  lineEl = el;
  // Removed when its fade ends (at exactly 120 ms the timer cut it short of its end), or at 400 ms at most.
  if (old) { old.classList.add('out'); old.addEventListener('animationend', (e) => { if (e.target === old) old.remove(); }); setTimeout(() => old.remove(), 400); }
}

const source = new StateSource(DEFAULTS.endpoint, {
  onState(s, at) {
    haveLive = true;
    // The clock only moves on: a snapshot repeating the feed's last time does not pull it back.
    s = { ...s, clock: steadyClock(state, receivedAt, s, at) };
    sample = false;
    if (state.gameId !== s.gameId) dispatcher.reset();
    prevState = state.status === 'idle' && !haveSeen ? null : state;
    onEvents([...deriveEvents(prevState, s, announced), ...deriveMore(prevState, s, memory, { soonSec: cfg().soonLead })], s);
    haveSeen = true;
    const statusWas = state.status;
    state = s;
    receivedAt = at;
    if (s.status !== statusWas) void panels?.sync(shownPanels());
    sendPanels();
    render();
  },
  onConnection(c, failures) { conn = c; render(); fallBack(failures); },
});

/**
 * The address in use. The default one can fail on its own (a new domain, its certificate): after three
 * failures in a row the app tries the old address for this run, and back again if that fails too.
 * A user's own address is never swapped.
 */
let onLegacy = false;
const endpointNow = () => (cfg().endpoint === DEFAULT_ENDPOINT && onLegacy ? LEGACY_ENDPOINT : cfg().endpoint);
function useEndpoint(url: string): void {
  if (!flags.sample) source.setUrl(url);
  schedulePoller.setUrl(scheduleUrl(url));
  teamsPoller.setUrl(historyUrl(url, 'teams'));
  playersPoller.setUrl(historyUrl(url, 'players'));
  rosterPoller.setUrl(rosterUrl(url));
}
function fallBack(failures: number): void {
  if (cfg().endpoint !== DEFAULT_ENDPOINT || failures < 3 || failures % 3 !== 0) return;
  onLegacy = !onLegacy;
  useEndpoint(endpointNow());
}
/**
 * The game's windows open only when there is something in them (2026-10-18 request): no match, none;
 * during the draft, this game's draft; in the game and after it, every one the user ticked. A tick means
 * "show it during matches". The data window is the user's to open and close.
 */
function shownPanels(): Record<PanelName, boolean> {
  const p = cfg().panels, st = state.status;
  const game = st === 'in_game' || st === 'finished', draft = st === 'waiting';
  return { minimap: p.minimap && game, players: p.players && game, draftGame: p.draftGame && (game || draft), data: p.data };
}

/** The first snapshot after start has no "before": no events, a baseline line instead. */
let haveSeen = false;

async function loadSample(): Promise<void> {
  if (!import.meta.env.DEV) return;
  const game = await import('../../fixtures/streamcv/state_v05_kc_mvk_g2.json');
  let s = adapt(game.default);
  if (flags.demo && s.status === 'finished') s = { ...s, status: 'in_game' };
  state = s;
  receivedAt = Date.now();
  sample = true;
  sendPanels();
  render();
}

let schedule: Schedule | null = null;
const schedulePoller = new Poller<Schedule>(scheduleUrl(DEFAULTS.endpoint), adaptSchedule, 5 * 60_000, { onData(s) { schedule = s; sendPanels(); render(); } });
const history: History = { teams: null, players: null };
const HISTORY_MS = 3 * 60_000;
const teamsPoller = new Poller(historyUrl(DEFAULTS.endpoint, 'teams'), adaptTeams, HISTORY_MS, { onData(t) { history.teams = t; sendPanels(); } });
const playersPoller = new Poller(historyUrl(DEFAULTS.endpoint, 'players'), adaptPlayers, HISTORY_MS, { onData(p) { history.players = p; sendPanels(); } });
let roster: Record<string, RosterTeam> | null = null;
const rosterPoller = new Poller(rosterUrl(DEFAULTS.endpoint), adaptRoster, 30 * 60_000, { onData(r) { roster = r; sendPanels(); } });

// ---------- panels ----------

let dataTab: DataTab = 'schedule';
let profile: { team: string | null; player: string | null } = { team: null, player: null };
let pickedMatch: string | null = null;
let endpointError = false;
let watchError: ReturnType<typeof watchUrlProblem> = null;
// ---- new versions (Basesmall's way): asked once after start-up, or from the settings
let appVersion = '0.0.0';
let newer: Newer | null = null;
let updateAsk: 'idle' | 'asking' | 'none' = 'idle';
/** The download's progress, or why it failed; shown in row B and the settings. */
let updateNote: string | null = null;
function askNewer(): void {
  if (!inTauri || updateAsk === 'asking') return;
  updateAsk = 'asking'; sendPanels();
  void findNewer(appVersion).then((r) => { newer = r; updateAsk = r ? 'idle' : 'none'; render(); sendPanels(); });
}
function startUpdate(): void {
  if (!newer || updateNote) return;
  if (!newer.update) { void openReleasePage(newer.tag); return; }
  updateNote = B.upd.downloading(null); render(); sendPanels();
  void installNewer(newer, (pct) => { updateNote = B.upd.downloading(pct); render(); sendPanels(); })
    .catch(() => { updateNote = B.upd.failed; render(); sendPanels(); });
}
/** --scroll: a settings section for the data window to scroll to (screenshots without scrolling by hand). */
let scrollTo: string | null = null;
/** Hotkeys by name and whether they are registered (src-tauri set_hotkeys). */
let hotkeyState: Record<string, boolean> = {};
const HOTKEY_LABEL: Record<string, string> = { hide: macKeys('Ctrl+Alt+Shift+H'), lowkey: macKeys('Ctrl+Alt+Shift+Q') };
const panels = inTauri ? new Panels((n) => cfg().sizes[`size-panel-${n}`] ?? PANEL_SIZE[n]) : null;
function sendPanels(): void {
  if (!panels) return;
  const f: PanelFrame = { state, receivedAt, settings: cfg(), lang, conn, sample, schedule, history, roster, pickedMatch, dataTab, profile, endpointError,
    scrollTo,
    settingsExtra: { lowNow: lowKeyOn(), hotkeyBusy: cfg().hotkeys ? Object.entries(hotkeyState).filter(([, on]) => !on).map(([k]) => HOTKEY_LABEL[k] ?? k) : [], watchError,
      update: { version: appVersion, newer: newer?.tag ?? null, installable: !!newer?.update, asking: updateAsk, note: updateNote } } };
  panels.send(f);
}
async function openData(tab: DataTab): Promise<void> {
  dataTab = tab;
  if (!cfg().panels.data) settings.update((d) => { d.panels.data = true; });
  sendPanels();
  await panels?.focusData();
}

// ---------- drawing ----------

const dotHtml = (t: Team) => `<i class="dot" style="background:${TEAM_COLOUR[t]}"></i>`;
const ICON = {
  history: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 4h10M3 8h10M3 12h6"/></svg>',
  panels: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="1.5" y="2.5" width="5.5" height="5" rx="1"/><rect x="9" y="2.5" width="5.5" height="5" rx="1"/><rect x="1.5" y="9.5" width="13" height="4" rx="1"/></svg>',
  data: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="2" width="12" height="12" rx="2"/><path d="M2 6h12M6 6v8"/></svg>',
  pause: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 6h2.5L9 3v10L5.5 10H3z"/><path d="M11.5 6l3 4M14.5 6l-3 4"/></svg>',
  resume: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 6h2.5L9 3v10L5.5 10H3z"/><path d="M11.5 5.5c1 .7 1.5 1.6 1.5 2.5s-.5 1.8-1.5 2.5"/></svg>',
  tier: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9.5 2.5h4v4M6.5 13.5h-4v-4M13.5 2.5l-4.5 4.5M2.5 13.5l4.5-4.5"/></svg>',
  settings: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><circle cx="8" cy="8" r="2.2"/><path d="M8 1.8v2M8 12.2v2M1.8 8h2M12.2 8h2M3.6 3.6l1.4 1.4M11 11l1.4 1.4M3.6 12.4 5 11M11 5l1.4-1.4"/></svg>',
  watch: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M5 3.2v9.6L12.6 8z"/></svg>',
  update: '<svg viewBox="0 0 16 16" fill="none" stroke="var(--accent)" stroke-width="1.6"><path d="M8 13V3.5M4 7l4-4 4 4"/></svg>',
};

function scoreHtml(s: MatchState, compact: boolean): string {
  const code = codeOf(s);
  const k = (t: Team) => s.teams[t].kills ?? '–';
  return `<span class="score">${dotHtml('B')}${esc(code('B'))} <b>${k('B')}</b>${compact ? ':' : ' : '}<b>${k('R')}</b> ${esc(code('R'))}${dotHtml('R')}</span>`;
}
function goldText(s: MatchState): string {
  const b = s.teams.B.gold, r = s.teams.R.gold;
  if (b === null || r === null || !cfg().show.gold) return '';
  const d = b - r;
  const lead: Team | null = d > 0 ? 'B' : d < 0 ? 'R' : null;
  return `<span class="gold">${esc(S.ui.gold)} <span class="mono${lead ? ` lead-${lead}` : ''}">${d === 0 ? '±0' : `+${fmtGold(Math.abs(d))}`}</span></span>`;
}

/**
 * The objectives counting down, nearest first, at most two: the next drake (or elder), the herald, the
 * baron (the broadcast says which of herald and baron the top pit holds next). "在場" once one is up.
 */
function countdowns(s: MatchState, clock: number | null): string[] {
  if (s.status !== 'in_game' || clock === null) return [];
  const c: { at: number; html: string }[] = [];
  const chip = (label: string, at: number) => {
    const l = at - clock;
    return `<span class="cd">${label}<span class="mono">${l > 0 ? fmtClock(l) : esc(B.up)}</span></span>`;
  };
  const nd = s.nextDragon;
  if (cfg().show.nextDragon && nd) {
    const e = nd.elder ? 'elder' : nd.element;
    // Label and time, like 巴龍 and 預示者: the drake by its full name in its colour ("水龍 4:27").
    const tile = e ? `<span class="el" style="--c:${ELEMENT_COLOUR[e]}">${esc(S.element[e])}</span>` : `<span class="el empty">${esc(S.ui.dragon)}</span>`;
    c.push({ at: nd.at, html: chip(tile, nd.at) });
  }
  const h = s.herald;
  if (cfg().show.herald && s.pitNext === 'herald' && h && (h.status === 'upcoming' || h.status === 'alive_or_upcoming')) c.push({ at: 15 * 60, html: chip(`<span class="k">${esc(S.ui.herald)}</span>`, 15 * 60) });
  const nb = s.nextBaron;
  if (cfg().show.nextBaron && nb && s.pitNext !== 'grubs' && s.pitNext !== 'herald') c.push({ at: nb.at, html: chip(`<span class="k">${esc(S.ui.baron)}</span>`, nb.at) });
  return c.sort((a, b) => a.at - b.at).slice(0, 2).map((x) => x.html);
}

/** Row A: what state the event is in (UI_SPEC §1, §7). */
function statusRow(clock: number | null): string {
  const s = state;
  const mute = paused() ? `<span class="mute" title="${esc(B.icon.resume)}">${ICON.pause.replace('<svg', '<svg width="12" height="12"')}</span>` : '';
  const connBad = conn === 'retrying' && !sample ? `<i class="conn" title="${esc(S.connection.retrying)}"></i>` : '';
  if (s.status === 'in_game') {
    const clk = clock === null || !cfg().show.clock ? '' : `<span class="clock">${fmtClock(clock)}</span>`;
    const cds = countdowns(s, clock).map((h, i) => h.replace('class="cd"', `class="cd cd${i}"`)).join('');
    return `${mute}${connBad}${scoreHtml(s, false)}${clk}${cds}${goldText(s)}`;
  }
  if (s.status === 'waiting') {
    const g = s.series?.game ?? s.draft?.current?.game ?? 1;
    const code = codeOf(s);
    return `${mute}${connBad}<span>${esc(B.draftOn(g))}</span><span class="muted">·</span><span class="score">${dotHtml('B')}${esc(code('B'))} ${esc(lang === 'zh-Hant' ? '對' : 'vs')} ${esc(code('R'))}${dotHtml('R')}</span>`;
  }
  if (s.status === 'finished') {
    const g = (s.series?.game ?? 0) + 1;
    return `${mute}${connBad}<span>${esc(B.between(g))}</span>`;
  }
  const m = schedule ? nextMatch(schedule, Date.now()) : null;
  if (m) return `${mute}${connBad}<span>${esc([m.stage ? S.stage[m.stage] : m.stageText, m.bestOf ? S.bo(m.bestOf) : ''].filter(Boolean).join(' '))} · ${esc(fmtStart(m.start, lang))}</span>`;
  if (schedule) return `${mute}${connBad}<span>${esc(B.seasonOver)}</span>`;
  return `${mute}${connBad}<span>${esc(conn === 'retrying' ? S.connection.retrying : S.connection.connecting)}</span>`;
}

/** Row B when nothing has happened yet in this state: a countdown, the draft so far, or a baseline. */
function restingLine(clock: number | null): { html: string; key: string } {
  const s = state;
  if (s.status === 'idle') {
    const m = schedule ? nextMatch(schedule, Date.now()) : null;
    if (!m) return { html: '', key: 'none' };
    const [a, b] = m.teams;
    const ms = m.start - Date.now();
    const until = ms <= 5 * 60_000 && ms > 0 ? `${B.startingSoon} · ${S.until(ms)}` : S.until(ms);
    const tbd = (c: string) => (c === 'TBD' ? S.ui.tbd : c);
    const text = `${tbd(a.code)} vs ${tbd(b.code)} · ${until}`;
    return { html: lineHtml({ text, at: null, team: null }), key: text };
  }
  if (s.status === 'waiting') {
    const c = s.draft?.current;
    const n = c ? TEAMS.reduce((k, t) => k + c.sides[t].bans.filter(Boolean).length + c.sides[t].picks.filter(Boolean).length, 0) : 0;
    const text = B.picksSoFar(n);
    return { html: lineHtml({ text, at: null, team: null }), key: text };
  }
  const code = codeOf(s);
  // Started after the game ended: who won, not "in progress" (2026-10-18 check: "已進行 36:15" under "第 4 局準備中").
  if (s.status === 'finished') {
    const text = eventText({ kind: 'gameEnd', team: winnerOf(s) ?? undefined, at: null, n: s.series?.game ?? undefined } as GameEvent, code, lang, cfg().spoilerFree).title;
    return { html: lineHtml({ text, at: null, team: null }), key: `end-${s.gameId}` };
  }
  // Started mid-game: one baseline line, the game so far is not replayed.
  const k = (t: Team) => s.teams[t].kills ?? 0;
  const text = `${B.inProgress(clock === null ? '–' : fmtClock(clock))} · ${code('B')} ${k('B')}:${k('R')} ${code('R')}`;
  return { html: lineHtml({ text, at: null, team: null }), key: `base-${s.gameId}` };
}

function iconsRow(): string {
  const b = (action: string, title: string, svg: string, pressed = false) => `<button data-action="${action}" title="${esc(title)}" aria-pressed="${pressed}">${svg}</button>`;
  return `<button class="modebtn" data-action="mode" title="${esc(B.icon.mode)}">${esc(modeLabel(cfg(), B))} ▾</button>`
    + b('history', B.icon.history, ICON.history, popKind === 'history')
    + b('panels', B.icon.panels, ICON.panels, popKind === 'panels')
    + b('data', B.icon.data, ICON.data, cfg().panels.data)
    + (paused() ? b('pause', B.icon.resume, ICON.resume, true) : b('pause', B.icon.pause, ICON.pause))
    + b('tier', B.icon.tier, ICON.tier)
    + b('settings', B.icon.settings, ICON.settings)
    + (cfg().watchUrl ? b('watch', B.icon.watch, ICON.watch) : '')
    + (newer ? b('update', B.upd.available(newer.tag), ICON.update) : '');
}

function popHtml(): string {
  if (popKind === 'mode') {
    const opt = (m: 'work' | 'companion' | 'custom', hint: string) =>
      `<button class="opt" data-mode="${m}" aria-pressed="${cfg().mode === m}"><i class="r"></i><b>${esc(m === 'custom' && cfg().mode === 'custom' ? modeLabel(cfg(), B) : B.mode[m])}</b><span class="h">${esc(hint)}</span></button>`;
    return opt('work', B.modeHint.work) + opt('companion', B.modeHint.companion) + opt('custom', B.customOf(B.base[cfg().modeBase]));
  }
  if (popKind === 'panels') {
    return (['minimap', 'draftGame', 'players'] as const).map((p) => `<button class="opt multi" data-panel="${p}" aria-pressed="${cfg().panels[p]}"><i class="r"></i><b>${esc(B.panel[p])}</b></button>`).join('');
  }
  if (popKind === 'history') {
    const link = (code: string, name: string) => rosterPlayer(roster, code, name)?.id ?? null;
    return historyView(logList, histFilter, B, !histUp, link, line?.text ?? null);
  }
  if (popKind === 'ask') {
    return `<div class="ask"><p>${esc(B.ask)}</p><button class="choice" data-ask="work">${esc(B.modeHint.work)}</button><button class="choice" data-ask="companion" style="margin-top:6px">${esc(B.modeHint.companion)}</button></div>`;
  }
  return '';
}

/** The low-key line: numbers only, nothing that reads as sport at a glance (batch 3 §2). */
function lowText(clock: number | null): string {
  const s = state;
  if (s.status === 'in_game') return `${s.teams.B.kills ?? 0}:${s.teams.R.kills ?? 0} · ${clock === null ? '–' : fmtClock(clock)}`;
  if (s.status === 'waiting') return 'BP';
  if (s.status === 'idle') {
    const m = schedule ? nextMatch(schedule, Date.now()) : null;
    if (m) { const d = new Date(m.start); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; }
  }
  return '—';
}

/**
 * Terminalol: a prompt, the last four lines of the log as a job's output, and a status line with the
 * score, the clock, the gold lead and the next objective. Plain text in a terminal's colours: nothing
 * that reads as sport at a glance but the words themselves.
 */
function termHtml(clock: number | null): string {
  const s = state;
  const out: string[] = [`<div class="tl prompt">~/work/sync $ npm run sync -- --watch</div>`];
  const lines = logList.slice(-4);
  for (const e of lines) {
    const when = e.at === null ? new Date(e.t).toTimeString().slice(0, 8) : fmtClock(e.at).padStart(5, '0');
    const lvl = e.level === 'major' ? 'warn ' : 'info ';
    out.push(`<div class="tl${e.level === 'major' ? ' warn' : ''}">[${esc(when)}] ${lvl} ${esc(e.text)}</div>`);
  }
  for (let i = lines.length; i < 4; i++) out.push('<div class="tl dim">&nbsp;</div>');
  const code = codeOf(s);
  let st: string;
  if (s.status === 'in_game') {
    const d = (s.teams.B.gold ?? 0) - (s.teams.R.gold ?? 0);
    const lead = d === 0 ? '±0' : `${code(d > 0 ? 'B' : 'R')} +${fmtGold(Math.abs(d))}`;
    const next: string[] = [];
    const nd = s.nextDragon;
    if (nd && clock !== null) { const e = nd.elder ? 'elder' : nd.element; next.push(`${e ? S.element[e] : S.ui.dragon} ${nd.at > clock ? fmtClock(nd.at - clock) : B.up}`); }
    const nb = s.nextBaron;
    if (nb && clock !== null && s.pitNext !== 'grubs' && s.pitNext !== 'herald') next.push(`${S.ui.baron} ${nb.at > clock ? fmtClock(nb.at - clock) : B.up}`);
    st = `${code('B')} ${s.teams.B.kills ?? 0}-${s.teams.R.kills ?? 0} ${code('R')}  t=${clock === null ? '--:--' : fmtClock(clock)}  Δ ${lead}${next.length ? `  ${next.join('  ')}` : ''}`;
  } else st = statusRow(clock).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() + (s.status === 'idle' ? `  ${restingLine(clock).key === 'none' ? '' : restingLine(clock).html.replace(/<[^>]+>/g, '')}` : '');
  if (termTall()) out.push(...termDraft(), ...termTowers());
  out.push(`<div class="tl status">» ${esc(st)}<i class="cur"></i></div>`);
  return out.join('');
}

/** The draft as two lines: each team's picks so far in brackets, then its bans. */
function termDraft(): string[] {
  const c = state.draft?.current;
  if (!c) return [];
  const code = codeOf(state);
  const name = (x: string | null) => (x ? championName(x, lang) : '·');
  return TEAMS.map((t) => {
    const sd = c.sides[t];
    const picks = sd.picks;
    return `<div class="tl">draft  ${esc(code(t).padEnd(4))} [${esc(picks.map(name).join(' '))}]  ban ${esc(sd.bans.map(name).join(' '))}</div>`;
  });
}

/** Each team's own towers lane by lane, outer to inner (# up, - down, ? maybe), its nexus turrets and its inhibitors: plain ASCII, so every font lines it up. */
function termTowers(): string[] {
  const s = state;
  if (s.status !== 'in_game' || !s.towersKnown) return [];
  const code = codeOf(s);
  return TEAMS.map((t) => {
    const tw = s.teams[t].towers;
    const g = (site: TowerSite) => (tw[site]?.down ? '-' : tw[site]?.maybe ? '?' : '#');
    const lane = (l: Lane) => `${l} ${g(`${l}_outer` as TowerSite)}${g(`${l}_inner` as TowerSite)}${g(`${l}_inhib_tower` as TowerSite)}`;
    const down = new Set(s.teams[t].inhibitorsDown.map((i) => i.lane));
    const inhib = LANES.map((l) => (down.has(l) ? '-' : '#')).join('');
    return `<div class="tl">tower  ${esc(code(t).padEnd(4))} ${LANES.map(lane).join('  ')}  base ${g('nexus_t1')}${g('nexus_t2')}  inhib ${inhib}</div>`;
  });
}

function render(): void {
  document.body.classList.toggle('dot', tier() === 'dot');
  const clock = clockNow(state, receivedAt, Date.now(), cfg().tickClock);
  const low = lowKeyOn();
  document.body.classList.toggle('low', low);
  // "雙擊恢復 · Ctrl+Alt+Shift+Q" while that hotkey works; the system decides the delay (review: kept as title).
  bar.title = low ? (cfg().hotkeys && hotkeyState.lowkey ? `${B.b3.lowKeyTip} · ${HOTKEY_LABEL.lowkey}` : B.b3.lowKeyTip) : '';
  if (low) {
    let el = bar.querySelector<HTMLElement>('.lowrow');
    if (!el) { el = document.createElement('div'); el.className = 'lowrow'; bar.appendChild(el); }
    const text = lowText(clock);
    if (el.textContent !== text) el.textContent = text;
    return;
  }
  document.body.classList.toggle('term', termOn());
  if (!termOn()) document.body.style.removeProperty('--bar-h');
  if (termOn()) {
    bar.title = B.b3.terminalTip;
    let el = bar.querySelector<HTMLElement>('.termrow');
    if (!el) { el = document.createElement('div'); el.className = 'termrow'; bar.appendChild(el); }
    const html = termHtml(clock);
    if (el.innerHTML !== html) el.innerHTML = html;
    // A draft or a game starts or ends: the pane grows or shrinks to its lines.
    const want = termSize();
    document.body.style.setProperty('--bar-h', `${want.h}px`);
    if (win && !resizingTo && (Math.abs(window.innerHeight - want.h) > 1 || Math.abs(window.innerWidth - want.w) > 1)) void fitWindow();
    return;
  }
  if (tier() === 'dot') {
    let el = bar.querySelector<HTMLElement>('.dotrow');
    if (!el) { el = document.createElement('div'); el.className = 'dotrow'; bar.appendChild(el); }
    const s = state;
    const html = s.status === 'in_game'
      ? `${scoreHtml(s, true)}${clock === null ? '' : `<span class="clock">${fmtClock(clock)}</span>`}`
      : `<span class="muted">${restingLine(clock).html ? esc(statusRow(clock).replace(/<[^>]+>/g, '')) : ''}</span>`;
    if (el.innerHTML !== html) el.innerHTML = html;
  }
  const a = statusRow(clock);
  if (rowA.dataset.html !== a) {
    rowA.innerHTML = a;
    rowA.dataset.html = a;
    // Too wide for the bar: the second countdown goes first, then the first, then the gold lead
    // (score > clock > gold > countdowns, UI_SPEC rev. after batch 1).
    for (const sel of ['.cd1', '.cd0', '.gold']) if (rowA.scrollWidth > rowA.clientWidth) rowA.querySelector(sel)?.remove();
  }
  const ic = iconsRow();
  if (icons.dataset.html !== ic) { icons.innerHTML = ic; icons.dataset.html = ic; }
  // Row B: a 3-second note, else the log line of this game (or the last game's, between games), else a resting line.
  const now = Date.now();
  if (note && now < note.until) swapLine(lineHtml({ text: note.text, at: null, team: null }), null, true);
  // A new version downloading (or why it failed).
  else if (updateNote) swapLine(lineHtml({ text: updateNote, at: null, team: null }), null, true);
  // The official feed is down mid-game (2026-10-19, Day 4 game 1): say so instead of "picks so far: 0".
  else if (state.feedMissing) swapLine(lineHtml({ text: B.feedDown, at: null, team: null }), null, true);
  // A pause (the feed stopped, the game is still on): say so instead of a clock that stands still.
  else if (state.paused) swapLine(lineHtml({ text: B.paused, at: null, team: null }), null, true);
  else {
    note = null;
    const current = line && (line.game === state.gameId || state.status === 'finished' || state.status === 'waiting') ? line : null;
    if (current) {
      swapLine(lineHtml(current), null, false);
      // Older lines fade to 60% over two minutes: how long ago, without a word.
      if (lineEl) lineEl.style.opacity = String(Math.max(0.6, 1 - 0.4 * Math.min(1, (now - current.shownAt) / 120_000)));
    } else {
      const r = restingLine(clock);
      swapLine(r.html, null, true);
    }
  }
  if (popKind) { const p = popHtml(); if (pop.dataset.html !== p) { pop.innerHTML = p; pop.dataset.html = p; } }
}

// The clock and countdowns move every second; reminders are checked with it.
setInterval(() => {
  render();
  const due = dueReminders(schedule, Date.now(), cfg().reminderLead, reminded);
  if (due.length) onEvents(due, state);
}, 1000);

// ---------- input ----------

function showNote(text: string): void { note = { text, until: Date.now() + 3000 }; render(); }

function setMode(m: 'work' | 'companion' | 'custom'): void {
  settings.update((d) => {
    if (m === 'custom' && d.mode !== 'custom') { d.modeBase = d.mode as NotifyBase; d.custom = {}; }
    d.mode = m;
  });
  showNote(B.feedback.mode(modeLabel(cfg(), B)));
}

/** A click on the bar, a popover, or in one of the windows (their data-* attributes). */
function act(d: Record<string, string | undefined>): void {
  if (d.mode) { setMode(d.mode as 'work' | 'companion' | 'custom'); void closePop(); return; }
  if (d.ask) { settings.update((x) => { x.mode = d.ask as 'work' | 'companion'; x.asked = true; }); void closePop(); showNote(B.feedback.mode(modeLabel(cfg(), B))); return; }
  // The bar's panel menu (its buttons carry only data-panel). Clicks from inside a window carry `from`
  // and the window's name as `panel`: a team button in the data window used to close it (2026-10-18).
  if (d.panel && d.panel in cfg().panels && !d.from && Object.keys(d).length === 1) {
    const p = d.panel as PanelName;
    settings.update((x) => { x.panels[p] = !x.panels[p]; });
    return;
  }
  if (d.hfilter) { histFilter = d.hfilter; delete pop.dataset.html; render(); return; }
  if (d.tab) { dataTab = d.tab as DataTab; if (d.tab === 'teams') profile = { team: null, player: null }; sendPanels(); return; }
  // Profiles (UI_SPEC §6): a team, a player ("CODE|id"), back one level, my team's star.
  if (d.team) { profile = { team: d.team, player: null }; void openData('teams'); return; }
  if (d.player) { const [team, player] = d.player.split('|') as [string, string]; profile = { team, player }; void openData('teams'); return; }
  if (d.action === 'profile-back') { profile = profile.player ? { team: profile.team, player: null } : { team: null, player: null }; sendPanels(); return; }
  if (d.star) { const code = d.star; settings.update((x) => { x.myTeam = x.myTeam === code ? null : code; }); return; }
  if (d.set) { const [path, value] = d.set.split(':') as [string, string]; if (path === 'mode') setMode(value as 'work' | 'companion' | 'custom'); else setPath(path, value); return; }
  // Low-key from the settings: the box shows low-key now (by hand or detection); clearing it leaves either.
  if (d.toggle === 'lowKey') { if (d.checked === 'true') settings.update((x) => { x.lowKey = true; }); else leaveLowKey(); return; }
  if (d.toggle) { setPath(d.toggle, d.checked === 'true'); return; }
  if (d.watchUrl !== undefined) {
    const v = d.watchUrl;
    watchError = watchUrlProblem(v);
    if (!watchError) settings.update((x) => { x.watchUrl = v; }); else sendPanels();
    return;
  }
  if (d.ev) {
    const [kind, ch] = d.ev.split(':') as [EventKind, string];
    settings.update((x) => {
      if (x.mode !== 'custom') { x.modeBase = x.mode as NotifyBase; x.custom = {}; x.mode = 'custom'; }
      x.custom[kind] = ch as Settings['custom'][string];
      // A change back to what the base says is no change.
      for (const k of EVENT_KINDS) if (x.custom[k] && x.custom[k] === channelOf(k, { ...x, custom: {} })) delete x.custom[k];
    });
    return;
  }
  if (d.reset) {
    settings.update((x) => {
      if (d.reset === 'major') { x.mode = 'custom'; x.modeBase = 'major'; } else x.mode = d.reset as 'work' | 'companion';
      x.custom = {};
    });
    showNote(B.feedback.mode(modeLabel(cfg(), B)));
    return;
  }
  if (d.match) { pickedMatch = d.match; sendPanels(); return; }
  if (d.action === 'schedule-back') { pickedMatch = null; sendPanels(); return; }
  if (d.endpoint !== undefined) {
    const v = d.endpoint;
    const ok = normalize({ ...cfg(), endpoint: v }).endpoint === v;
    endpointError = !ok;
    if (ok) settings.update((x) => { x.endpoint = v; }); else sendPanels();
    return;
  }
  if ('toggleSpoiler' in d) { settings.update((x) => { x.spoilerFree = !x.spoilerFree; }); return; }
  switch (d.action) {
    case 'mode': void openPop('mode'); break;
    case 'panels': void openPop('panels'); break;
    case 'history': void openPop('history'); break;
    case 'data': if (cfg().panels.data) settings.update((x) => { x.panels.data = false; }); else void openData(dataTab); break;
    case 'pause':
      if (paused()) { pausedUntil = 0; showNote(B.feedback.resumed); } else { pausedUntil = Date.now() + 30 * 60_000; void notifier.clear(); showNote(B.feedback.paused); }
      break;
    case 'tier': settings.update((x) => { x.barTier = x.barTier === 'bar' ? 'dot' : 'bar'; }); break;
    case 'settings': void openData('settings'); break;
    case 'sound-test': playTone('major', cfg().soundVolume); break;
    case 'watch': void invoke('open_watch_url').catch(() => undefined); break;
    case 'update': startUpdate(); break;
    case 'check-update': askNewer(); break;
  }
}

// Buttons act on press: a button redrawn between press and release (the icon row redraws when a
// panel opens) lost its click, so a press did nothing (2026-10-18 check).
function onPress(e: PointerEvent): void {
  if (e.button !== 0) return;
  const t = (e.target as HTMLElement).closest<HTMLElement>('button');
  if (t) { e.preventDefault(); act({ ...t.dataset }); }
}
for (const el of [bar, pop]) el.addEventListener('pointerdown', onPress);
// The keyboard (Tab, then Enter or Space) sends a click with detail 0; the mouse already acted on press.
for (const el of [bar, pop]) el.addEventListener('click', (e) => {
  const t = (e.target as HTMLElement).closest<HTMLElement>('button');
  if (t && e.detail === 0) act({ ...t.dataset });
});
// The dot: a click on it (not a drag) goes back to the bar.
bar.addEventListener('click', (e) => {
  if ((e.target as HTMLElement).closest('button') || moved || lowKeyOn() || termOn()) return;
  if (tier() === 'dot') settings.update((x) => { x.barTier = 'bar'; });
  else void openPop('history');
});
window.addEventListener('keydown', (e) => { if (e.key === 'Escape') void closePop(); });
// Low-key: a double click brings the bar back; a single click or the mouse passing over does nothing.
bar.addEventListener('dblclick', () => { if (lowKeyOn()) leaveLowKey(); else if (termOn()) settings.update((d) => { d.terminal = false; }); });
// And when the user clicks elsewhere (the window loses focus). The first-run question stays until answered.
/** A checking run opened a popover for a screenshot (--open): keep it while focus moves elsewhere. */
let keepOpen = false;
window.addEventListener('blur', () => { if (popKind && popKind !== 'ask' && !keepOpen) void closePop(); });
// The history folds away a minute after the mouse leaves (UI_SPEC §1).
let leaveTimer: ReturnType<typeof setTimeout> | null = null;
document.body.addEventListener('mouseleave', () => { if (popKind === 'history') leaveTimer = setTimeout(() => { if (popKind === 'history') void closePop(); }, 60_000); });
document.body.addEventListener('mouseenter', () => { if (leaveTimer) clearTimeout(leaveTimer); leaveTimer = null; });

// Drag with a press that moves 4 px or more; a press that does not move is a click.
let down: { x: number; y: number } | null = null;
let moved = false;
bar.addEventListener('mousedown', (e) => {
  if (e.button !== 0 || (e.target as HTMLElement).closest('button')) return;
  down = { x: e.screenX, y: e.screenY };
  moved = false;
});
window.addEventListener('mousemove', (e) => {
  if (!down || !win) return;
  if (Math.hypot(e.screenX - down.x, e.screenY - down.y) >= 4) { moved = true; down = null; void win.startDragging(); }
});
window.addEventListener('mouseup', () => { down = null; });

if (win) {
  document.getElementById('grip')!.addEventListener('mousedown', (e) => { e.preventDefault(); void win.startResizeDragging('East'); });
  void listen<string>('bg-mode', (e) => {
    const m = e.payload;
    if (m === 'solid' || m === 'semi' || m === 'clear') settings.update((d) => { d.background = m; });
  });
  void listen('open-settings', () => void openData('settings'));
  void listen<Record<string, string>>('panel-action', (e) => act(e.payload));
  void listen<PanelName>('panel-closed', (e) => settings.update((d) => { d.panels[e.payload] = false; }));
  void listen<{ name: PanelName; w: number; h: number }>('panel-size', (e) => settings.update((d) => { d.sizes[`size-panel-${e.payload.name}`] = { w: e.payload.w, h: e.payload.h }; }));
}

function onSettings(now: Settings, before: Settings): void {
  if (now.language !== before.language) applyLanguage();
  if (now.background !== before.background) applyBackground();
  if (now.endpoint !== before.endpoint) {
    if (!flags.sample) { haveLive = false; haveSeen = false; }
    onLegacy = false;
    useEndpoint(endpointNow());
  }
  if (now.barTier !== before.barTier) void fitWindow();
  if (now.hotkeys !== before.hotkeys) void applyHotkeys();
  if (now.watchUrl !== before.watchUrl) watchError = null;
  syncLow();
  notifier.corner = now.notifyCorner;
  if (PANELS.some((p) => now.panels[p] !== before.panels[p])) {
    void panels?.sync(shownPanels());
    // Ticked while no match is on: nothing opens yet; say when it will.
    const opened = PANELS.find((p) => p !== 'data' && now.panels[p] && !before.panels[p]);
    if (opened && !shownPanels()[opened]) showNote(B.b3.panelLater);
  }
  sendPanels();
  render();
}

async function start(): Promise<void> {
  const q = new URLSearchParams(location.search);
  if (inTauri) {
    for (const a of await invoke<string[]>('launch_args').catch(() => [] as string[])) {
      const m = /^--(set|sample|open|tab|team|player|match|press|notify-state|drag|inject|click|anim-log|scroll)=(.+)$/.exec(a);
      if (m) q.set(m[1]!, m[2]!);
      for (const flag of ['sample', 'demo', 'no-tray', 'devlog', 'pause']) if (a === `--${flag}`) q.set(flag, '1');
    }
  }
  flags.sample = q.has('sample');
  flags.demo = q.has('demo');
  const checking = ['sample', 'demo', 'set', 'open', 'tab', 'team', 'player', 'match', 'anim-log', 'press', 'notify-state', 'no-tray', 'drag', 'inject', 'click', 'devlog', 'pause', 'scroll'].some((k) => q.has(k));
  settings = await SettingsStore.open(backend, () => DEFAULTS);
  settings.persist = !checking;
  for (const pair of (q.get('set') ?? '').split(',').filter(Boolean)) {
    const i = pair.indexOf(':');
    const path = pair.slice(0, i), raw = pair.slice(i + 1);
    if (i > 0) setPath(path, raw === 'true' ? true : raw === 'false' ? false : raw);
  }
  logList = parseEntries(inTauri ? await invoke<string | null>('read_history').catch(() => null) : local.get('log-history'));
  settings.subscribe(onSettings);
  applyLanguage();
  applyBackground();
  if (flags.sample) void loadSample();
  useEndpoint(endpointNow());
  if (!flags.sample) source.start();
  for (const p of [schedulePoller, teamsPoller, playersPoller, rosterPoller] as Poller<unknown>[]) p.start();
  await fitWindow();
  render();
  void panels?.sync(shownPanels());
  // The one question, the first time (UI_SPEC §8).
  if (!cfg().asked && !checking) void openPop('ask');
  // Checking aids: open a popover or the data window without clicking.
  const open = q.get('open');
  if (open === 'history' || open === 'mode' || open === 'panels' || open === 'ask') { keepOpen = true; setTimeout(() => void openPop(open), 2500); }
  const tab = q.get('tab') as DataTab | null, team = q.get('team'), player = q.get('player');
  if (player) { const [t, p] = player.split(/[|:]/) as [string, string]; profile = { team: t, player: p }; }
  else if (team) profile = { team, player: null };
  if (q.has('anim-log') && inTauri) startAnimLog(q.get('anim-log')!);
  if (inTauri) appVersion = await getVersion().catch(() => appVersion);
  // One question to GitHub per launch, after the game has had time to load (setting updateCheck).
  if (inTauri && cfg().updateCheck && !checking) setTimeout(() => { if (updateAsk === 'idle' && !newer) askNewer(); }, 20_000);
  noTray = q.has('no-tray');
  osPlan = (q.get('notify-state') ?? '').split(',').filter(Boolean).map((x) => { const [st, sec] = x.split(':'); return { st: st as OsState, sec: Number(sec ?? Infinity) }; }).filter((x) => OS_STATES.includes(x.st));
  osPlanStart = Date.now();
  syncLow();
  void applyHotkeys();
  devlog = q.has('devlog');
  for (const [i, x] of (q.get('inject') ?? '').split(',').filter(Boolean).entries()) {
    // "tower+drake:20": both in one step.
    const [kinds, sec] = x.split(':') as [string, string | undefined];
    const evs = kinds.split('+').filter((k): k is EventKind => EVENT_KINDS.includes(k as EventKind))
      .map((kind, j) => ({ kind, team: 'B', victim: 'R', at: state.clock ?? 600, n: 1, lane: (['top', 'mid', 'bot'] as const)[j % 3], tower: 'outer', element: 'infernal' }) as GameEvent);
    if (evs.length) setTimeout(() => onEvents(evs, state), (sec ? Number(sec) : 6 + i * 4) * 1000);
  }
  for (const [i, x] of (q.get('click') ?? '').split(',').filter(Boolean).entries()) {
    const [what, sec] = x.split(':');
    setTimeout(() => void emitTo('notify', 'notify-click', what), (sec ? Number(sec) : 8 + i * 4) * 1000);
  }
  if (q.has('pause')) pausedUntil = Date.now() + 30 * 60_000;
  const drag = (q.get('drag') ?? '').split(',');
  if (drag.length >= 3) setTimeout(() => void dragAid(drag[0]!, Number(drag[1]), Number(drag[2]), drag.includes('alt'), drag.includes('held')), 5000);
  scrollTo = q.get('scroll');
  (q.get('press') ?? '').split(',').forEach((x, i) => {
    const [k, sec] = x.split(':');
    if (k === 'hide' || k === 'lowkey') setTimeout(() => onHotkey(k), sec ? Number(sec) * 1000 : 4000 + i * 3000);
  });
  const match = q.get('match');
  // Once the schedule has come (it is polled), up to 20 s.
  if (match) { let tries = 0; const pick = () => {
    const ms = schedule?.matches ?? [];
    if (!ms.length && ++tries < 40) { setTimeout(pick, 500); return; }
    pickedMatch = match === 'next' ? (ms.find((m) => m.state !== 'completed' && m.teams.every((t) => t.code && t.code !== 'TBD')) ?? ms[0])?.matchId ?? null : match;
    sendPanels();
  }; setTimeout(pick, 3000); }
  if (tab || team || player) setTimeout(() => void openData(tab ?? 'teams'), 2500);
}
// ---------- low-key, hiding, hotkeys, presentation detection (batch 3) ----------

/** The bar's look last applied: the bar, low-key or Terminalol. */
let lookWas: 'bar' | 'low' | 'term' = 'bar';
/** Apply low-key turning on or off: the bar's size and look, the other windows, the notices. */
function syncLow(): void {
  // Low-key and Terminalol both put the bar in disguise: no popovers, notices or game windows.
  const look = lowKeyOn() ? 'low' : termOn() ? 'term' : 'bar';
  if (look === lookWas) return;
  lookWas = look;
  const on = look !== 'bar';
  void win?.setTitle(look === 'term' ? 'Terminal' : 'SmalLoL').catch(() => undefined);
  if (on) { void closePop(); void notifier.clear(); bar.classList.remove('glow', 'lit'); }
  void panels?.setHidden(on || hiddenByKey);
  render();
  void fitWindow();
  sendPanels();
}

/** Leave low-key by hand, whichever way it came on. */
function leaveLowKey(): void {
  auto.leaveByHand();
  if (cfg().lowKey) settings.update((d) => { d.lowKey = false; }); else syncLow();
}

function toggleLowKey(): void {
  if (lowKeyOn()) leaveLowKey(); else settings.update((d) => { d.lowKey = true; });
}

let noTray = false;
/**
 * Every window out of sight, and back (batch 3 §1). Hidden only when something can bring it back: the
 * tray icon, or the hide hotkey registered. Events still go to the history; nothing is replayed after.
 */
function toggleHidden(): void {
  if (!hiddenByKey && noTray && !hotkeyState.hide) { showNote(B.b3.hideRefused); return; }
  hiddenByKey = !hiddenByKey;
  if (hiddenByKey) { void closePop(); void notifier.clear(); void win?.hide(); } else { void win?.show(); render(); }
  void panels?.setHidden(lowKeyOn() || termOn() || hiddenByKey);
}

function onHotkey(name: string): void {
  if (name === 'hide') toggleHidden();
  else if (name === 'lowkey') toggleLowKey();
}

async function applyHotkeys(): Promise<void> {
  if (!inTauri) return;
  const r = await invoke<[string, boolean][]>('set_hotkeys', { on: cfg().hotkeys }).catch(() => [] as [string, boolean][]);
  hotkeyState = Object.fromEntries(r);
  sendPanels();
}
if (win) void listen<string>('hotkey', (e) => onHotkey(e.payload));

/** --notify-state: states to report instead of Windows', each for so many seconds; the last one stays. */
let osPlan: { st: OsState; sec: number }[] = [];
let osPlanStart = 0;
function plannedState(): OsState | null {
  if (!osPlan.length) return null;
  let t = (Date.now() - osPlanStart) / 1000;
  for (const p of osPlan) { if (t < p.sec) return p.st; t -= p.sec; }
  return osPlan[osPlan.length - 1]!.st;
}
// Every 2 s: does Windows say not to disturb? (batch 3 §6)
setInterval(() => {
  if (!inTauri) return;
  void (async () => {
    const st = plannedState() ?? (await invoke<OsState>('notify_state').catch(() => 'ok' as OsState));
    if (auto.step(st, detectionMode(cfg().mode, cfg().modeBase), cfg().autoLowKey)) syncLow();
  })();
}, 2000);

// ---------- edge snapping (batch 3 §5) ----------

const SNAP_LABELS = ['main', ...(['minimap', 'draftGame', 'players', 'data'] as const).map(panelLabel)];
const watched = new Map<string, () => void>();
const snapTimers = new Map<string, ReturnType<typeof setTimeout>>();
const windowOf = async (label: string) => (label === 'main' ? win : await WebviewWindow.getByLabel(label));

/** Follow the moves of the bar and the open windows (they come and go; checked every 2 s). */
async function watchMoves(): Promise<void> {
  for (const label of SNAP_LABELS) {
    const w = await windowOf(label).catch(() => null);
    if (!w) { watched.get(label)?.(); watched.delete(label); continue; }
    if (watched.has(label)) continue;
    watched.set(label, () => undefined);
    watched.set(label, await w.onMoved(() => {
      if (Date.now() < (selfMoveUntil.get(label) ?? 0)) return;
      afterMove(label);
    }));
  }
}
if (win) setInterval(() => void watchMoves(), 2000);

/** --drag held: the left button counts as down until then. */
let heldUntil = 0;
const buttonDown = async () => (Date.now() < heldUntil ? true : await invoke<boolean>('left_button_down').catch(() => false));

/** A window moved: snap once it is let go (no move for 150 ms and the button up). */
function afterMove(label: string, alt?: boolean): void {
  clearTimeout(snapTimers.get(label));
  const movedAt = Date.now();
  const check = async () => {
    const d = letGo(Date.now() - movedAt, await buttonDown());
    if (d === 'snap') void snapNow(label, alt);
    else snapTimers.set(label, setTimeout(() => void check(), d === 'recheck' ? RECHECK_MS : LET_GO_MS));
  };
  snapTimers.set(label, setTimeout(() => void check(), LET_GO_MS));
}

const rectOf = async (w: NonNullable<Awaited<ReturnType<typeof windowOf>>>) => {
  const [p, z] = await Promise.all([w.outerPosition(), w.outerSize()]);
  return { x: p.x, y: p.y, w: z.width, h: z.height };
};

/** Line a window up with the bar screen's work area or the app's other windows, if within 12 px. */
async function snapNow(label: string, alt?: boolean): Promise<void> {
  const w = await windowOf(label);
  if (!w || !win) return;
  const mon = await currentMonitor();
  if (!mon) return;
  const r = await rectOf(w);
  const others: Target[] = [];
  for (const l of SNAP_LABELS) {
    if (l === label) continue;
    const o = await windowOf(l).catch(() => null);
    if (o) others.push({ ...(await rectOf(o)), visible: await o.isVisible(), minimized: await o.isMinimized() });
  }
  const area = { x: mon.workArea.position.x, y: mon.workArea.position.y, w: mon.workArea.size.width, h: mon.workArea.size.height };
  const out = snap(r, others, area, mon.scaleFactor, {
    alt: alt ?? (await invoke<boolean>('alt_down').catch(() => false)),
    // The bar's history or menu open: its size is about to change back.
    expanded: label === 'main' && popKind !== null,
  });
  if (out.x === r.x && out.y === r.y) return;
  selfMoveUntil.set(label, Date.now() + 500);
  await w.setPosition(new PhysicalPosition(out.x, out.y));
}

/** --drag: put a window somewhere (logical px) as if the user had dragged it there, and let it go. */
async function dragAid(name: string, x: number, y: number, alt: boolean, held: boolean): Promise<void> {
  const label = name === 'main' ? 'main' : panelLabel(name as PanelName);
  const w = await windowOf(label);
  if (!w) return;
  if (held) heldUntil = Date.now() + 1000;
  selfMoveUntil.set(label, Date.now() + 100);
  await w.setPosition(new LogicalPosition(x, y));
  // The same path as a real move: let go once 150 ms have passed and the button is up.
  afterMove(label, alt);
}

/**
 * Checking aid: every animation's start and end in the bar and the notices, one JSON line each, so their
 * real durations can be read without screen captures (a throttled window shows as ends far too late).
 */
function startAnimLog(file: string): void {
  let buf: string[] = [];
  // The notification window stamps its own wall clock (the event's trip here would add to its times).
  const add = (r: Record<string, unknown>) => buf.push(JSON.stringify({ wall: Date.now(), ...r }));
  for (const type of ['animationstart', 'animationend', 'animationcancel'] as const) {
    document.addEventListener(type, (e) => {
      const el = e.target as HTMLElement;
      add({ w: 'bar', ev: type.slice(9), name: e.animationName, cls: `${el.id ? `#${el.id} ` : ''}${el.className}`, id: el.closest<HTMLElement>('.line')?.dataset.n ?? '', elapsed: e.elapsedTime, t: performance.now() });
    }, true);
  }
  void listen<Record<string, unknown>>('notify-anim', (e) => add({ w: 'notify', ...e.payload }));
  setInterval(() => {
    if (!buf.length) return;
    const text = buf.map((l) => `${l}\n`).join('');
    buf = [];
    void invoke('append_anim_log', { text, file }).catch(() => undefined);
  }, 2000);
}

void start();
