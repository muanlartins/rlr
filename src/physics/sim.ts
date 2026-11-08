/**
 * RocketSim (github.com/ZealanL/RocketSim, MIT), built for the browser by
 * `physics/build.sh`: one soccar arena on our own walls (`arena-mesh.ts`),
 * stepped at the game's 120 ticks a second. The game's units go in and out
 * of the wasm (uu, Z up); this file turns them into scene space (metres,
 * Y up) like the replay's.
 */
import { Matrix4, Quaternion, Vector3 } from "three"
import { arenaMeshes } from "./arena-mesh"
import createModule, { type RocketSimModule } from "./rocketsim.mjs"
import wasmUrl from "./rocketsim.wasm?url"

export const TICK_RATE = 120
const UU = 1 / 100
/** Floats per body in the wasm's state: position, forward, right, up, velocity, spin. */
const BODY = 18
/** A car's floats: its body, boost, flags. */
const CAR = BODY + 2

export const ON_GROUND = 1
export const BOOSTING = 2
export const SUPERSONIC = 4
export const DEMOLISHED = 8

/** One tick's inputs, as the game takes them: sticks and triggers -1 to 1. */
export interface Controls {
  throttle: number
  steer: number
  pitch: number
  yaw: number
  roll: number
  jump: boolean
  boost: boolean
  handbrake: boolean
}

/** A body to put somewhere, in scene space (metres, m/s, rad/s remapped like the replay's). */
export interface BodyState {
  pos: Vector3
  quat: Quaternion
  vel: Vector3
  spin: Vector3
}

/** A car to put somewhere: its body, its boost, what it has used since it left the ground, or off the pitch. */
export interface CarState extends BodyState {
  boost: number
  jumped: boolean
  doubleJumped: boolean
  flipped: boolean
  /** Seconds since its jump. */
  sinceJump: number
  off: boolean
}

export const IDLE: Controls = { throttle: 0, steer: 0, pitch: 0, yaw: 0, roll: 0, jump: false, boost: false, handbrake: false }

const basis = new Matrix4()
const forward = new Vector3()
const right = new Vector3()
const up = new Vector3()
const before = new Vector3()
const turned = new Quaternion()

export class Sim {
  private cars = 0
  private pads = 0
  /** The state before and after the last tick, to draw between them. */
  private previous = new Float32Array(0)
  private current = new Float32Array(0)
  private pointer = 0
  /** Room for one state going in: a body, then a car's extras. */
  private input = 0

  private constructor(private wasm: RocketSimModule) {}

  static async create(): Promise<Sim> {
    const wasm = await createModule({ locateFile: () => wasmUrl })
    for (const mesh of arenaMeshes()) {
      const vertices = wasm._malloc(mesh.vertices.byteLength)
      const indices = wasm._malloc(mesh.indices.byteLength)
      wasm.HEAPF32.set(mesh.vertices, vertices / 4)
      wasm.HEAP32.set(mesh.indices, indices / 4)
      wasm._rs_mesh(vertices, mesh.vertices.length / 3, indices, mesh.indices.length / 3)
      wasm._free(vertices)
      wasm._free(indices)
    }
    wasm._rs_init()
    const sim = new Sim(wasm)
    sim.input = wasm._malloc(32 * 4)
    sim.pads = wasm._rs_pad_count()
    sim.resize()
    return sim
  }

  /** Adds an Octane to the arena; returns its index. */
  addCar(team: 0 | 1) {
    const index = this.wasm._rs_add_car(team)
    this.cars++
    this.resize()
    return index
  }

  controls(car: number, c: Controls) {
    this.wasm._rs_controls(car, c.throttle, c.steer, c.pitch, c.yaw, c.roll, +c.jump, +c.boost, +c.handbrake)
  }

  step(ticks = 1) {
    this.wasm._rs_step(ticks)
    this.previous.set(this.current)
    this.read()
  }

  /** A random kickoff, or the one `seed` picks. */
  kickoff(seed = -1) {
    this.wasm._rs_kickoff(seed)
    this.read()
    this.previous.set(this.current)
  }

  /** Unlimited boost, as in the game's free play. */
  unlimitedBoost(on: boolean) {
    this.wasm._rs_unlimited_boost(+on)
    this.read()
  }

  setBall(state: BodyState) {
    this.write(0, state)
    this.wasm._rs_set_ball(this.input)
    this.read()
  }

  setCar(index: number, state: CarState) {
    this.write(0, state)
    this.wasm.HEAPF32.set([state.boost, +state.jumped, +state.doubleJumped, +state.flipped, state.sinceJump, +state.off], this.input / 4 + BODY)
    this.wasm._rs_set_car(index, this.input)
  }

  /** Brings the state read back in line after setting cars, without a tick in between. */
  settle() {
    this.read()
    this.previous.set(this.current)
  }

  /** The arena tick when the car last touched the ball, or -1. */
  touched(index: number) {
    return this.wasm._rs_car_touched(index)
  }

  get tick() {
    return this.wasm._rs_tick()
  }

  padCount() {
    return this.pads
  }

  /** Each pad's position in scene space and whether it's big. */
  padPlaces() {
    const out = this.wasm._malloc(this.pads * 16)
    this.wasm._rs_pads(out)
    const raw = this.wasm.HEAPF32.slice(out / 4, out / 4 + this.pads * 4)
    this.wasm._free(out)
    return Array.from({ length: this.pads }, (_, i) => ({ pos: new Vector3(raw[i * 4] * UU, raw[i * 4 + 2] * UU, raw[i * 4 + 1] * UU), big: raw[i * 4 + 3] > 0 }))
  }

  padUp(index: number) {
    return this.current[BODY + this.cars * CAR + index] > 0
  }

  setPad(index: number, up: boolean, cooldown: number) {
    this.wasm._rs_set_pad(index, +up, cooldown)
  }

  goals(): [number, number] {
    return [this.wasm._rs_goals(0), this.wasm._rs_goals(1)]
  }

  /** The ball between the last two ticks (`alpha` 0 to 1), in scene space. */
  ball(alpha: number, pos: Vector3, rotation: Quaternion) {
    this.pose(0, alpha, pos, rotation)
  }

  car(index: number, alpha: number, pos: Vector3, rotation: Quaternion) {
    this.pose(BODY + index * CAR, alpha, pos, rotation)
  }

  /** A car's velocity in scene space (m/s), as of the last tick. */
  carVelocity(index: number, out: Vector3) {
    return scene(this.current, BODY + index * CAR + 12, out)
  }

  carBoost(index: number) {
    return this.current[BODY + index * CAR + BODY]
  }

  carFlags(index: number) {
    return this.current[BODY + index * CAR + BODY + 1]
  }

  private pose(offset: number, alpha: number, pos: Vector3, rotation: Quaternion) {
    scene(this.previous, offset, before)
    scene(this.current, offset, pos)
    pos.lerpVectors(before, pos, alpha)
    orientation(this.previous, offset, turned)
    orientation(this.current, offset, rotation)
    rotation.slerpQuaternions(turned, rotation, alpha)
  }

  /** A body's state into the input buffer at `offset` floats, in the game's units. */
  private write(offset: number, state: BodyState) {
    const at = this.input / 4 + offset
    const heap = this.wasm.HEAPF32
    const game = (v: Vector3, scale: number, i: number) => heap.set([v.x * scale, v.z * scale, v.y * scale], at + i)
    game(state.pos, 100, 0)
    game(forward.set(1, 0, 0).applyQuaternion(state.quat), 1, 3)
    game(right.set(0, 0, 1).applyQuaternion(state.quat), 1, 6)
    game(up.set(0, 1, 0).applyQuaternion(state.quat), 1, 9)
    game(state.vel, 100, 12)
    game(state.spin, 1, 15)
  }

  private resize() {
    const length = BODY + this.cars * CAR + this.pads
    if (this.pointer) this.wasm._free(this.pointer)
    this.pointer = this.wasm._malloc(length * 4)
    this.current = new Float32Array(length)
    this.previous = new Float32Array(length)
    this.read()
    this.previous.set(this.current)
  }

  private read() {
    this.wasm._rs_state(this.pointer)
    this.current.set(this.wasm.HEAPF32.subarray(this.pointer / 4, this.pointer / 4 + this.current.length))
  }
}

/** The game's (x, y, z) in uu at `offset` as scene space: (x, z, y) in metres. */
function scene(state: Float32Array, offset: number, out: Vector3) {
  return out.set(state[offset] * UU, state[offset + 2] * UU, state[offset + 1] * UU)
}

/** A body's rotation as a scene quaternion. Its own axes become X ahead, Y up, Z right, as a replay's cars do. */
function orientation(state: Float32Array, offset: number, out: Quaternion) {
  const axis = (at: number, v: Vector3) => v.set(state[at], state[at + 2], state[at + 1])
  axis(offset + 3, forward)
  axis(offset + 6, right)
  axis(offset + 9, up)
  return out.setFromRotationMatrix(basis.makeBasis(forward, up, right))
}
