import { Line, TransformControls, useGLTF } from "@react-three/drei"
import { useThree, type ThreeEvent } from "@react-three/fiber"
import { Suspense, type ComponentRef, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react"
import { Box3, Euler, Object3D, Plane, Raycaster, Shape, Vector2, Vector3 } from "three"
import { useCarModel } from "../scene/car"
import { BACK, BALL_RADIUS, CEILING, GOAL, PADS, SIDE } from "../scene/field"
import { NameTags } from "../scene/name-tags"
import { PadMarker } from "../scene/pads"
import type { Tool } from "../ui/sketch"
import { headingTo, REST, type Board, type Mark, type Piece } from "./model"

const BALL_MODEL = `${import.meta.env.BASE_URL}models/ball.glb`
/** Marks lie just above the floor and its markings. */
const MARK_HEIGHT = 0.06
const SELECTED = "#85a7ff"
type Gizmo = ComponentRef<typeof TransformControls>

export type Selection = string | "ball" | undefined
/** What the handles on the selected piece do: arrows that move it, or rings that turn a car on its own axes. */
export type Handles = "move" | "turn"

interface Props {
  board: Board
  /** Changes the board; `record` makes it a step that undo goes back to. */
  edit: (board: Board, record: boolean) => void
  selected: Selection
  select: (selection: Selection) => void
  tool?: Tool
  ink: string
  tags: RefObject<(HTMLElement | null)[]>
  /** The car the camera follows, whose name isn't shown. */
  riding?: string
  handles: Handles
  /** Set while a handle is held, so letting go over nothing doesn't drop the selection. */
  holding: RefObject<boolean>
}

const raycaster = new Raycaster()
const pointer = new Vector2()
const hit = new Vector3()
const floor = new Plane(new Vector3(0, 1, 0), 0)

/** Keeps a point inside the arena, goals included, and a centre at least `rest` off the floor. */
function inside([x, y, z]: [number, number, number], rest: number): [number, number, number] {
  const depth = Math.abs(x) < GOAL.halfWidth ? BACK + GOAL.depth : BACK
  return [Math.max(-SIDE, Math.min(SIDE, x)), Math.max(rest, Math.min(CEILING - rest, y)), Math.max(-depth, Math.min(depth, z))]
}

/** What's on the board, in the arena: the pieces to drag, the pads to click, the marks, and the drawing surface. */
export function Table({ board, edit, selected, select, tool, ink, tags, riding, handles, holding }: Props) {
  const { camera, gl, get } = useThree()
  const [drawing, setDrawing] = useState<Mark>()
  const gizmo = useRef<Gizmo>(null)

  /** Follows the pointer across `plane` until it's let go, calling `move` with each point (`first` for the first). */
  const drag = (plane: Plane, move: (point: Vector3, first: boolean) => void, end?: () => void) => {
    const controls = get().controls as unknown as { enabled: boolean } | null
    if (controls) controls.enabled = false
    let first = true
    const onMove = (event: PointerEvent) => {
      const box = gl.domElement.getBoundingClientRect()
      pointer.set(((event.clientX - box.left) / box.width) * 2 - 1, -((event.clientY - box.top) / box.height) * 2 + 1)
      raycaster.setFromCamera(pointer, camera)
      if (!raycaster.ray.intersectPlane(plane, hit)) return
      move(hit, first)
      first = false
    }
    const onUp = () => {
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup", onUp)
      if (controls) controls.enabled = true
      end?.()
    }
    window.addEventListener("pointermove", onMove)
    window.addEventListener("pointerup", onUp)
  }

  /**
   * Picks a piece up: across the floor at its own height, or, with Shift,
   * up and down on an upright plane facing the camera.
   */
  const grab = (event: ThreeEvent<PointerEvent>, which: "ball" | Piece) => {
    // A handle under the pointer takes the press (the handles hear it after the pieces do).
    if (tool || holding.current || (gizmo.current as unknown as { axis: string | null } | null)?.axis) return
    event.stopPropagation()
    select(which === "ball" ? "ball" : which.id)
    const start = which === "ball" ? board.ball : which.pos
    const rest = which === "ball" ? REST.ball : REST.car
    const facing = new Vector3().subVectors(camera.position, event.point).setY(0).normalize()
    const plane = event.shiftKey ? new Plane().setFromNormalAndCoplanarPoint(facing, event.point) : new Plane(new Vector3(0, 1, 0), -event.point.y)
    const offset = new Vector3(...start).sub(event.point)
    drag(plane, (point, first) => {
      const moved = point.clone().add(offset)
      const pos = inside(event.shiftKey ? [start[0], moved.y, start[2]] : [moved.x, start[1], moved.z], rest)
      if (which === "ball") edit({ ...board, ball: pos }, first)
      else edit({ ...board, cars: board.cars.map((car) => (car.id === which.id ? { ...car, pos } : car)) }, first)
    })
  }

  /** Draws a mark across the floor with the picked tool. */
  const draw = (event: ThreeEvent<PointerEvent>) => {
    if (!tool) return
    event.stopPropagation()
    let mark: Mark = { tool, color: ink, points: [[event.point.x, event.point.z]] }
    setDrawing(mark)
    drag(
      floor,
      (point) => {
        const last = mark.points[mark.points.length - 1]
        if (tool === "pen" && Math.hypot(point.x - last[0], point.z - last[1]) < 0.3) return
        mark = { ...mark, points: tool === "pen" ? [...mark.points, [point.x, point.z]] : [mark.points[0], [point.x, point.z]] }
        setDrawing(mark)
      },
      () => {
        setDrawing(undefined)
        if (mark.points.length > 1) edit({ ...board, marks: [...board.marks, mark] }, true)
      },
    )
  }

  return (
    <>
      <mesh rotation-x={-Math.PI / 2} position-y={0.01} visible={false} onPointerDown={draw}>
        <planeGeometry args={[4 * SIDE, 4 * BACK]} />
      </mesh>
      {PADS.map((pad, index) => (
        <PadMarker
          key={index}
          at={pad.pos}
          big={pad.big}
          up={!board.taken[index]}
          onClick={(event) => {
            if (tool || event.delta > 4) return
            event.stopPropagation()
            edit({ ...board, taken: board.taken.map((taken, other) => (other === index ? !taken : taken)) }, true)
          }}
        />
      ))}
      {[...board.marks, ...(drawing ? [drawing] : [])].map((mark, index) => (
        <MarkShape key={index} mark={mark} />
      ))}
      <Suspense fallback={null}>
        {board.cars.map((car) => (
          <CarPiece key={car.id} car={car} selected={selected === car.id} onGrab={(event) => grab(event, car)} />
        ))}
        <BallPiece at={board.ball} selected={selected === "ball"} onGrab={(event) => grab(event, "ball")} />
      </Suspense>
      {!tool && selected && <Handles gizmo={gizmo} board={board} edit={edit} selected={selected} handles={handles} holding={holding} />}
      <NameTags tags={tags} place={(index, point) => !!board.cars[index] && board.cars[index].id !== riding && !!point.fromArray(board.cars[index].pos)} />
    </>
  )
}

const euler = new Euler(0, 0, 0, "YZX")

/**
 * Blender-style handles on the selected piece: arrows (and squares, for two
 * axes at once) along the arena's own directions to move it, Y being up; or
 * rings around a car's own axes to turn it: around its roof (heading), its
 * side (nose up or down) and its length (roll). They hold an unseen stand-in
 * that the board is read back from as it moves, kept inside the arena.
 */
function Handles({ gizmo, board, edit, selected, handles, holding }: Pick<Props, "board" | "edit" | "handles" | "holding"> & { selected: string; gizmo: RefObject<Gizmo | null> }) {
  const [proxy] = useState(() => {
    const object = new Object3D()
    object.rotation.order = "YZX"
    return object
  })
  const first = useRef(true)
  const car = board.cars.find((other) => other.id === selected)
  const ball = selected === "ball"

  // The stand-in follows the piece, except while it's the one being moved.
  useLayoutEffect(() => {
    if (holding.current) return
    if (car) {
      proxy.position.fromArray(car.pos)
      proxy.rotation.set(car.rot[2], car.rot[0], car.rot[1])
    } else if (ball) {
      proxy.position.fromArray(board.ball)
      proxy.rotation.set(0, 0, 0)
    }
    proxy.updateMatrixWorld()
  })

  if (!car && !ball) return null
  const turning = handles === "turn" && !!car
  const change = () => {
    const pos = inside(proxy.position.toArray() as [number, number, number], ball ? REST.ball : REST.car)
    proxy.position.fromArray(pos)
    if (ball) edit({ ...board, ball: pos }, first.current)
    else {
      const rot: Piece["rot"] = [proxy.rotation.y, proxy.rotation.z, proxy.rotation.x]
      edit({ ...board, cars: board.cars.map((other) => (other.id === selected ? { ...other, pos, rot } : other)) }, first.current)
    }
    first.current = false
  }
  return (
    <>
      <primitive object={proxy} />
      <TransformControls
        ref={gizmo}
        object={proxy}
        mode={turning ? "rotate" : "translate"}
        space={turning ? "local" : "world"}
        size={0.9}
        onMouseDown={() => {
          holding.current = true
          first.current = true
        }}
        onMouseUp={() => {
          // The click that ends the drag comes after this; let it pass first.
          setTimeout(() => (holding.current = false), 0)
        }}
        onObjectChange={change}
      />
    </>
  )
}

function CarPiece({ car, selected, onGrab }: { car: Piece; selected: boolean; onGrab: (event: ThreeEvent<PointerEvent>) => void }) {
  const { model } = useCarModel(car.body, car.team)
  const [heading, nose, roll] = car.rot
  const rotation = useMemo(() => euler.set(roll, heading, nose).clone(), [heading, nose, roll])

  return (
    <group position={car.pos}>
      <group rotation={rotation} onPointerDown={onGrab} onClick={(event) => event.stopPropagation()}>
        <primitive object={model} />
        <Grip radius={1.5} />
      </group>
      <Footing y={car.pos[1]} rest={REST.car} radius={0.9} selected={selected} />
    </group>
  )
}

function BallPiece({ at, selected, onGrab }: { at: [number, number, number]; selected: boolean; onGrab: (event: ThreeEvent<PointerEvent>) => void }) {
  const { scene } = useGLTF(BALL_MODEL)
  const { ball, scale } = useMemo(() => ({ ball: scene.clone(true), scale: BALL_RADIUS / (new Box3().setFromObject(scene).getSize(new Vector3()).x / 2) }), [scene])
  return (
    <group position={at}>
      <group onPointerDown={onGrab} onClick={(event) => event.stopPropagation()}>
        <group scale={scale}>
          <primitive object={ball} />
        </group>
        <Grip radius={1.8} />
      </group>
      <Footing y={at[1]} rest={REST.ball} radius={BALL_RADIUS} selected={selected} />
    </group>
  )
}

/** An unseen sphere around a piece, so it can be picked up from across the pitch. */
function Grip({ radius }: { radius: number }) {
  return (
    <mesh>
      <sphereGeometry args={[radius, 12, 8]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
    </mesh>
  )
}

/**
 * Where a piece stands, drawn from its centre `y` above the floor: a ring on
 * the floor under it, and, once it's off the floor, a line down to it, so
 * heights read from any angle.
 */
function Footing({ y, rest, radius, selected }: { y: number; rest: number; radius: number; selected: boolean }) {
  const lifted = y - rest > 0.3
  if (!selected && !lifted) return null
  const color = selected ? SELECTED : "#ffffff"
  return (
    <group position-y={-y}>
      {lifted && <Line points={[[0, MARK_HEIGHT, 0], [0, y, 0]]} color={color} lineWidth={1.5} dashed dashSize={0.4} gapSize={0.3} transparent opacity={0.7} />}
      <mesh rotation-x={-Math.PI / 2} position-y={MARK_HEIGHT}>
        <ringGeometry args={[radius, radius + 0.15, 40]} />
        <meshBasicMaterial color={color} transparent opacity={selected ? 0.9 : 0.5} />
      </mesh>
    </group>
  )
}

/** A mark on the floor: a freehand line, an arrow, or a circle from its centre out. */
function MarkShape({ mark }: { mark: Mark }) {
  const { tool, color, points } = mark
  const geometry = useMemo(() => {
    const [x0, z0] = points[0]
    const [x1, z1] = points[points.length - 1]
    if (tool === "circle") {
      const radius = Math.hypot(x1 - x0, z1 - z0)
      return { line: Array.from({ length: 65 }, (_, i) => [x0 + radius * Math.cos((i / 64) * Math.PI * 2), MARK_HEIGHT, z0 + radius * Math.sin((i / 64) * Math.PI * 2)] as [number, number, number]) }
    }
    if (tool === "pen") return { line: points.map(([x, z]) => [x, MARK_HEIGHT, z] as [number, number, number]) }
    const angle = Math.atan2(z1 - z0, x1 - x0)
    const length = Math.hypot(x1 - x0, z1 - z0)
    const head = Math.min(2.2, length * 0.5)
    const neck: [number, number] = [x1 - Math.cos(angle) * head * 0.8, z1 - Math.sin(angle) * head * 0.8]
    const side = (turn: number) => ({ x: x1 - head * Math.cos(angle + turn), y: -(z1 - head * Math.sin(angle + turn)) })
    const shape = new Shape([{ x: x1, y: -z1 } as never, side(0.5) as never, side(-0.5) as never])
    return { line: [[x0, MARK_HEIGHT, z0], [neck[0], MARK_HEIGHT, neck[1]]] as [number, number, number][], shape }
  }, [tool, points])

  if (points.length < 2) return null
  return (
    <group>
      <Line points={geometry.line} color={color} lineWidth={0.45} worldUnits />
      {geometry.shape && (
        <mesh rotation-x={-Math.PI / 2} position-y={MARK_HEIGHT}>
          <shapeGeometry args={[geometry.shape]} />
          <meshBasicMaterial color={color} />
        </mesh>
      )}
    </group>
  )
}
