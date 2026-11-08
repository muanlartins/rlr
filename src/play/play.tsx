import { useGLTF } from "@react-three/drei"
import { useFrame } from "@react-three/fiber"
import { useEffect, useMemo, useRef, useState } from "react"
import { AdditiveBlending, Box3, BufferAttribute, BufferGeometry, DoubleSide, Quaternion, Vector3, type Group } from "three"
import { rampMesh } from "../physics/arena-mesh"
import { HELP, Input } from "../physics/input"
import { BOOSTING, IDLE, Sim, TICK_RATE, type BodyState, type Controls } from "../physics/sim"
import type { Body, CameraSettings, Replay } from "../replay/model"
import { Arena } from "../scene/arena"
import { Follow, type Track } from "../scene/cameras"
import { useCarModel } from "../scene/car"
import { BALL_RADIUS, TEAMS } from "../scene/field"
import { PadMarker, showPad } from "../scene/pads"
import { BoostGauge } from "../ui/boost"
import { bodyAt, carAt, emptyCar, setPads } from "./rewind"

const BALL_MODEL = `${import.meta.env.BASE_URL}models/ball.glb`
/** Never more than this many ticks in one frame, so a stalled tab doesn't race to catch up. */
const MAX_TICKS = 12
const WHEEL_RADIUS = 0.17
/** Luan's camera, from his replays, for free play and players whose replay doesn't carry theirs. */
const CAMERA: CameraSettings = { fov: 110, height: 100, angle: -3, distance: 270, stiffness: 0.35, swivel: 4.7 }
/** After a goal, how long before the next kickoff (free play) or the next try (a replay's moment). */
const AFTER_GOAL = 3

/** A replay's moment to play from, as one of its players. */
export interface From {
  replay: Replay
  time: number
  car: number
}

/** Where a try stands: waiting for the first input, on the replay's own ball, the player's own play, or over. */
type Phase = "ready" | "replay" | "yours" | "over"

/** What the HUD shows, copied out of the simulation a few times a second. */
interface Hud {
  boost: number
  speed: number
  goals: [number, number]
  device: "pad" | "keys"
  ballCam: boolean
  phase: Phase
  /** Seconds since the moment, in a replay's. */
  elapsed: number
  /** How the try ended. */
  ending?: string
}

/**
 * Playing on RocketSim with a gamepad or the keyboard. Without `from` it's
 * free play: one Octane and the ball from a kickoff, unlimited boost, as in
 * the game. With `from`, it's a replay's moment with one player's car in
 * your hands: the others play the replay back, and the ball follows it until
 * you touch it; from then on the play is yours. It waits for your first
 * input, and R (Start) tries again from the same moment.
 */
export function PlayPage({ from, onClose }: { from?: From; onClose: () => void }) {
  const [sim, setSim] = useState<Sim>()
  const [error, setError] = useState<string>()
  const [hud, setHud] = useState<Hud>({ boost: 33, speed: 0, goals: [0, 0], device: "keys", ballCam: true, phase: from ? "ready" : "yours", elapsed: 0 })
  const stage = useRef<HTMLDivElement>(null)
  const [input, setInput] = useState<Input>()
  const [unlimited, setUnlimited] = useState(!from)
  const toggleBoost = () => {
    sim?.unlimitedBoost(!unlimited)
    setUnlimited(!unlimited)
  }

  useEffect(() => {
    let cancelled = false
    Sim.create().then(
      (made) => {
        if (cancelled) return
        if (from) for (const car of from.replay.cars) made.addCar(car.team)
        else made.addCar(0)
        made.unlimitedBoost(!from)
        if (!from) made.kickoff()
        setSim(made)
      },
      (failure) => setError(String(failure)),
    )
    return () => {
      cancelled = true
    }
  }, [from])

  useEffect(() => {
    if (!stage.current) return
    const made = new Input(stage.current)
    setInput(made)
    return () => made.dispose()
  }, [])

  const me = from ? from.replay.cars[from.car] : undefined
  const before = from ? scoreAt(from.replay, from.time) : [0, 0]
  const status = from && (hud.ending ?? { ready: "Move to start", replay: "As it happened: touch the ball to change it", yours: "Your play", over: "" }[hud.phase])
  const help = HELP[hud.device].replace(/(R|Start) resets/, from ? "$1 tries again" : "$1 resets")

  return (
    <div ref={stage} className="relative h-screen w-screen overflow-hidden bg-[#050a1a] text-white">
      <Arena>{sim && input && <World sim={sim} input={input} from={from} unlimited={unlimited} onHud={setHud} />}</Arena>

      <div className="absolute left-4 top-4 flex items-center gap-2">
        <button onClick={onClose} className="rounded-full border border-white/10 bg-[#0b1430]/85 px-3.5 py-1.5 text-[12px] text-white/80 backdrop-blur hover:bg-white/10">
          ← {from ? "Back to the replay" : "Home"}
        </button>
        {me && (
          <span className="flex items-center gap-2 rounded-full bg-[#0b1430]/85 px-3 py-1.5 text-[12px] text-white/70 backdrop-blur">
            <span className="h-2 w-2 rounded-full" style={{ background: TEAMS[me.team].color }} />
            Playing as {me.name}
          </span>
        )}
      </div>

      <div className="absolute left-1/2 top-4 flex -translate-x-1/2 flex-col items-center gap-2">
        <div className="flex overflow-hidden rounded-lg text-[20px] font-semibold tabular-nums">
          <span className="px-4 py-1" style={{ background: TEAMS[0].color }}>{before[0] + hud.goals[0]}</span>
          <span className="px-4 py-1" style={{ background: TEAMS[1].color }}>{before[1] + hud.goals[1]}</span>
        </div>
        {status && (
          <span className={`rounded-full px-3 py-1 text-[12px] backdrop-blur ${hud.phase === "yours" ? "bg-[#85a7ff]/30 text-white" : "bg-[#0b1430]/85 text-white/70"}`}>
            {status}
            {hud.phase !== "ready" && <span className="ml-2 tabular-nums text-white/50">+{hud.elapsed.toFixed(1)} s</span>}
          </span>
        )}
      </div>

      <span className="absolute bottom-4 left-4 max-w-[60%] text-[13px] text-white/60">{error ?? (sim ? help : "Loading the physics…")}</span>

      <div className="absolute bottom-4 right-4 flex flex-col items-center gap-1">
        <BoostGauge boost={hud.boost} color={TEAMS[me?.team ?? 0].color} speed={hud.speed} />
        <span className="text-[12px] text-white/50">{hud.ballCam ? "Ball cam" : "Car cam"}</span>
        <button
          onClick={toggleBoost}
          onMouseDown={(event) => event.stopPropagation()}
          className="mt-1 rounded-full border border-white/10 bg-[#0b1430]/85 px-3 py-1.5 text-[12px] text-white/80 backdrop-blur hover:bg-white/10"
        >
          {unlimited ? "Unlimited boost: on" : "Unlimited boost: off"}
        </button>
      </div>
    </div>
  )
}

/** The score just before `time`. */
function scoreAt(replay: Replay, time: number): [number, number] {
  return replay.goals.filter((goal) => goal.time <= time).at(-1)?.score ?? [0, 0]
}

const turn = new Quaternion()
const velocity = new Vector3()

/** Steps the simulation with the clock and draws it; the camera follows your car. */
function World({ sim, input, from, unlimited, onHud }: { sim: Sim; input: Input; from?: From; unlimited: boolean; onHud: (hud: Hud) => void }) {
  const { scene: ballScene } = useGLTF(BALL_MODEL)
  const ballScale = useMemo(() => BALL_RADIUS / (new Box3().setFromObject(ballScene).getSize(new Vector3()).x / 2), [ballScene])
  const ballRoot = useRef<Group>(null)
  const padGroups = useRef<(Group | null)[]>([])
  const pads = useMemo(() => sim.padPlaces(), [sim])
  const mine = from?.car ?? 0
  const cars: { body: Body; team: 0 | 1 }[] = from ? from.replay.cars.map((car) => ({ body: car.body, team: car.team })) : [{ body: "octane", team: 0 }]
  const camera = from?.replay.cars[from.car].camera ?? CAMERA
  const scratch = useMemo(() => ({ car: emptyCar(), ball: { pos: new Vector3(), quat: new Quaternion(), vel: new Vector3(), spin: new Vector3() } as BodyState }), [])
  const clock = useRef({ owed: 0, shown: 0, ballCam: true, goals: [0, 0] as [number, number], ending: 0, endingText: undefined as string | undefined, phase: (from ? "ready" : "yours") as Phase, elapsed: 0, startTick: 0, steer: 0 })

  /** Back to the start: a kickoff, or the replay's moment waiting for the first input. */
  const restart = () => {
    const state = clock.current
    if (from) {
      from.replay.cars.forEach((_, index) => sim.setCar(index, carAt(from.replay, index, from.time, scratch.car)))
      if (bodyAt(from.replay, from.replay.ball, from.time, scratch.ball)) sim.setBall(scratch.ball)
      setPads(sim, from.replay, from.time)
      if (unlimited) sim.unlimitedBoost(true)
      sim.settle()
      state.phase = "ready"
    } else {
      sim.kickoff()
      state.phase = "yours"
    }
    state.elapsed = 0
    state.endingText = undefined
    state.startTick = sim.tick
    state.goals = sim.goals()
  }
  const started = useRef(false)
  if (!started.current) {
    started.current = true
    if (from) restart()
  }

  const finish = (text: string) => {
    const state = clock.current
    state.phase = "over"
    state.ending = AFTER_GOAL
    state.endingText = text
  }

  /** One tick of a replay's moment: the others and (until it's yours) the ball as the replay has them, then the physics. */
  const tickReplay = (controls: Controls) => {
    const state = clock.current
    const replay = from!.replay
    const time = from!.time + state.elapsed
    const ended = time > replay.times[replay.times.length - 1]
    replay.cars.forEach((_, index) => {
      if (index === mine) return
      const car = carAt(replay, index, time, scratch.car)
      if (ended) car.off = true
      sim.setCar(index, car)
    })
    if (state.phase === "replay") {
      if (bodyAt(replay, replay.ball, time, scratch.ball)) sim.setBall(scratch.ball)
      else if (ended) state.phase = "yours"
      else if (replay.goals.some((goal) => goal.time > from!.time && goal.time <= time)) return finish("A goal, as in the replay")
    }
    // Nobody moves while a kickoff counts down: your car waits for the go with the others.
    const counting = replay.kickoffs.some((kickoff) => time >= kickoff.countdown && time < kickoff.go)
    if (counting) sim.setCar(mine, carAt(replay, mine, time, scratch.car))
    sim.controls(mine, counting ? IDLE : controls)
    sim.step()
    state.elapsed += 1 / TICK_RATE
    if (state.phase === "replay" && sim.touched(mine) > state.startTick) state.phase = "yours"
  }

  useFrame((_, delta) => {
    const state = clock.current
    while (input.reset > 0) {
      input.reset--
      restart()
      state.owed = 0
    }
    while (input.ballCam > 0) {
      input.ballCam--
      state.ballCam = !state.ballCam
    }
    // A goal ends the try: a new kickoff, or the replay's moment again, a moment later.
    const goals = sim.goals()
    const scored = goals[0] > state.goals[0] ? 0 : goals[1] > state.goals[1] ? 1 : undefined
    state.goals = goals
    if (scored !== undefined) finish(from ? (scored === cars[mine].team ? "Goal for your team" : "Goal against") : "Goal")
    if (state.phase === "over") {
      state.ending -= delta
      if (state.ending <= 0) restart()
    }

    state.owed = Math.min(state.owed + delta * TICK_RATE, MAX_TICKS)
    while (state.owed >= 1) {
      state.owed--
      const controls = input.read()
      state.steer = controls.steer
      if (state.phase === "ready") {
        if (!moved(controls)) continue
        state.phase = "replay"
      }
      if (from) {
        if (state.phase !== "over") tickReplay(controls)
      } else {
        sim.controls(0, controls)
        sim.step()
      }
    }
    const still = from && (state.phase === "ready" || state.phase === "over")
    const alpha = still ? 1 : state.owed

    if (ballRoot.current) sim.ball(alpha, ballRoot.current.position, ballRoot.current.quaternion)
    pads.forEach((_, index) => {
      const group = padGroups.current[index]
      if (group) showPad(group, sim.padUp(index))
    })

    state.shown += delta
    if (state.shown > 0.1) {
      state.shown = 0
      sim.carVelocity(mine, velocity)
      onHud({
        boost: Math.round(sim.carBoost(mine)),
        speed: Math.round(velocity.length() * 3.6),
        goals: sim.goals(),
        device: input.device,
        ballCam: state.ballCam,
        phase: state.phase,
        elapsed: state.elapsed,
        ending: state.endingText,
      })
    }
  })

  const alpha = () => {
    const state = clock.current
    return from && (state.phase === "ready" || state.phase === "over") ? 1 : state.owed
  }
  const track: Track = (at, rotation, ball) => {
    sim.car(mine, alpha(), at, rotation)
    sim.ball(alpha(), ball, turn)
    return { settings: camera, ballCam: clock.current.ballCam }
  }

  return (
    <>
      <Ramps />
      {pads.map((pad, index) => (
        <PadMarker key={index} ref={(group) => void (padGroups.current[index] = group)} at={[pad.pos.x, pad.pos.z]} big={pad.big} />
      ))}
      {cars.map((car, index) => (
        <SimCar key={index} sim={sim} index={index} body={car.body} team={car.team} steer={() => (index === mine ? clock.current.steer : 0)} alpha={alpha} />
      ))}
      <group ref={ballRoot}>
        <group scale={ballScale}>
          <primitive object={ballScene} />
        </group>
      </group>
      <Follow track={track} />
    </>
  )
}

/** Any stick, trigger or button: what starts a replay's moment. */
function moved(controls: Controls) {
  return controls.throttle !== 0 || controls.steer !== 0 || controls.pitch !== 0 || controls.roll !== 0 || controls.jump || controls.boost || controls.handbrake
}

const forward = new Vector3()

/** A car as the physics has it: its model in its team's paint, wheels turning, the flame while it boosts. */
function SimCar({ sim, index, body, team, steer, alpha }: { sim: Sim; index: number; body: Body; team: 0 | 1; steer: () => number; alpha: () => number }) {
  const { model, wheels } = useCarModel(body, team)
  const root = useRef<Group>(null)
  const flame = useRef<Group>(null)
  const roll = useRef(0)
  const speed = useMemo(() => new Vector3(), [])

  useFrame((_, delta) => {
    const group = root.current
    if (!group) return
    sim.car(index, alpha(), group.position, group.quaternion)
    // A car off the pitch is parked outside the walls; don't draw it there.
    group.visible = Math.abs(group.position.x) < 50 && Math.abs(group.position.z) < 57
    if (flame.current) {
      flame.current.visible = (sim.carFlags(index) & BOOSTING) !== 0
      flame.current.scale.y = 0.85 + Math.random() * 0.3
    }
    forward.set(1, 0, 0).applyQuaternion(group.quaternion)
    sim.carVelocity(index, speed)
    roll.current -= (speed.dot(forward) / WHEEL_RADIUS) * delta
    for (const wheel of wheels) {
      wheel.spin.rotation.z = roll.current
      if (wheel.front) wheel.steer.rotation.y = -steer() * 0.45
    }
  })

  return (
    <group ref={root}>
      <primitive object={model} />
      <group ref={flame} position={[0.1388 - 0.59, 0.22, 0]} rotation-z={Math.PI / 2}>
        <mesh position-y={0.28}>
          <coneGeometry args={[0.11, 0.56, 16, 1, true]} />
          <meshBasicMaterial color="#ff7a1a" transparent opacity={0.55} blending={AdditiveBlending} depthWrite={false} />
        </mesh>
      </group>
    </group>
  )
}

/** The floor ramps the physics drives on, which the pitch doesn't draw yet. */
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
