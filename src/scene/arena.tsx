import { Environment, Lightformer } from "@react-three/drei"
import { Canvas } from "@react-three/fiber"
import { Suspense, type ReactNode } from "react"
import { Pitch } from "./pitch"
import { Stadium } from "./stadium"

/** The lit stadium and pitch, with whatever goes on it as children. */
export function Arena({ children, onMissed }: { children: ReactNode; onMissed?: () => void }) {
  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ position: [-58, 34, 0], fov: 60, near: 0.1, far: 2000 }}
      gl={{ antialias: true, preserveDrawingBuffer: true }}
      onPointerMissed={onMissed}
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
      <Suspense fallback={null}>
        <Stadium />
        <Pitch />
      </Suspense>
      {children}
    </Canvas>
  )
}
