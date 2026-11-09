import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { BoardPage, savedBoard } from "./board/board"
import { decode, fromReplay, kickoff, type Board } from "./board/model"
import { Playback, usePlayback } from "./playback"
import { loadReplay } from "./replay/load"
import { BALL_CAM, type Car, type Goal, type Replay } from "./replay/model"
import { gaps, momentAt } from "./replay/sample"
import type { View } from "./scene/cameras"
import { TEAMS } from "./scene/field"
import { Scene } from "./scene/scene"
import { Announcer } from "./ui/announcer"
import { ArrowIcon, BoardIcon, CircleIcon, ClearIcon, FullScreenIcon, OrbitIcon, OverheadIcon, PenIcon, StudioIcon } from "./ui/icons"
import { PlayFromHere, Segment, ToolButton } from "./ui/toolbar"
import { PlayPage, type From } from "./play/play"
import { BoostGauge } from "./ui/boost"
import { Scoreboard } from "./ui/scoreboard"
import { LibraryButtons, LibraryList, MatchPicker, PlayList, playName, playsOf, type Library } from "./studio/library"
import { recordingFor, type Live, type LiveMatch } from "./studio/lives"
import type { Play } from "./studio/plays"
import { StudioBar, StudioVideo, useLineUp, useSync, type Screen } from "./studio/studio"
import { toReplay } from "./studio/sync"
import { INKS, Sketch, type Stroke, type Tool } from "./ui/sketch"
import { GOAL_LEAD, Timeline } from "./ui/timeline"

type State = { status: "empty" } | { status: "loading"; name: string } | { status: "error"; message: string } | { status: "ready"; replay: Replay }

export function App() {
  const [state, setState] = useState<State>({ status: "empty" })
  // A link to a board (#board=…) opens it.
  const [board, setBoard] = useState<Board | undefined>(() => decode(location.hash.match(/^#board=(.+)$/)?.[1] ?? ""))
  /** Where the replay was when the board was opened from it, to go back to. */
  const [resume, setResume] = useState<number>()
  /** The stream's recording, for the studio; it stays while replays change. */
  const [vod, setVod] = useState<File>()
  /** Luan's lives folder, once opened, and the match from it that's playing. */
  const [library, setLibrary] = useState<Library>()
  const [current, setCurrent] = useState<{ live: Live; match: LiveMatch }>()
  /** Recording shorts: the day's plays, best first, and the one on screen. */
  const [short, setShort] = useState<{ live: Live; plays: Play[]; play: Play }>()
  const [finding, setFinding] = useState<string>()
  /** Playing a replay's moment as one of its players. */
  const [playing, setPlaying] = useState<From>()

  const open = useCallback(async (bytes: Promise<ArrayBuffer>, name: string) => {
    setState({ status: "loading", name })
    try {
      setState({ status: "ready", replay: await loadReplay(await bytes, name) })
    } catch (error) {
      setState({ status: "error", message: String(error) })
    }
  }, [])

  /** A match from the lives folder: its replay, the day's recording that holds it, and the studio open. */
  const openMatch = useCallback(
    (live: Live, match: LiveMatch) => {
      setCurrent({ live, match })
      try {
        localStorage.setItem("rlr:studio", "open")
      } catch {
        // The studio button still opens it.
      }
      const recording = recordingFor(live, match)
      if (recording) {
        void recording.file().then(
          // The same recording keeps playing where it is, without loading again.
          (file) => setVod((shown) => (shown && shown.name === file.name && shown.size === file.size && shown.lastModified === file.lastModified ? shown : file)),
          () => undefined,
        )
      }
      void open(match.replay.file().then((file) => file.arrayBuffer()), match.replay.name)
    },
    [open],
  )

  /** A play for a short: its match opens (unless it's the one already open), lined up on the play. */
  const openPlay = (live: Live, plays: Play[], play: Play) => {
    setShort({ live, plays, play })
    const match = live.matches.find((each) => each.number === play.number)
    const open = state.status === "ready" && current?.live.date === live.date && current.match.number === play.number
    if (match && !open) openMatch(live, match)
  }
  const shorts = (live: Live) => {
    setFinding(`Finding the plays of ${live.date}…`)
    playsOf(live).then(
      (plays) => {
        setFinding(plays.length ? undefined : `No plays of yours found in ${live.date}'s published session.`)
        if (plays.length) openPlay(live, plays, plays[0])
      },
      (error) => setFinding(`Couldn't read the session (${error})`),
    )
  }

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
      else if (file) {
        setCurrent(undefined)
        void open(file.arrayBuffer(), file.name)
      }
    }
    const onDragOver = (event: DragEvent) => event.preventDefault()
    window.addEventListener("drop", onDrop)
    window.addEventListener("dragover", onDragOver)
    return () => {
      window.removeEventListener("drop", onDrop)
      window.removeEventListener("dragover", onDragOver)
    }
  }, [open])

  if (playing) {
    const back = () => {
      setResume(playing.time)
      setPlaying(undefined)
    }
    return <PlayPage from={playing} onClose={back} />
  }
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
    const picker = current && <MatchPicker live={current.live} match={current.match} onOpen={openMatch} onList={() => setState({ status: "empty" })} />
    const shortProps = short && {
      play: short.play,
      list: (
        <PlayList
          live={short.live}
          plays={short.plays}
          play={short.play}
          onPlay={(play) => openPlay(short.live, short.plays, play)}
          onLeave={() => (setShort(undefined), setState({ status: "empty" }))}
        />
      ),
    }
    const playMoment = (time: number, car: number, goal?: Goal) => setPlaying({ replay: state.replay, time: inPlay(state.replay, time), car, goal })
    return <Player key={state.replay.name} replay={state.replay} at={resume} onBoard={openBoard} onPlay={playMoment} vod={vod} onVod={setVod} picker={short ? undefined : picker} short={shortProps} />
  }
  return (
    <main className="relative grid h-screen place-items-center bg-[#050a1a] text-[#f4f5f7]">
      <div className="w-full text-center">
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
                  if (file) {
                    setCurrent(undefined)
                    void open(file.arrayBuffer(), file.name)
                  }
                }}
              />
            </label>
            <button onClick={() => setBoard(savedBoard() ?? kickoff(2))} className="rounded-full border border-white/25 px-5 py-2 font-medium text-[#f4f5f7] hover:bg-white/10">
              Open the board
            </button>
          </div>
        )}
        {state.status !== "loading" &&
          (library ? (
            <div className="mt-10">
              <LibraryList
                library={library}
                current={current && { date: current.live.date, number: current.match.number }}
                onOpen={(live, match) => (setShort(undefined), openMatch(live, match))}
                onShorts={shorts}
                onClose={() => setLibrary(undefined)}
              />
              {finding && <p className="mt-3 text-[13px] text-white/60">{finding}</p>}
            </div>
          ) : (
            <LibraryButtons onLibrary={setLibrary} />
          ))}
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

/** `time`, or if the ball isn't on the pitch then (a goal being celebrated, the game's goal replay), the next kickoff. */
function inPlay(replay: Replay, time: number) {
  let { frame } = momentAt(replay.times, time)
  if (replay.ball.present[frame]) return time
  while (frame < replay.times.length - 1 && !replay.ball.present[frame]) frame++
  return replay.times[frame]
}

const isVideo = (file: File) => file.type.startsWith("video/") || /\.(mp4|mkv|mov|webm)$/i.test(file.name)

/** The author's site, in the language of the domain RLR is served from (English elsewhere). */
const HOME = location.hostname.endsWith(".com.br") ? "https://muanlartins.com.br" : "https://muanlartins.com"

const CAMS = { theirs: "As they played", on: "Ball cam", off: "Car cam" } as const

/**
 * Plays a replay; `at` starts it somewhere other than the beginning, and `onBoard` sets the moment out on the board.
 * With the stream's recording (`vod`) it's the studio: both in step, swapping which one fills the screen.
 */
/**
 * A short's picture, in the screen's own pixels: the top of a 1080×1920 short, over Luan's camera. OBS's "Shorts"
 * profile captures the screen from its top left corner, with the browser full screen, so the page puts it there.
 */
const STAGE = [1080, 1056]

function Player({
  replay,
  at,
  onBoard,
  onPlay,
  vod,
  onVod,
  picker,
  short,
}: {
  replay: Replay
  at?: number
  onBoard: (time: number) => void
  /** Plays on from a moment as one of the players, maybe for one goal (to save it or score it again). */
  onPlay: (time: number, car: number, goal?: Goal) => void
  vod?: File
  onVod: (file: File) => void
  picker?: ReactNode
  /** Recording shorts: the play to line up and loop, and the day's list of them. */
  short?: { play: Play; list: ReactNode }
}) {
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
  const [screen, setScreen] = useState<Screen>(short ? "vod" : "3d")
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
  const studioOn = studio || Boolean(short)
  const lookup = useSync(replay, studioOn && Boolean(vod))
  const { sync, nudge, setNudge } = useLineUp(replay, lookup, vod)
  const shown: Screen = studioOn && vod ? screen : "3d"

  // A short's play, once the studio knows the match: its stretch, looping, paused at its start.
  const play = short?.play
  const lined = useRef<Play>(undefined)
  useEffect(() => {
    if (!play || lookup?.status !== "found" || !sync.session || sync.index === undefined || !sync.recording) return
    const match = sync.session.matches[sync.index]
    if (match.id !== play.match || lined.current === play) return
    lined.current = play
    const base = (Date.parse(match.start) - Date.parse(sync.recording)) / 1000
    const from = toReplay(sync, base + play.from).time
    const to = toReplay(sync, base + play.to).time
    setRange([from, Math.max(to, from + 1)])
    setLoop(true)
    playback.set({ playing: false })
    playback.seek(from)
  }, [play, lookup, sync, playback])

  const fullScreen = useFullScreen()
  const controlsWanted = useControlsWanted(2500)
  const [overControls, setOverControls] = useState(false)
  useEffect(() => {
    if (!short) return
    const before = document.title
    document.title = "RLR · Shorts"
    return () => void (document.title = before)
  }, [short])
  const dpr = window.devicePixelRatio || 1
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
        j: () => {
          if (view.kind !== "player") return
          playback.set({ playing: false })
          onPlay(playback.time, view.car)
        },
      }
      replay.cars.forEach((_, index) => (keys[String(index + 1)] = () => follow(index)))
      const action = keys[event.key]
      if (!action) return
      event.preventDefault()
      action()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [replay, playback, follow, view, onPlay])

  useEffect(() => setView((current) => (current.kind === "player" ? { ...current, ballCam } : current)), [ballCam])

  const gauge = (
    <>
      {shown === "3d" && view.kind === "player" && (
        <div className="pointer-events-none! flex justify-end pr-2">
          <Gauge car={replay.cars[view.car]} replay={replay} playback={playback} />
        </div>
      )}
    </>
  )
  const picture = (
    <>
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
      {studioOn && vod && <StudioVideo key={`${vod.name}:${vod.lastModified}:${vod.size}`} vod={vod} sync={sync} nudge={nudge} playback={playback} screen={shown} onSwap={swap} volume={volume} short={Boolean(short)} />}
      {shown === "3d" && <Announcer replay={replay} playback={playback} />}
      <Sketch tool={tool} color={ink} strokes={strokes} onChange={setStrokes} />

      {shown === "3d" && (
        <div className="pointer-events-none absolute inset-x-0 top-0 p-4">
          <Scoreboard replay={replay} playback={playback} followed={view.kind === "player" ? view.car : undefined} onFollow={follow} />
        </div>
      )}

    </>
  )
  const bar = (
    <>
      {studioOn && (
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
          short={short && { chapter: playName(short.play) }}
        />
      )}
    </>
  )
  const playGoal = (goal: Goal, car: number) => {
    playback.set({ playing: false })
    onPlay(goal.time - GOAL_LEAD, car, goal)
  }
  const playFrom = (car: number) => {
    playback.set({ playing: false })
    onPlay(playback.time, car)
  }
  const tools = { pen: { icon: <PenIcon />, name: "Pen", key: "P" }, arrow: { icon: <ArrowIcon />, name: "Arrow", key: "A" }, circle: { icon: <CircleIcon />, name: "Circle", key: "C" } } as const
  // Under the timeline: how to look (the players themselves are up top), what to draw, and what to do with the moment.
  const controls = (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-[12px]">
      {picker}
      <Segment>
        <ToolButton active={view.kind === "free"} onClick={() => setView({ kind: "free" })} hint="Free camera: drag to orbit, scroll to zoom (0)">
          <OrbitIcon />
          Free
        </ToolButton>
        <ToolButton active={view.kind === "overhead"} onClick={() => setView({ kind: "overhead" })} hint="Overhead (9)">
          <OverheadIcon />
          Overhead
        </ToolButton>
      </Segment>
      {view.kind === "player" && (
        <Segment>
          {(Object.keys(CAMS) as (keyof typeof CAMS)[]).map((mode) => (
            <ToolButton key={mode} active={ballCam === mode} onClick={() => setBallCam(mode)} hint={CAMS[mode]}>
              {CAMS[mode]}
              {mode === "theirs" && <TheirCam car={replay.cars[view.car]} replay={replay} playback={playback} />}
            </ToolButton>
          ))}
        </Segment>
      )}
      <span className="h-5 w-px bg-white/10" />
      <Segment>
        {(Object.keys(tools) as (keyof typeof tools)[]).map((name) => (
          <ToolButton key={name} active={tool === name} onClick={() => setTool(tool === name ? undefined : name)} hint={`${tools[name].name} (${tools[name].key})`}>
            {tools[name].icon}
          </ToolButton>
        ))}
        <span className="flex items-center gap-1.5 px-2">
          {INKS.map((color) => (
            <button
              key={color}
              onClick={() => setInk(color)}
              className="h-3.5 w-3.5 rounded-full ring-offset-2 ring-offset-[#0b1430] transition-shadow"
              style={{ background: color, boxShadow: color === ink ? `0 0 0 2px #0b1430, 0 0 0 3.5px ${color}` : undefined }}
              aria-label={`Ink ${color}`}
            />
          ))}
        </span>
        <ToolButton onClick={() => setStrokes([])} hint="Clear the drawing (X)">
          <ClearIcon />
        </ToolButton>
      </Segment>
      <div className="ml-auto flex items-center gap-1">
        <ToolButton
          onClick={() => {
            playback.set({ playing: false })
            onBoard(playback.time)
          }}
          hint="Open this moment on the tactics board"
        >
          <BoardIcon />
          Board
        </ToolButton>
        {!studio && (
          <ToolButton onClick={() => openStudio(true)} hint="The studio: the stream's recording alongside">
            <StudioIcon />
            Studio
          </ToolButton>
        )}
        {studioOn && !short && !fullScreen && (
          <ToolButton onClick={() => void document.documentElement.requestFullscreen()} hint="Full screen">
            <FullScreenIcon />
          </ToolButton>
        )}
        <span className="ml-2">
          <PlayFromHere replay={replay} followed={view.kind === "player" ? view.car : undefined} onPlay={playFrom} />
        </span>
      </div>
    </div>
  )

  if (short) {
    return (
      <main className="relative h-screen w-screen overflow-hidden bg-[#050a1a] text-[#f4f5f7]">
        <div className="absolute left-0 top-0 overflow-hidden" style={{ width: STAGE[0] / dpr, height: STAGE[1] / dpr }}>
          {picture}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 p-4">{gauge}</div>
        </div>
        <aside className="absolute bottom-0 right-0 top-0 flex flex-col gap-3 overflow-hidden p-5" style={{ left: STAGE[0] / dpr }}>
          {!fullScreen && (
            <button onClick={() => void document.documentElement.requestFullscreen()} className="rounded-lg bg-[#f4f5f7] px-3 py-2 text-[13px] font-medium text-[#002fa7]">
              Full screen: OBS records the picture from the screen's top left corner
            </button>
          )}
          {short.list}
          <div className="space-y-2 [&>*]:pointer-events-auto">
            {bar}
            <Timeline replay={replay} playback={playback} range={range} ticks={ticks} onPlayGoal={playGoal}>
              {controls}
            </Timeline>
          </div>
        </aside>
      </main>
    )
  }

  // A commented video is the whole screen, recorded as it is (OBS leaves the cursor out): in full screen the controls
  // step aside unless the mouse is near them (the keys still work).
  const clean = studioOn && fullScreen && !controlsWanted && !overControls
  return (
    <main className="relative h-screen w-screen overflow-hidden bg-[#050a1a] text-[#f4f5f7]">
      {picture}
      <div
        onPointerEnter={() => setOverControls(true)}
        onPointerLeave={() => setOverControls(false)}
        className={`pointer-events-none absolute inset-x-0 bottom-0 space-y-2 p-4 transition-opacity duration-300 [&>*]:pointer-events-auto ${clean ? "opacity-0" : ""}`}
      >
        {gauge}
        {bar}
        <Timeline replay={replay} playback={playback} range={range} ticks={ticks} onPlayGoal={playGoal}>
          {controls}
        </Timeline>
      </div>
    </main>
  )
}

/**
 * Whether the controls are wanted: the pointer moved near the bottom of the screen in the last `ms`. Moving it
 * elsewhere (turning the 3D camera, drawing) doesn't bring them back.
 */
function useControlsWanted(ms: number) {
  const [wanted, setWanted] = useState(true)
  useEffect(() => {
    let timer = setTimeout(() => setWanted(false), ms)
    const moved = (event: PointerEvent) => {
      if (event.clientY < window.innerHeight * 0.7) return
      setWanted(true)
      clearTimeout(timer)
      timer = setTimeout(() => setWanted(false), ms)
    }
    window.addEventListener("pointermove", moved)
    return () => {
      clearTimeout(timer)
      window.removeEventListener("pointermove", moved)
    }
  }, [ms])
  return wanted
}

/** Whether the page is full screen. */
function useFullScreen() {
  const [full, setFull] = useState(() => Boolean(document.fullscreenElement))
  useEffect(() => {
    const change = () => setFull(Boolean(document.fullscreenElement))
    document.addEventListener("fullscreenchange", change)
    return () => document.removeEventListener("fullscreenchange", change)
  }, [])
  return full
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
