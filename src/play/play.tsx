import { useGLTF } from "@react-three/drei"
import { useFrame } from "@react-three/fiber"
import { useEffect, useMemo, useRef, useState } from "react"
import { AdditiveBlending, Box3, BufferAttribute, BufferGeometry, DoubleSide, Quaternion, Vector3, type Group } from "three"
import { rampMesh } from "../physics/arena-mesh"
import { HELP, Input } from "../physics/input"
import { BOOSTING, Sim, TICK_RATE } from "../physics/sim"
import { Arena } from "../scene/arena"
import { Follow, type Track } from "../scene/cameras"
import { BALL_RADIUS, TEAMS } from "../scene/field"
import { useCarModel } from "../scene/car"
import type { CameraSettings } from "../replay/model"
import { BoostGauge } from "../ui/boost"

const BALL_MODEL = `${import.meta.env.BASE_URL}models/ball.glb`
/** Never more than this many ticks in one frame, so a stalled tab doesn't race to catch up. */
const MAX_TICKS = 12
const WHEEL_RADIUS = 0.17
const LOCK = 0.45
/** Luan's camera, from his replays. */
const CAMERA: CameraSettings = { fov: 110, height: 100, angle: -3, distance: 270, stiffness: 0.35, swivel: 4.7 }

/** What the HUD shows, copied out of the simulation a few times a second. */
interface Hud {
  boost: number
  speed: number
  goals: [number, number]
  device: "pad" | "keys"
  ballCam: boolean
}

/**
 * Free play on RocketSim: one Octane and the ball, driven with a gamepad or
 * the keyboard, from a kickoff. The first step towards replaying a moment of a
 * replay with your own car.
 */
export function PlayPage({ onClose }: { onClose: () => void }) {
  const [sim, setSim] = useState<Sim>()
  const [error, setError] = useState<string>()
  const [hud, setHud] = useState<Hud>({ boost: 33, speed: 0, goals: [0, 0], device: "keys", ballCam: true })
  const stage = useRef<HTMLDivElement>(null)
  const [input, setInput] = useState<Input>()

  useEffect(() => {
    let cancelled = false
    Sim.create().then(
      (made) => {
        if (cancelled) return
        made.addCar(0)
        made.kickoff()
        setSim(made)
      },
      (failure) => setError(String(failure)),
    )
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!stage.current) return
    const made = new Input(stage.current)
    setInput(made)
    return () => made.dispose()
  }, [])

  return (
    <div ref={stage} className="relative h-screen w-screen overflow-hidden bg-[#050a1a] text-white">
      <Arena>{sim && input && <World sim={sim} input={input} onHud={setHud} />}</Arena>

      <div className="absolute left-4 top-4 flex items-center gap-3">
        <button onClick={onClose} className="rounded-lg border border-white/10 bg-[#0b1430]/85 px-3 py-1.5 text-[12px] text-white/80 backdrop-blur hover:bg-white/10">
          ← Home
        </button>
      </div>
      <span className="absolute bottom-4 left-4 max-w-[60%] text-[13px] text-white/60">{error ?? (sim ? HELP[hud.device] : "Loading the physics…")}</span>

      <div className="absolute left-1/2 top-4 flex -translate-x-1/2 overflow-hidden rounded-lg text-[20px] font-semibold tabular-nums">
        <span className="px-4 py-1" style={{ background: TEAMS[0].color }}>{hud.goals[0]}</span>
        <span className="px-4 py-1" style={{ background: TEAMS[1].color }}>{hud.goals[1]}</span>
      </div>

      <div className="absolute bottom-4 right-4 flex flex-col items-center gap-1">
        <BoostGauge boost={hud.boost} color={TEAMS[0].color} speed={hud.speed} />
        <span className="text-[12px] text-white/50">{hud.ballCam ? "Ball cam" : "Car cam"}</span>
      </div>
    </div>
  )
}

const car = new Vector3()
const ball = new Vector3()
const turn = new Quaternion()
const velocity = new Vector3()
const forward = new Vector3()

/** Steps the simulation with the clock and draws it; the camera follows the car. */
function World({ sim, input, onHud }: { sim: Sim; input: Input; onHud: (hud: Hud) => void }) {
  const { model, wheels } = useCarModel("octane", 0)
  const { scene: ballScene } = useGLTF(BALL_MODEL)
  const ballScale = useMemo(() => BALL_RADIUS / (new Box3().setFromObject(ballScene).getSize(new Vector3()).x / 2), [ballScene])
  const carRoot = useRef<Group>(null)
  const ballRoot = useRef<Group>(null)
  const flame = useRef<Group>(null)
  const clock = useRef({ owed: 0, steer: 0, roll: 0, shown: 0, ballCam: true, scored: 0, kickoffIn: 0 })

  useFrame((_, delta) => {
    const state = clock.current
    while (input.reset > 0) {
      input.reset--
      sim.kickoff()
      state.owed = 0
    }
    while (input.ballCam > 0) {
      input.ballCam--
      state.ballCam = !state.ballCam
    }
    // After a goal, a new kickoff once the ball has sat in the net a moment, as in the game.
    const [blue, orange] = sim.goals()
    if (blue + orange !== state.scored) {
      state.scored = blue + orange
      state.kickoffIn = 3
    }
    if (state.kickoffIn > 0 && (state.kickoffIn -= delta) <= 0) sim.kickoff()
    state.owed = Math.min(state.owed + delta * TICK_RATE, MAX_TICKS)
    while (state.owed >= 1) {
      const controls = input.read()
      state.steer = controls.steer
      sim.controls(0, controls)
      sim.step()
      state.owed--
    }
    const alpha = state.owed

    if (carRoot.current) sim.car(0, alpha, carRoot.current.position, carRoot.current.quaternion)
    if (ballRoot.current) sim.ball(alpha, ballRoot.current.position, ballRoot.current.quaternion)
    const flags = sim.carFlags(0)
    if (flame.current) {
      flame.current.visible = (flags & BOOSTING) !== 0
      flame.current.scale.y = 0.85 + Math.random() * 0.3
    }
    if (carRoot.current) {
      forward.set(1, 0, 0).applyQuaternion(carRoot.current.quaternion)
      sim.carVelocity(0, velocity)
      state.roll -= (velocity.dot(forward) / WHEEL_RADIUS) * delta
      for (const wheel of wheels) {
        wheel.spin.rotation.z = state.roll
        if (wheel.front) wheel.steer.rotation.y = -state.steer * LOCK
      }
    }

    state.shown += delta
    if (state.shown > 0.1) {
      state.shown = 0
      onHud({ boost: Math.round(sim.carBoost(0)), speed: Math.round(velocity.length() * 3.6), goals: sim.goals(), device: input.device, ballCam: state.ballCam })
    }
  })

  const track: Track = (at, rotation, ballAt) => {
    sim.car(0, clock.current.owed, at, rotation)
    sim.ball(clock.current.owed, ballAt, turn)
    return { settings: CAMERA, ballCam: clock.current.ballCam }
  }

  return (
    <>
      <Ramps />
      <group ref={carRoot}>
        <primitive object={model} />
        <group ref={flame} position={[0.1388 - 0.59, 0.22, 0]} rotation-z={Math.PI / 2}>
          <mesh position-y={0.28}>
            <coneGeometry args={[0.11, 0.56, 16, 1, true]} />
            <meshBasicMaterial color="#ff7a1a" transparent opacity={0.55} blending={AdditiveBlending} depthWrite={false} />
          </mesh>
        </group>
      </group>
      <group ref={ballRoot}>
        <group scale={ballScale}>
          <primitive object={ballScene} />
        </group>
      </group>
      <Follow track={track} />
    </>
  )
}

/** The ramps the physics drives on, which the pitch doesn't draw yet. */
function Ramps() {
  const geometry = useMemo(() => {
    const mesh = rampMesh()
    const positions = new Float32Array(mesh.vertices.length)
    for (let i = 0; i < mesh.vertices.length; i += 3) {
      positions[i] = mesh.vertices[i] / 100
      positions[i + 1] = mesh.vertices[i + 2] / 100
      positions[i + 2] = mesh.vertices[i + 1] / 100
    }
    const made = new BufferGeometry()
    made.setAttribute("position", new BufferAttribute(positions, 3))
    made.setIndex(new BufferAttribute(new Uint32Array(mesh.indices), 1))
    made.computeVertexNormals()
    return made
  }, [])
  return (
    <mesh geometry={geometry} receiveShadow>
      <meshStandardMaterial color="#1d3a8a" side={DoubleSide} transparent opacity={0.55} />
    </mesh>
  )
}
