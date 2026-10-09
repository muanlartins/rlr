import { OrbitControls } from "@react-three/drei"
import { useFrame, useThree } from "@react-three/fiber"
import { useEffect, useRef, type ComponentRef } from "react"
import { MathUtils, Quaternion, Vector3, type PerspectiveCamera } from "three"
import type { Playback } from "../playback"
import { BALL_CAM, UU, type CameraSettings, type Replay } from "../replay/model"
import { momentAt, poseAt } from "../replay/sample"

export type View =
  | { kind: "free" }
  | { kind: "overhead" }
  /** Behind a player's car, with their own camera settings. Ball cam follows what they used unless forced. */
  | { kind: "player"; car: number; ballCam: "theirs" | "on" | "off" }

/** The game's default camera, for players whose replay doesn't carry theirs. */
const DEFAULT_CAMERA: CameraSettings = { fov: 110, height: 100, angle: -4, distance: 270, stiffness: 0.5, swivel: 5 }

const car = new Vector3()
const ball = new Vector3()
const rotation = new Quaternion()
const spin = new Quaternion()
const ahead = new Vector3()
const goal = new Vector3()
const look = new Vector3()
const up = new Vector3(0, 1, 0)

/**
 * Where the followed car and the ball are, written into `car`, `rotation`
 * and `ball` each frame, and how that car's camera is set: its settings (the
 * game's default when missing) and whether ball cam is on. Nothing while the
 * car isn't on the pitch.
 */
export type Track = (car: Vector3, rotation: Quaternion, ball: Vector3) => { settings?: CameraSettings; ballCam: boolean } | undefined

/** Drives the camera for the chosen view. */
export function Cameras({ view, replay, playback }: { view: View; replay: Replay; playback: Playback }) {
  if (view.kind === "free" || view.kind === "overhead") return <Orbit overhead={view.kind === "overhead"} />
  const player = replay.cars[view.car]
  const track: Track = (car, rotation, ball) => {
    const moment = momentAt(replay.times, playback.time)
    if (!poseAt(player, replay.times, moment, car, rotation)) return undefined
    poseAt(replay.ball, replay.times, moment, ball, spin)
    return { settings: player.camera, ballCam: view.ballCam === "theirs" ? (player.flags[moment.frame] & BALL_CAM) !== 0 : view.ballCam === "on" }
  }
  return <Follow track={track} />
}

/**
 * The free camera (drag to orbit, scroll to zoom) or, `overhead`, the view
 * straight down. `still` stops dragging from moving it, for when the mouse
 * is busy drawing.
 */
export function Orbit({ overhead, still }: { overhead: boolean; still?: boolean }) {
  const camera = useThree((state) => state.camera) as PerspectiveCamera
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null)

  useEffect(() => {
    if (overhead) {
      camera.position.set(0, 140, 0.01)
      camera.fov = 45
    } else {
      camera.position.set(-58, 34, 0)
      camera.fov = 60
    }
    controls.current?.target.set(0, 0, 0)
    camera.updateProjectionMatrix()
  }, [overhead, camera])

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enableRotate={!overhead && !still}
      enablePan={!still}
      target={[0, 0, 0]}
      maxDistance={300}
      minDistance={3}
    />
  )
}

/** Behind a car, with its player's camera settings, like the game. */
export function Follow({ track }: { track: Track }) {
  const camera = useThree((state) => state.camera) as PerspectiveCamera
  const aim = useRef(new Vector3())

  useFrame((_, delta) => {
    const followed = track(car, rotation, ball)
    if (!followed) return
    const settings = followed.settings ?? DEFAULT_CAMERA
    const { ballCam } = followed

    // Ball cam looks from behind the car towards the ball; car cam along the car's heading.
    if (ballCam) ahead.subVectors(ball, car)
    else ahead.set(1, 0, 0).applyQuaternion(rotation)
    ahead.y = 0
    if (ahead.lengthSq() < 1e-6) ahead.set(0, 0, 1)
    ahead.normalize()

    goal.copy(car).addScaledVector(ahead, -settings.distance * UU).addScaledVector(up, settings.height * UU)
    goal.y = Math.max(goal.y, 0.3)
    const follow = 1 - Math.exp(-(4 + settings.stiffness * 20) * delta)
    camera.position.lerp(goal, follow)
    look.copy(car).addScaledVector(ahead, 3).addScaledVector(up, Math.tan(MathUtils.degToRad(-settings.angle)) * 3)
    if (ballCam) look.lerp(ball, 0.5)
    aim.current.lerp(look, 1 - Math.exp(-settings.swivel * 2 * delta))
    camera.lookAt(aim.current)
    // The game's field of view is horizontal; three's is vertical.
    const fov = MathUtils.radToDeg(2 * Math.atan(Math.tan(MathUtils.degToRad(settings.fov) / 2) / camera.aspect))
    if (Math.abs(camera.fov - fov) > 0.01) {
      camera.fov = fov
      camera.updateProjectionMatrix()
    }
  })

  return null
}
