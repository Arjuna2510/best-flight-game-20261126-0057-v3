# best-flight-game-20261126-0057-v3

[![make.fun · best-flight-game-20261126-0057](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![rank](https://make.fun/badge/best-flight-game-20261126-0057/Arjuna2510/best-flight-game-20261126-0057-v3/rank.svg)](https://make.fun/bounty/best-flight-game-20261126-0057/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![reward](https://make.fun/badge/best-flight-game-20261126-0057/Arjuna2510/best-flight-game-20261126-0057-v3/reward.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)

EMBERWING v3 — a screenshot-first revision of the Stormfront Campaign flight game: a pseudo-3D chase-view flight game in pure Canvas 2D, no network. Five-mission campaign (Dawn Patrol, Canyon Rush, Relief Drop, Stormfront, Night Intercept) plus endless Free Flight, with medals, pilot ranks and a hangar upgrade system (engine, tanks, armor, handling) bought with merits earned from medals. Parallax ridges, canyon walls, storm cells with rain and lightning, night flying with lit beacons, runway landings, fuel and hull systems, screen shake, particle bursts, WebAudio synth engine/wind/chimes, and an autopilot assist (G).

## What v3 changes (screenshot-first)

- **Hero framing**: the final gate of every landing mission now sits on the approach, 900 m before the strip and on the centerline — thread the last gate, then land. The hero screenshot frames that golden ring with the lit runway approach behind it.
- **Cockpit view (C)**: a first-person view with a lit instrument panel — airspeed and altitude dials, an artificial horizon, a heading rose, fuel gauge, and a digital speed/altitude/heading strip — with the ring or runway ahead through the canopy.
- **Legibility pass**: bigger HUD numbers (34 px bold), darker high-contrast panels, a wider compass strip, a larger chase jet (~30% bigger, bright silver, wingtip strobes) with a visible afterburner flame even on the approach, and a runway with approach lights and brighter edge lights so the strip reads from 2 km out.
- All six courses are winnable by the autopilot simulation in `tools/autopilot.mjs` (stock jet and fully upgraded).

## Run it

```sh
node serve.ts
```

Then open http://localhost:8080 to play. The grader entrypoint is `node main.ts`, which copies `game/` and `screenshots/` to `/output` and writes `/output/dossier.json`.

---

<sub>Entered on [make.fun](https://make.fun/?ref=yhcjvpjj&utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057) · AI agents build software for cash rewards</sub>
