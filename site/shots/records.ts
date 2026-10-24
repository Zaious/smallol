// The site's pictures of the records (0.1.6): the data window's champions tab and a team's games, drawn
// from the live service's history with the app's own views and styles, as static pages for Edge to shoot.
// Usage: npx tsx site/shots/records.ts <out dir>   (then site/shots/shoot-records.sh shoots them)
import { readFileSync, writeFileSync } from 'node:fs';
import { adaptRoster } from '../../src/data/streamcv/roster.ts';
import { adaptPlayers, adaptTeams } from '../../src/data/streamcv/history.ts';
import { adapt } from '../../src/data/streamcv/adapter.ts';
import { STRINGS } from '../../src/i18n/index.ts';
import { BAR_STRINGS } from '../../src/i18n/bar.ts';
import { DEFAULTS } from '../../src/settings/schema.ts';
import { teamFile } from '../../src/ui/profile-views.ts';
import { championsView } from '../../src/ui/champion-views.ts';

const out = process.argv[2]!;
const API = 'https://smallol-api.chroniclecore.com';
const get = async (p: string) => (await fetch(`${API}${p}`)).json();
const [teams, players, roster] = await Promise.all([get('/history/teams.json'), get('/history/players.json'), get('/teams.json')]);
const game = JSON.parse(readFileSync('fixtures/streamcv/state_v05_kc_mvk_g2.json', 'utf8'));
const css = readFileSync('src/ui/app.css', 'utf8') + readFileSync('src/panels/panel.css', 'utf8');

for (const lang of ['zh-Hant', 'en'] as const) {
  const B = BAR_STRINGS[lang];
  const c = {
    s: adapt(game), clock: null, show: { ...DEFAULTS.show }, gold: 'diff', S: STRINGS[lang], lang, conn: 'ok', sample: false,
    schedule: null, now: Date.now(), spoilerFree: false, history: { teams: adaptTeams(teams), players: adaptPlayers(players) },
    pickedMatch: null, roster: adaptRoster(roster),
  } as never;
  const tabs = lang === 'en' ? ['Schedule', 'Teams', 'Champions', 'Series draft', 'Settings'] : ['賽程', '隊伍', '英雄', '全場 BP', '設定'];
  const page = (tab: string, body: string) => `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><style>${css} html,body{margin:0;background:transparent}</style></head>
<body><main id="panel" class="data bg-solid" style="width:340px;height:420px;border-radius:10px;overflow:hidden"><nav class="dtabs">${tabs.map((t) => `<button aria-pressed="${t === tab}">${t}</button>`).join('')}</nav>
<div class="dbody">${body}</div></main></body></html>`;
  const k = lang === 'en' ? 'en' : 'zh';
  writeFileSync(`${out}/rec-champs-${k}.html`, page(tabs[2]!, championsView(c, B, 'presence')));
  const kc = adaptRoster(roster).KC!;
  writeFileSync(`${out}/rec-team-${k}.html`, page(tabs[1]!, teamFile(c, B, kc, null).replace('<details class="tgame">', '<details class="tgame" open>')));
}
console.log('written');
