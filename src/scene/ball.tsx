import { Line, useGLTF } from "@react-three/drei"
import { useFrame } from "@react-three/fiber"
import { useMemo, useRef, type ComponentRef } from "react"
import { Box3, Quaternion, Vector3, type Group } from "three"
import type { Playback } from "../playback"
import type { Replay } from "../replay/model"
import { momentAt, poseAt } from "../replay/sample"
import { BALL_RADIUS } from "./field"

const MODEL = `${import.meta.env.BASE_URL}models/ball.glb`
/** The trail shows where the ball was over this many seconds, sampled this many times. */
const TRAIL = { seconds: 0.5, samples: 24 }

const point = new Vector3()
const ignored = new Quaternion()

/**
 * The ball, with a trail of where it has just been. The trail is read from
 * the replay rather than remembered, so it stays right while scrubbing.
 */
export function Ball({ replay, playback }: { replay: Replay; playback: Playback }) {
  const { scene } = useGLTF(MODEL)
  const scale = useMemo(() => BALL_RADIUS / (new Box3().setFromObject(scene).getSize(new Vector3()).x / 2), [scene])
  const root = useRef<Group>(null)
  const trail = useRef<ComponentRef<typeof Line>>(null)
  const points = useMemo(() => new Float32Array(TRAIL.samples * 3), [])

  useFrame(() => {
    const group = root.current
    if (!group) return
    const { times, ball } = replay
    group.visible = poseAt(ball, times, momentAt(times, playback.time), group.position, group.quaternion)
    for (let i = 0; i < TRAIL.samples; i++) {
      const time = playback.time - (TRAIL.seconds * (TRAIL.samples - 1 - i)) / (TRAIL.samples - 1)
      if (!poseAt(ball, times, momentAt(times, time), point, ignored)) point.copy(group.position)
      point.toArray(points, i * 3)
    }
    trail.current?.geometry.setPositions(points)
  })

  return (
    <>
      <group ref={root}>
        <primitive object={scene} scale={scale} />
      </group>
      <Line
        ref={trail}
        points={Array.from({ length: TRAIL.samples }, () => [0, 0, 0] as [number, number, number])}
        vertexColors={Array.from({ length: TRAIL.samples }, (_, i) => [0.79, 0.84, 1, i / TRAIL.samples] as never)}
        transparent
        lineWidth={6}
        worldUnits={false}
      />
    </>
  )
}

useGLTF.preload(MODEL)
