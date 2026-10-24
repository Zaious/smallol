// Terminalol (2026-10-24): the bar drawn as a terminal window running a sync job, laid out like a
// process monitor. Sections the user picks (Settings > General): the players (during the draft their
// picks under the roster's names, during the game champion, level, K/D/A and health), the draft kept
// during the game, each team's towers, the last log lines; and always a prompt line and a status line.
// English by default (names line up, it reads more like a terminal), Chinese on request. Plain text in
// fixed-width columns: nothing that reads as sport at a glance but the words themselves.
// Pure: context in, HTML and its size out.

import type { LogEntry } from '../events/history-log.ts';
import type { Strings } from '../i18n/index.ts';
import type { BarStrings } from '../i18n/bar.ts';
import { championName } from '../data/champions.ts';
import { LANES, TEAMS, type Lane, type MatchState, type Player, type Team, type TowerSite } from '../model/types.ts';
import { fmtClock } from '../model/clock.ts';
import { fmtGold } from './views.ts';

export interface TermOptions { players: boolean; draftInGame: boolean; towers: boolean; log: boolean; zh: boolean }

export interface TermCtx {
  s: MatchState;
  clock: number | null;
  log: LogEntry[];
  opts: TermOptions;
  code: (t: Team) => string;
  /** The roster's starters per team code, top to support (names for the draft rows). */
  starters: (code: string) => string[];
  /** The bar's own status line, as text, for when no game is on. */
  idleText: string;
  /** Strings in the terminal's language. */
  S: Strings;
  B: BarStrings;
}

export const TERM_LINE = 17;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const cell = (cls: string, text: string) => `<span class="c k-${cls}">${esc(text)}</span>`;

/** A health bar in ten characters: # for each tenth left, - for the rest. */
export function hpBar(p: Player): string {
  if (p.hp === null || !p.maxHp) return ' '.repeat(16);
  const f = Math.max(0, Math.min(1, p.hp / p.maxHp));
  const n = Math.round(f * 10);
  return `${'#'.repeat(n)}${'-'.repeat(10 - n)} ${String(Math.round(f * 100)).padStart(3)}%`;
}

export function terminalView(c: TermCtx): { html: string; lines: number; wide: boolean } {
  const { s, opts } = c;
  const lang = opts.zh ? 'zh-Hant' : 'en';
  const name = (id: string | null) => (id ? championName(id, lang) : '·');
  const on = s.status === 'waiting' || s.status === 'in_game';
  const out: string[] = [];
  const right = s.status === 'in_game'
    ? `${c.code('B')} ${s.teams.B.kills ?? 0}-${s.teams.R.kills ?? 0} ${c.code('R')}  t=${c.clock === null ? '--:--' : fmtClock(c.clock)}`
    : '';
  out.push(`<div class="tl prompt">~/work/sync $ npm run sync -- --watch${right ? `<span class="r">${esc(right)}</span>` : ''}</div>`);

  // The players: their picks during the draft, their state during the game.
  const draft = s.draft?.current ?? null;
  const wide = on && opts.players;
  if (wide) {
    out.push(`<div class="tl head">${cell('tm', 'TEAM')}${cell('pl', 'PLAYER')}${cell('ch', 'CHAMP')}${s.status === 'in_game' ? `${cell('lv', 'LV')}${cell('kda', 'K/ D/ A')}${cell('hp', 'HP')}` : ''}</div>`);
    for (const t of TEAMS) {
      const code = c.code(t);
      const live = s.status === 'in_game' ? s.players?.[t] ?? null : null;
      if (live && live.length) {
        for (const p of live) {
          const kda = `${String(p.kills ?? 0).padStart(2)}/${String(p.deaths ?? 0).padStart(2)}/${String(p.assists ?? 0).padStart(2)}`;
          const dead = p.hp === 0;
          out.push(`<div class="tl${dead ? ' dim2' : ''}">${cell('tm', code)}${cell('pl', p.name)}${cell('ch', name(p.champion))}${cell('lv', String(p.level ?? ''))}${cell('kda', kda)}${cell('hp', hpBar(p))}${dead ? cell('dd', 'dead') : ''}</div>`);
        }
      } else {
        const names = c.starters(code);
        const picks = draft?.sides[t].picks ?? [];
        for (let i = 0; i < 5; i++) out.push(`<div class="tl">${cell('tm', code)}${cell('pl', names[i] ?? '')}${cell('ch', name(picks[i] ?? null))}</div>`);
      }
    }
  }
  // The bans: always during the draft (with the players), during the game when the draft is kept.
  if (draft && ((s.status === 'waiting' && opts.players) || (s.status === 'in_game' && opts.draftInGame))) {
    for (const t of TEAMS) {
      const sd = draft.sides[t];
      const picks = s.status === 'in_game' && !opts.players ? `  pick ${sd.picks.map(name).join(' ')}` : '';
      out.push(`<div class="tl">${cell('lb', 'ban')}${cell('tm', c.code(t))}${esc(sd.bans.map(name).join(' '))}${esc(picks)}</div>`);
    }
  }
  // Each team's own towers, lane by lane outer to inner (# up, - down, ? maybe), nexus turrets, inhibitors.
  if (s.status === 'in_game' && opts.towers && s.towersKnown) {
    for (const t of TEAMS) {
      const tw = s.teams[t].towers;
      const g = (site: TowerSite) => (tw[site]?.down ? '-' : tw[site]?.maybe ? '?' : '#');
      const lane = (l: Lane) => `${l} ${g(`${l}_outer` as TowerSite)}${g(`${l}_inner` as TowerSite)}${g(`${l}_inhib_tower` as TowerSite)}`;
      const down = new Set(s.teams[t].inhibitorsDown.map((i) => i.lane));
      out.push(`<div class="tl">${cell('lb', 'tower')}${cell('tm', c.code(t))}${esc(`${LANES.map(lane).join('  ')}  base ${g('nexus_t1')}${g('nexus_t2')}  inhib ${LANES.map((l) => (down.has(l) ? '-' : '#')).join('')}`)}</div>`);
    }
  }
  // The last log lines: three beside the rest, four when it is all there is.
  if (opts.log) {
    const n = on ? 3 : 4;
    const lines = c.log.slice(-n);
    for (const e of lines) {
      const when = e.at === null ? new Date(e.t).toTimeString().slice(0, 8) : fmtClock(e.at).padStart(5, '0');
      const text = opts.zh ? e.text : e.en ?? e.text;
      out.push(`<div class="tl${e.level === 'major' ? ' warn' : ''}">[${esc(when)}] ${e.level === 'major' ? 'warn ' : 'info '} ${esc(text)}</div>`);
    }
    if (!on) for (let i = lines.length; i < n; i++) out.push('<div class="tl dim">&nbsp;</div>');
  }
  // The status line.
  let st: string;
  if (s.status === 'in_game') {
    const d = (s.teams.B.gold ?? 0) - (s.teams.R.gold ?? 0);
    const lead = d === 0 ? '±0' : `${c.code(d > 0 ? 'B' : 'R')} +${fmtGold(Math.abs(d))}`;
    const next: string[] = [];
    const nd = s.nextDragon;
    if (nd && c.clock !== null) { const e = nd.elder ? 'elder' : nd.element; next.push(`${e ? c.S.element[e] : c.S.ui.dragon} ${nd.at > c.clock ? fmtClock(nd.at - c.clock) : c.B.up}`); }
    const nb = s.nextBaron;
    if (nb && c.clock !== null && s.pitNext !== 'grubs' && s.pitNext !== 'herald') next.push(`${c.S.ui.baron} ${nb.at > c.clock ? fmtClock(nb.at - c.clock) : c.B.up}`);
    st = `Δ ${lead}${next.length ? `  ${next.join('  ')}` : ''}${opts.players ? '' : `  ${right}`}`;
  } else st = c.idleText;
  out.push(`<div class="tl status">» ${esc(st)}<i class="cur"></i></div>`);
  return { html: out.join(''), lines: out.length, wide };
}
