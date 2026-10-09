import { useGLTF } from "@react-three/drei"
import { useFrame } from "@react-three/fiber"
import { useMemo, useRef } from "react"
import { AdditiveBlending, Box3, Group, Vector3, type Mesh, type MeshStandardMaterial, type Object3D } from "three"
import type { Body, Car as CarData, Replay } from "../replay/model"
import { BOOSTING } from "../replay/model"
import { momentAt, poseAt } from "../replay/sample"
import type { Playback } from "../playback"
import { TEAMS } from "./field"

const MODELS: Record<Body, string> = {
  octane: `${import.meta.env.BASE_URL}models/octane.glb`,
  fennec: `${import.meta.env.BASE_URL}models/fennec.glb`,
}

/**
 * Where the model sits on the replay's car position (the centre of mass):
 * the Octane hitbox (which the Fennec shares) is 1.18 m long and centred
 * 0.14 m ahead of it, and its wheels touch the floor 0.17 m below it.
 */
const LENGTH = 1.18
const AHEAD = 0.1388
export const RIDE = 0.1701
const WHEEL_RADIUS = 0.17
/** How far the front wheels turn at full lock, in radians. */
const LOCK = 0.45

const forward = new Vector3()
const velocity = new Vector3()

/** A player's car: its body painted in the team colour, wheels that roll and steer, and a boost flame. */
export function Car({ car, replay, playback }: { car: CarData; replay: Replay; playback: Playback }) {
  const { model, wheels } = useCarModel(car.body, car.team)
  const root = useRef<Group>(null)
  const flame = useRef<Group>(null)
  const roll = useRef(0)

  useFrame((_, delta) => {
    const group = root.current
    if (!group) return
    const moment = momentAt(replay.times, playback.time)
    group.visible = poseAt(car, replay.times, moment, group.position, group.quaternion)
    if (!group.visible) return
    const { frame } = moment
    if (flame.current) {
      flame.current.visible = (car.flags[frame] & BOOSTING) !== 0
      flame.current.scale.y = 0.85 + Math.random() * 0.3
    }
    forward.set(1, 0, 0).applyQuaternion(group.quaternion)
    velocity.fromArray(car.vel, frame * 3)
    const step = playback.playing ? delta * playback.speed : 0
    roll.current -= (velocity.dot(forward) / WHEEL_RADIUS) * step
    for (const wheel of wheels) {
      wheel.spin.rotation.z = roll.current
      if (wheel.front) wheel.steer.rotation.y = -car.steer[frame] * LOCK
    }
  })

  return (
    <group ref={root}>
      <primitive object={model} />
      <group ref={flame} position={[AHEAD - LENGTH / 2, 0.22, 0]} rotation-z={Math.PI / 2}>
        <mesh position-y={0.28}>
          <coneGeometry args={[0.11, 0.56, 16, 1, true]} />
          <meshBasicMaterial color="#ff7a1a" transparent opacity={0.55} blending={AdditiveBlending} depthWrite={false} />
        </mesh>
        <mesh position-y={0.16}>
          <coneGeometry args={[0.06, 0.32, 12, 1, true]} />
          <meshBasicMaterial color="#fff1b8" transparent opacity={0.9} blending={AdditiveBlending} depthWrite={false} />
        </mesh>
      </group>
    </group>
  )
}

/** A copy of a body's model of its own, painted for `team`, its wheels free to turn. */
export function useCarModel(body: Body, team: 0 | 1) {
  const { scene } = useGLTF(MODELS[body])
  return useMemo(() => build(scene, team), [scene, team])
}

interface Wheel {
  steer: Group
  spin: Group
  front: boolean
}

/**
 * A copy of the car model for one player: scaled and placed on the car's
 * centre of mass, painted in the team colour, with each wheel hung on a
 * steering pivot and a spinning one.
 */
function build(scene: Object3D, team: 0 | 1) {
  const car = scene.clone(true)
  const box = new Box3().setFromObject(car)
  const size = box.getSize(new Vector3())
  const centre = box.getCenter(new Vector3())
  const scale = LENGTH / size.x
  const model = new Group()
  model.scale.setScalar(scale)
  model.position.set(AHEAD - centre.x * scale, -RIDE - box.min.y * scale, -centre.z * scale)
  model.add(car)

  car.traverse((part) => {
    const mesh = part as Mesh
    if (!mesh.isMesh) return
    const material = (mesh.material as MeshStandardMaterial).clone()
    if (/Body/.test(material.name)) material.color.set(TEAMS[team].color)
    if (material.name === "Paint") material.color.set(TEAMS[team].deep)
    mesh.material = material
    mesh.castShadow = true
  })

  const wheels: Wheel[] = []
  const axles: Object3D[] = []
  car.traverse((part) => /- (FR|FL|BR|BL) \(/.test(part.name) && axles.push(part))
  car.updateMatrixWorld(true)
  for (const axle of axles) {
    const steer = new Group()
    const spin = new Group()
    axle.parent!.add(steer)
    axle.getWorldPosition(steer.position)
    steer.parent!.worldToLocal(steer.position)
    steer.add(spin)
    spin.attach(axle)
    wheels.push({ steer, spin, front: /- F[RL] \(/.test(axle.name) })
  }
  return { model, wheels }
}

for (const url of Object.values(MODELS)) useGLTF.preload(url)
