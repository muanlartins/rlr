import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"
import { Arena } from "../scene/arena"
import { Follow, Orbit, type Track } from "../scene/cameras"
import { TEAMS } from "../scene/field"
import { BoostGauge } from "../ui/boost"
import { Choice, Group } from "../ui/controls"
import { INKS, type Tool } from "../ui/sketch"
import { EMPTY, encode, kickoff, newCar, poseOf, REST, type Board, type Piece } from "./model"
import { Table, type Handles, type Selection } from "./table"

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
  const [handles, setHandles] = useState<Handles>("move")
  const holding = useRef(false)
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
        g: () => setHandles("move"),
        r: () => setHandles("turn"),
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
      <Arena onMissed={() => holding.current || select(undefined)}>
        {followed ? <Follow track={track} /> : <Orbit overhead={overhead} still={!!tool} />}
        <Table board={board} edit={edit} selected={selected} select={select} tool={tool} ink={ink} tags={tags} riding={followed?.id} handles={handles} holding={holding} />
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
        <span className="text-[13px] text-white/50">Arraste para mover · as setas movem numa direção (G) · os anéis giram o carro (R) · clique num boost para pegá-lo · 1, 2… para ver de um carro</span>
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
          <div className="flex items-center gap-3">
            <BoostGauge boost={car.boost} color={TEAMS[car.team].color} size={84} onStart={checkpoint} onChange={(boost) => update({ boost })} />
            <dl className="grid flex-1 grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-white/60">
              <dt>Altura</dt>
              <dd className="text-right font-mono tabular-nums text-white/85">{(car.pos[1] - REST.car).toFixed(1)} m</dd>
              <dt>Direção</dt>
              <dd className="text-right font-mono tabular-nums text-white/85">{Math.round(angle(car.rot[0]))}°</dd>
              <dt>Bico</dt>
              <dd className="text-right font-mono tabular-nums text-white/85">{Math.round(angle(car.rot[1]))}°</dd>
              <dt>Rolamento</dt>
              <dd className="text-right font-mono tabular-nums text-white/85">{Math.round(angle(car.rot[2]))}°</dd>
            </dl>
          </div>
          <Row>
            <Choice active={handles === "move"} onClick={() => setHandles("move")}>Mover · G</Choice>
            <Choice active={handles === "turn"} onClick={() => setHandles("turn")}>Girar · R</Choice>
          </Row>
          <Row>
            <Choice active={false} onClick={() => update({ pos: [car.pos[0], REST.car, car.pos[2]], rot: [car.rot[0], 0, 0] })}>Sobre as rodas</Choice>
            <Choice active={false} onClick={remove}>Remover</Choice>
          </Row>
        </Panel>
      )}
      {selected === "ball" && (
        <Panel>
          <span className="text-[13px]">Bola · arraste as setas, a verde é para cima</span>
          <p className="flex justify-between text-white/60">
            Altura
            <span className="font-mono tabular-nums text-white/85">{(board.ball[1] - REST.ball).toFixed(1)} m</span>
          </p>
          <Row>
            <Choice active={false} onClick={() => edit({ ...board, ball: [board.ball[0], REST.ball, board.ball[2]] }, true)}>No chão</Choice>
            <Choice active={false} onClick={() => edit({ ...board, ball: [0, REST.ball, 0] }, true)}>No centro</Choice>
          </Row>
        </Panel>
      )}

      <div className="absolute inset-x-0 bottom-0 flex flex-wrap items-center gap-2 p-4 text-[12px]">
        <Group>
          <Choice active={!followed && !overhead} onClick={() => setView("free")}>Livre</Choice>
          <Choice active={overhead} onClick={() => setView("overhead")}>De cima</Choice>
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
            <Choice active={!ballCam} onClick={() => setBallCam(false)}>Câmera normal</Choice>
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
          <Choice active={false} onClick={() => reset({ ...EMPTY, marks: board.marks })}>Vazio</Choice>
          <Choice active={false} onClick={() => edit({ ...board, taken: board.taken.map(() => false) }, true)}>Todos os boosts de volta</Choice>
        </Group>
        <Group>
          {(["pen", "arrow", "circle"] as const).map((name) => (
            <Choice key={name} active={tool === name} onClick={() => setTool(tool === name ? undefined : name)}>
              {name === "pen" ? "Caneta" : name === "arrow" ? "Seta" : "Círculo"}
            </Choice>
          ))}
          {INKS.map((color) => (
            <button
              key={color}
              onClick={() => setInk(color)}
              className="mx-1 h-4 w-4 rounded-full border-2"
              style={{ background: color, borderColor: color === ink ? "#fff" : "transparent" }}
              aria-label={`Cor ${color}`}
            />
          ))}
          <Choice active={false} onClick={() => edit({ ...board, marks: [] }, true)}>Apagar</Choice>
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
            Desfazer
          </Choice>
          <Choice
            active={copied}
            onClick={() => {
              void navigator.clipboard.writeText(`${location.origin}${location.pathname}#board=${encode(board)}`)
              setCopied(true)
              setTimeout(() => setCopied(false), 1500)
            }}
          >
            {copied ? "Copiado" : "Copiar link"}
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
