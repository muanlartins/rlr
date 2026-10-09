import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"
import { Arena } from "../scene/arena"
import { Follow, Orbit, type Track } from "../scene/cameras"
import { CEILING, TEAMS } from "../scene/field"
import { Choice, Group } from "../ui/controls"
import { INKS, type Tool } from "../ui/sketch"
import { EMPTY, encode, kickoff, newCar, poseOf, REST, type Board, type Piece } from "./model"
import { Table, type Selection } from "./table"

const SAVED = "rlr:board"
const DEGREES = 180 / Math.PI
/** The free camera, the view from above, or behind a car (by id). */
type View = "free" | "overhead" | { car: string }

/** How far Q and E turn a car. */
const TURN = Math.PI / 12

/** The board last worked on in this browser, if any. */
export function savedBoard(): Board | undefined {
  try {
    const text = localStorage.getItem(SAVED)
    return text ? (JSON.parse(text) as Board) : undefined
  } catch {
    return undefined
  }
}

/**
 * A tactics board on the pitch: place cars and the ball, turn them, set boost
 * and pads, and draw on the floor. The board is kept in this browser and in
 * the page's link, so a link opens the same setup.
 */
export function BoardPage({ initial, back, onClose }: { initial: Board; back: string; onClose: () => void }) {
  const [board, setBoard] = useState(initial)
  const [undo, setUndo] = useState<Board[]>([])
  const [selected, select] = useState<Selection>()
  const [tool, setTool] = useState<Tool>()
  const [ink, setInk] = useState(INKS[1])
  const [view, setView] = useState<View>("free")
  const [ballCam, setBallCam] = useState(true)
  const [copied, setCopied] = useState(false)
  const tags = useRef<(HTMLElement | null)[]>([])

  const edit = useCallback(
    (next: Board, record: boolean) => {
      if (record) setUndo((steps) => [...steps.slice(-99), board])
      setBoard(next)
    },
    [board],
  )
  const followed = typeof view === "object" ? board.cars.find((car) => car.id === view.car) : undefined
  const overhead = view === "overhead"
  const track: Track = (at, rotation, ball) => {
    if (!followed) return undefined
    poseOf(followed, at, rotation)
    ball.fromArray(board.ball)
    return { settings: followed.camera, ballCam }
  }
  const checkpoint = () => setUndo((steps) => [...steps.slice(-99), board])
  const car = board.cars.find((car) => car.id === selected)
  const update = (changes: Partial<Piece>) => car && setBoard({ ...board, cars: board.cars.map((other) => (other.id === car.id ? { ...other, ...changes } : other)) })
  const remove = () => {
    if (!car) return
    edit({ ...board, cars: board.cars.filter((other) => other.id !== car.id) }, true)
    select(undefined)
  }
  const add = (team: 0 | 1) => {
    const count = board.cars.filter((car) => car.team === team).length
    const piece = newCar(board, team, ((count % 5) - 2) * 6, team ? 18 : -18)
    edit({ ...board, cars: [...board.cars, piece] }, true)
    select(piece.id)
  }
  const reset = (next: Board) => {
    edit(next, true)
    select(undefined)
  }

  // Kept in this browser and in the link, a moment after the last change.
  useEffect(() => {
    const timer = setTimeout(() => {
      const text = encode(board)
      history.replaceState(null, "", `${location.pathname}${location.search}#board=${text}`)
      try {
        localStorage.setItem(SAVED, JSON.stringify(board))
      } catch {
        // Private windows may refuse; the link still has it.
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [board])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement && event.target.type === "text") return
      if ((event.metaKey || event.ctrlKey) && event.key === "z") {
        event.preventDefault()
        setUndo((steps) => {
          if (steps.length) setBoard(steps[steps.length - 1])
          return steps.slice(0, -1)
        })
        return
      }
      const turn = (by: number) => car && edit({ ...board, cars: board.cars.map((other) => (other.id === car.id ? { ...other, rot: [other.rot[0] + by, other.rot[1], other.rot[2]] } : other)) }, true)
      const keys: Record<string, () => void> = {
        Delete: remove,
        Backspace: remove,
        q: () => turn(TURN),
        e: () => turn(-TURN),
        p: () => setTool((current) => (current === "pen" ? undefined : "pen")),
        a: () => setTool((current) => (current === "arrow" ? undefined : "arrow")),
        c: () => setTool((current) => (current === "circle" ? undefined : "circle")),
        x: () => edit({ ...board, marks: [] }, true),
        "0": () => setView("free"),
        "9": () => setView("overhead"),
        Escape: () => (tool ? setTool(undefined) : select(undefined)),
      }
      board.cars.forEach((car, index) => (keys[String(index + 1)] = () => setView({ car: car.id })))
      const action = keys[event.key]
      if (!action) return
      event.preventDefault()
      action()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  })

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-[#050a1a] text-[#f4f5f7]">
      <Arena onMissed={() => select(undefined)}>
        {followed ? <Follow track={track} /> : <Orbit overhead={overhead} still={!!tool} />}
        <Table board={board} edit={edit} selected={selected} select={select} tool={tool} ink={ink} tags={tags} riding={followed?.id} />
      </Arena>
      {board.cars.map((car, index) => (
        <span
          key={car.id}
          ref={(tag) => void (tags.current[index] = tag)}
          className="pointer-events-none invisible absolute left-0 top-0 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium text-white shadow"
          style={{ background: `${TEAMS[car.team].color}cc` }}
        >
          {car.name}
          <span className="mt-0.5 block h-0.5 overflow-hidden rounded-full bg-white/25">
            <span className="block h-full bg-white" style={{ width: `${car.boost}%` }} />
          </span>
        </span>
      ))}

      <div className="absolute left-4 top-4 flex items-center gap-3">
        <button onClick={onClose} className="rounded-lg border border-white/10 bg-[#0b1430]/85 px-3 py-1.5 text-[12px] text-white/80 backdrop-blur hover:bg-white/10">
          ← {back}
        </button>
        <span className="text-[13px] text-white/50">Drag to move · Shift-drag to raise · drag the dot to turn (or Q, E) · click a pad to take it · 1, 2… to see from a car</span>
      </div>

      {car && (
        <Panel>
          <input
            value={car.name}
            onFocus={checkpoint}
            onChange={(event) => update({ name: event.target.value })}
            className="w-full rounded-md bg-white/10 px-2 py-1 text-[13px] outline-none focus:bg-white/15"
          />
          <Row>
            {([0, 1] as const).map((team) => (
              <Choice key={team} active={car.team === team} onClick={() => edit({ ...board, cars: board.cars.map((other) => (other.id === car.id ? { ...other, team } : other)) }, true)}>
                <span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ background: TEAMS[team].color }} />
                {TEAMS[team].name}
              </Choice>
            ))}
          </Row>
          <Row>
            {(["octane", "fennec"] as const).map((body) => (
              <Choice key={body} active={car.body === body} onClick={() => edit({ ...board, cars: board.cars.map((other) => (other.id === car.id ? { ...other, body } : other)) }, true)}>
                {body === "octane" ? "Octane" : "Fennec"}
              </Choice>
            ))}
          </Row>
          <Slider label="Boost" value={car.boost} min={0} max={100} shown={`${Math.round(car.boost)}`} onStart={checkpoint} onChange={(boost) => update({ boost })} />
          <Slider label="Height" value={car.pos[1]} min={REST.car} max={CEILING - REST.car} step={0.05} shown={`${(car.pos[1] - REST.car).toFixed(1)} m`} onStart={checkpoint} onChange={(y) => update({ pos: [car.pos[0], y, car.pos[2]] })} />
          <Slider label="Heading" value={angle(car.rot[0])} min={-180} max={180} shown={`${Math.round(angle(car.rot[0]))}°`} onStart={checkpoint} onChange={(value) => update({ rot: [value / DEGREES, car.rot[1], car.rot[2]] })} />
          <Slider label="Nose" value={car.rot[1] * DEGREES} min={-90} max={90} shown={`${Math.round(car.rot[1] * DEGREES)}°`} onStart={checkpoint} onChange={(value) => update({ rot: [car.rot[0], value / DEGREES, car.rot[2]] })} />
          <Slider label="Roll" value={angle(car.rot[2])} min={-180} max={180} shown={`${Math.round(angle(car.rot[2]))}°`} onStart={checkpoint} onChange={(value) => update({ rot: [car.rot[0], car.rot[1], value / DEGREES] })} />
          <Row>
            <Choice active={false} onClick={() => update({ pos: [car.pos[0], REST.car, car.pos[2]], rot: [car.rot[0], 0, 0] })}>On its wheels</Choice>
            <Choice active={false} onClick={remove}>Remove</Choice>
          </Row>
        </Panel>
      )}
      {selected === "ball" && (
        <Panel>
          <span className="text-[13px]">Ball</span>
          <Slider
            label="Height"
            value={board.ball[1]}
            min={REST.ball}
            max={CEILING - REST.ball}
            step={0.05}
            shown={`${(board.ball[1] - REST.ball).toFixed(1)} m`}
            onStart={checkpoint}
            onChange={(y) => setBoard({ ...board, ball: [board.ball[0], y, board.ball[2]] })}
          />
          <Row>
            <Choice active={false} onClick={() => edit({ ...board, ball: [board.ball[0], REST.ball, board.ball[2]] }, true)}>On the floor</Choice>
            <Choice active={false} onClick={() => edit({ ...board, ball: [0, REST.ball, 0] }, true)}>Centre</Choice>
          </Row>
        </Panel>
      )}

      <div className="absolute inset-x-0 bottom-0 flex flex-wrap items-center gap-2 p-4 text-[12px]">
        <Group>
          <Choice active={!followed && !overhead} onClick={() => setView("free")}>Free</Choice>
          <Choice active={overhead} onClick={() => setView("overhead")}>Overhead</Choice>
          {board.cars.map((car) => (
            <Choice key={car.id} active={followed === car} onClick={() => setView({ car: car.id })}>
              <span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ background: TEAMS[car.team].color }} />
              {car.name}
            </Choice>
          ))}
        </Group>
        {followed && (
          <Group>
            <Choice active={ballCam} onClick={() => setBallCam(true)}>Ball cam</Choice>
            <Choice active={!ballCam} onClick={() => setBallCam(false)}>Car cam</Choice>
          </Group>
        )}
        <Group>
          {([0, 1] as const).map((team) => (
            <Choice key={team} active={false} onClick={() => add(team)}>
              <span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ background: TEAMS[team].color }} />+ {TEAMS[team].name}
            </Choice>
          ))}
        </Group>
        <Group>
          <span className="px-2.5 text-white/50">Kickoff</span>
          {([1, 2, 3] as const).map((size) => (
            <Choice key={size} active={false} onClick={() => reset(kickoff(size))}>{`${size}v${size}`}</Choice>
          ))}
          <Choice active={false} onClick={() => reset({ ...EMPTY, marks: board.marks })}>Empty</Choice>
          <Choice active={false} onClick={() => edit({ ...board, taken: board.taken.map(() => false) }, true)}>All pads up</Choice>
        </Group>
        <Group>
          {(["pen", "arrow", "circle"] as const).map((name) => (
            <Choice key={name} active={tool === name} onClick={() => setTool(tool === name ? undefined : name)}>
              {name === "pen" ? "Pen" : name === "arrow" ? "Arrow" : "Circle"}
            </Choice>
          ))}
          {INKS.map((color) => (
            <button
              key={color}
              onClick={() => setInk(color)}
              className="mx-1 h-4 w-4 rounded-full border-2"
              style={{ background: color, borderColor: color === ink ? "#fff" : "transparent" }}
              aria-label={`Ink ${color}`}
            />
          ))}
          <Choice active={false} onClick={() => edit({ ...board, marks: [] }, true)}>Clear</Choice>
        </Group>
        <Group>
          <Choice
            active={false}
            onClick={() =>
              setUndo((steps) => {
                if (steps.length) setBoard(steps[steps.length - 1])
                return steps.slice(0, -1)
              })
            }
          >
            Undo
          </Choice>
          <Choice
            active={copied}
            onClick={() => {
              void navigator.clipboard.writeText(`${location.origin}${location.pathname}#board=${encode(board)}`)
              setCopied(true)
              setTimeout(() => setCopied(false), 1500)
            }}
          >
            {copied ? "Copied" : "Copy link"}
          </Choice>
        </Group>
      </div>
    </main>
  )
}

/** An angle in degrees between -180 and 180. */
function angle(radians: number) {
  const degrees = (((radians * DEGREES) % 360) + 360) % 360
  return degrees > 180 ? degrees - 360 : degrees
}

function Panel({ children }: { children: ReactNode }) {
  return <div className="absolute right-4 top-4 w-60 space-y-2.5 rounded-xl border border-white/10 bg-[#0b1430]/90 p-3 text-[12px] backdrop-blur">{children}</div>
}

function Row({ children }: { children: ReactNode }) {
  return <div className="flex overflow-hidden rounded-lg border border-white/10">{children}</div>
}

function Slider({ label, value, min, max, step = 1, shown, onStart, onChange }: { label: string; value: number; min: number; max: number; step?: number; shown: string; onStart: () => void; onChange: (value: number) => void }) {
  return (
    <label className="block">
      <span className="flex justify-between text-white/60">
        {label}
        <span className="font-mono tabular-nums text-white/80">{shown}</span>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onPointerDown={onStart} onChange={(event) => onChange(Number(event.target.value))} className="w-full accent-[#85a7ff]" />
    </label>
  )
}
