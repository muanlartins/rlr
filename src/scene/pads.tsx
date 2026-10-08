import { useFrame } from "@react-three/fiber"
import { useRef } from "react"
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
      if (!group) return
      const up = available(pad, playback.time)
      const [base, orb] = group.children
      if (orb) orb.visible = up
      ;(base as unknown as { material: { opacity: number } }).material.opacity = up ? 0.9 : 0.2
    })
  })

  return (
    <group>
      {replay.pads.map((pad, index) => (
        <group key={index} ref={(group) => void (pads.current[index] = group)} position={[pad.pos[0], 0.02, pad.pos[2]]}>
          <mesh rotation-x={-Math.PI / 2}>
            <circleGeometry args={[pad.big ? 1.6 : 0.8, 32]} />
            <meshBasicMaterial color={BOOST} transparent opacity={0.9} blending={AdditiveBlending} depthWrite={false} />
          </mesh>
          {pad.big && (
            <mesh position-y={1}>
              <sphereGeometry args={[0.55, 24, 16]} />
              <meshStandardMaterial color={BOOST} emissive={BOOST} emissiveIntensity={1.5} />
            </mesh>
          )}
        </group>
      ))}
    </group>
  )
}

function available(pad: Pad, time: number) {
  let taken = 0
  while (taken < pad.taken.length && pad.taken[taken] <= time) taken++
  return taken % 2 === 0
}
