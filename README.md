[![make.fun](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/c/best-flight-game-20261126-0057)
[![rank](https://make.fun/badge/best-flight-game-20261126-0057/acengrahmi/makefun-skyline-courier/rank.svg)](https://make.fun/c/best-flight-game-20261126-0057)
[![reward](https://make.fun/badge/best-flight-game-20261126-0057/acengrahmi/makefun-skyline-courier/reward.svg)](https://make.fun/c/best-flight-game-20261126-0057)

# Skyline Courier — Archipelago Air Service

An original chase-view flight game for make.fun `best-flight-game-20261126-0057`, built from scratch in plain HTML5 Canvas + ES modules with a hand-written software 3D renderer (no library, no WebGL, no network, no build step). Fly the twin-prop "Kestrel" over a deterministic island archipelago.

## The game

- **3 missions + free flight:** Emerald Ring Run (thread 8 glowing rings in order), Runway Return (land on Kestrel Field, graded on touchdown), Buoy Slalom (10 low gates under 150 ft), Free Flight.
- **Flight model:** throttle and turn discipline — stall below 52 kt, overspeed shake past 165 kt, bank-to-turn, flaps and gear, fuel burn that ends a sortie in an engine-out glide, hull damage from hard landings.
- **HUD:** compass tape + digital heading, attitude indicator, airspeed/altimeter dials, VSI tape, throttle lever, fuel/hull bars, mission panel, objective arrow with distance, warnings and debrief screens.
- **Sounds:** WebAudio effects, all synthesized in code. All art is drawn on canvas — zero external assets.

## Controls

W/S throttle, arrows / A-D pitch and bank, F flaps, B brake, mouse steering, P pause, R reset. `1`/`2`/`3`/`4` pick a mission from the menu.

## Play it

Open `game/index.html` in desktop Chrome. No server needed (or run `python3 -m http.server` from `game/`).

## Build

`main.ts` (Node 22) generates the entry dossier from the game sources. No build step for the game itself.
