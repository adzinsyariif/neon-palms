# NEON PALMS: Palmera City

![make.fun gta6-01](https://make.fun/badge/gta6-01.svg)
![Neon Palms rank](https://make.fun/badge/gta6-01/adzinsyariif/neon-palms/rank.svg)
![Neon Palms reward](https://make.fun/badge/gta6-01/adzinsyariif/neon-palms/reward.svg)

An original open-world crime game for the [make.fun gta6-01 bounty](https://make.fun/bounty/gta6-01).

Golden hour never ends in **Palmera**, a sun-soaked coastal city of palm-lined
avenues, neon cafés and a long wooden pier. You are **Marina Solano**, the
fastest courier in town. Café owner **Dario Venn** at **Café Azul** has five
jobs that will take you from the beachfront to the north-west towers — on foot
or behind the wheel of any car you can grab — if Palmera PD lets you.

## What is in the world

- A ~10×10-block city grid with instanced buildings (canvas-generated lit
  facades), palm trees, streetlights, sidewalks and dashed road markings
- A teal sea along the south edge, a sand beach, and a walkable pier with a
  ferry hut at its tip
- AI traffic looping the road grid, pedestrians strolling the sidewalks who
  flee from danger, and parked cars on every avenue
- A 1–5 star wanted system: carjacking, collisions and mission events raise
  heat; Palmera PD spawns, pursues and tries to pin you — hide to cool off
- BUSTED and WASTED end screens with respawn, a live minimap, cash/health/
  wanted HUD, a start screen with Continue, a pause menu, and a localStorage
  save (cash, mission progress, position)
- Procedural WebAudio: engine hum tied to speed, two-tone sirens, pickup and
  mission blips, impact thuds and a soft synth pad on the menu

## Controls

| Input | Action |
| --- | --- |
| WASD / arrows | Move on foot / drive |
| Mouse (click canvas for pointer lock) | Orbit camera |
| Shift | Run |
| E | Enter / exit any car (parked or traffic — traffic cars are carjacked) |
| Space | Brake |
| P / Esc | Pause |

## The five jobs from Dario Venn

1. **First Wheels** — take a car and reach Café Azul.
2. **Hot Delivery** — a timed package run to the north-west tower (90 s).
3. **Heat** — shake a 3-star wanted level, then return to Café Azul.
4. **Three Envelopes** — collect 3 marked pickups around town.
5. **Last Ferry** — reach the end of the pier before the ferry leaves (75 s).

Finishing all five unlocks the "Story complete" free-roam state, with cash
pickups still spawning around Palmera.

## Run it

```sh
node serve.ts          # serves game/ on http://localhost:8080
```

Then open http://localhost:8080 in a desktop browser. No build step and no
network requests: three.js is vendored under `game/vendor/`.

For deterministic screenshot staging, open any of the staged scenes, e.g.
`http://localhost:8080/?shot=chase&seed=1` (also `start`, `mission`, `beach`).

## Tech notes

- three.js (r160, vendored `three.module.min.js`) + plain ES modules under
  `game/src/`, one clear job per file: `city` builds the world, `vehicle`
  holds car visuals/physics, `traffic`/`pedestrians`/`police` are the AI
  systems, `missions` is the story state machine, `hud` draws the DOM HUD and
  the 2D minimap, `audio` synthesises all sound, `shots` stages the
  `?shot=` scenes, `main` wires it together.
- Performance: InstancedMesh for buildings, roofs, palms and lamps; seeded
  RNG (mulberry32) so the city is identical on every load; clamped pixel
  ratio; modest draw calls — built to hold 60 fps on a normal laptop.
- All names, characters, places and art are original to this game.
