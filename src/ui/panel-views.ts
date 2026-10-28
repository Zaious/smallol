// The optional windows' content (docs/UI_SPEC_v1.md §6), sized for small windows: this game's draft
// (300×100) and the players (320×150, 440×150 with more columns). Pure: context in, HTML out.

import { TEAMS, type Player, type Team } from '../model/types.ts';
import { itemName, legendaryItem } from '../data/items.ts';
import { shortChampion } from '../events/text.ts';
import { TEAM_COLOUR } from '../render/map-svg.ts';
import { nextMatch } from '../data/streamcv/schedule.ts';
import { tally } from '../data/streamcv/history.ts';
import { esc, type ViewCtx } from './views.ts';

const dot = (t: Team) => `<i class="dot" style="background:${TEAM_COLOUR[t]}"></i>`;
const code = (c: ViewCtx, t: Team) => c.s.series?.teams[t].code ?? c.S.team[t];

/** This game's draft: per team a ban row and a pick row, short champion names, empty slots dashed. */
export function draftPanel(c: ViewCtx): string {
  const g = c.s.draft?.current;
  const head = `<header><b>${esc(c.S.view.draftGame)}</b>${g ? `<span class="muted">${esc(c.S.gameNo(g.game))}</span>` : ''}</header>`;
  if (!g) return nextTendencies(c) ?? `${head}<p class="none muted">${esc(c.S.ui.noDraft)}</p>`;
  const slots = (ids: (string | null)[], kind: 'ban' | 'pick', t: Team) =>
    ids.slice(0, 5).concat(Array(Math.max(0, 5 - ids.length)).fill(null)).map((id) => (id
      ? `<span class="pc ${kind}" style="--t:${TEAM_COLOUR[t]}" title="${esc(shortChampion(id, c.lang))}">${esc(shortChampion(id, c.lang))}</span>`
      : '<span class="pc empty"></span>')).join('');
  return head + TEAMS.map((t) => `<div class="dp">
      <span class="who">${dot(t)}<b>${esc(code(c, t))}</b></span>
      <span class="k">${esc(c.S.ui.bans)}</span><span class="slots">${slots(g.sides[t].bans, 'ban', t)}</span>
      <span class="k">${esc(c.S.ui.picks)}</span><span class="slots">${slots(g.sides[t].picks, 'pick', t)}</span>
    </div>`).join('');
}

/**
 * No game on: the next match's two teams, each with its five most banned and most picked this event
 * (same rows as a draft, so the window keeps its shape). Null when there is no next match with history.
 */
function nextTendencies(c: ViewCtx): string | null {
  const m = c.s.status === 'idle' && c.schedule ? nextMatch(c.schedule, c.now) : null;
  if (!m) return null;
  const codes = m.teams.map((t) => t.code);
  const games = (x: string) => c.history.teams?.[x] ?? [];
  if (!codes.some((x) => x !== 'TBD' && games(x).length)) return null;
  const chips = (x: string, what: 'bans' | 'picks') => {
    const list = x === 'TBD' ? [] : tally(games(x), what);
    return list.map(([id, n]) => `<span class="pc ${what === 'bans' ? 'ban' : 'pick'}" style="--t:var(--muted)" title="${esc(`${shortChampion(id, c.lang)} ×${n}`)}">${esc(shortChampion(id, c.lang))}</span>`)
      .concat(Array(5 - list.length).fill('<span class="pc empty"></span>')).join('');
  };
  const head = `<header><b>${esc(c.S.ui.nextTend)}</b></header>`;
  return head + codes.map((x) => `<div class="dp">
      <span class="who"><b>${esc(x === 'TBD' ? c.S.ui.tbd : x)}</b></span>
      <span class="k">${esc(c.S.ui.bans)}</span><span class="slots">${chips(x, 'bans')}</span>
      <span class="k">${esc(c.S.ui.picks)}</span><span class="slots">${chips(x, 'picks')}</span>
    </div>`).join('');
}

/** The legendary items a player holds, by name (counted in the wide panel, named on hover). */
const legendaries = (p: Player, lang: ViewCtx['lang']) => (p.items ?? []).filter(legendaryItem).map((id) => itemName(id, lang));

/** The players: two teams side by side, five rows each. Wide windows add CS, gold and legendaries. */
export function playersPanel(c: ViewCtx, wide: boolean): string {
  const ps = c.s.players;
  if (!ps) return `<p class="none muted">${esc(c.S.ui.noPlayers)}</p>`;
  const row = (p: Player, t: Team) => {
    const dead = p.hp === 0;
    const hp = p.hp !== null && p.maxHp ? Math.max(0, Math.min(1, p.hp / p.maxHp)) : null;
    const kda = `${p.kills ?? '–'}/${p.deaths ?? '–'}/${p.assists ?? '–'}`;
    const legs = wide ? legendaries(p, c.lang) : [];
    const extra = wide
      ? `<span class="n">${p.cs ?? '–'}</span><span class="n">${p.gold === null ? '–' : `${(p.gold / 1000).toFixed(1)}k`}</span><span class="n" title="${esc(legs.join('、'))}">${legs.length}</span>`
      : '';
    return `<div class="pr${dead ? ' dead' : ''}" title="${esc(p.name)}">
        <span class="ch">${esc(p.champion ? shortChampion(p.champion, c.lang) : p.name)}</span>
        <span class="n">${p.level ?? '–'}</span><span class="n kda">${kda}</span>${extra}
        ${hp === null ? '' : `<i class="hp" style="--w:${(hp * 100).toFixed(0)}%;--t:${TEAM_COLOUR[t]}"></i>`}
      </div>`;
  };
  return `<div class="pp${wide ? ' wide' : ''}">${TEAMS.map((t) => `<div class="pt"><div class="ph">${dot(t)}<b>${esc(code(c, t))}</b></div>${ps[t].map((p) => row(p, t)).join('')}</div>`).join('')}</div>`;
}
