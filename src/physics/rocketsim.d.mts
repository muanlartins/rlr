/** The wasm build of `physics/rlr_sim.cpp` (see `physics/build.sh`). */
export interface RocketSimModule {
  HEAPF32: Float32Array
  HEAP32: Int32Array
  _malloc(bytes: number): number
  _free(pointer: number): void
  _rs_mesh(vertices: number, vertexCount: number, indices: number, triangleCount: number): void
  _rs_init(): void
  _rs_add_car(team: number): number
  _rs_controls(car: number, throttle: number, steer: number, pitch: number, yaw: number, roll: number, jump: number, boost: number, handbrake: number): void
  _rs_step(ticks: number): void
  _rs_kickoff(seed: number): void
  _rs_goals(team: number): number
  _rs_state(out: number): void
  _rs_pad_count(): number
  _rs_pads(out: number): void
  _rs_set_ball(state: number): void
  _rs_set_car(car: number, state: number): void
}

export default function createModule(options?: { locateFile?: (path: string) => string }): Promise<RocketSimModule>
