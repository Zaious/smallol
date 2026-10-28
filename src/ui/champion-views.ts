// The data window's champions tab: this event's picks and bans per champion (presence, picks, bans,
// win rate), from the service's history of finished games. Win rates are spoilers: hidden while scores
// are hidden, with the same show/hide button as a player's champions. Pure: context in, HTML out; the
// sort buttons carry data-champ-sort, handled by the data window itself.

import type { BarStrings } from '../i18n/bar.ts';
import { championStats, type ChampStat } from '../data/streamcv/history.ts';
import { championName } from '../data/champions.ts';
import { esc, type ViewCtx } from './views.ts';

export type ChampSort = 'presence' | 'picks' | 'bans' | 'win';
export const CHAMP_SORTS: readonly ChampSort[] = ['presence', 'picks', 'bans', 'win'];
// Which games: the main event (default), the play-ins, or all. The play-ins are a few teams playing many games
// (2026: 4 teams, 22 of the first 51 games), enough to tilt the whole event's numbers (suggestion, 2026-10-28).
export type ChampStage = 'main' | 'playIns' | 'all';
export const CHAMP_STAGES: readonly ChampStage[] = ['main', 'playIns', 'all'];
const inStage: Record<ChampStage, (stage: string) => boolean> = { main: (s) => s !== 'Play-Ins', playIns: (s) => s === 'Play-Ins', all: () => true };

const pct = (n: number) => `${Math.round(n * 100)}%`;
const rate = (r: ChampStat) => (r.decided ? r.wins / r.decided : -1);

export function championsView(c: ViewCtx, B: BarStrings, sort: ChampSort, stage: ChampStage = 'main'): string {
  const { games, rows } = championStats(c.history.teams, (g) => inStage[stage](g.stage));
  const stageLabel: Record<ChampStage, string> = { main: B.rec.stageMain, playIns: B.rec.stagePlayIns, all: B.rec.stageAll };
  const stages = `<div class="csort"><span class="k">${esc(B.rec.stageBy)}</span>${CHAMP_STAGES.map((k) => `<button data-champ-stage="${k}" aria-pressed="${stage === k}">${esc(stageLabel[k])}</button>`).join('')}</div>`;
  if (!games) return `${stages}<p class="none muted">${esc(B.rec.none)}</p>`;
  const winsShown = !c.spoilerFree;
  const key: Record<ChampSort, (r: ChampStat) => number> = {
    presence: (r) => r.picks + r.bans, picks: (r) => r.picks, bans: (r) => r.bans, win: (r) => (winsShown ? rate(r) : r.picks + r.bans),
  };
  const sorted = [...rows].sort((a, b) => key[sort](b) - key[sort](a) || b.picks + b.bans - (a.picks + a.bans) || a.champion.localeCompare(b.champion));
  const label: Record<ChampSort, string> = { presence: B.rec.presence, picks: B.rec.picks, bans: B.rec.bans2, win: B.rec.winRate };
  const sorts = CHAMP_SORTS.filter((k) => k !== 'win' || winsShown)
    .map((k) => `<button data-champ-sort="${k}" aria-pressed="${sort === k}">${esc(label[k])}</button>`).join('');
  const head = `${stages}<div class="chead"><b>${esc(B.rec.title(games))}</b><span class="grow"></span><button class="mini" data-toggle-spoiler="1">${esc(winsShown ? B.prof.hideWins : B.prof.showWins)}</button></div>`
    + `<div class="csort"><span class="k">${esc(B.rec.sortBy)}</span>${sorts}</div>`;
  const th = `<div class="crow chd"><span>${esc(B.rec.champion)}</span><span>${esc(B.rec.presence)}</span><span>${esc(B.rec.picks)}</span><span>${esc(B.rec.bans2)}</span><span>${esc(winsShown ? B.rec.winRate : '')}</span></div>`;
  const body = sorted.map((r) => `<div class="crow"><span class="cn">${esc(championName(r.champion, c.lang))}</span>`
    + `<span class="mono">${pct((r.picks + r.bans) / games)}</span><span class="mono">${r.picks}</span><span class="mono">${r.bans}</span>`
    + `<span class="mono">${winsShown && r.decided ? `${pct(r.wins / r.decided)}<i class="muted"> ${r.wins}-${r.decided - r.wins}</i>` : ''}</span></div>`).join('');
  return `${head}<div class="ctable">${th}${body}</div><p class="note muted">${esc(B.rec.few)}</p>`;
}
