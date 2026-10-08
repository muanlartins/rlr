import { Environment, Lightformer } from "@react-three/drei"
import { Canvas, useFrame } from "@react-three/fiber"
import { Suspense } from "react"
import type { Playback } from "../playback"
import type { Replay } from "../replay/model"
import { Ball } from "./ball"
import { Cameras, type View } from "./cameras"
import { Car } from "./car"
import { Pads } from "./pads"
import { Pitch } from "./pitch"
import { Stadium } from "./stadium"

/** The 3D view of a replay at the playhead. */
export function Scene({ replay, playback, view }: { replay: Replay; playback: Playback; view: View }) {
  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ position: [-58, 34, 0], fov: 60, near: 0.1, far: 2000 }}
      gl={{ antialias: true, preserveDrawingBuffer: true }}
    >
      <color attach="background" args={["#050a1a"]} />
      <fog attach="fog" args={["#050a1a", 180, 650]} />
      <hemisphereLight args={["#c9d6ff", "#0b1430", 0.6]} />
      <directionalLight position={[40, 80, 20]} intensity={1.6} castShadow shadow-mapSize={[2048, 2048]}>
        <orthographicCamera attach="shadow-camera" args={[-70, 70, 70, -70, 1, 200]} />
      </directionalLight>
      <Environment resolution={256}>
        <Lightformer form="rect" intensity={2} position={[0, 30, 0]} rotation-x={Math.PI / 2} scale={[80, 100, 1]} />
        <Lightformer form="rect" color="#85a7ff" intensity={1.5} position={[-60, 10, 0]} rotation-y={Math.PI / 2} scale={[100, 10, 1]} />
        <Lightformer form="rect" color="#ffb067" intensity={1} position={[60, 10, 0]} rotation-y={-Math.PI / 2} scale={[100, 10, 1]} />
      </Environment>
      <Clock playback={playback} />
      <Suspense fallback={null}>
        <Stadium />
        <Pitch />
        <Pads replay={replay} playback={playback} />
        <Ball replay={replay} playback={playback} />
        {replay.cars.map((car) => (
          <Car key={car.id} car={car} replay={replay} playback={playback} />
        ))}
      </Suspense>
      <Cameras view={view} replay={replay} playback={playback} />
    </Canvas>
  )
}

/** Moves the playhead with real time, before anything reads it this frame. */
function Clock({ playback }: { playback: Playback }) {
  useFrame((_, delta) => playback.advance(Math.min(delta, 0.1)), -1)
  return null
}
