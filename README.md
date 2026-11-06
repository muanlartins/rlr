# RLR

Rocket League Replay: a 3D player for Rocket League replays, made for
recording videos over them. Drop in a `.replay` file and watch the match from
anywhere, from any player's own camera, pause, step frame by frame, and draw on
the frozen moment.

Online at [muanlartins.com/rlr](https://muanlartins.com/rlr/) (also
[muanlartins.com.br/rlr](https://muanlartins.com.br/rlr/) and
[muanlartins.github.io/rlr](https://muanlartins.github.io/rlr/)).

## Using it

```sh
./run.sh
```

It installs what's missing, starts the dev server on port 5180 and opens it.
Then drop a `.replay` file on the page, or open `?replay=<url>` to load one
directly. Replays come from your game's `Demos` folder, or from
[ballchasing.com](https://ballchasing.com) (log in to download).

| Key | Does |
|---|---|
| Space | Play / pause |
| ← → | One frame back / ahead (pauses) |
| Shift ← → | Five seconds back / ahead |
| 0 | Free camera (drag to orbit, scroll to zoom) |
| 9 | Overhead |
| 1–6 | Follow a player with their own camera settings |
| P, A, C | Pen, arrow, circle (again to put the tool down) |
| X | Clear the drawing |
| Esc | Put the tool down |

Drawings are for the paused moment: playing on clears them.

## The board

A tactics board on the same pitch, without a replay: "Open the board" on the
start page, or "Open this moment on the board" while watching one to set out
every car, the ball, their boost and the pads as they were.

- Drag a car or the ball to move it; Shift-drag to raise or lower it.
- A selected piece shows handles, as in a 3D editor: arrows move it along one
  way (G; the green one is up) and, for a car, rings turn it about its own
  axes (R; Q and E turn it too). Its panel sets the name, team and body, and
  its boost on a dial like the game's.
- Click a pad to mark it taken.
- A car's name in the toolbar (or 1, 2, …) shows the pitch from behind it,
  with ball cam or car cam; a car from a replay keeps its player's camera
  settings.
- Pen, arrow and circle draw on the pitch itself, so they stay put as the
  camera moves. Cmd/Ctrl-Z undoes.
- The board is kept in the browser and in the page's link: "Copy link" shares
  the setup.

## The studio

For talking over a match you streamed: "Studio" in the player, then "Add the
recording…" (or drop the video on the page). The recording and the replay play
in step; V swaps which one fills the screen, and the other sits in the corner.

- **A lives folder.** "Open a lives folder…" on the first page takes the
  folder the stream's after-live script fills (`Lives\<date>\<hh-mm-ss> Live.mp4`
  and `Replays\Partida NN - <result>.replay`) and lists each day's matches; one
  click opens the match with its replay, the day's recording and the studio,
  and ‹ › go to the day's other matches. Edge and Chrome remember the folder
  (a click a visit to allow reading it again); elsewhere it's picked each visit.
- **Lining up.** A replay doesn't say when it was recorded closely enough, so
  the studio reads the session the stream's match dock published (muanlartins'
  [site repository](https://github.com/muanlartins/muanlartins/tree/main/content/matches)):
  when the recording started and when each kickoff and goal happened. It finds
  the match by its kickoffs and goals and lines up each stretch between goals
  on its own, since a replay loses a couple of seconds across every goal
  replay the game shows. Without a session it's lined up by hand; either way
  the ±0.1 s and ±1 s buttons nudge it, kept for the whole session.
- **A play.** I and O mark where it starts and ends, L loops it.
- **Marks.** M marks a moment (also while OBS records: it becomes a chapter in
  the recording, with Hybrid MP4). "Save marks" downloads them for the edit.
- **OBS.** "Connect OBS" (Tools → WebSocket Server Settings for the password,
  kept in this browser) starts and stops the recording from the page.
- The dock's shots, saves and goals of the streamer show as yellow ticks on
  the timeline; the recording's sound has full, low and off.

## What's in a replay

A `.replay` file is the game's own recording of what the server sent: every
car's and the ball's position, rotation and velocity about 30 times a second,
plus boost, jumps, flips, demolitions, goals and each player's camera
settings. It does not record the controller, so stick inputs are not known
(throttle and steer are). [subtr-actor](https://github.com/rlrml/subtr-actor)
(built on [boxcars](https://github.com/nickbabcock/boxcars)) reads it, in a
web worker, and everything drawn here comes from that.

## Credits

- Octane, Fennec and ball models by [Jako](https://sketchfab.com/fairlight51),
  [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/):
  [Octane](https://sketchfab.com/3d-models/octane-rocket-league-car-9910f0a5d158425bbc7deb60c7a81f69),
  [Fennec](https://sketchfab.com/3d-models/fennec-rocket-league-car-5b43b50b6eeb4a12a29671df3418f57a),
  [ball](https://sketchfab.com/3d-models/ball-rocket-league-2c8911aa1dcd4c53bad842f2d354dfe2).
- Stadium: [Champions Field](https://sketchfab.com/3d-models/champions-field-rocket-league-stadium-6ea5ee0502ae432fbac3a4f8aaab61a5)
  by Prabhu Ram, [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/),
  repainted, and with its pitch replaced by one drawn to the game's measurements.
- Replay parsing: [subtr-actor](https://github.com/rlrml/subtr-actor) and
  [boxcars](https://github.com/nickbabcock/boxcars) (MIT).
- Pitch measurements: RLBot's [useful game values](https://github.com/RLBot/wiki/blob/master/docs/v5/botmaking/useful-game-values.md).

Rocket League is a trademark of Psyonix. This is a fan project, not made or
endorsed by Psyonix or Epic Games.
