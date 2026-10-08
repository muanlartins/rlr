import { useGLTF } from "@react-three/drei"
import { useMemo } from "react"
import { Color, MeshStandardMaterial, type Mesh } from "three"

const MODEL = `${import.meta.env.BASE_URL}models/stadium.glb`

/**
 * Fits the model's own (inexact) pitch around ours: its glass matches our
 * side walls, it runs along x where ours runs along z, and its floor sits at
 * 0.19 model units.
 */
const SCALE = 22.26
const FLOOR = 0.19

/** Our look for each of the model's materials, by name prefix; the first match wins. */
const PAINT: [prefix: string, look: { color: string; glow?: number; metal?: number; rough?: number }][] = [
  ["blueBanner", { color: "#2f6bff", glow: 1.4 }],
  ["blue_Glow", { color: "#2f6bff", glow: 2 }],
  ["orangeGlow", { color: "#ff8a1f", glow: 2 }],
  ["rl_curve2_glow", { color: "#85a7ff", glow: 2.5 }],
  ["win_glow", { color: "#85a7ff", glow: 2.5 }],
  ["glow", { color: "#85a7ff", glow: 2 }],
  ["lightRank04", { color: "#85a7ff", glow: 1.5 }],
  ["lightRank01", { color: "#03060f", rough: 1 }],
  ["entry_GlowHolder", { color: "#16224a", glow: 0.15, metal: 0.4 }],
  ["playarea_Boundary", { color: "#1a2a5c", metal: 0.5, rough: 0.4 }],
  ["play_ring02", { color: "#0d1633", metal: 0.3, rough: 0.6 }],
  ["shield", { color: "#1c2b66", metal: 0.6, rough: 0.35 }],
  ["rl_curve2", { color: "#24357a", metal: 0.6, rough: 0.35 }],
  ["Side", { color: "#0a1129", rough: 0.8 }],
  ["split", { color: "#132050", metal: 0.4, rough: 0.5 }],
  ["nuke", { color: "#0b132e", metal: 0.3, rough: 0.7 }],
  ["fut", { color: "#101a3d", metal: 0.3, rough: 0.6 }],
  ["", { color: "#0c1430", rough: 0.8 }],
]

/** The stands, screens and towers around the pitch, repainted in our colours. */
export function Stadium() {
  const { scene } = useGLTF(MODEL)
  useMemo(() => {
    scene.traverse((part) => {
      const mesh = part as Mesh
      if (!mesh.isMesh) return
      const name = (mesh.material as MeshStandardMaterial).name
      const [, look] = PAINT.find(([prefix]) => name.startsWith(prefix))!
      mesh.material = new MeshStandardMaterial({
        name,
        color: look.color,
        emissive: look.glow ? new Color(look.color) : undefined,
        emissiveIntensity: look.glow ?? 0,
        metalness: look.metal ?? 0.1,
        roughness: look.rough ?? 0.7,
      })
      mesh.receiveShadow = true
    })
  }, [scene])

  return <primitive object={scene} scale={SCALE} rotation-y={Math.PI / 2} position-y={-FLOOR * SCALE} />
}

useGLTF.preload(MODEL)
