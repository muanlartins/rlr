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

/** Drives the camera for the chosen view. */
export function Cameras({ view, replay, playback }: { view: View; replay: Replay; playback: Playback }) {
  const camera = useThree((state) => state.camera) as PerspectiveCamera
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null)
  const aim = useRef(new Vector3())

  useEffect(() => {
    if (view.kind === "overhead") {
      camera.position.set(0, 140, 0.01)
      camera.fov = 45
    } else if (view.kind === "free") {
      camera.position.set(-58, 34, 0)
      camera.fov = 60
      controls.current?.target.set(0, 0, 0)
    }
    camera.updateProjectionMatrix()
  }, [view, camera])

  useFrame((_, delta) => {
    if (view.kind !== "player") return
    const player = replay.cars[view.car]
    const moment = momentAt(replay.times, playback.time)
    if (!poseAt(player, replay.times, moment, car, rotation)) return
    poseAt(replay.ball, replay.times, moment, ball, spin)
    const settings = player.camera ?? DEFAULT_CAMERA
    const ballCam = view.ballCam === "theirs" ? (player.flags[moment.frame] & BALL_CAM) !== 0 : view.ballCam === "on"

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

  if (view.kind === "player") return null
  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enableRotate={view.kind === "free"}
      target={[0, 0, 0]}
      maxDistance={300}
      minDistance={3}
    />
  )
}
