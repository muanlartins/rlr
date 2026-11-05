# RLR (Rocket League Replay): notes for whoever works on this next

A 3D Rocket League replay player. Luan uses it to record videos, talking over
replays: free and player cameras, pause, frame steps and drawing matter;
automated analysis ("rule checks") was explicitly not wanted. The look is ours
(Klein blue #002FA7, light #F4F5F7, Klein claro #85A7FF, Space Grotesk), not
the game's. Read `README.md` for what it does and the credits.

## Ground rules

- Small, focused commits; check before pushing anything. A push to `main`
  publishes the site (`.github/workflows/pages.yml`, GitHub Pages at
  muanlartins.github.io/rlr). Luan's site's CloudFront also serves it at
  muanlartins.com/rlr and muanlartins.com.br/rlr (`infra/site.yml` there),
  picking it up within 10 minutes; nothing to do on AWS per release. The build uses relative paths (`base: "./"`), so it
  works under any path; keep it that way.
- Anything kept in the browser is namespaced `rlr:`: the site may also be served
  from muanlartins.com.br/rlr, which shares its origin with Luan's site.
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
| `src/studio/*` | The studio: the stream's recording in step with the replay, marks, OBS |
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
- The handles are drei's `TransformControls` on an unseen proxy (Euler order
  "YZX", like `rot`), written back to the piece on each change; a whole drag
  is one undo step. The handles hear a press after the pieces and the pitch
  do, so `holding` (and the gizmo's `axis` under the pointer) keeps a press
  on a handle from also grabbing a piece or clearing the selection.
- The board lives in the URL hash (`#board=`, base64url JSON) and in
  `localStorage`; a hash on load opens it.
- Loaded models are shared between canvases: scale a group around one, never
  the model itself, or measuring it again on the next mount compounds.

## The studio

- `src/studio/sync.ts` lines a replay up with the stream's recording from the
  session the "Partidas" dock publishes in Luan's site repository
  (`content/matches/<id>.json`: the recording's start; `<id>.events.json`:
  each match's kickoffs and goals by wall clock), fetched from GitHub's API
  without a token. While the ball is in play a replay's time runs with the
  wall clock, but across each goal replay it loses about 2 s, so the replay is
  cut at its gaps into runs, each with the offset of its own kickoff (checked
  against the goals: off by ~0.03 s on 2026-11-05). Replay ids and the dock's
  match ids differ, so the match is found by its kickoffs and goals.
- The dock logs a second "goal" when the game's goal replay ends, with
  `replay-end` at the same moment; skip those.
- The video drives the playhead while it fills the screen (`Playback.driver`);
  otherwise the replay drives and the video keeps up, re-seeking on jumps
  (`Playback.jumps`) and when it drifts.
- `src/studio/obs.ts` talks to obs-websocket v5 from the page:
  `CreateRecordChapter` needs OBS 30.2+ and a Hybrid MP4 recording.
- The headless test browser decodes no video at all (Format error even for
  VP8); test the studio's logic with a stand-in clock on `HTMLMediaElement`
  (`currentTime`, `paused`, `play`, `pause`) added by an init script.

## Checking a change

`pnpm exec tsc` and `pnpm build`. For pictures, a headless browser renders the
WebGL only with `--use-angle=swiftshader --enable-unsafe-swiftshader`.
