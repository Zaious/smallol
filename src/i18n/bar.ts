// Words for the sentinel bar, the notification modes, the panels and the data window
// (docs/UI_SPEC_v1.md). Kept apart from index.ts so the redesign's strings stay together; same
// rule: one typed record per language, a key missing in either fails the type check.

import type { EventKind } from '../events/kinds.ts';
import type { Channel, NotifyBase, NotifyMode, PanelName } from '../settings/schema.ts';
import type { Lang } from './index.ts';

/** On a Mac the hotkeys' Ctrl+Alt+Shift is Control, Option, Shift: written ⌃⌥⇧ there. */
const IS_MAC = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform || navigator.userAgent);
export const macKeys = (s: string) => (IS_MAC ? s.replace(/Ctrl\+Alt\+Shift\+/g, '⌃⌥⇧') : s);

export type DataTab = 'schedule' | 'teams' | 'champions' | 'series' | 'settings';

export interface BarStrings {
  mode: Record<NotifyMode, string>;
  modeHint: Record<'work' | 'companion', string>;
  customOf(base: string): string;
  base: Record<NotifyBase, string>;
  channel: Record<Channel, string>;
  event: Record<EventKind, string>;
  panel: Record<PanelName, string>;
  tab: Record<DataTab, string>;
  icon: Record<'mode' | 'history' | 'panels' | 'data' | 'pause' | 'resume' | 'tier' | 'settings' | 'watch', string>;
  ask: string;
  feedback: { mode(m: string): string; paused: string; resumed: string };
  more: string;
  draftOn(game: number): string;
  between(game: number): string;
  seasonOver: string;
  picksSoFar(n: number): string;
  inProgress(clock: string): string;
  startingSoon: string;
  reset: string;
  prof: {
    search: string; today: string; mine: string; teams: string; players: string; noMatch: string; back: string;
    star: string; unstar: string; coaches: string; starter: string; sub: string; bp: string;
    worlds: string; msi: string; league: string; worldsTimes(n: number, last: number | null): string; allYears: string;
    played(n: number): string; pool: string; showWins: string; hideWins: string; debut(y: number): string; noPool: string;
  };
  hist: { all: string; big: string; game(n: number, a: string, b: string): string; empty: string };
  /** The team page's games, the player page's champions, the champions tab. */
  rec: {
    games: string; vs(code: string): string; side: Record<'B' | 'R', string>; win: string; loss: string; bans: string; none: string;
    pool: string; pickedTimes(n: number): string; kda: string; wl(w: number, l: number): string;
    title(n: number): string; presence: string; picks: string; bans2: string; winRate: string; champion: string; few: string; sortBy: string;
  };
  /** The feed of a game on the bar has stopped, while the official schedule still has the game on (a pause, mostly). */
  paused: string;
  sections: Record<'notify' | 'events' | 'panels' | 'reminder' | 'general' | 'corner' | 'soon' | 'milestones', string>;
  milestones: Record<'all' | 'mine', string>;
  seconds(n: number): string;
  corner: Record<'br' | 'tr', string>;
  /** An objective that has spawned, on the bar's countdown chips. */
  up: string;
  minutes(n: number): string;
  atStart: string;
  /** The official live feed is down while a game is on. */
  feedDown: string;
  /** New versions. */
  upd: {
    available(tag: string): string; updateTo(tag: string): string; download(tag: string): string; check: string; checking: string;
    latest: string; downloading(pct: number | null): string; failed: string; version(v: string): string; startCheck: string;
  };
  /** Batch 3: low-key, hotkeys, presentation detection, card sound, stream address. */
  b3: {
    lowKey: string; lowKeyTip: string; terminal: string; terminalTip: string; termParts: Record<'players' | 'draftInGame' | 'towers' | 'log' | 'zh', string>; hotkeys: string; hotkeyHide: string; hotkeyLow: string; hotkeyBusy(keys: string): string; hotkeyTaken: string;
    autoLow: string; autoLowNote: string; sound: string; volume: Record<'low' | 'mid' | 'high', string>; test: string;
    watchUrl: string; watchNote: string; watchBad: Record<'scheme' | 'credentials' | 'long' | 'bad', string>; watch: string; hideRefused: string; panelLater: string;
  };
}

const zh: BarStrings = {
  mode: { work: '上班', companion: '陪看', custom: '自訂' },
  modeHint: { work: '我沒在看轉播，告訴我戰況', companion: '我開著轉播，只補轉播沒說的' },
  customOf: (b) => `自訂（基於 ${b}）`,
  base: { work: '上班', companion: '陪看', major: '只留大事' },
  channel: { off: '不顯示', log: '只進 log', strip: '小條', card: '卡片' },
  event: {
    reminder: '開賽提醒', ban: '逐手禁用', pick: '逐手選角', bpDone: 'BP 完成', gameStart: '一局開打', gameEnd: '一局結束', seriesEnd: '系列賽結束',
    tower: '外塔、內塔', inhibTower: '高地塔', nexusTower: '主堡塔', inhibitor: '水晶被破',
    drake: '小龍', herald: '預示者', grubs: '三蟲', soul: '龍魂', elder: '遠古龍', baron: '巴龍',
    bpStart: '下一局 BP 開始', inhibRespawn: '水晶重生', nexusRespawn: '主堡塔重生', soulPoint: '龍魂聽牌',
    dragonSoon: '小龍即將出現', bossSoon: '巴龍、遠古龍即將出現', baronBuffEnding: '巴龍增益剩 30 秒',
    kill: '單殺與陣亡', goldLead5k: '經濟領先 5k', goldLead10k: '經濟領先 10k', goldFlip: '經濟反超',
    level6: '升 6 級', level11: '升 11、16 級', firstLegendary: '第一件傳說裝',
  },
  panel: { minimap: '小地圖', draftGame: '本局 BP', players: '選手面板', data: '資料窗' },
  tab: { schedule: '賽程', teams: '隊伍', champions: '英雄', series: '全場 BP', settings: '設定' },
  prof: {
    search: '搜尋隊伍、選手…', today: '今日出場', mine: '我的隊伍', teams: '隊伍', players: '選手', noMatch: '找不到', back: '←',
    star: '設為我的隊伍', unstar: '取消我的隊伍', coaches: '教練', starter: '先發', sub: '替補', bp: '本屆 BP（常禁常選）',
    worlds: '世界賽冠軍', msi: 'MSI 冠軍', league: '聯賽冠軍', worldsTimes: (n, y) => `世界賽 ${n} 次${y ? ` · 最近 ${y}` : ''}`, allYears: '全部年份',
    played: (n) => `本屆上場 ${n} 局`, pool: '本屆英雄池', showWins: '顯示勝率', hideWins: '隱藏勝率', debut: (y) => `${y} 出道`, noPool: '本屆還沒上場',
  },
  hist: { all: '全部', big: '重要事件', game: (n, a, b) => `第 ${n} 局 · ${a} 對 ${b}`, empty: '還沒有紀錄' },
  rec: {
    games: '本屆每局', vs: (t) => `對 ${t}`, side: { B: '藍方', R: '紅方' }, win: '勝', loss: '負', bans: '禁', none: '還沒有紀錄',
    pool: '本屆英雄', pickedTimes: (n) => `${n} 局`, kda: 'KDA', wl: (w, l) => `${w} 勝 ${l} 負`,
    title: (n) => `世界賽選禁 · ${n} 局`, presence: '出場率', picks: '選', bans2: '禁', winRate: '勝率', champion: '英雄',
    few: '只算本服務有記錄的局，局數少時數字只供參考', sortBy: '排序',
  },
  paused: '比賽暫停中 · 官方數據暫停更新',
  icon: { mode: '通知模式', history: '歷史', panels: '面板', data: '資料窗', pause: '暫停通知 30 分鐘', resume: '恢復通知', tier: '切換大小', settings: '設定', watch: '看轉播' },
  ask: '你怎麼用這個小工具？之後可以從模式標籤改。',
  feedback: { mode: (m) => `通知模式：${m}`, paused: '通知已暫停 30 分鐘', resumed: '通知已恢復' },
  more: '+{n} 則 ▸',
  draftOn: (g) => `BP 進行中 · 第 ${g} 局`,
  between: (g) => `第 ${g} 局準備中`,
  seasonOver: '賽事已結束',
  picksSoFar: (n) => `已 ${n} 手`,
  inProgress: (c) => `已進行 ${c}`,
  startingSoon: '即將開打',
  reset: '重設為',
  sections: { notify: '通知模式', events: '事件', panels: '面板', reminder: '開賽提醒', general: '一般', corner: '通知位置', soon: '即將出現', milestones: '升級與出裝' },
  milestones: { all: '全部選手', mine: '只我的隊伍' },
  seconds: (n) => `${n} 秒前`,
  corner: { br: '右下', tr: '右上' },
  up: '在場',
  minutes: (n) => `${n} 分`,
  atStart: '開打時',
  feedDown: '比賽進行中 · 官方即時數據暫停，比分暫時無法更新',
  upd: {
    available: (t) => `有新版本 ${t}`, updateTo: (t) => `更新到 ${t}`, download: (t) => `下載 ${t}`, check: '檢查更新', checking: '檢查中…',
    latest: '已是最新版', downloading: (p) => (p === null ? '下載新版本中…' : `下載新版本 ${p}%`), failed: '更新失敗，請到下載頁手動更新',
    version: (v) => `版本 ${v}`, startCheck: '啟動時檢查新版本',
  },
  b3: {
    lowKey: '低調模式', lowKeyTip: '雙擊恢復', terminal: 'Terminalol：偽裝成終端機（雙擊回到一般畫面）', terminalTip: '雙擊回到一般畫面',
    termParts: { players: '選手（BP 選角、比賽中狀態）', draftInGame: '比賽中保留 BP', towers: '塔況', log: '最近紀錄', zh: '用中文（預設英文）' }, hotkeys: '全域熱鍵',
    hotkeyHide: '隱藏全部視窗 Ctrl+Alt+Shift+H', hotkeyLow: '低調模式 Ctrl+Alt+Shift+Q', hotkeyBusy: (k) => `熱鍵被其他程式占用：${k}`, hotkeyTaken: '被其他程式占用',
    autoLow: '全螢幕、簡報或勿擾時自動低調', autoLowNote: '上班模式包含自己全螢幕看轉播時；陪看模式只在簡報與勿擾時。',
    sound: '卡片音效', volume: { low: '小', mid: '中', high: '大' }, test: '試聽',
    watchUrl: '轉播網址', watchNote: '有填時，卡片滑過會出現「▶ 看」，點了用預設瀏覽器開這個網址。',
    watchBad: { scheme: '只接受 http 或 https，沒有儲存', credentials: '網址不能帶帳號密碼，沒有儲存', long: '網址太長（上限 2048 字），沒有儲存', bad: '網址格式不對，沒有儲存' },
    watch: '▶ 看', hideRefused: '沒有系統匣也沒有熱鍵，不隱藏', panelLater: '比賽開始時自動打開',
  },
};

const en: BarStrings = {
  mode: { work: 'Work', companion: 'Watching', custom: 'Custom' },
  modeHint: { work: "I'm not watching: tell me how it goes", companion: "I'm watching: only what the broadcast doesn't say" },
  customOf: (b) => `Custom (from ${b})`,
  base: { work: 'Work', companion: 'Watching', major: 'Big events only' },
  channel: { off: 'Off', log: 'Log only', strip: 'Strip', card: 'Card' },
  event: {
    reminder: 'Match reminder', ban: 'Each ban', pick: 'Each pick', bpDone: 'Draft complete', gameStart: 'Game begins', gameEnd: 'Game over', seriesEnd: 'Series over',
    tower: 'Outer, inner turrets', inhibTower: 'Inhibitor turrets', nexusTower: 'Nexus turrets', inhibitor: 'Inhibitor destroyed',
    drake: 'Drakes', herald: 'Herald', grubs: 'Void Grubs', soul: 'Dragon Soul', elder: 'Elder Dragon', baron: 'Baron',
    bpStart: 'Next draft begins', inhibRespawn: 'Inhibitor respawns', nexusRespawn: 'Nexus turret respawns', soulPoint: 'One drake from Soul',
    dragonSoon: 'Drake spawning soon', bossSoon: 'Baron, Elder spawning soon', baronBuffEnding: 'Baron buff 30s left',
    kill: 'Solo kills and deaths', goldLead5k: 'Gold lead 5k', goldLead10k: 'Gold lead 10k', goldFlip: 'Gold lead changes hands',
    level6: 'Level 6', level11: 'Levels 11, 16', firstLegendary: 'First legendary item',
  },
  panel: { minimap: 'Minimap', draftGame: 'Draft', players: 'Players', data: 'Data' },
  tab: { schedule: 'Schedule', teams: 'Teams', champions: 'Champions', series: 'Series draft', settings: 'Settings' },
  prof: {
    search: 'Search teams, players…', today: 'Playing today', mine: 'My team', teams: 'Teams', players: 'Players', noMatch: 'No match', back: '←',
    star: 'Make my team', unstar: 'Not my team', coaches: 'Coaches', starter: 'Starter', sub: 'Substitute', bp: 'This event: bans, picks',
    worlds: 'Worlds titles', msi: 'MSI titles', league: 'League titles', worldsTimes: (n, y) => `Worlds ${n}×${y ? ` · last ${y}` : ''}`, allYears: 'All years',
    played: (n) => `${n} game${n === 1 ? '' : 's'} this event`, pool: 'Champions this event', showWins: 'Show wins', hideWins: 'Hide wins', debut: (y) => `debut ${y}`, noPool: 'No games this event yet',
  },
  rec: {
    games: 'Games this event', vs: (t) => `vs ${t}`, side: { B: 'Blue', R: 'Red' }, win: 'W', loss: 'L', bans: 'Bans', none: 'No games yet',
    pool: 'Champions this event', pickedTimes: (n) => `${n} ${n === 1 ? 'game' : 'games'}`, kda: 'KDA', wl: (w, l) => `${w}W ${l}L`,
    title: (n) => `Worlds picks and bans · ${n} games`, presence: 'Presence', picks: 'Picks', bans2: 'Bans', winRate: 'Win rate', champion: 'Champion',
    few: 'Only games this service recorded; with few games the numbers are a rough guide', sortBy: 'Sort',
  },
  paused: 'Game paused · the official data has stopped for now',
  hist: { all: 'All', big: 'Big events', game: (n, a, b) => `Game ${n} · ${a} vs ${b}`, empty: 'Nothing yet' },
  icon: { mode: 'Notification mode', history: 'History', panels: 'Panels', data: 'Data window', pause: 'Pause notifications for 30 min', resume: 'Resume notifications', tier: 'Change size', settings: 'Settings', watch: 'Watch the stream' },
  ask: 'How will you use this? You can change it later from the mode label.',
  feedback: { mode: (m) => `Notifications: ${m}`, paused: 'Notifications paused for 30 min', resumed: 'Notifications back on' },
  more: '+{n} more ▸',
  draftOn: (g) => `Draft · Game ${g}`,
  between: (g) => `Game ${g} up next`,
  seasonOver: 'Event over',
  picksSoFar: (n) => `${n} done`,
  inProgress: (c) => `In progress ${c}`,
  startingSoon: 'Starting soon',
  reset: 'Reset to',
  sections: { notify: 'Notifications', events: 'Events', panels: 'Panels', reminder: 'Match reminder', general: 'General', corner: 'Notices at', soon: 'Spawning soon', milestones: 'Levels, items' },
  milestones: { all: 'Every player', mine: 'My team only' },
  seconds: (n) => `${n}s ahead`,
  corner: { br: 'Bottom right', tr: 'Top right' },
  up: 'up',
  minutes: (n) => `${n} min`,
  atStart: 'At start',
  feedDown: 'Game on · the official live data is paused; no score for now',
  upd: {
    available: (t) => `New version ${t}`, updateTo: (t) => `Update to ${t}`, download: (t) => `Download ${t}`, check: 'Check for updates', checking: 'Checking…',
    latest: 'Up to date', downloading: (p) => (p === null ? 'Downloading the new version…' : `Downloading the new version ${p}%`), failed: 'Update failed; please update from the download page',
    version: (v) => `Version ${v}`, startCheck: 'Check for a new version at start-up',
  },
  b3: {
    lowKey: 'Low-key', lowKeyTip: 'Double-click to restore', terminal: 'Terminalol: look like a terminal (double-click for the bar)', terminalTip: 'Double-click for the bar',
    termParts: { players: 'Players (draft picks, then their state)', draftInGame: 'Keep the draft during the game', towers: 'Towers', log: 'Latest log lines', zh: 'In Chinese (English by default)' }, hotkeys: 'Global hotkeys',
    hotkeyHide: 'Hide every window Ctrl+Alt+Shift+H', hotkeyLow: 'Low-key Ctrl+Alt+Shift+Q', hotkeyBusy: (k) => `Hotkey taken by another program: ${k}`, hotkeyTaken: 'taken by another program',
    autoLow: 'Go low-key in full screen, presentations and quiet hours', autoLowNote: 'At work this includes your own full-screen stream; watching along, only presentations and quiet hours.',
    sound: 'Card sound', volume: { low: 'Low', mid: 'Medium', high: 'High' }, test: 'Play',
    watchUrl: 'Stream address', watchNote: 'When set, cards show "▶ Watch" on hover; it opens this address in your browser.',
    watchBad: { scheme: 'Only http or https; not saved', credentials: 'No user name or password in the address; not saved', long: 'Too long (2048 at most); not saved', bad: 'Not an address; not saved' },
    watch: '▶ Watch', hideRefused: 'No tray or hotkey to undo it: not hidden', panelLater: 'Opens when a match is on',
  },
};

export const BAR_STRINGS: Record<Lang, BarStrings> = { 'zh-Hant': zh, en };
