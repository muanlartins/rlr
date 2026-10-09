# RepLay: notes for whoever works on this next

A 3D Rocket League replay player. Luan uses it to record videos, talking over
replays: free and player cameras, pause, frame steps and drawing matter;
automated analysis ("rule checks") was explicitly not wanted. The look is ours
(Klein blue #002FA7, light #F4F5F7, Klein claro #85A7FF, Space Grotesk), not
the game's. Read `README.md` for what it does and the credits.

## Ground rules

- Small, focused commits; check before pushing anything (there is no remote yet,
  and creating one is Luan's call).
- Never commit someone else's replays. `samples/` is for local testing and is
  ignored. The dev server serves it from the project root, so
  `./run.sh samples/<file>` (or `?replay=samples/<file>`) opens one directly.
- Model sources are re-downloadable and ignored (`assets-src/`); the built models
  in `public/models` are committed. Credit any new model in the README.

## Layout

| Path | What |
|---|---|
| `src/replay/model.ts` | The `Replay` shape: per-frame typed arrays, already in scene space |
| `src/replay/parse.worker.ts` | subtr-actor in a worker → `Replay` |
| `src/replay/sample.ts` | Finding the frame for a time, and smoothing between frames |
| `src/playback.ts` | The playhead (time, playing, speed); the scene reads it every frame without React |
| `src/scene/*` | The arena (`arena.tsx`: lights, stadium, pitch), cars, ball, boost pads, cameras, name tags; shared by the player and the board |
| `src/ui/*` | Timeline, scoreboard, announcer, drawing, shared buttons |
| `src/board/*` | The tactics board: its model (pieces, pads, marks, the link format), the page, and what goes on the pitch |
| `tools/models.mjs` | `pnpm models`: builds `public/models` from the sources |

## Conventions that bite

- **Coordinates.** Rocket League is Unreal: centimetres ("uu"), Z up,
  left-handed. Scene space is metres, Y up: `(x, y, z)` in the replay becomes
  `(x, z, y) / 100`, and a quaternion `(x, y, z, w)` becomes `(x, z, y, -w)`
  (the same remap subtr-actor's own player uses). Blue's goal is at -z. A car's
  own axes come out as X ahead, Y up, Z right. Convert once, in the worker.
- **The pitch is ours, not the stadium model's.** The Champions Field model's
  pitch is not to scale, so `tools/models.mjs` deletes it and `scene/pitch.tsx`
  draws one from RLBot's measurements (`scene/field.ts`). The wall-floor ramps
  (about 2.56 m, not circular) are not modelled yet: the corners are sharp.
- **Placing a car.** The replay gives the centre of mass. The Octane hitbox (the
  Fennec's too) is 1.18 m long, centred 0.14 m ahead of it, and the wheels touch
  the floor 0.17 m below it (`scene/car.tsx`). Every body without its own model
  shows as an Octane; `BODIES` in the worker maps product ids (23 Octane, 4284
  Fennec). Jako also made a Dominus, CC BY, if another body is wanted.
- **Wheels** are separate nodes named `… - FR (Octane)` etc. in Jako's models;
  `build()` hangs each on a steer pivot and a spin pivot. Keep them separate when
  optimising (no `join`/`flatten`/`instance` on cars).
- **Frames are ~30 a second** and uneven (33–59 ms). Positions are smoothed with a
  Hermite curve through both frames' velocities, rotations slerped. Anything that
  shows the past (the ball trail) is read back from the replay, not remembered,
  so scrubbing stays right.
- **Boost pads**: the worker turns pickup/available events into
  `[taken, back, …]` times; when a replay only has pickups, a pad comes back after
  4 s (small) or 10 s (big).
- **Camera settings** (fov horizontal in degrees, height/distance in uu, angle,
  stiffness, swivel) and each player's ball cam toggles come from the replay;
  "Their ball cam" replays what the player saw.
- **subtr-actor's wasm** is loaded by explicit URL (`?url` import) and the package
  is excluded from Vite's dependency pre-bundling; don't undo either.
- **Name tags** are plain elements over the canvas that `scene/name-tags.tsx`
  moves every frame. Not drei's `<Html>`: each of those is its own React root,
  and StrictMode's double mount in dev left one car without its name.
- **The game's phases.** After a goal the game is in a state of its own (the
  ball is gone, the cars drive about) until the players are reset; then the
  kickoff counts down while `replicated_game_state_time_remaining` is above 0.
  The state is an index into the replay's names, so it differs between
  replays: compare it, never hardcode it. While the game shows its own goal
  replay nothing is recorded, a 1–7 s hole in `times` that playing skips
  (`gaps`); `ui/announcer.tsx` shows the goal and the countdown.

## The board

- A piece's `rot` is heading, nose and roll applied as a three.js Euler in
  "YZX" order, because a car's own X is ahead. Heading 0 faces +x;
  `headingTo` aims one at a point.
- Boost pads are the standard layout (`PADS` in `scene/field.ts`, read off a
  replay). A replay's own pads are matched to them by position.
- Dragging follows the pointer on a plane (the floor at the piece's height,
  or an upright one facing the camera with Shift) through window listeners,
  with the orbit controls off meanwhile. Each piece has an unseen larger
  sphere to grab, since a car is a few pixels wide from across the pitch.
- The board lives in the URL hash (`#board=`, base64url JSON) and in
  `localStorage`; a hash on load opens it.
- Loaded models are shared between canvases: scale a group around one, never
  the model itself, or measuring it again on the next mount compounds.

## Checking a change

`pnpm exec tsc` and `pnpm build`. For pictures, a headless browser renders the
WebGL only with `--use-angle=swiftshader --enable-unsafe-swiftshader`.
