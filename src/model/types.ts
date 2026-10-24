// The normalized game model. Renderers, settings views and tests only see these types; the raw
// Stream CV JSON stays inside src/data/streamcv/. All game times are seconds of game clock.

export type Team = 'B' | 'R';
export const TEAMS: readonly Team[] = ['B', 'R'];
export const other = (t: Team): Team => (t === 'B' ? 'R' : 'B');

export type Lane = 'top' | 'mid' | 'bot';
export const LANES: readonly Lane[] = ['top', 'mid', 'bot'];

/** The eleven towers each team owns (contract `site` values). */
export const TOWER_SITES = [
  'top_outer', 'top_inner', 'top_inhib_tower',
  'mid_outer', 'mid_inner', 'mid_inhib_tower',
  'bot_outer', 'bot_inner', 'bot_inhib_tower',
  'nexus_t1', 'nexus_t2',
] as const;
export type TowerSite = (typeof TOWER_SITES)[number];
export const isNexusTurret = (s: TowerSite) => s === 'nexus_t1' || s === 'nexus_t2';

/** Elemental drakes. The elder dragon is counted on its own (`TeamState.elders`). */
export const ELEMENTS = ['infernal', 'ocean', 'mountain', 'cloud', 'hextech', 'chemtech'] as const;
export type Element = (typeof ELEMENTS)[number];

export type GameStatus = 'idle' | 'waiting' | 'in_game' | 'finished';

export interface Tower {
  site: TowerSite;
  down: boolean;
  /** When it fell, when the service knows. */
  lostAt: number | null;
  /** Nexus turrets come back; the time it is due, by the rule table. */
  respawnAt: number | null;
  /** Standing as far as anyone named, but the feed counts more losses than were named and this is one of
   *  the towers that could be among them (the next in its lane). Drawn with a "?". */
  maybe?: boolean;
}

export interface InhibitorDown {
  /** Inferred from which inhibitor towers are down; null when it cannot be told. */
  lane: Lane | null;
  respawnAt: number;
}

export interface TeamState {
  kills: number | null;
  gold: number | null;
  barons: number | null;
  elders: number | null;
  /** Elemental drakes in the order this team took them. */
  dragons: Element[];
  /** Towers this team destroyed (feed count, includes nexus turrets killed again). */
  towersDestroyed: number | null;
  /** This team's own towers. */
  towers: Record<TowerSite, Tower>;
  /** The feed says this team lost more towers than the screen reading has named yet. */
  unnamedLost: number;
  /** This team's own inhibitors that are down, soonest respawn first. */
  inhibitorsDown: InhibitorDown[];
}

export interface Buff {
  kind: 'baron' | 'elder';
  team: Team;
  until: number;
}

export interface NextDragon {
  elder: boolean;
  /** null while it cannot be known yet (before the rift element is set). */
  element: Element | null;
  /** v0.4: read from the broadcast's objective box, or worked out from the rules. */
  elementSource: 'broadcast' | 'rules' | null;
  at: number;
}

/** The top pit's next monster, as the broadcast's objective box shows it (v0.4). */
export type PitNext = 'grubs' | 'herald' | 'baron';

export interface HeraldState {
  /** taken: killed before 19:40; taken_or_despawned: gone after 19:40, killed or despawned. */
  status: 'upcoming' | 'alive_or_upcoming' | 'taken' | 'taken_or_despawned';
  /** When it was taken (±5 s). */
  at: number | null;
  /** Who took it, from the kill announcement on screen (v0.5); null when the service did not see one. */
  team: Team | null;
}

/** The series this game belongs to (service contract v0.1, "系列賽與 BP"). */
export interface SeriesInfo {
  bestOf: number;
  /** 1-based number of this game in the series. */
  game: number;
  matchId: string | null;
  /** Who plays which side this game, and series wins before it (null when the service could not tell). */
  teams: Record<Team, { code: string; wins: number | null }>;
  /** Why the wins are unknown, from the service. */
  winsNote: string | null;
  /**
   * What the blue/red sides rest on (v0.4). Before a game the official API often has them the wrong
   * way round; 'api_unconfirmed' means the team names on each side may be swapped.
   */
  sidesSource: 'api' | 'broadcast' | 'api_unconfirmed' | null;
}

/** A champion by its Data Dragon id ("KSante"); names come from src/data/champions.ts. */
export type Champion = string;

export interface DraftSide {
  /** Team code, so a series can follow a team across side swaps. */
  team: string;
  /** Five slots each; null while not chosen yet (or not supported, see DraftState). */
  bans: (Champion | null)[];
  /** In draft order, or by role (top, jungle, mid, bot, support): DraftState.picksOrder says which. */
  picks: (Champion | null)[];
}

export const ROLES = ['top', 'jungle', 'mid', 'bot', 'support'] as const;
export type Role = (typeof ROLES)[number];

export interface DraftGame {
  game: number;
  sides: Record<Team, DraftSide>;
  /** The next action while the draft is on; null once it is done. */
  turn: { side: Team; kind: 'ban' | 'pick'; slot: number } | null;
}

export interface DraftState {
  current: DraftGame | null;
  earlier: DraftGame[];
  /** v0.1 sends picks by role: the feed has positions, not the order they were picked in. */
  picksOrder: 'draft' | 'role';
  /** v0.3 sends bans in each side's own ban order (1st to 5th); null when the service does not say. */
  bansOrder: 'ban' | null;
  /**
   * Whether the service reads bans at all (v0.3: yes) and whose turn it is (not yet). Supported does
   * not mean every slot has a value: a game the service never saw the draft of has five nulls.
   */
  bansSupported: boolean;
  turnSupported: boolean;
}

/** One player right now (service contract v0.2, "選手"). */
export interface Player {
  role: Role | null;
  /** Without the team tag the feed puts in front ("MVK Kratos" -> "Kratos"). */
  name: string;
  champion: Champion | null;
  level: number | null;
  kills: number | null;
  deaths: number | null;
  assists: number | null;
  cs: number | null;
  gold: number | null;
  hp: number | null;
  maxHp: number | null;
  /** Data Dragon item ids, as the feed lists them (trinket and potions included); null when the service had none. */
  items: number[] | null;
}

export interface MatchState {
  status: GameStatus;
  /** The official live feed is down while a game is on (the service says so): say it, do not look broken. */
  feedMissing?: boolean;
  /** The game's official feed has stopped for over 2 minutes and the schedule still has it on: a pause, mostly. */
  paused?: boolean;
  gameId: string | null;
  /** Service time of this snapshot (ISO), for "last updated". */
  updated: string | null;
  /** Game clock at the snapshot. */
  clock: number | null;
  teams: Record<Team, TeamState>;
  /** Whether towers come from screen reading at all; false means tower state is unknown, not "all up". */
  towersKnown: boolean;
  riftElement: Element | null;
  soul: { team: Team; element: Element } | null;
  nextDragon: NextDragon | null;
  nextBaron: { at: number } | null;
  buffs: Buff[];
  series: SeriesInfo | null;
  /** This game's draft, and the earlier games of the series (fearless draft: their picks are locked). */
  draft: DraftState | null;
  /** Five per team, top to support; null when the service sends none (it does not while waiting). */
  players: Record<Team, Player[]> | null;
  /** The feed moment the players were read at (0–10 s behind the newest feed frame). */
  playersAsOf: string | null;
  /** Voidgrubs each team has taken (0–3), from the broadcast; null when the service did not read them. */
  voidgrubs: Record<Team, number | null> | null;
  pitNext: PitNext | null;
  herald: HeraldState | null;
}
