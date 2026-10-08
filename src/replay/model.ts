/**
 * A replay as the player uses it: every moving thing as flat typed arrays, one
 * entry per recorded frame, already in scene space.
 *
 * Scene space is three.js's: metres, Y up. Rocket League's (Unreal's) is
 * centimetres ("uu"), Z up and left-handed: x stays x, its z becomes our y and
 * its y our z (Blue's goal is at -z, Orange's at +z). A car's own axes come out
 * as X ahead, Y up, Z right.
 */

export const UU = 0.01

export interface Track {
  /** x, y, z per frame. */
  pos: Float32Array
  /** x, y, z, w per frame. */
  quat: Float32Array
  /** Linear velocity, x, y, z per frame (m/s). */
  vel: Float32Array
  /** 1 where the frame has data; 0 while it's missing (a demolished car, a reset ball). */
  present: Uint8Array
}

/** Bits of `Car.flags`. */
export const BOOSTING = 1
export const JUMPING = 2
export const DOUBLE_JUMPING = 4
export const DODGING = 8
export const SLIDING = 16
export const BALL_CAM = 32

export type Body = "octane" | "fennec"

/** A player's camera preset, in the game's own units (degrees, uu). */
export interface CameraSettings {
  fov: number
  height: number
  angle: number
  distance: number
  stiffness: number
  swivel: number
}

export interface Car extends Track {
  id: string
  name: string
  /** 0 Blue, 1 Orange. */
  team: 0 | 1
  body: Body
  camera?: CameraSettings
  /** 0–100 per frame. */
  boost: Float32Array
  flags: Uint8Array
  /** -1 (full left) … 1 (full right) per frame. */
  steer: Float32Array
}

export interface Pad {
  pos: [number, number, number]
  big: boolean
  /** When it was taken and when it came back, as [taken, back, taken, back, …] times. */
  taken: number[]
}

export interface Goal {
  time: number
  /** The team that scored. */
  team: 0 | 1
  scorer?: string
  score: [number, number]
}

export interface Replay {
  name: string
  map: string
  /** Seconds since the recording started, per frame. */
  times: Float32Array
  /** The match clock (seconds left), per frame. */
  clock: Float32Array
  ball: Track
  cars: Car[]
  goals: Goal[]
  demos: { time: number; attacker: string; victim: string }[]
  pads: Pad[]
}

/** The arrays a replay is made of, to hand it across threads without copying. */
export function buffers(replay: Replay) {
  const tracks: Track[] = [replay.ball, ...replay.cars]
  return [
    replay.times.buffer,
    replay.clock.buffer,
    ...tracks.flatMap((track) => [track.pos.buffer, track.quat.buffer, track.vel.buffer, track.present.buffer]),
    ...replay.cars.flatMap((car) => [car.boost.buffer, car.flags.buffer, car.steer.buffer]),
  ] as ArrayBuffer[]
}
