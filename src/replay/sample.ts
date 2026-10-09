import { Quaternion, Vector3 } from "three"
import type { Track } from "./model"

/** Where `time` falls: the frame before it and how far (0–1) towards the next. */
export interface Moment {
  frame: number
  alpha: number
}

export function momentAt(times: Float32Array, time: number): Moment {
  const last = times.length - 1
  if (time <= times[0]) return { frame: 0, alpha: 0 }
  if (time >= times[last]) return { frame: last, alpha: 0 }
  let low = 0
  let high = last
  while (high - low > 1) {
    const middle = (low + high) >> 1
    if (times[middle] <= time) low = middle
    else high = middle
  }
  return { frame: low, alpha: (time - times[low]) / (times[low + 1] - times[low]) }
}

/** Longer than this between two frames, nothing was recorded: the game was showing its goal replay. */
const GAP = 0.5

/** The stretches with no frames, as [last frame before, first frame after] times. */
export function gaps(times: Float32Array) {
  const found: [number, number][] = []
  for (let i = 1; i < times.length; i++) if (times[i] - times[i - 1] > GAP) found.push([times[i - 1], times[i]])
  return found
}

const q0 = new Quaternion()
const q1 = new Quaternion()

/**
 * The track's pose at a moment, smoothed between frames: positions follow a
 * Hermite curve through both frames' velocities (so the ball arcs instead of
 * zig-zagging at ~30 frames a second), rotations a slerp.
 * False when the track has no data there.
 */
export function poseAt(track: Track, times: Float32Array, { frame, alpha }: Moment, position: Vector3, rotation: Quaternion) {
  if (!track.present[frame]) return false
  const next = Math.min(frame + 1, times.length - 1)
  const { pos, vel, quat } = track
  if (alpha === 0 || !track.present[next]) {
    position.fromArray(pos, frame * 3)
    rotation.fromArray(quat, frame * 4)
    return true
  }
  const dt = times[next] - times[frame]
  const t2 = alpha * alpha
  const t3 = t2 * alpha
  const h00 = 2 * t3 - 3 * t2 + 1
  const h10 = t3 - 2 * t2 + alpha
  const h01 = -2 * t3 + 3 * t2
  const h11 = t3 - t2
  for (let axis = 0; axis < 3; axis++) {
    const a = frame * 3 + axis
    const b = next * 3 + axis
    position.setComponent(axis, h00 * pos[a] + h10 * dt * vel[a] + h01 * pos[b] + h11 * dt * vel[b])
  }
  rotation.slerpQuaternions(q0.fromArray(quat, frame * 4), q1.fromArray(quat, next * 4), alpha)
  return true
}
