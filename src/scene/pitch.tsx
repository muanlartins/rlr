import { Line } from "@react-three/drei"
import { useMemo } from "react"
import { CanvasTexture, DoubleSide, Shape, SRGBColorSpace } from "three"
import { BACK, CEILING, GOAL, OUTLINE, SIDE, TEAMS } from "./field"

/**
 * Our own pitch, drawn to the game's exact measurements so the ball meets the
 * walls where the replay says it does: a striped floor with its markings,
 * glass walls traced by light, and the two goals.
 */
export function Pitch() {
  const floor = useMemo(() => new Shape(OUTLINE.map(([x, z]) => ({ x, y: -z }) as never)), [])
  const markings = useMemo(drawMarkings, [])

  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <shapeGeometry args={[floor]} />
        <meshStandardMaterial map={markings} roughness={0.85} metalness={0.05} />
      </mesh>
      <Walls />
      <Goal team={0} />
      <Goal team={1} />
    </group>
  )
}

/** Glass on every side, open where the goals are, with light along its edges. */
function Walls() {
  const panels = useMemo(() => {
    const result: { from: [number, number]; to: [number, number]; bottom: number }[] = []
    OUTLINE.forEach((from, index) => {
      const to = OUTLINE[(index + 1) % OUTLINE.length]
      const backWall = Math.abs(from[1]) === BACK && from[1] === to[1]
      if (!backWall) return result.push({ from, to, bottom: 0 })
      const z = from[1]
      const [left, right] = from[0] < to[0] ? [from, to] : [to, from]
      result.push({ from: left, to: [-GOAL.halfWidth, z], bottom: 0 })
      result.push({ from: [GOAL.halfWidth, z], to: right, bottom: 0 })
      result.push({ from: [-GOAL.halfWidth, z], to: [GOAL.halfWidth, z], bottom: GOAL.height })
    })
    return result
  }, [])

  const ring = (y: number) => [...OUTLINE, OUTLINE[0]].map(([x, z]) => [x, y, z] as [number, number, number])

  return (
    <group>
      {panels.map(({ from, to, bottom }, index) => {
        const length = Math.hypot(to[0] - from[0], to[1] - from[1])
        const height = CEILING - bottom
        return (
          <mesh
            key={index}
            position={[(from[0] + to[0]) / 2, bottom + height / 2, (from[1] + to[1]) / 2]}
            rotation-y={-Math.atan2(to[1] - from[1], to[0] - from[0])}
          >
            <planeGeometry args={[length, height]} />
            <meshPhysicalMaterial color="#9fb6ff" transparent opacity={0.05} roughness={0.1} side={DoubleSide} depthWrite={false} />
          </mesh>
        )
      })}
      <Line points={ring(0.02)} color="#85a7ff" lineWidth={2} />
      <Line points={ring(CEILING)} color="#85a7ff" lineWidth={1} transparent opacity={0.35} />
      {OUTLINE.map(([x, z], index) => (
        <Line key={index} points={[[x, 0, z], [x, CEILING, z]]} color="#85a7ff" lineWidth={1} transparent opacity={0.35} />
      ))}
    </group>
  )
}

/** A goal behind Blue's back wall (team 0) or Orange's. */
function Goal({ team }: { team: 0 | 1 }) {
  const { color } = TEAMS[team]
  const side = team === 0 ? -1 : 1
  const { halfWidth: w, height: h, depth } = GOAL
  const mouth = side * BACK
  const back = side * (BACK + depth)
  const frame: [number, number, number][] = [
    [-w, 0, mouth], [-w, h, mouth], [w, h, mouth], [w, 0, mouth],
  ]
  const box: [number, number, number][] = [
    [-w, h, mouth], [-w, h, back], [w, h, back], [w, h, mouth], [w, h, back], [w, 0, back], [-w, 0, back], [-w, h, back],
  ]
  return (
    <group>
      <mesh position={[0, 0.005, side * (BACK + depth / 2)]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[w * 2, depth]} />
        <meshStandardMaterial color={TEAMS[team].deep} roughness={0.9} />
      </mesh>
      {[
        { position: [0, h / 2, back], rotation: [0, 0, 0], size: [w * 2, h] },
        { position: [0, h, side * (BACK + depth / 2)], rotation: [Math.PI / 2, 0, 0], size: [w * 2, depth] },
        { position: [-w, h / 2, side * (BACK + depth / 2)], rotation: [0, Math.PI / 2, 0], size: [depth, h] },
        { position: [w, h / 2, side * (BACK + depth / 2)], rotation: [0, Math.PI / 2, 0], size: [depth, h] },
      ].map(({ position, rotation, size }, index) => (
        <mesh key={index} position={position as never} rotation={rotation as never}>
          <planeGeometry args={size as never} />
          <meshBasicMaterial color={color} transparent opacity={0.12} side={DoubleSide} depthWrite={false} />
        </mesh>
      ))}
      <Line points={frame} color={color} lineWidth={4} />
      <Line points={box} color={color} lineWidth={1.5} transparent opacity={0.7} />
      <Line points={[[-w, 0.03, mouth], [w, 0.03, mouth]]} color={color} lineWidth={3} />
    </group>
  )
}

/**
 * The floor's paint, drawn on a canvas that spans the pitch: mown stripes,
 * each half washed in its team's colour, and the lines.
 */
function drawMarkings() {
  const scale = 20 // pixels per metre
  const [width, height] = [SIDE * 2 * scale, BACK * 2 * scale]
  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const g = canvas.getContext("2d")!
  const px = (metres: number) => metres * scale
  // Canvas y runs from Blue's end (top) to Orange's (bottom).
  const at = (x: number, z: number) => [px(x + SIDE), px(z + BACK)] as const

  g.fillStyle = "#0e1a3a"
  g.fillRect(0, 0, width, height)
  const stripes = 14
  for (let i = 0; i < stripes; i++) {
    if (i % 2) continue
    g.fillStyle = "#11204a"
    g.fillRect(0, (height / stripes) * i, width, height / stripes)
  }
  for (const [team, from, to] of [[0, 0, height / 2], [1, height, height / 2]] as const) {
    const wash = g.createLinearGradient(0, from, 0, to)
    wash.addColorStop(0, `${TEAMS[team].color}40`)
    wash.addColorStop(1, `${TEAMS[team].color}00`)
    g.fillStyle = wash
    g.fillRect(0, Math.min(from, to), width, height / 2)
  }

  g.strokeStyle = "rgba(220, 230, 255, 0.55)"
  g.lineWidth = px(0.25)
  const line = (points: [number, number][]) => {
    g.beginPath()
    points.forEach(([x, z], index) => (index ? g.lineTo(...at(x, z)) : g.moveTo(...at(x, z))))
    g.stroke()
  }
  line([[-SIDE, 0], [SIDE, 0]])
  g.beginPath()
  g.arc(...at(0, 0), px(9.5), 0, Math.PI * 2)
  g.stroke()
  g.beginPath()
  g.arc(...at(0, 0), px(0.6), 0, Math.PI * 2)
  g.fillStyle = "rgba(220, 230, 255, 0.55)"
  g.fill()
  for (const side of [-1, 1]) {
    const z = side * BACK
    line([[-GOAL.halfWidth - 6, z], [-GOAL.halfWidth - 6, z - side * 12], [GOAL.halfWidth + 6, z - side * 12], [GOAL.halfWidth + 6, z]])
    line([[-GOAL.halfWidth - 14, z], [-GOAL.halfWidth - 14, z - side * 22], [GOAL.halfWidth + 14, z - side * 22], [GOAL.halfWidth + 14, z]])
  }

  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.anisotropy = 8
  // The floor's UVs are its own x and -z in metres; fit the canvas over them.
  texture.repeat.set(1 / (SIDE * 2), 1 / (BACK * 2))
  texture.offset.set(0.5, 0.5)
  return texture
}
