/// <reference lib="webworker" />
/**
 * Reads a .replay file off the main thread: subtr-actor parses it, and this
 * turns its frame-by-frame objects into the flat arrays of `Replay`.
 */
import init, { get_replay_frames_data } from "@rlrml/subtr-actor"
import wasm from "@rlrml/subtr-actor/rl_replay_subtr_actor_bg.wasm?url"
import {
  BALL_CAM, BOOSTING, buffers, DODGING, DOUBLE_JUMPING, JUMPING, SLIDING, UU,
  type Body, type Car, type Goal, type Pad, type Replay, type Track,
} from "./model"

interface Vec { x: number; y: number; z: number }
interface RigidBody { location: Vec; rotation: Vec & { w: number }; linear_velocity: Vec | null }
type Frame<T> = "Empty" | { Data: T }
interface PlayerState {
  rigid_body: RigidBody
  boost_amount: number
  boost_active: boolean
  powerslide_active: boolean
  jump_active: boolean
  double_jump_active: boolean
  dodge_active: boolean
  input: { steer?: number | null }
}
interface PlayerInfo {
  remote_id: object
  name: string
  car_body_id?: number | null
  camera_settings?: { fov: number; height: number; angle: number; distance: number; stiffness: number; swivel_speed: number } | null
}
interface Parsed {
  frame_data: {
    ball_data: { frames: Frame<{ rigid_body: RigidBody }>[] }
    players: [object, { frames: Frame<PlayerState>[] }][]
    metadata_frames: { time: number; seconds_remaining: number }[]
  }
  meta: { team_zero: PlayerInfo[]; team_one: PlayerInfo[]; all_headers: [string, unknown][] }
  goal_events: { time: number; scoring_team_is_team_0: boolean; player: object | null; team_zero_score: number | null; team_one_score: number | null }[]
  demolish_infos: { time: number; attacker: object; victim: object }[]
  boost_pads: { pad_id: string | null; size: "Big" | "Small"; position: Vec }[]
  boost_pad_events: { time: number; pad_id: string; kind: "Available" | { PickedUp: unknown } }[]
  player_camera_events: [object, { frame: number; ball_cam_active: boolean | null }[]][]
}

/** Car body product ids that have their own model; every other body shows as an Octane. */
const BODIES: Record<number, Body> = { 23: "octane", 4284: "fennec" }
/** Seconds a boost pad takes to come back. */
const RESPAWN = { big: 10, small: 4 }

const ready = init({ module_or_path: wasm })

self.onmessage = async (event: MessageEvent<{ bytes: ArrayBuffer; name: string }>) => {
  try {
    await ready
    const parsed: Parsed = get_replay_frames_data(new Uint8Array(event.data.bytes))
    const replay = convert(parsed, event.data.name)
    self.postMessage({ replay }, buffers(replay))
  } catch (error) {
    self.postMessage({ error: String(error) })
  }
}

function convert(parsed: Parsed, file: string): Replay {
  const { frame_data: frames, meta } = parsed
  const count = frames.metadata_frames.length
  const key = (id: object) => JSON.stringify(id)
  const infos = new Map<string, PlayerInfo & { team: 0 | 1 }>()
  for (const [team, players] of [meta.team_zero, meta.team_one].entries()) {
    for (const player of players) infos.set(key(player.remote_id), { ...player, team: team as 0 | 1 })
  }
  const names = new Map([...infos].map(([id, info]) => [id, info.name]))
  const header = (name: string) => valueOf(meta.all_headers.find(([key]) => key === name)?.[1])

  const ball = track(count, frames.ball_data.frames.map((frame) => (frame === "Empty" ? undefined : frame.Data.rigid_body)))

  const cars = frames.players.flatMap(([id, data]): Car[] => {
    const info = infos.get(key(id))
    if (!info) return []
    const states = data.frames.map((frame) => (frame === "Empty" ? undefined : frame.Data))
    const car: Car = {
      ...track(count, states.map((state) => state?.rigid_body)),
      id: key(id),
      name: info.name,
      team: info.team,
      body: BODIES[info.car_body_id ?? 23] ?? "octane",
      camera: info.camera_settings ? { ...info.camera_settings, swivel: info.camera_settings.swivel_speed } : undefined,
      boost: new Float32Array(count),
      flags: new Uint8Array(count),
      steer: new Float32Array(count),
    }
    const changes = parsed.player_camera_events.find(([player]) => key(player) === car.id)?.[1] ?? []
    let ballCam = false
    for (let i = 0, change = 0; i < count; i++) {
      while (change < changes.length && changes[change].frame <= i) ballCam = changes[change++].ball_cam_active ?? ballCam
      const state = states[i]
      if (!state) continue
      car.boost[i] = (state.boost_amount / 255) * 100
      car.steer[i] = state.input.steer == null ? 0 : (state.input.steer - 128) / 127
      car.flags[i] =
        (state.boost_active ? BOOSTING : 0) | (state.jump_active ? JUMPING : 0) | (state.double_jump_active ? DOUBLE_JUMPING : 0) |
        (state.dodge_active ? DODGING : 0) | (state.powerslide_active ? SLIDING : 0) | (ballCam ? BALL_CAM : 0)
    }
    return [car]
  })

  const goals = parsed.goal_events.map((goal): Goal => ({
    time: goal.time,
    team: goal.scoring_team_is_team_0 ? 0 : 1,
    scorer: goal.player ? names.get(key(goal.player)) : undefined,
    score: [goal.team_zero_score ?? 0, goal.team_one_score ?? 0],
  }))

  return {
    name: String(header("ReplayName") ?? file),
    map: String(header("MapName") ?? ""),
    times: Float32Array.from(frames.metadata_frames, (frame) => frame.time),
    clock: Float32Array.from(frames.metadata_frames, (frame) => frame.seconds_remaining),
    ball,
    cars,
    goals,
    demos: parsed.demolish_infos.map((demo) => ({ time: demo.time, attacker: names.get(key(demo.attacker)) ?? "", victim: names.get(key(demo.victim)) ?? "" })),
    pads: pads(parsed),
  }
}

/** A rigid body per frame as a `Track`; a missing frame holds the last known pose. */
function track(count: number, bodies: (RigidBody | undefined)[]): Track {
  const pos = new Float32Array(count * 3)
  const quat = new Float32Array(count * 4)
  const vel = new Float32Array(count * 3)
  const present = new Uint8Array(count)
  quat[3] = 1
  for (let i = 0; i < count; i++) {
    const body = bodies[i]
    if (!body) {
      if (i > 0) {
        pos.copyWithin(i * 3, (i - 1) * 3, i * 3)
        quat.copyWithin(i * 4, (i - 1) * 4, i * 4)
      }
      continue
    }
    present[i] = 1
    const { location: l, rotation: r, linear_velocity: v } = body
    pos.set([l.x * UU, l.z * UU, l.y * UU], i * 3)
    quat.set([r.x, r.z, r.y, -r.w], i * 4)
    if (v) vel.set([v.x * UU, v.z * UU, v.y * UU], i * 3)
  }
  return { pos, quat, vel, present }
}

/** Each boost pad with the times it was taken and came back. */
function pads(parsed: Parsed): Pad[] {
  return parsed.boost_pads.map((pad) => {
    const big = pad.size === "Big"
    const respawn = big ? RESPAWN.big : RESPAWN.small
    const taken: number[] = []
    for (const event of parsed.boost_pad_events) {
      if (event.pad_id !== pad.pad_id) continue
      const away = taken.length % 2 === 1
      if (event.kind === "Available") {
        if (away) taken.push(event.time)
      } else {
        if (away) taken.push(Math.min(event.time, taken[taken.length - 1] + respawn))
        taken.push(event.time)
      }
    }
    if (taken.length % 2 === 1) taken.push(taken[taken.length - 1] + respawn)
    return { pos: [pad.position.x * UU, pad.position.z * UU, pad.position.y * UU], big, taken }
  })
}

/** The plain value inside one of the parser's tagged header values ({ Str: "…" }, { Int: 3 }, …). */
function valueOf(prop: unknown): unknown {
  if (prop && typeof prop === "object") return valueOf(Object.values(prop)[0])
  return prop
}
