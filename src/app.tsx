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
import { BoostGauge } from "./ui/boost"
import { Scoreboard } from "./ui/scoreboard"
import { StudioBar, StudioVideo, useLineUp, useSync, type Screen } from "./studio/studio"
import { INKS, Sketch, type Stroke, type Tool } from "./ui/sketch"
import { Timeline } from "./ui/timeline"

type State = { status: "empty" } | { status: "loading"; name: string } | { status: "error"; message: string } | { status: "ready"; replay: Replay }

export function App() {
  const [state, setState] = useState<State>({ status: "empty" })
  // A link to a board (#board=…) opens it.
  const [board, setBoard] = useState<Board | undefined>(() => decode(location.hash.match(/^#board=(.+)$/)?.[1] ?? ""))
  /** Where the replay was when the board was opened from it, to go back to. */
  const [resume, setResume] = useState<number>()
  /** The stream's recording, for the studio; it stays while replays change. */
  const [vod, setVod] = useState<File>()

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
      if (file && isVideo(file)) setVod(file)
      else if (file) void open(file.arrayBuffer(), file.name)
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
    return <Player key={state.replay.name} replay={state.replay} at={resume} onBoard={openBoard} vod={vod} onVod={setVod} />
  }
  return (
    <main className="relative grid h-screen place-items-center bg-[#050a1a] text-[#f4f5f7]">
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
      <footer className="absolute inset-x-0 bottom-6 text-center text-[12px] text-white/40">
        Created by{" "}
        <a href={HOME} className="text-white/70 underline decoration-white/25 underline-offset-4 hover:text-[#85a7ff]">
          muanlartins
        </a>
      </footer>
    </main>
  )
}

const isVideo = (file: File) => file.type.startsWith("video/") || /\.(mp4|mkv|mov|webm)$/i.test(file.name)

/** The author's site, in the language of the domain RLR is served from (English elsewhere). */
const HOME = location.hostname.endsWith(".com.br") ? "https://muanlartins.com.br" : "https://muanlartins.com"

const CAMS = { theirs: "As they played", on: "Ball cam", off: "Car cam" } as const

/**
 * Plays a replay; `at` starts it somewhere other than the beginning, and `onBoard` sets the moment out on the board.
 * With the stream's recording (`vod`) it's the studio: both in step, swapping which one fills the screen.
 */
function Player({ replay, at, onBoard, vod, onVod }: { replay: Replay; at?: number; onBoard: (time: number) => void; vod?: File; onVod: (file: File) => void }) {
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
  const [screen, setScreen] = useState<Screen>("3d")
  const [range, setRange] = useState<[number, number]>()
  const [loop, setLoop] = useState(false)
  const [volume, setVolume] = useState(0.25)
  const [studio, setStudio] = useState(() => {
    try {
      return localStorage.getItem("rlr:studio") === "open"
    } catch {
      return false
    }
  })
  const openStudio = (open: boolean) => {
    setStudio(open)
    try {
      localStorage.setItem("rlr:studio", open ? "open" : "closed")
    } catch {
      // Remembered for this visit only.
    }
  }
  const lookup = useSync(replay, studio && Boolean(vod))
  const { sync, nudge, setNudge } = useLineUp(replay, lookup)
  const shown: Screen = studio && vod ? screen : "3d"
  const swap = () => setScreen((current) => (current === "3d" ? "vod" : "3d"))
  const ticks = useMemo(() => sync.events.filter((event) => event.by === "me").map((event) => ({ time: event.time, label: event.name ?? event.type })), [sync])

  // Drawings belong to the paused moment: playing on wipes them.
  useEffect(
    () =>
      playback.subscribe(() => {
        if (playback.playing) setStrokes((current) => (current.length ? [] : current))
      }),
    [playback],
  )

  const follow = useCallback((car: number) => setView({ kind: "player", car, ballCam }), [ballCam])

  // Once the studio knows the match, it sees it from Luan's car, as the recording does.
  const matched = lookup?.status === "found"
  useEffect(() => {
    const own = replay.cars.findIndex((car) => /muanlartins/i.test(car.name))
    if (matched && own >= 0) setView((current) => (current.kind === "free" ? { kind: "player", car: own, ballCam: "theirs" } : current))
  }, [matched, replay])

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
      {studio && vod && <StudioVideo vod={vod} sync={sync} nudge={nudge} playback={playback} screen={shown} onSwap={swap} volume={volume} />}
      {shown === "3d" && <Announcer replay={replay} playback={playback} />}
      <Sketch tool={tool} color={ink} strokes={strokes} onChange={setStrokes} />

      {shown === "3d" && (
        <div className="pointer-events-none absolute inset-x-0 top-0 p-4">
          <Scoreboard replay={replay} playback={playback} />
        </div>
      )}

      <div className="pointer-events-none absolute inset-x-0 bottom-0 space-y-2 p-4 [&>*]:pointer-events-auto">
        {shown === "3d" && view.kind === "player" && (
          <div className="pointer-events-none! flex justify-end pr-2">
            <Gauge car={replay.cars[view.car]} replay={replay} playback={playback} />
          </div>
        )}
        {studio && (
          <StudioBar
            replay={replay}
            playback={playback}
            vod={vod}
            onVod={onVod}
            lookup={lookup}
            sync={sync}
            nudge={nudge}
            onNudge={setNudge}
            screen={shown}
            onSwap={swap}
            range={range}
            onRange={setRange}
            loop={loop}
            onLoop={setLoop}
            onClose={() => openStudio(false)}
            volume={volume}
            onVolume={setVolume}
          />
        )}
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
            {!studio && (
              <Choice active={false} onClick={() => openStudio(true)}>
                Studio
              </Choice>
            )}
          </Group>
        </div>
        <Timeline replay={replay} playback={playback} range={range} ticks={ticks} />
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

/** The followed player's boost, as the game shows it, with their speed. */
function Gauge({ car, replay, playback }: { car: Car; replay: Replay; playback: Playback }) {
  usePlayback(playback)
  const { frame } = momentAt(replay.times, playback.time)
  const speed = Math.hypot(car.vel[frame * 3], car.vel[frame * 3 + 1], car.vel[frame * 3 + 2]) * 3.6
  return <BoostGauge boost={car.boost[frame]} color={TEAMS[car.team].color} speed={car.present[frame] ? speed : undefined} />
}
