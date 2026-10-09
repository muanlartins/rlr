# RepLay

A 3D player for Rocket League replays, made for recording videos over them:
drop in a `.replay` file and watch the match from anywhere, from any player's
own camera, pause, step frame by frame, and draw on the frozen moment.

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
- Drag the dot in front of a selected car to turn it (or Q and E); its panel
  sets the name, team, body, boost, height, heading, nose and roll.
- Click a pad to mark it taken.
- Pen, arrow and circle draw on the pitch itself, so they stay put as the
  camera moves. Cmd/Ctrl-Z undoes.
- The board is kept in the browser and in the page's link: "Copy link" shares
  the setup.

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
