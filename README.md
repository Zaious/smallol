# SmalLoL

**League of Legends esports, but small.**

A quiet desktop bar for the pro match you can't watch.

SmalLoL is an unofficial desktop companion for following live League of Legends esports. A thin bar sits in a corner of your screen with the score, the clock, the gold lead and what is coming next (drake, herald, baron). When something happens, one line tells you, and the bigger moments show up as a small notice in the corner. Enough to know how the game is going at a glance, without the stream.

> **Download:** [smallol.chroniclecore.com](https://smallol.chroniclecore.com/) or [GitHub Releases](https://github.com/Zaious/smallol/releases/latest), for Windows 10 and 11: an installer that updates itself, or a portable zip; and an experimental macOS build, signed and notarized. Early: built and tested during the 2026 World Championship. The Windows build is not code-signed yet, so Windows may say "Windows protected your PC" (More info, Run anyway).
>
> **New in 0.1.6:** draft records (this Worlds' picks, bans and win rates per champion; each team's games; each player's champions) and Terminalol, which draws the whole thing as a terminal window.

SmalLoL is the League of Legends sibling of [Basesmall](https://github.com/Zaious/basesmall).

## What it does

- **One bar, two lines.** The score, game clock, gold lead and the next two objective timers on top; the latest play underneath ("FUR secure Baron", "MVK SiuLoong solos Tatu"). Hover for the controls.
- **Notices in the corner** for the plays you care about: cards for the big moments (Baron, Soul, an inhibitor, a game won), small strips for the rest (towers, drakes, kills, level 6, first items). Tower streaks, level-6 waves and first items are merged into one updating strip instead of a pile.
- **Two presets and your own.** "At work" (you are not watching: tell me how it is going) and "Watching along" (the stream is on: only add what the broadcast does not say), or set each event yourself: off, log only, strip or card.
- **My team.** Star a team and its important events move up a step.
- **History.** Click the bar for every event of the last five games, by game time, filtered by importance or team.
- **Optional windows**, each placed where you want: the minimap with towers and drakes, this game's draft (picks and bans as they lock in, read from the broadcast), and the players with levels, items and K/D/A. They open by themselves when a match is on and get out of the way when it is not.
- **Data window:** the schedule, team pages (roster, this event's bans and picks, every game with its picks, bans and result) and player pages (every champion played, with wins and KDA), a Champions tab with this event's presence, picks, bans and win rate per champion, and a spoiler-free switch for results.
- **Terminalol.** The bar as a terminal window running a sync job, laid out like `top`: the ten players' champions, levels, K/D/A, CS, gold and health, the draft, each team's towers, the latest log lines and the next objectives. Each part can be switched off; English by default; double-click for the bar.
- **Low-key mode.** A small grey strip of numbers that does not look like sports. It also turns on by itself while you present, play full screen or have Do not disturb on.
- **Hotkeys:** Ctrl+Alt+Shift+H hides every window, Ctrl+Alt+Shift+Q toggles low-key mode.
- **Optional card sound**, a link from a card to the stream you watch, edge snapping, English and Traditional Chinese.

## Where the data comes from

The app reads one JSON document (`state.json`, every five seconds) from a data service. The service, [smallol-cv](https://github.com/Zaious/smallol-cv), combines the official LoL Esports live feed (score, gold, kills, objectives, items) with what it reads from the broadcast picture (which tower fell, the draft, the herald). By default the app reads the public instance of that service (`smallol-api.chroniclecore.com`); you can point it at your own in **Settings → Data source**.

Why a broadcast reader at all: unlike MLB, whose public data has every pitch and every runner (what [Basesmall](https://github.com/Zaious/basesmall) uses), League of Legends' official live data has only numbers such as the score, gold, kills, drakes and Barons. Which tower fell and the draft as it happens are not in it; fuller live data is licensed commercially. So the service runs on a cloud server, takes one frame of the official stream a second and reads the minimap, the draft cards and the game clock with OpenCV, then lines that up with the official data.

## Build from source

You need Node.js 20+, Rust (stable) and, on Windows, the WebView2 runtime (Windows 11 has it).

```bash
npm install
npm run tauri dev      # run it
npm run tauri build    # make an installer
npm test               # unit tests
```

Checking aids for development (screenshots without clicking, replaying recorded games and so on) are listed at the top of `src/ui/main.ts`.

## Privacy

No account, no analytics. The app talks to the data service you set (the public one by default), asks GitHub once after start-up whether a newer version is out (you can switch that off), and, only when you click **▶ Watch**, opens the stream address you saved in your browser. Settings and the event history stay in the app's config folder.

## Support

SmalLoL is free and stays free: no ads, no paid features, and no donation links inside the app. If it keeps you company at work, you can [buy me a coffee](https://buymeacoffee.com/zaious).

## Licence

Made by Zaious at [ChronicleCore Studio](https://studio.chroniclecore.com). Apache License 2.0, see [LICENSE](LICENSE) and [NOTICE](NOTICE). The name "SmalLoL" is not licensed for other works.

SmalLoL isn't endorsed by Riot Games and doesn't reflect the views or opinions of Riot Games or anyone officially involved in producing or managing Riot Games properties. Riot Games, and all associated properties are trademarks or registered trademarks of Riot Games, Inc.
