import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { BoardPage, savedBoard } from "./board/board"
import { decode, fromReplay, kickoff, type Board } from "./board/model"
import { Playback, usePlayback } from "./playback"
import { loadReplay } from "./replay/load"
import { BALL_CAM, type Car, type Replay } from "./replay/model"
import { gaps, momentAt } from "./replay/sample"
import type { View } from "./scene/cameras"
import { TEAMS } from "./scene/field"
import { Scene } from "./scene/scene"
import { Announcer } from "./ui/announcer"
import { Choice, Group } from "./ui/controls"
import { Scoreboard } from "./ui/scoreboard"
import { INKS, Sketch, type Stroke, type Tool } from "./ui/sketch"
import { Timeline } from "./ui/timeline"

type State = { status: "empty" } | { status: "loading"; name: string } | { status: "error"; message: string } | { status: "ready"; replay: Replay }

export function App() {
  const [state, setState] = useState<State>({ status: "empty" })
  // A link to a board (#board=…) opens it.
  const [board, setBoard] = useState<Board | undefined>(() => decode(location.hash.match(/^#board=(.+)$/)?.[1] ?? ""))
  /** Where the replay was when the board was opened from it, to go back to. */
  const [resume, setResume] = useState<number>()

  const open = useCallback(async (bytes: Promise<ArrayBuffer>, name: string) => {
    setState({ status: "loading", name })
    try {
      setState({ status: "ready", replay: await loadReplay(await bytes, name) })
    } catch (error) {
      setState({ status: "error", message: String(error) })
    }
  }, [])

  // ?replay=<url> opens a replay straight away.
  useEffect(() => {
    const url = new URLSearchParams(location.search).get("replay")
    if (url) void open(fetch(url).then((response) => response.arrayBuffer()), url.split("/").pop()!)
  }, [open])

  useEffect(() => {
    const onDrop = (event: DragEvent) => {
      event.preventDefault()
      const file = event.dataTransfer?.files[0]
      if (file) void open(file.arrayBuffer(), file.name)
    }
    const onDragOver = (event: DragEvent) => event.preventDefault()
    window.addEventListener("drop", onDrop)
    window.addEventListener("dragover", onDragOver)
    return () => {
      window.removeEventListener("drop", onDrop)
      window.removeEventListener("dragover", onDragOver)
    }
  }, [open])

  if (board) {
    const close = () => {
      history.replaceState(null, "", `${location.pathname}${location.search}`)
      setBoard(undefined)
    }
    return <BoardPage initial={board} back={state.status === "ready" ? "Replay" : "Home"} onClose={close} />
  }
  if (state.status === "ready") {
    const openBoard = (time: number) => {
      setResume(time)
      setBoard(fromReplay(state.replay, time))
    }
    return <Player key={state.replay.name} replay={state.replay} at={resume} onBoard={openBoard} />
  }
  return (
    <main className="grid h-screen place-items-center bg-[#050a1a] text-[#f4f5f7]">
      <div className="text-center">
        <h1 className="text-4xl font-medium tracking-tight">
          R<span className="text-[#85a7ff]">L</span>R
        </h1>
        <p className="mt-1 text-[13px] uppercase tracking-[0.2em] text-white/40">Rocket League Replay</p>
        <p className="mt-3 text-white/60">
          {state.status === "loading" ? `Reading ${state.name}…` : state.status === "error" ? state.message : "Drop a Rocket League .replay file anywhere, or"}
        </p>
        {state.status !== "loading" && (
          <div className="mt-5 flex items-center justify-center gap-3">
            <label className="inline-block cursor-pointer rounded-full bg-[#f4f5f7] px-5 py-2 font-medium text-[#002fa7]">
              Choose a replay
              <input
                type="file"
                accept=".replay"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (file) void open(file.arrayBuffer(), file.name)
                }}
              />
            </label>
            <button onClick={() => setBoard(savedBoard() ?? kickoff(2))} className="rounded-full border border-white/25 px-5 py-2 font-medium text-[#f4f5f7] hover:bg-white/10">
              Open the board
            </button>
          </div>
        )}
      </div>
    </main>
  )
}

const CAMS = { theirs: "As they played", on: "Ball cam", off: "Car cam" } as const

/** Plays a replay; `at` starts it somewhere other than the beginning, and `onBoard` sets the moment out on the board. */
function Player({ replay, at, onBoard }: { replay: Replay; at?: number; onBoard: (time: number) => void }) {
  const playback = useMemo(() => {
    const playback = new Playback(replay.times[0], replay.times[replay.times.length - 1], gaps(replay.times))
    if (at !== undefined) playback.seek(at)
    return playback
  }, [replay, at])
  const tags = useRef<(HTMLElement | null)[]>([])
  const [view, setView] = useState<View>({ kind: "free" })
  const [ballCam, setBallCam] = useState<keyof typeof CAMS>("theirs")
  const [tool, setTool] = useState<Tool>()
  const [ink, setInk] = useState(INKS[1])
  const [strokes, setStrokes] = useState<Stroke[]>([])

  // Drawings belong to the paused moment: playing on wipes them.
  useEffect(
    () =>
      playback.subscribe(() => {
        if (playback.playing) setStrokes((current) => (current.length ? [] : current))
      }),
    [playback],
  )

  const follow = useCallback((car: number) => setView({ kind: "player", car, ballCam }), [ballCam])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement && event.target.type !== "range") return
      const step = (frames: number) => {
        const { frame } = momentAt(replay.times, playback.time)
        playback.set({ playing: false })
        playback.seek(replay.times[Math.max(0, Math.min(replay.times.length - 1, frame + frames))])
      }
      const keys: Record<string, () => void> = {
        " ": () => playback.set({ playing: !playback.playing }),
        ArrowLeft: () => (event.shiftKey ? playback.seek(playback.time - 5) : step(-1)),
        ArrowRight: () => (event.shiftKey ? playback.seek(playback.time + 5) : step(1)),
        "0": () => setView({ kind: "free" }),
        "9": () => setView({ kind: "overhead" }),
        p: () => setTool((current) => (current === "pen" ? undefined : "pen")),
        a: () => setTool((current) => (current === "arrow" ? undefined : "arrow")),
        c: () => setTool((current) => (current === "circle" ? undefined : "circle")),
        x: () => setStrokes([]),
        Escape: () => setTool(undefined),
      }
      replay.cars.forEach((_, index) => (keys[String(index + 1)] = () => follow(index)))
      const action = keys[event.key]
      if (!action) return
      event.preventDefault()
      action()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [replay, playback, follow])

  useEffect(() => setView((current) => (current.kind === "player" ? { ...current, ballCam } : current)), [ballCam])

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-[#050a1a] text-[#f4f5f7]">
      <Scene replay={replay} playback={playback} view={view} tags={tags} />
      {replay.cars.map((car, index) => (
        <span
          key={car.id}
          ref={(tag) => void (tags.current[index] = tag)}
          className="pointer-events-none invisible absolute left-0 top-0 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium text-white shadow"
          style={{ background: `${TEAMS[car.team].color}cc` }}
        >
          {car.name}
        </span>
      ))}
      <Announcer replay={replay} playback={playback} />
      <Sketch tool={tool} color={ink} strokes={strokes} onChange={setStrokes} />

      <div className="pointer-events-none absolute inset-x-0 top-0 p-4">
        <Scoreboard replay={replay} playback={playback} />
      </div>

      <div className="absolute inset-x-0 bottom-0 space-y-2 p-4">
        <div className="flex flex-wrap items-center gap-2 text-[12px]">
          <Group>
            <Choice active={view.kind === "free"} onClick={() => setView({ kind: "free" })}>Free</Choice>
            <Choice active={view.kind === "overhead"} onClick={() => setView({ kind: "overhead" })}>Overhead</Choice>
            {replay.cars.map((car, index) => (
              <Choice key={car.id} active={view.kind === "player" && view.car === index} onClick={() => follow(index)}>
                <span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ background: TEAMS[car.team].color }} />
                {car.name}
              </Choice>
            ))}
          </Group>
          {view.kind === "player" && (
            <Group>
              {(Object.keys(CAMS) as (keyof typeof CAMS)[]).map((mode) => (
                <Choice key={mode} active={ballCam === mode} onClick={() => setBallCam(mode)}>
                  {CAMS[mode]}
                  {mode === "theirs" && <TheirCam car={replay.cars[view.car]} replay={replay} playback={playback} />}
                </Choice>
              ))}
            </Group>
          )}
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
            <Choice active={false} onClick={() => setStrokes([])}>Clear</Choice>
          </Group>
          <Group>
            <Choice
              active={false}
              onClick={() => {
                playback.set({ playing: false })
                onBoard(playback.time)
              }}
            >
              Open this moment on the board
            </Choice>
          </Group>
        </div>
        <Timeline replay={replay} playback={playback} />
      </div>
    </main>
  )
}

/** Which camera the followed player had on at the playhead. */
function TheirCam({ car, replay, playback }: { car: Car; replay: Replay; playback: Playback }) {
  usePlayback(playback)
  const { frame } = momentAt(replay.times, playback.time)
  return <span className="ml-1.5 opacity-60">{car.flags[frame] & BALL_CAM ? "ball cam" : "car cam"}</span>
}
