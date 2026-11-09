import { useGLTF } from "@react-three/drei"
import { useFrame } from "@react-three/fiber"
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { AdditiveBlending, Box3, BufferAttribute, BufferGeometry, DoubleSide, Quaternion, Vector3, type Group, type Mesh, type MeshStandardMaterial } from "three"
import { rampMesh } from "../physics/arena-mesh"
import { Input } from "../physics/input"
import { BOOSTING, Sim, TICK_RATE } from "../physics/sim"
import type { Body, CameraSettings, Replay } from "../replay/model"
import { momentAt, poseAt } from "../replay/sample"
import { Arena } from "../scene/arena"
import { Follow, type Track } from "../scene/cameras"
import { useCarModel } from "../scene/car"
import { BALL_RADIUS, TEAMS } from "../scene/field"
import { PadMarker, showPad } from "../scene/pads"
import { BoostGauge } from "../ui/boost"
import { PadIcon } from "../ui/icons"
import { ControlsSheet } from "./controls-sheet"
import { Session, type From, type Phase, type Result } from "./session"

export type { From } from "./session"

const BALL_MODEL = `${import.meta.env.BASE_URL}models/ball.glb`
/** Never more than this many ticks in one frame, so a stalled tab doesn't race to catch up. */
const MAX_TICKS = 12
const WHEEL_RADIUS = 0.17
/** Luan's camera, from his replays, for free play and players whose replay doesn't carry theirs. */
const CAMERA: CameraSettings = { fov: 110, height: 100, angle: -3, distance: 270, stiffness: 0.35, swivel: 4.7 }
const SPEEDS = [1, 0.75, 0.5, 0.25]

/** How a moment is played, kept in this browser. */
interface Options {
  /** The game's speed. */
  speed: number
  /** The replay runs up to the moment before handing over your car (or the moment waits, still). */
  runUp: boolean
  /** Your car as it went in the match, see-through, to compare with. */
  ghost: boolean
}
const SAVED = "rlr:play"
const DEFAULT_OPTIONS: Options = { speed: 1, runUp: true, ghost: true }

function loadOptions(): Options {
  try {
    return { ...DEFAULT_OPTIONS, ...(JSON.parse(localStorage.getItem(SAVED) ?? "{}") as Partial<Options>) }
  } catch {
    return DEFAULT_OPTIONS
  }
}

/** What the HUD shows, copied out of the simulation a few times a second. */
interface Hud {
  boost: number
  speed: number
  goals: [number, number]
  device: "pad" | "keys"
  ballCam: boolean
  phase: Phase
  /** Seconds since the moment (negative during the run-up). */
  since: number
  handOverIn: number
  result?: Result
  tries: number
  wins: number
}

/**
 * Playing on RocketSim with a controller or the keyboard. Without `from` it's
 * free play: one Octane and the ball from a kickoff, unlimited boost, as in
 * the game. With `from`, it's a replay's moment with one player's car in your
 * hands (see `Session`), tried again and again, with the options to train it:
 * the game's speed, the run-up, your car's ghost from the match.
 */
export function PlayPage({ from, onClose }: { from?: From; onClose: () => void }) {
  const [sim, setSim] = useState<Sim>()
  const [session, setSession] = useState<Session>()
  const [error, setError] = useState<string>()
  const [hud, setHud] = useState<Hud>({ boost: 33, speed: 0, goals: [0, 0], device: "keys", ballCam: true, phase: from ? "ready" : "yours", since: 0, handOverIn: 0, tries: 0, wins: 0 })
  const stage = useRef<HTMLDivElement>(null)
  const [input, setInput] = useState<Input>()
  const [options, setOptions] = useState(loadOptions)
  const [unlimited, setUnlimited] = useState(!from)
  const [controls, setControls] = useState(false)

  const change = (next: Partial<Options>) => {
    const merged = { ...options, ...next }
    setOptions(merged)
    try {
      localStorage.setItem(SAVED, JSON.stringify(merged))
    } catch {
      // Kept for this visit only.
    }
  }

  useEffect(() => {
    let cancelled = false
    Sim.create().then(
      (made) => {
        if (cancelled) return
        if (from) for (const car of from.replay.cars) made.addCar(car.team)
        else made.addCar(0)
        made.unlimitedBoost(!from)
        setSim(made)
        setSession(new Session(made, from, { runUp: loadOptions().runUp, unlimited: !from }))
      },
      (failure) => setError(String(failure)),
    )
    return () => {
      cancelled = true
    }
  }, [from])

  useEffect(() => session?.setOptions({ runUp: options.runUp, unlimited }), [session, options.runUp, unlimited])

  useEffect(() => {
    if (!stage.current) return
    const made = new Input(stage.current)
    setInput(made)
    return () => made.dispose()
  }, [])

  const me = from ? from.replay.cars[from.car] : undefined
  const before = from ? scoreAt(from.replay, from.time) : [0, 0]
  const target = session?.target
  const status = from && statusOf(hud)
  const tally = target && hud.tries > 0 ? `${session?.defending ? "Saved" : "Scored"} ${hud.wins} of ${hud.tries}` : undefined

  return (
    <div ref={stage} className="relative h-screen w-screen overflow-hidden bg-[#050a1a] text-white">
      <Arena>{sim && session && input && <World sim={sim} session={session} input={input} options={options} paused={controls} onHud={setHud} />}</Arena>

      <div data-ui className="absolute left-4 top-4 flex items-center gap-2">
        <button onClick={onClose} className="rounded-full border border-white/10 bg-[#0b1430]/85 px-3.5 py-1.5 text-[12px] text-white/80 backdrop-blur hover:bg-white/10">
          ← {from ? "Back to the replay" : "Home"}
        </button>
        {me && (
          <span className="flex items-center gap-2 rounded-full bg-[#0b1430]/85 px-3 py-1.5 text-[12px] text-white/70 backdrop-blur">
            <span className="h-2 w-2 rounded-full" style={{ background: TEAMS[me.team].color }} />
            {target ? `${session?.defending ? "Saving" : "Scoring"} ${target.scorer ? `${target.scorer}'s` : "the"} goal as ${me.name}` : `Playing as ${me.name}`}
          </span>
        )}
      </div>

      <div className="pointer-events-none absolute left-1/2 top-4 flex -translate-x-1/2 flex-col items-center gap-2">
        <div className="flex overflow-hidden rounded-lg text-[20px] font-semibold tabular-nums">
          <span className="px-4 py-1" style={{ background: TEAMS[0].color }}>{before[0] + hud.goals[0]}</span>
          <span className="px-4 py-1" style={{ background: TEAMS[1].color }}>{before[1] + hud.goals[1]}</span>
        </div>
        {hud.result ? (
          <span
            className={`rounded-full px-5 py-1.5 text-[16px] font-semibold shadow-lg ${
              hud.result.success === true ? "bg-[#f4f5f7] text-[#002fa7]" : hud.result.success === false ? "bg-[#0b1430]/90 text-white/85 ring-1 ring-white/15" : "bg-[#0b1430]/90 text-white"
            }`}
          >
            {hud.result.text}
          </span>
        ) : (
          status && (
            <span className={`rounded-full px-3 py-1 text-[12px] backdrop-blur ${hud.phase === "yours" ? "bg-[#85a7ff]/30 text-white" : "bg-[#0b1430]/85 text-white/70"}`}>{status}</span>
          )
        )}
        {tally && <span className="text-[12px] tabular-nums text-white/55">{tally}</span>}
      </div>

      <div data-ui className="absolute inset-x-0 bottom-4 mx-auto flex w-fit max-w-[calc(100%-2rem)] flex-wrap items-center justify-center gap-2 rounded-2xl border border-white/10 bg-[#0b1430]/85 p-1.5 text-[12px] backdrop-blur">
        <Options label="Speed">
          {SPEEDS.map((speed) => (
            <Option key={speed} active={options.speed === speed} onClick={() => change({ speed })}>
              {speed * 100}%
            </Option>
          ))}
        </Options>
        {from && (
          <>
            <Options label="Start">
              <Option active={options.runUp} onClick={() => change({ runUp: true })} hint="The replay runs 2 s up to the moment, then hands you the car">
                Run-up
              </Option>
              <Option active={!options.runUp} onClick={() => change({ runUp: false })} hint="The moment waits, still, for your first input">
                Still
              </Option>
            </Options>
            <Option active={options.ghost} onClick={() => change({ ghost: !options.ghost })} hint="Your car as it went in the match, see-through">
              Ghost
            </Option>
          </>
        )}
        <Option active={unlimited} onClick={() => setUnlimited(!unlimited)} hint="Unlimited boost, as in free play">
          ∞ Boost
        </Option>
        <button onClick={() => setControls(true)} className="flex h-8 items-center gap-1.5 rounded-xl px-3 text-white/75 hover:bg-white/10 hover:text-white" title="Your controller's and keyboard's buttons">
          <PadIcon />
          Controls
        </button>
      </div>

      <span className="pointer-events-none absolute bottom-6 left-4 max-w-[22%] text-[12px] text-white/45">
        {error ?? (!sim ? "Loading the physics…" : input && hint(input, hud.device, Boolean(from)))}
      </span>

      <div className="pointer-events-none absolute bottom-4 right-4 flex flex-col items-center gap-1">
        <BoostGauge boost={hud.boost} color={TEAMS[me?.team ?? 0].color} speed={hud.speed} />
        <span className="text-[12px] text-white/50">{hud.ballCam ? "Ball cam" : "Car cam"}</span>
      </div>

      {controls && input && <ControlsSheet input={input} onClose={() => setControls(false)} />}
    </div>
  )
}

/** The line under the score: where the try stands. */
function statusOf(hud: Hud) {
  switch (hud.phase) {
    case "ready":
      return "Move to start"
    case "runup":
      return `Your car in ${hud.handOverIn.toFixed(1)} s`
    case "replay":
      return `As it happened: touch the ball to change it · ${since(hud.since)}`
    case "yours":
      return `Your play · ${since(hud.since)}`
    default:
      return undefined
  }
}

const since = (seconds: number) => `+${Math.max(0, seconds).toFixed(1)} s`

/** The keys that matter most, in the bound ones. */
function hint(input: Input, device: "pad" | "keys", replay: boolean) {
  const again = replay ? "tries again" : "resets"
  return device === "pad"
    ? `${input.name("pad", "reset")} ${again} · ${input.name("pad", "ballCam")} ball cam`
    : `${input.name("keys", "reset")} ${again} · ${input.name("keys", "ballCam")} ball cam`
}

function Options({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-0.5 rounded-xl bg-white/[0.06] p-0.5" role="group" aria-label={label}>
      <span className="px-2 text-white/40">{label}</span>
      {children}
    </div>
  )
}

function Option({ active, onClick, hint, children }: { active: boolean; onClick: () => void; hint?: string; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      title={hint}
      aria-pressed={active}
      className={`h-7 rounded-lg px-2.5 tabular-nums transition-colors ${active ? "bg-[#f4f5f7] text-[#002fa7]" : "text-white/70 hover:bg-white/10 hover:text-white"}`}
    >
      {children}
    </button>
  )
}

/** The score just before `time`. */
function scoreAt(replay: Replay, time: number): [number, number] {
  return replay.goals.filter((goal) => goal.time <= time).at(-1)?.score ?? [0, 0]
}

const turn = new Quaternion()
const velocity = new Vector3()

/** Steps the session with the clock (at the chosen speed) and draws it; the camera follows your car. */
function World({ sim, session, input, options, paused, onHud }: { sim: Sim; session: Session; input: Input; options: Options; paused: boolean; onHud: (hud: Hud) => void }) {
  const { scene: ballScene } = useGLTF(BALL_MODEL)
  const ballScale = useMemo(() => BALL_RADIUS / (new Box3().setFromObject(ballScene).getSize(new Vector3()).x / 2), [ballScene])
  const ballRoot = useRef<Group>(null)
  const padGroups = useRef<(Group | null)[]>([])
  const pads = useMemo(() => sim.padPlaces(), [sim])
  const from = session.from
  const mine = from?.car ?? 0
  const cars: { body: Body; team: 0 | 1 }[] = from ? from.replay.cars.map((car) => ({ body: car.body, team: car.team })) : [{ body: "octane", team: 0 }]
  const camera = from?.replay.cars[from.car].camera ?? CAMERA
  const clock = useRef({ owed: 0, shown: 0, ballCam: true, steer: 0 })

  useFrame((_, delta) => {
    const state = clock.current
    while (input.reset > 0) {
      input.reset--
      session.restart()
      state.owed = 0
    }
    while (input.ballCam > 0) {
      input.ballCam--
      state.ballCam = !state.ballCam
    }
    if (!paused) {
      session.update(delta)
      state.owed = Math.min(state.owed + delta * TICK_RATE * options.speed, MAX_TICKS)
      while (state.owed >= 1) {
        state.owed--
        const controls = input.read()
        state.steer = controls.steer
        session.tick(controls)
      }
    }
    const alpha = alphaOf()
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
        phase: session.phase,
        since: from ? session.replayTime - from.time : 0,
        handOverIn: session.handOverIn,
        result: session.result,
        tries: session.tries,
        wins: session.wins,
      })
    }
  })

  const alphaOf = () => (session.still ? 1 : clock.current.owed)
  const track: Track = (at, rotation, ball) => {
    sim.car(mine, alphaOf(), at, rotation)
    sim.ball(alphaOf(), ball, turn)
    return { settings: camera, ballCam: clock.current.ballCam }
  }

  return (
    <>
      <Ramps />
      {pads.map((pad, index) => (
        <PadMarker key={index} ref={(group) => void (padGroups.current[index] = group)} at={[pad.pos.x, pad.pos.z]} big={pad.big} />
      ))}
      {cars.map((car, index) => (
        <SimCar key={index} sim={sim} index={index} body={car.body} team={car.team} steer={() => (index === mine ? clock.current.steer : 0)} alpha={alphaOf} />
      ))}
      {from && options.ghost && <Ghost replay={from.replay} car={from.car} session={session} />}
      <group ref={ballRoot}>
        <group scale={ballScale}>
          <primitive object={ballScene} />
        </group>
      </group>
      <Follow track={track} />
    </>
  )
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
      <Flame ref={flame} />
    </group>
  )
}

function Flame({ ref }: { ref: React.Ref<Group> }) {
  return (
    <group ref={ref} position={[0.1388 - 0.59, 0.22, 0]} rotation-z={Math.PI / 2}>
      <mesh position-y={0.28}>
        <coneGeometry args={[0.11, 0.56, 16, 1, true]} />
        <meshBasicMaterial color="#ff7a1a" transparent opacity={0.55} blending={AdditiveBlending} depthWrite={false} />
      </mesh>
    </group>
  )
}

/** Your car as it went in the match, see-through, from the hand-over on. */
function Ghost({ replay, car, session }: { replay: Replay; car: number; session: Session }) {
  const data = replay.cars[car]
  const { model } = useCarModel(data.body, data.team)
  const root = useRef<Group>(null)
  useMemo(
    () =>
      model.traverse((part) => {
        const mesh = part as Mesh
        if (!mesh.isMesh) return
        const material = mesh.material as MeshStandardMaterial
        material.transparent = true
        material.opacity = 0.28
        material.depthWrite = false
        mesh.castShadow = false
      }),
    [model],
  )

  useFrame(() => {
    const group = root.current
    if (!group) return
    const shown = session.phase === "replay" || session.phase === "yours"
    group.visible = shown && poseAt(data, replay.times, momentAt(replay.times, session.replayTime), group.position, group.quaternion)
  })

  return (
    <group ref={root}>
      <primitive object={model} />
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
