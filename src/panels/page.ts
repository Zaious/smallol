// The page inside an optional window (panel.html#minimap, #draftGame, #players, #data). It draws what
// the main window sends and sends clicks back; it never fetches anything itself.

import { getCurrentWindow } from '@tauri-apps/api/window';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { emit } from '@tauri-apps/api/event';
import { STRINGS } from '../i18n/index.ts';
import { BAR_STRINGS } from '../i18n/bar.ts';
import { clockNow } from '../model/clock.ts';
import { mapSvg } from '../render/map-svg.ts';
import type { PanelName } from '../settings/schema.ts';
import { draftPanel, playersPanel } from '../ui/panel-views.ts';
import { scheduleView } from '../ui/schedule-views.ts';
import { settingsView } from '../ui/settings-view.ts';
import { draftSeriesView, esc, schedCtx, timerChips, type ViewCtx } from '../ui/views.ts';
import { playerFile, teamFile, teamIndex, teamResults } from '../ui/profile-views.ts';
import type { PanelFrame } from './frame.ts';

const name = (location.hash.slice(1) || 'minimap') as PanelName;
const win = getCurrentWindow();
const root = document.getElementById('panel')!;
root.classList.add(name);
let frame: PanelFrame | null = null;

function ctx(f: PanelFrame): ViewCtx {
  const S = STRINGS[f.lang];
  return {
    s: f.state, clock: clockNow(f.state, f.receivedAt, Date.now(), f.settings.tickClock), show: f.settings.show, gold: f.settings.gold, S, lang: f.lang,
    conn: f.conn, sample: f.sample, schedule: f.schedule, now: Date.now(), spoilerFree: f.settings.spoilerFree, history: f.history, pickedMatch: f.pickedMatch, roster: f.roster,
  };
}

function body(f: PanelFrame): string {
  const c = ctx(f);
  const B = BAR_STRINGS[f.lang];
  const hasGame = f.state.status === 'in_game' || f.state.status === 'finished';
  if (name === 'minimap') {
    if (!hasGame) return `<p class="none muted">${esc(c.S.status[f.state.status])}</p>`;
    const map = mapSvg(f.state, c.clock, {
      inhibitors: c.show.inhibitors, inhibTimers: c.show.inhibitors, nexusTimers: c.show.nexusTimers,
      unnamed: c.S.unnamed, unnamedTitle: esc(c.S.ui.towersUnnamed), unknownTitle: esc(c.S.ui.towersUnknown),
      drakes: c.show.dragons ? { titles: (e) => esc(c.S.element[e as keyof typeof c.S.element] ?? (BAR_STRINGS[f.lang].event as Record<string, string>)[e] ?? e) } : undefined,
      pits: {
        dragon: c.show.nextDragon, top: c.show.nextBaron || c.show.herald || c.show.voidgrubs,
        titles: (k) => esc(k in c.S.element ? c.S.element[k as keyof typeof c.S.element] : (BAR_STRINGS[f.lang].event as Record<string, string>)[k] ?? k),
      },
      noUnnamed: true,
      teams: f.state.series ? { B: esc(f.state.series.teams.B.code), R: esc(f.state.series.teams.R.code) } : undefined,
    });
    // Buffs and the inhibitors the map cannot place: one small line under it.
    const chips = timerChips(c, true);
    return `${map}${chips ? `<div class="mtimers">${chips}</div>` : ''}`;
  }
  if (name === 'draftGame') return draftPanel(c);
  if (name === 'players') return playersPanel(c, window.innerWidth >= 400);
  const tabs = (['schedule', 'teams', 'series', 'settings'] as const).map((t) => `<button data-tab="${t}" aria-pressed="${f.dataTab === t}">${esc(B.tab[t])}</button>`).join('');
  const content = f.dataTab === 'schedule' ? scheduleView(schedCtx(c)) : f.dataTab === 'teams' ? teamsTab(f, c) : f.dataTab === 'series' ? draftSeriesView(c) : settingsView(f.settings, c.S, B, f.endpointError, f.settingsExtra);
  return `<nav class="dtabs">${tabs}</nav><div class="dbody tab-${f.dataTab}">${content}</div>`;
}

/** The search typed in the teams tab: this window's own, never sent to the main window. */
let query = '';
let composing = false;
function teamsTab(f: PanelFrame, c: ViewCtx): string {
  const B = BAR_STRINGS[f.lang];
  const t = f.profile.team ? f.roster?.[f.profile.team] : null;
  const p = t && f.profile.player ? t.players.find((x) => x.id === f.profile.player) : null;
  if (t && p) return playerFile(c, B, t, p);
  if (t) return teamFile(c, B, t, f.settings.myTeam);
  return teamIndex(c, B, f.settings.myTeam, query);
}

let lastHtml = '';
let scrolled: string | null = null;
const f2scroll = (f: PanelFrame) => (f.dataTab === 'settings' && f.scrollTo && /^[a-z]+$/.test(f.scrollTo) ? f.scrollTo : null);

function draw(): void {
  if (!frame) return;
  document.documentElement.lang = frame.lang;
  root.classList.remove('bg-solid', 'bg-semi', 'bg-clear');
  root.classList.add(`bg-${name === 'data' ? 'solid' : frame.settings.background}`);
  // Keep the endpoint field (and its caret) while the user types in it.
  if (document.activeElement?.matches('[data-input]')) return;
  const html = body(frame);
  if (html === lastHtml) return;
  // Redraw the data window's body without losing where it was scrolled to.
  const scroller = root.querySelector('.dbody');
  const top = scroller?.scrollTop ?? 0;
  root.innerHTML = html;
  lastHtml = html;
  const again = root.querySelector('.dbody');
  if (again) again.scrollTop = top;
  // Checking aid (--scroll): once, to the named section.
  const sec = f2scroll(frame);
  if (sec && sec !== scrolled) { root.querySelector(`[data-sec="${sec}"]`)?.scrollIntoView({ block: 'start' }); scrolled = sec; }
}

// Timers move every second (the minimap's respawn tags); the data window's countdowns each minute.
setInterval(draw, name === 'data' ? 30_000 : 1000);
new ResizeObserver(() => { lastHtml = ''; draw(); }).observe(root);

// Clicks go to the main window, which owns the settings and the game.
root.addEventListener('click', (e) => {
  const t = (e.target as HTMLElement).closest<HTMLElement>('button, input[type=checkbox]');
  if (!t) return;
  // `from`: a click in a window, not the bar's panel menu (whose buttons carry only data-panel).
  const data: Record<string, string> = { panel: name, from: name, ...t.dataset } as Record<string, string>;
  if (t instanceof HTMLInputElement && t.type === 'checkbox') data.checked = String(t.checked);
  void emit('panel-action', data);
});
/** A typed field (the data source, the stream address) is sent when the user presses Enter or leaves it. */
const TYPED = '[data-input=endpoint], [data-input=watchUrl]';
function commitField(input: HTMLInputElement): void {
  void emit('panel-action', { panel: name, [input.dataset.input!]: input.value.trim() });
  input.blur();
}
// Search as the user types; while an input method is composing (注音, 拼音) wait for the word.
root.addEventListener('compositionstart', () => { composing = true; });
root.addEventListener('compositionend', (e) => { composing = false; searchFrom(e.target as HTMLElement); });
root.addEventListener('input', (e) => { if (!composing) searchFrom(e.target as HTMLElement); });
function searchFrom(el: HTMLElement): void {
  if (!frame || !el.matches('[data-input=search]')) return;
  query = (el as HTMLInputElement).value;
  const box = root.querySelector('.tresults');
  if (box) box.innerHTML = teamResults(ctx(frame), BAR_STRINGS[frame.lang], frame.settings.myTeam, query);
}

root.addEventListener('keydown', (e) => {
  const t = e.target as HTMLElement;
  if (t.matches(TYPED) && e.key === 'Enter') commitField(t as HTMLInputElement);
});
root.addEventListener('focusout', (e) => {
  const t = e.target as HTMLElement;
  if (t.matches(TYPED)) commitField(t as HTMLInputElement);
});

// Drag from anywhere that is not a control; resize from the corner; close from the corner button.
root.addEventListener('mousedown', (e) => {
  if (e.button !== 0 || (e.target as HTMLElement).closest('button, input, label, a, .dbody')) return;
  void win.startDragging();
});
document.getElementById('grip')!.addEventListener('mousedown', (e) => { e.preventDefault(); void win.startResizeDragging('SouthEast'); });
document.getElementById('close')!.addEventListener('click', () => void emit('panel-closed', name));

let resizeTimer: ReturnType<typeof setTimeout> | null = null;
void win.onResized(() => {
  if (resizeTimer) clearTimeout(resizeTimer);
  resizeTimer = setTimeout(async () => {
    const s = (await win.innerSize()).toLogical(await win.scaleFactor());
    void emit('panel-size', { name, w: Math.round(s.width), h: Math.round(s.height) });
  }, 400);
});

const self = getCurrentWebviewWindow();
void (async () => {
  await self.listen<PanelFrame>('panel-frame', (e) => { frame = e.payload; draw(); });
  await emit('panel-ready', name);
})();
