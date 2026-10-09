import { useFrame, type ThreeEvent } from "@react-three/fiber"
import { useRef, type Ref } from "react"
import { AdditiveBlending, type Group } from "three"
import type { Playback } from "../playback"
import type { Pad, Replay } from "../replay/model"

const BOOST = "#ffb02e"

/** The 34 boost pads, dimmed while taken. */
export function Pads({ replay, playback }: { replay: Replay; playback: Playback }) {
  const pads = useRef<(Group | null)[]>([])

  useFrame(() => {
    replay.pads.forEach((pad, index) => {
      const group = pads.current[index]
      if (group) show(group, available(pad, playback.time))
    })
  })

  return (
    <group>
      {replay.pads.map((pad, index) => (
        <PadMarker key={index} ref={(group) => void (pads.current[index] = group)} at={[pad.pos[0], pad.pos[2]]} big={pad.big} />
      ))}
    </group>
  )
}

/** One pad at `at` ([x, z]): a glowing disc, with an orb over it when it's big. */
export function PadMarker({ at, big, up = true, ref, onClick }: { at: [number, number]; big: boolean; up?: boolean; ref?: Ref<Group>; onClick?: (event: ThreeEvent<MouseEvent>) => void }) {
  return (
    <group ref={ref} position={[at[0], 0.02, at[1]]} onClick={onClick}>
      <mesh rotation-x={-Math.PI / 2}>
        <circleGeometry args={[big ? 1.6 : 0.8, 32]} />
        <meshBasicMaterial color={BOOST} transparent opacity={up ? 0.9 : 0.2} blending={AdditiveBlending} depthWrite={false} />
      </mesh>
      {big && (
        <mesh position-y={1} visible={up}>
          <sphereGeometry args={[0.55, 24, 16]} />
          <meshStandardMaterial color={BOOST} emissive={BOOST} emissiveIntensity={1.5} />
        </mesh>
      )}
    </group>
  )
}

/** Shows a pad's group as available or taken, without re-rendering. */
function show(group: Group, up: boolean) {
  const [base, orb] = group.children
  if (orb) orb.visible = up
  ;(base as unknown as { material: { opacity: number } }).material.opacity = up ? 0.9 : 0.2
}

/** Whether a pad is up at `time`. */
export function available(pad: Pad, time: number) {
  let taken = 0
  while (taken < pad.taken.length && pad.taken[taken] <= time) taken++
  return taken % 2 === 0
}
