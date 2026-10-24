// The settings tab of the data window (docs/UI_SPEC_v1.md §6). Pure: settings in, HTML out. Clicks
// carry data-set="path:value", data-toggle="path", data-ev="kind:channel" or data-reset="base";
// the main window applies them.

import type { Strings } from '../i18n/index.ts';
import { macKeys, type BarStrings } from '../i18n/bar.ts';
import { channelOf, EVENT_KINDS } from '../events/kinds.ts';
import { CHANNELS, FEATURES, REMINDER_LEADS, SOON_LEADS, type Settings } from '../settings/schema.ts';
import { esc } from './views.ts';

const seg = (path: string, current: string, options: [string, string][]) =>
  `<span class="seg">${options.map(([v, label]) => `<button data-set="${path}:${v}" aria-pressed="${v === current}">${esc(label)}</button>`).join('')}</span>`;

const check = (path: string, on: boolean, label: string) =>
  `<label class="check"><input type="checkbox" data-toggle="${path}" ${on ? 'checked' : ''}/>${esc(label)}</label>`;

/** "上班" / "自訂（基於 陪看）": what the mode label says. */
export function modeLabel(cfg: Settings, B: BarStrings): string {
  return cfg.mode === 'custom' ? B.customOf(B.base[cfg.modeBase]) : B.mode[cfg.mode];
}

/** What the settings tab needs besides the settings: low-key now (by hand or detection), hotkeys another
 * program holds, why a typed stream address was refused. */
export interface SettingsExtra {
  lowNow: boolean; hotkeyBusy: string[]; watchError: keyof BarStrings['b3']['watchBad'] | null;
  /** This version, a newer one if found (installable by this copy or not), the check's state, the download's note. */
  update?: { version: string; newer: string | null; installable: boolean; asking: 'idle' | 'asking' | 'none'; note: string | null };
}

function updateRows(B: BarStrings, cfg: Settings, u: NonNullable<SettingsExtra['update']>): string {
  const U = B.upd;
  const action = u.newer
    ? `<button data-action="update"${u.note ? ' disabled' : ''}>${esc(u.installable ? U.updateTo(u.newer) : U.download(u.newer))}</button>`
    : `<button data-action="check-update"${u.asking === 'asking' ? ' disabled' : ''}>${esc(u.asking === 'asking' ? U.checking : U.check)}</button>`;
  const status = u.note ?? (u.asking === 'none' && !u.newer ? U.latest : '');
  return `<div class="srow"><span class="k">${esc(U.version(u.version))}</span><span class="seg">${action}</span>${status ? `<span class="note">${esc(status)}</span>` : ''}</div>
    <div class="srow">${check('updateCheck', cfg.updateCheck, U.startCheck)}</div>`;
}

export function settingsView(cfg: Settings, S: Strings, B: BarStrings, endpointError: boolean, x: SettingsExtra = { lowNow: false, hotkeyBusy: [], watchError: null }): string {
  const t = S.set;
  const b = B.b3;
  const modes = (['work', 'companion', 'custom'] as const).map((m) =>
    `<button data-set="mode:${m}" aria-pressed="${cfg.mode === m}">${esc(m === 'custom' && cfg.mode === 'custom' ? modeLabel(cfg, B) : B.mode[m])}</button>`).join('');
  const events = EVENT_KINDS.map((k) => {
    const ch = channelOf(k, cfg);
    return `<div class="evrow"><span class="evk">${esc(B.event[k])}</span><span class="seg sm">${CHANNELS.map((c) => `<button data-ev="${k}:${c}" aria-pressed="${c === ch}">${esc(B.channel[c])}</button>`).join('')}</span></div>`;
  }).join('');
  return `<div class="settings">
    <h3>${esc(B.sections.notify)}</h3>
    <div class="srow"><span class="seg">${modes}</span></div>
    ${cfg.mode !== 'custom' ? `<p class="note">${esc(B.modeHint[cfg.mode])}</p>` : ''}
    <h3>${esc(B.sections.events)}</h3>
    <div class="srow"><span class="k">${esc(B.reset)}</span><span class="seg sm">${(['work', 'companion', 'major'] as const).map((b) => `<button data-reset="${b}">${esc(B.base[b])}</button>`).join('')}</span></div>
    <div class="events">${events}</div>
    <div class="srow"><span class="k">${esc(B.sections.reminder)}</span>${seg('reminderLead', String(cfg.reminderLead), REMINDER_LEADS.map((n) => [String(n), n === 0 ? B.atStart : B.minutes(n)]))}</div>
    <div class="srow"><span class="k">${esc(B.sections.soon)}</span>${seg('soonLead', String(cfg.soonLead), SOON_LEADS.map((n) => [String(n), B.seconds(n)]))}</div>
    <div class="srow"><span class="k">${esc(B.sections.milestones)}</span>${seg('milestones', cfg.milestones, [['all', B.milestones.all], ['mine', B.milestones.mine]])}</div>
    <div class="srow"><span class="k">${esc(B.sections.corner)}</span>${seg('notifyCorner', cfg.notifyCorner, [['br', B.corner.br], ['tr', B.corner.tr]])}</div>
    <div class="srow">${check('cardSound', cfg.cardSound, b.sound)}${seg('soundVolume', cfg.soundVolume, (['low', 'mid', 'high'] as const).map((v) => [v, b.volume[v]]))}<span class="seg"><button data-action="sound-test">${esc(b.test)}</button></span></div>
    <div class="srow"><span class="k">${esc(b.watchUrl)}</span><input class="key" data-input="watchUrl" value="${esc(cfg.watchUrl)}" spellcheck="false" placeholder="https://"/></div>
    <p class="note">${esc(x.watchError ? b.watchBad[x.watchError] : b.watchNote)}</p>
    <h3>${esc(B.sections.panels)}</h3>
    <div class="chips">${(['minimap', 'draftGame', 'players'] as const).map((p) => check(`panels.${p}`, cfg.panels[p], B.panel[p])).join('')}</div>
    <h3 data-sec="general">${esc(B.sections.general)}</h3>
    <div class="srow"><span class="k">${esc(t.language)}</span>${seg('language', cfg.language, [['auto', t.auto], ['zh-Hant', '中文'], ['en', 'English']])}</div>
    <div class="srow"><span class="k">${esc(t.background)}</span>${seg('background', cfg.background, [['solid', t.solid], ['semi', t.semi], ['clear', t.clear]])}</div>
    <div class="srow">${check('spoilerFree', cfg.spoilerFree, t.spoilerFree)}</div>
    <div class="srow">${check('tickClock', cfg.tickClock, t.tickClock)}</div>
    <div class="srow">${check('lowKey', x.lowNow, b.lowKey)}</div>
    <div class="srow">${check('terminal', cfg.terminal, b.terminal)}</div>
    <div class="srow">${check('hotkeys', cfg.hotkeys, b.hotkeys)}</div>
    ${cfg.hotkeys ? `<p class="note">${[macKeys(b.hotkeyHide), macKeys(b.hotkeyLow)].map((line) =>
      // A hotkey another program holds says so beside it, in the accent colour (batch 3 closing note).
      esc(line) + (x.hotkeyBusy.some((k) => line.endsWith(k)) ? ` <span class="busy">${esc(b.hotkeyTaken)}</span>` : '')).join('<br>')}</p>` : ''}
    <div class="srow">${check('autoLowKey', cfg.autoLowKey, b.autoLow)}</div>
    <p class="note">${esc(b.autoLowNote)}</p>
    <h3>${esc(t.show)}</h3>
    <div class="chips">${FEATURES.filter((f) => f !== 'series' && f !== 'nextMatch').map((f) => check(`show.${f}`, cfg.show[f], S.feature[f])).join('')}</div>
    <h3>${esc(t.endpoint)}</h3>
    <div class="srow"><input class="key" data-input="endpoint" value="${esc(cfg.endpoint)}" spellcheck="false"/></div>
    <p class="note">${esc(endpointError ? t.endpointBad : t.endpointNote)}</p>
    <h3>${esc(t.about)}</h3>
    ${x.update ? updateRows(B, cfg, x.update) : ''}
    <p class="about">${esc(t.aboutText)}</p>
  </div>`;
}
