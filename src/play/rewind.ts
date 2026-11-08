/**
 * A replay's moment as the physics' state: where every car and the ball are,
 * how they move, each car's boost and what it has used since it left the
 * ground, and which pads are taken. Replays carry no controller inputs, so
 * the other players can only be played back, never simulated.
 */
import { Quaternion, Vector3 } from "three"
import type { BodyState, CarState, Sim } from "../physics/sim"
import { DODGING, DOUBLE_JUMPING, JUMPING, type Replay, type Track } from "../replay/model"
import { momentAt, poseAt } from "../replay/sample"
import { available } from "../scene/pads"

/** How far back a jump still counts: past this the car has surely landed or used its flip. */
const JUMP_MEMORY = 2

const lerp = (array: Float32Array, frame: number, next: number, alpha: number, out: Vector3) =>
  out.set(
    array[frame * 3] + (array[next * 3] - array[frame * 3]) * alpha,
    array[frame * 3 + 1] + (array[next * 3 + 1] - array[frame * 3 + 1]) * alpha,
    array[frame * 3 + 2] + (array[next * 3 + 2] - array[frame * 3 + 2]) * alpha,
  )

/** A track's body at `time`, or undefined where the replay has nothing (a demolished car, the ball after a goal). */
export function bodyAt(replay: Replay, track: Track, time: number, out: BodyState): BodyState | undefined {
  const moment = momentAt(replay.times, time)
  if (!poseAt(track, replay.times, moment, out.pos, out.quat)) return undefined
  const next = Math.min(moment.frame + 1, replay.times.length - 1)
  const alpha = track.present[next] ? moment.alpha : 0
  lerp(track.vel, moment.frame, next, alpha, out.vel)
  lerp(track.spin, moment.frame, next, alpha, out.spin)
  return out
}

export function emptyCar(): CarState {
  return { pos: new Vector3(), quat: new Quaternion(), vel: new Vector3(), spin: new Vector3(), boost: 0, jumped: false, doubleJumped: false, flipped: false, sinceJump: 0, off: true }
}

/**
 * Car `index` at `time`. What it has used in the air is read off the replay's
 * flags: its latest jump within JUMP_MEMORY, and a double jump or flip after
 * it. A car that has landed since gets them back from the physics on its
 * first tick on the ground.
 */
export function carAt(replay: Replay, index: number, time: number, out: CarState): CarState {
  const car = replay.cars[index]
  out.off = !bodyAt(replay, car, time, out)
  if (out.off) return out
  const { frame } = momentAt(replay.times, time)
  out.boost = car.boost[frame]
  out.jumped = out.doubleJumped = out.flipped = false
  out.sinceJump = 0
  let jumpStart = -1
  for (let i = frame; i >= 0 && replay.times[frame] - replay.times[i] < JUMP_MEMORY; i--) {
    if (car.flags[i] & JUMPING) jumpStart = i
    else if (jumpStart >= 0) break
  }
  if (jumpStart >= 0) {
    out.jumped = true
    out.sinceJump = replay.times[frame] - replay.times[jumpStart]
    for (let i = jumpStart; i <= frame; i++) {
      if (car.flags[i] & DOUBLE_JUMPING) out.doubleJumped = true
      if (car.flags[i] & DODGING) out.flipped = true
    }
  }
  return out
}

/** The pads as the replay has them at `time`, onto the physics' pads (matched by position). */
export function setPads(sim: Sim, replay: Replay, time: number) {
  if (!replay.pads.length) return
  sim.padPlaces().forEach((place, index) => {
    let nearest = replay.pads[0]
    let best = Infinity
    for (const pad of replay.pads) {
      const distance = Math.hypot(pad.pos[0] - place.pos.x, pad.pos[2] - place.pos.z)
      if (distance < best) [best, nearest] = [distance, pad]
    }
    const up = available(nearest, time)
    let back = 0
    if (!up) {
      for (let i = 0; i + 1 < nearest.taken.length; i += 2) if (nearest.taken[i] <= time && time < nearest.taken[i + 1]) back = nearest.taken[i + 1] - time
    }
    sim.setPad(index, up, back || (place.big ? 10 : 4))
  })
}
