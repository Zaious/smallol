// UI strings, Traditional Chinese (Taiwan) and English. Same shape as Basesmall's: one typed
// record per language, so a key missing in either language fails the type check.

import type { Element, GameStatus, Role, Team } from '../model/types.ts';
import type { MatchStage } from '../model/schedule.ts';
import type { Feature, ViewName } from '../settings/schema.ts';
import type { Connection } from '../data/streamcv/source.ts';

export type Lang = 'zh-Hant' | 'en';
export const LANGS: readonly Lang[] = ['zh-Hant', 'en'];

export function detectLang(locale: string | undefined): Lang {
  return locale?.toLowerCase().startsWith('zh') ? 'zh-Hant' : 'en';
}

export interface Strings {
  team: Record<Team, string>;
  /** One letter or character for tight spots. */
  teamShort: Record<Team, string>;
  status: Record<GameStatus, string>;
  /** For the dot tier. */
  statusShort: Record<'waiting' | 'finished', string>;
  connection: Record<Connection, string>;
  element: Record<Element | 'elder', string>;
  /** One character (or two letters) inside a dragon tile. */
  elementShort: Record<Element | 'elder', string>;
  feature: Record<Feature, string>;
  /** One character (or letter) per position. */
  role: Record<Role, string>;
  view: Record<ViewName, string>;
  stage: Record<MatchStage, string>;
  ui: Record<
    | 'sample' | 'sampleShort' | 'sampleHint' | 'baron' | 'baronUp' | 'baronBuff' | 'elderBuff' | 'dragon' | 'dragonUp' | 'elderNext' | 'unknownElement'
    | 'soul' | 'inhibitor' | 'nexusTurret' | 'kills' | 'gold' | 'towersUnnamed' | 'towersUnknown'
    | 'settings' | 'done' | 'quit' | 'quitAgain' | 'noGame' | 'waiting'
    | 'next' | 'elder' | 'noSeries' | 'bans' | 'picks' | 'fearless' | 'noDraft' | 'noEarlier' | 'turn'
    | 'vs' | 'winsUnknown' | 'bansUnsupported' | 'picksAtStart' | 'noPlayers' | 'level' | 'cs' | 'kda' | 'hp' | 'itemsUnknown' | 'bansMissing'
    | 'grubs' | 'herald' | 'heraldMaybeUp' | 'sidesUnconfirmed' | 'sidesUnconfirmedHint' | 'elementByRules'
    | 'nextMatch' | 'onNow' | 'tbd' | 'finished' | 'showScores' | 'hideScores' | 'noSchedule' | 'seasonOver' | 'spoilerOn'
    | 'tendBans' | 'tendPicks' | 'noHistory' | 'historyScope' | 'backToSchedule' | 'thisEvent' | 'pool'
    | 'coaches' | 'substitute' | 'notPlayedYet' | 'gamesBP' | 'gamesBPSpoil' | 'nextTend',
    string
  >;
  set: Record<
    | 'title' | 'language' | 'auto' | 'background' | 'solid' | 'semi' | 'clear' | 'show' | 'goldView' | 'goldDiff' | 'goldTotals'
    | 'tickClock' | 'endpoint' | 'endpointBad' | 'endpointNote' | 'views' | 'about' | 'aboutText' | 'spoilerFree',
    string
  >;
  /** "+2 not yet identified" next to a team's map corner. */
  unnamed(n: number): string;
  /** "BO5 第 3 局". */
  seriesGame(bestOf: number, game: number): string;
  gameNo(game: number): string;
  locked(n: number): string;
  /** "紅方水晶" — whose building, in words. */
  whose(team: string, what: string): string;
  /** "還有 3 小時 12 分". */
  until(ms: number): string;
  bo(n: number): string;
  /** "2 場", or "2 場 1 勝" when scores may be shown. */
  games(n: number, wins: number | null): string;
  /** "本屆 8 局". */
  eventGames(n: number): string;
  /** "本屆上場 8 局". */
  playedThisWorlds(n: number): string;
  age(n: number): string;
}

const zh: Strings = {
  team: { B: '藍方', R: '紅方' },
  teamShort: { B: '藍', R: '紅' },
  status: { idle: '目前沒有進行中的比賽', waiting: '等待開局', in_game: '比賽中', finished: '本局結束' },
  statusShort: { waiting: '等待', finished: '結束' },
  connection: { connecting: '連線中', ok: '已連線', retrying: '連不到服務，重試中' },
  // 用語為一般玩家的叫法，尚未對照官方中文版。
  element: { infernal: '火龍', ocean: '水龍', mountain: '土龍', cloud: '風龍', hextech: '海克斯龍', chemtech: '化學龍', elder: '遠古龍' },
  // 海克斯龍寫「科」（維護者 2026-10-16 定）：「海」會被看成海龍（水龍的另一個叫法）。
  elementShort: { infernal: '火', ocean: '水', mountain: '土', cloud: '風', hextech: '科', chemtech: '化', elder: '遠' },
  feature: {
    clock: '遊戲時間', kills: '擊殺數', gold: '經濟差',
    towers: '防禦塔小地圖', nexusTimers: '主堡塔重生倒數', inhibitors: '水晶與重生倒數',
    dragons: '小龍', soul: '龍魂', nextDragon: '下一條龍與倒數',
    barons: '巴龍次數', nextBaron: '巴龍重生倒數', buffs: '巴龍／遠古龍增益倒數',
    voidgrubs: '三蟲數', herald: '預示者',
    series: '上方標籤：BO 幾、第幾局', playerItems: '選手視圖：裝備名稱',
    nextMatch: '沒有比賽時：下一場與倒數',
  },
  role: { top: '上', jungle: '野', mid: '中', bot: '下', support: '輔' },
  view: { draftGame: '本局 BP', draftSeries: '全場 BP', players: '選手', schedule: '賽程' },
  stage: { 'Play-Ins': '入圍賽', Swiss: '瑞士輪', Quarterfinals: '八強', Semifinals: '四強', Finals: '決賽' },
  ui: {
    sample: '樣本資料', sampleShort: '樣本', sampleHint: '連不到 Stream CV 服務，顯示的是樣本資料（開發模式）',
    baron: '巴龍', baronUp: '巴龍在場', baronBuff: '巴龍增益', elderBuff: '遠古龍增益',
    dragon: '小龍', dragonUp: '小龍在場', elderNext: '遠古龍', unknownElement: '屬性未定',
    soul: '龍魂', inhibitor: '水晶', nexusTurret: '主堡塔', kills: '擊殺', gold: '經濟',
    towersUnnamed: '塔數由官方數據得知，是哪一座還沒辨識出來', towersUnknown: '沒有塔的辨識資料',
    settings: '設定', done: '完成', quit: '結束', quitAgain: '再按一次結束',
    noGame: '目前沒有進行中的比賽', waiting: '等待開局',
    next: '下一隻', elder: '遠古', noSeries: '系列賽資料未接上', bans: '禁', picks: '選',
    fearless: '無懼選角：前面局選過的英雄，雙方都不能再選', noDraft: '下一局 BP 開始後顯示',
    noEarlier: '這是第一局，還沒有鎖住的英雄', turn: '輪到',
    vs: 'vs', winsUnknown: '不知道本局開始前的勝場', bansUnsupported: '尚未支援（服務還讀不到禁用）', picksAtStart: '開局後才會有',
    noPlayers: '沒有選手資料（開局後才有）', itemsUnknown: '裝備資料暫缺', bansMissing: '這局沒有禁用資料（服務沒看到這局的 BP 畫面）',
    grubs: '三蟲', herald: '預示者', heraldMaybeUp: '可能在場', sidesUnconfirmed: '藍紅待確認',
    nextMatch: '下一場', onNow: '進行中', tbd: '待定', finished: '已結束', showScores: '顯示比分', hideScores: '隱藏比分',
    noSchedule: '讀不到賽程', seasonOver: '本季賽程已結束', spoilerOn: '不爆雷',
    tendBans: '常禁', tendPicks: '常選', noHistory: '本屆還沒有記錄', historyScope: '只含本服務有記錄的 Worlds 2026 小局',
    backToSchedule: '← 賽程', thisEvent: '本屆', pool: '本屆英雄', coaches: '教練', substitute: '替補', notPlayedYet: '本屆還沒上場', gamesBP: '各局 BP', gamesBPSpoil: '各局 BP（點開會看到打了幾局）', nextTend: '下一場 · 本屆常禁、常選',
    sidesUnconfirmedHint: '開打前官方資料的藍紅方常是反的，畫面也還判斷不出來：隊伍名可能對調', elementByRules: '屬性依規則推算（轉播畫面讀不到）', level: 'Lv', cs: '補刀', kda: '擊殺／死亡／助攻', hp: '血量',
  },
  set: {
    title: '設定', language: '語言', auto: '跟隨系統', background: '背景', solid: '不透明', semi: '半透明', clear: '透明',
    show: '顯示項目', goldView: '經濟', goldDiff: '只顯示差距', goldTotals: '雙方總額',
    tickClock: '兩次更新之間時鐘繼續走', endpoint: '資料來源', endpointBad: '網址格式不對，沒有儲存',
    endpointNote: '比賽資料的網址（state.json），每 5 秒讀一次。',
    views: '下方視圖', spoilerFree: '不爆雷：賽程不顯示比分與勝負',
    about: '關於',
    aboutText: '非官方工具，與 Riot Games 無關。龍、巴龍、水晶、擊殺、經濟來自官方數據；「哪一座塔」來自畫面辨識，可能延遲或缺漏。英雄名稱取自 Data Dragon。',
  },
  unnamed: (n) => `另 ${n} 座未辨識`,
  seriesGame: (bo, g) => `BO${bo} 第 ${g} 局`,
  gameNo: (g) => `第 ${g} 局`,
  locked: (n) => `已鎖 ${n} 隻`,
  whose: (team, what) => `${team} ${what}`,
  until(ms) {
    const m = Math.max(0, Math.round(ms / 60000));
    if (m < 1) return '即將開始';
    const d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), mm = m % 60;
    return d ? `還有 ${d} 天 ${h} 小時` : h ? `還有 ${h} 小時 ${mm} 分` : `還有 ${mm} 分`;
  },
  bo: (n) => `BO${n}`,
  games: (n, w) => (w === null ? `${n} 場` : `${n} 場 ${w} 勝`),
  eventGames: (n) => `本屆 ${n} 局`,
  playedThisWorlds: (n) => `本屆上場 ${n} 局`,
  age: (n) => `${n} 歲`,
};

const en: Strings = {
  team: { B: 'Blue', R: 'Red' },
  teamShort: { B: 'B', R: 'R' },
  status: { idle: 'No game in progress', waiting: 'Waiting for the game', in_game: 'Live', finished: 'Game over' },
  statusShort: { waiting: 'Soon', finished: 'Final' },
  connection: { connecting: 'Connecting', ok: 'Connected', retrying: "Can't reach the service, retrying" },
  element: { infernal: 'Infernal', ocean: 'Ocean', mountain: 'Mountain', cloud: 'Cloud', hextech: 'Hextech', chemtech: 'Chemtech', elder: 'Elder' },
  elementShort: { infernal: 'In', ocean: 'Oc', mountain: 'Mt', cloud: 'Cl', hextech: 'Hx', chemtech: 'Ch', elder: 'El' },
  feature: {
    clock: 'Game clock', kills: 'Kills', gold: 'Gold lead',
    towers: 'Tower map', nexusTimers: 'Nexus turret respawns', inhibitors: 'Inhibitors and respawns',
    dragons: 'Dragons', soul: 'Dragon soul', nextDragon: 'Next dragon and timer',
    barons: 'Baron count', nextBaron: 'Baron timer', buffs: 'Baron / Elder buff timers',
    voidgrubs: 'Voidgrubs taken', herald: 'Rift Herald',
    series: 'Top tab: best of, game number', playerItems: 'Players view: item names',
    nextMatch: 'No game on: next match and countdown',
  },
  role: { top: 'T', jungle: 'J', mid: 'M', bot: 'B', support: 'S' },
  view: { draftGame: 'Draft', draftSeries: 'Series draft', players: 'Players', schedule: 'Schedule' },
  stage: { 'Play-Ins': 'Play-Ins', Swiss: 'Swiss', Quarterfinals: 'Quarterfinals', Semifinals: 'Semifinals', Finals: 'Finals' },
  ui: {
    sample: 'Sample data', sampleShort: 'Sample', sampleHint: "Can't reach the Stream CV service; showing sample data (dev mode)",
    baron: 'Baron', baronUp: 'Baron up', baronBuff: 'Baron buff', elderBuff: 'Elder buff',
    dragon: 'Dragon', dragonUp: 'Dragon up', elderNext: 'Elder', unknownElement: 'element not set',
    soul: 'Soul', inhibitor: 'Inhib', nexusTurret: 'Nexus', kills: 'Kills', gold: 'Gold',
    towersUnnamed: 'The tower count comes from the official feed; which tower has not been read yet', towersUnknown: 'No tower reading',
    settings: 'Settings', done: 'Done', quit: 'Quit', quitAgain: 'Click again to quit',
    noGame: 'No game in progress', waiting: 'Waiting for the game',
    next: 'Next', elder: 'Elder', noSeries: 'No series data yet', bans: 'Ban', picks: 'Pick',
    fearless: 'Fearless draft: champions picked earlier in the series are locked for both teams', noDraft: 'Shows once the next draft begins',
    noEarlier: 'Game 1: nothing locked yet', turn: 'Now',
    vs: 'vs', winsUnknown: 'Series score before this game is unknown', bansUnsupported: 'Not supported yet (the service cannot read bans)', picksAtStart: 'Shown once the game starts',
    noPlayers: 'No player data (it comes once the game starts)', itemsUnknown: 'Items not available right now', bansMissing: 'No bans for this game (the service did not see its draft)',
    grubs: 'Grubs', herald: 'Herald', heraldMaybeUp: 'maybe up', sidesUnconfirmed: 'Sides unconfirmed',
    nextMatch: 'Next match', onNow: 'On now', tbd: 'TBD', finished: 'Done', showScores: 'Show scores', hideScores: 'Hide scores',
    noSchedule: "Can't read the schedule", seasonOver: 'No more matches this season', spoilerOn: 'Spoiler-free',
    tendBans: 'Bans', tendPicks: 'Picks', noHistory: 'No games recorded yet', historyScope: 'Only Worlds 2026 games the service recorded',
    backToSchedule: '← Schedule', thisEvent: 'This event', pool: 'Champions this event', coaches: 'Coaches', substitute: 'Substitute', notPlayedYet: 'No games this event yet', gamesBP: 'Draft by game', gamesBPSpoil: 'Draft by game (opening it shows how many games were played)', nextTend: 'Next match · most banned and picked',
    sidesUnconfirmedHint: 'Before a game the official sides are often swapped, and the broadcast could not tell yet: team names may be on the wrong side', elementByRules: 'Element worked out from the rules (not read from the broadcast)', level: 'Lv', cs: 'CS', kda: 'Kills / deaths / assists', hp: 'Health',
  },
  set: {
    title: 'Settings', language: 'Language', auto: 'System', background: 'Background', solid: 'Solid', semi: 'Translucent', clear: 'Clear',
    show: 'Show', goldView: 'Gold', goldDiff: 'Lead only', goldTotals: 'Both totals',
    tickClock: 'Keep the clock running between updates', endpoint: 'Data source', endpointBad: "That address doesn't look right; not saved",
    endpointNote: 'Where the match data comes from (state.json), read every 5 seconds.',
    views: 'Views below', spoilerFree: 'Spoiler-free: no scores or winners in the schedule',
    about: 'About',
    aboutText: 'Unofficial; not affiliated with Riot Games. Dragons, barons, inhibitors, kills and gold come from the official feed; which tower fell is read from the broadcast and can be late or missing. Champion names from Data Dragon.',
  },
  unnamed: (n) => `${n} more unread`,
  seriesGame: (bo, g) => `Bo${bo} · Game ${g}`,
  gameNo: (g) => `Game ${g}`,
  locked: (n) => `${n} locked`,
  whose: (team, what) => `${team} ${what}`,
  until(ms) {
    const m = Math.max(0, Math.round(ms / 60000));
    if (m < 1) return 'starting';
    const d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), mm = m % 60;
    return d ? `in ${d}d ${h}h` : h ? `in ${h}h ${mm}m` : `in ${mm}m`;
  },
  bo: (n) => `Bo${n}`,
  games: (n, w) => (w === null ? `${n} game${n === 1 ? '' : 's'}` : `${n} game${n === 1 ? '' : 's'}, ${w} won`),
  eventGames: (n) => `${n} game${n === 1 ? '' : 's'} this event`,
  playedThisWorlds: (n) => `${n} game${n === 1 ? '' : 's'} played this event`,
  age: (n) => `${n}`,
};

export const STRINGS: Record<Lang, Strings> = { 'zh-Hant': zh, en };
