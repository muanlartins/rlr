import { useEffect, useMemo, useRef, useState } from "react"
import { usePlayback, type Playback } from "../playback"
import type { Replay } from "../replay/model"
import { Choice, Group } from "../ui/controls"
import { clock } from "../ui/timeline"
import { Obs, saveObs, savedObs, type Recording } from "./obs"
import { byHand, findMatch, forRecording, sessionsNear, toReplay, toVideo, type Sync } from "./sync"

/**
 * The studio: the stream's recording beside the replay, kept in step, to
 * talk over a play or a match. V swaps which one fills the screen (the
 * other sits in the corner); I and O mark a play and L loops it; M drops a
 * mark, which also becomes a chapter in OBS's recording when it's recording.
 */

export type Screen = "3d" | "vod"

/** A moment Luan marked: where in the replay and the video, and how far into OBS's recording. */
export interface Mark {
  time: number
  video?: number
  recorded?: number
  label: string
}

type Lookup = { status: "looking" } | { status: "found"; sync: Sync } | { status: "missing"; reason: string }

/** Lines the replay up with the stream's recording, once there is a recording to line it with. */
export function useSync(replay: Replay, active: boolean): Lookup | undefined {
  const [lookup, setLookup] = useState<{ replay: Replay; lookup: Lookup }>()
  useEffect(() => {
    if (!active) return
    let gone = false
    sessionsNear(replay.date)
      .then((candidates) => {
        const sync = findMatch(replay, candidates)
        if (!gone) setLookup({ replay, lookup: sync ? { status: "found", sync } : { status: "missing", reason: "No published session has this match" } })
      })
      .catch((error) => !gone && setLookup({ replay, lookup: { status: "missing", reason: `Couldn't reach the sessions (${error})` } }))
    return () => void (gone = true)
  }, [replay, active])
  if (!active) return undefined
  return lookup?.replay === replay ? lookup.lookup : { status: "looking" }
}

const NUDGES = [-1, -0.1, 0.1, 1]
/** The recording's sound, low to talk over it. */
const VOLUMES = [1, 0.25, 0]

/** The nudge for a session (or a replay lined up by hand), kept in this browser: one setting lines up a whole session. */
function nudgeKey(sync: Sync, replay: Replay) {
  return `rlr:nudge:${sync.session?.id ?? replay.name}`
}

function readNudge(key: string) {
  try {
    return Number(localStorage.getItem(key) ?? 0) || 0
  } catch {
    return 0
  }
}

/** The recording, in the corner or filling the screen, playing in step with the replay. */
export function StudioVideo({ vod, sync, nudge, playback, screen, onSwap, volume, short }: { vod: File; sync: Sync; nudge: number; playback: Playback; screen: Screen; onSwap: () => void; volume: number; short?: boolean }) {
  const video = useRef<HTMLVideoElement>(null)
  useEffect(() => void (video.current && (video.current.volume = volume)), [volume])
  const src = useMemo(() => URL.createObjectURL(vod), [vod])
  useEffect(() => () => URL.revokeObjectURL(src), [src])
  const [held, setHeld] = useState(false)
  /** The file went away under the page (moved or renamed after it was added). */
  const [lost, setLost] = useState(false)

  useEffect(() => {
    const element = video.current
    if (!element) return
    const toV = (time: number) => toVideo(sync, time) + nudge
    const toR = (seconds: number) => toReplay(sync, seconds - nudge)
    let jumps = -1
    // The recording drives the replay while it fills the screen; otherwise the replay drives and the video keeps up.
    playback.driver =
      screen === "vod"
        ? () => {
            const at = toR(element.currentTime)
            setHeld(at.held)
            return at.time
          }
        : undefined
    const keep = () => {
      element.playbackRate = playback.speed
      const playing = playback.playing
      if (playback.jumps !== jumps || (!playing && screen === "3d")) {
        jumps = playback.jumps
        if (Math.abs(element.currentTime - toV(playback.time)) > 0.02) element.currentTime = toV(playback.time)
      } else if (playing && screen === "3d" && Math.abs(element.currentTime - toV(playback.time)) > 0.3) {
        element.currentTime = toV(playback.time)
      }
      if (playing && element.paused) void element.play().catch(() => playback.set({ playing: false }))
      if (!playing && !element.paused) element.pause()
    }
    keep()
    const stop = playback.subscribe(keep)
    // Played to its end, the recording stops the replay too.
    const ended = () => playback.set({ playing: false })
    element.addEventListener("ended", ended)
    return () => {
      stop()
      element.removeEventListener("ended", ended)
      playback.driver = undefined
    }
  }, [sync, nudge, playback, screen])

  const main = screen === "vod"
  return (
    <>
      <video
        ref={video}
        src={src}
        playsInline
        preload="auto"
        onError={() => setLost(true)}
        onClick={main ? undefined : onSwap}
        className={
          // A short's picture is the middle of the game, cut to fill it; behind the 3D it plays unseen, for its sound.
          main
            ? `absolute inset-0 h-full w-full bg-black ${short ? "object-cover" : "object-contain"}`
            : short
              ? "hidden"
              : "absolute right-6 top-36 z-10 aspect-video w-72 cursor-pointer rounded-lg border border-white/20 bg-black object-contain shadow-xl hover:border-[#85a7ff]"
        }
      />
      {lost && (
        <div className="absolute left-1/2 top-20 z-20 -translate-x-1/2 rounded-lg bg-[#e5484d] px-4 py-2 text-[13px] text-white shadow">
          Couldn't read {vod.name}: was it moved or renamed? Add the recording again.
        </div>
      )}
      {main && held && (
        <div className="pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 rounded-full bg-[#0b1430]/85 px-3 py-1 text-[12px] text-white/70">
          The game's goal replay: the 3D waits for the kickoff
        </div>
      )}
    </>
  )
}

/** The studio's controls: the recording to use, how it lines up, the play, marks and OBS. */
export function StudioBar({
  replay,
  playback,
  vod,
  onVod,
  lookup,
  sync,
  nudge,
  onNudge,
  screen,
  onSwap,
  range,
  onRange,
  loop,
  onLoop,
  onClose,
  volume,
  onVolume,
  short,
}: {
  replay: Replay
  playback: Playback
  vod?: File
  onVod: (file: File) => void
  lookup?: Lookup
  sync: Sync
  nudge: number
  onNudge: (nudge: number) => void
  screen: Screen
  onSwap: () => void
  range?: [number, number]
  onRange: (range?: [number, number]) => void
  loop: boolean
  onLoop: (loop: boolean) => void
  onClose: () => void
  volume: number
  onVolume: (volume: number) => void
  /** Recording shorts: OBS records with its "Shorts" profile, and each play is a chapter named for it. */
  short?: { chapter: string }
}) {
  usePlayback(playback)
  const marks = useMarks(replay)
  const obs = useObs()

  // Each play recorded is a chapter of the take, so the edit knows which play it was.
  const recordingNow = Boolean(obs.recording?.active)
  const chapter = short?.chapter
  useEffect(() => {
    if (recordingNow && chapter) void obs.client?.chapter(chapter)
  }, [recordingNow, chapter, obs.client])

  const mark = () => {
    const time = playback.time
    const label = `M${marks.list.length + 1} · ${clock(replay, time)}`
    const recorded = obs.recording?.active ? obs.recording.duration + (performance.now() - obs.recording.since) : undefined
    marks.add({ time, video: vod ? toVideo(sync, time) + nudge : undefined, recorded, label })
    if (recorded !== undefined) void obs.client?.chapter(label)
  }

  // Studio keys: V swaps, I and O set the play, L loops it, M marks.
  const keys = useRef<Record<string, () => void>>({})
  keys.current = {
    v: () => vod && onSwap(),
    i: () => onRange([playback.time, Math.max(playback.time + 1, range?.[1] ?? playback.time + 8)]),
    o: () => onRange([Math.min(range?.[0] ?? playback.time - 8, playback.time - 1), playback.time]),
    l: () => range && onLoop(!loop),
    m: mark,
  }
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement && event.target.type !== "range") return
      if (event.metaKey || event.ctrlKey || event.altKey) return
      const action = keys.current[event.key.toLowerCase()]
      if (!action) return
      event.preventDefault()
      action()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  // Looping the play: past its end, back to its start.
  useEffect(
    () =>
      playback.subscribe(() => {
        if (loop && range && playback.playing && playback.time >= range[1]) playback.seek(range[0])
      }),
    [playback, loop, range],
  )

  const found = lookup?.status === "found"
  const match = found && sync.session && sync.index !== undefined ? sync.session.matches[sync.index] : undefined

  return (
    <div className="flex flex-wrap items-center gap-2 text-[12px]">
      <Group>
        <label className="cursor-pointer whitespace-nowrap px-2.5 py-1.5 text-white/75 hover:bg-white/10" title={vod?.name}>
          {vod ? "Recording ✓" : "Add the recording…"}
          <input type="file" accept="video/*,.mkv" className="hidden" onChange={(event) => {
              const file = event.target.files?.[0]
              // Cleared, so choosing the same file again (after moving it) still counts.
              event.target.value = ""
              if (file) onVod(file)
            }} />
        </label>
        {vod && (
          <Choice active={false} onClick={() => onVolume(VOLUMES[(VOLUMES.indexOf(volume) + 1) % VOLUMES.length])}>
            {volume === 1 ? "Sound: full" : volume ? "Sound: low" : "Sound: off"}
          </Choice>
        )}
        {vod && (
          <Choice active={screen === "vod"} onClick={onSwap}>
            {screen === "vod" ? "Showing the recording · V" : "Showing the 3D · V"}
          </Choice>
        )}
      </Group>

      {vod && (
        <Group>
          <span className="whitespace-nowrap px-2.5 py-1.5 text-white/60" title={found ? `Off by ${sync.error.toFixed(2)} s on average at the goals` : undefined}>
            {lookup?.status === "looking"
              ? "Finding the match…"
              : match
                ? `Match ${sync.index! + 1} of ${sync.session!.id} · ${match.score.join("–")}`
                : `${lookup?.status === "missing" ? lookup.reason : "No match"}: line it up by hand`}
          </span>
          {NUDGES.map((step) => (
            <button key={step} onClick={() => onNudge(+(nudge + step).toFixed(2))} className="px-2 py-1.5 text-white/75 hover:bg-white/10" title="Move the recording against the replay">
              {step > 0 ? "+" : "−"}
              {Math.abs(step)}s
            </button>
          ))}
          <span className="px-2 py-1.5 font-mono tabular-nums text-white/50">{nudge >= 0 ? "+" : "−"}{Math.abs(nudge).toFixed(2)}</span>
        </Group>
      )}

      <Group>
        <Choice active={false} onClick={() => keys.current.i()}>
          In · I
        </Choice>
        <Choice active={false} onClick={() => keys.current.o()}>
          Out · O
        </Choice>
        {range && (
          <>
            <span className="whitespace-nowrap px-2 py-1.5 font-mono tabular-nums text-white/60">
              {clock(replay, range[0])}–{clock(replay, range[1])}
            </span>
            <Choice active={loop} onClick={() => onLoop(!loop)}>
              Loop · L
            </Choice>
            <Choice active={false} onClick={() => (onRange(undefined), onLoop(false))}>
              ×
            </Choice>
          </>
        )}
      </Group>

      <Group>
        <Choice active={false} onClick={mark}>
          Mark · M{marks.list.length ? ` (${marks.list.length})` : ""}
        </Choice>
        {marks.list.length > 0 && (
          <>
            <Choice active={false} onClick={() => marks.save(replay)}>
              Save marks
            </Choice>
            <Choice active={false} onClick={() => confirm("Clear the marks of this replay?") && marks.clear()}>
              Clear
            </Choice>
          </>
        )}
      </Group>

      <ObsControls obs={obs} short={Boolean(short)} />

      <Group>
        <Choice active={false} onClick={onClose}>
          Close the studio
        </Choice>
      </Group>
    </div>
  )
}

/** The marks of this replay, kept in this browser until cleared. */
function useMarks(replay: Replay) {
  const key = `rlr:marks:${replay.name}`
  const [list, setList] = useState<Mark[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(key) ?? "[]")
    } catch {
      return []
    }
  })
  const keep = (next: Mark[]) => {
    setList(next)
    try {
      localStorage.setItem(key, JSON.stringify(next))
    } catch {
      // Not kept past this visit.
    }
  }
  return {
    list,
    add: (mark: Mark) => keep([...list, mark]),
    clear: () => keep([]),
    /** Downloads them as JSON, for the edit. */
    save: (replay: Replay) => {
      const blob = new Blob([JSON.stringify({ replay: replay.name, date: replay.date, marks: list }, null, 2)], { type: "application/json" })
      const link = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: `marks-${replay.name}.json` })
      link.click()
      URL.revokeObjectURL(link.href)
    },
  }
}

type ObsState = { client?: Obs; recording?: Recording; error?: string; connecting: boolean }

function useObs() {
  const [state, setState] = useState<ObsState>({ connecting: false })
  const connect = async (settings = savedObs()) => {
    const client = new Obs()
    client.onRecording = (recording) => setState((current) => ({ ...current, recording }))
    client.onClose = () => setState({ connecting: false })
    setState({ connecting: true })
    try {
      await client.connect(settings)
      saveObs(settings)
      setState((current) => ({ ...current, client, connecting: false, error: undefined }))
    } catch (error) {
      client.close()
      setState({ connecting: false, error: String((error as Error).message ?? error) })
    }
  }
  useEffect(() => () => state.client?.close(), [state.client])
  return { ...state, connect }
}

/**
 * OBS's profiles and scene collections for what the studio records, each with the same name for both (generated by
 * `brand/twitch/obs_shorts.py` and `obs_video.py` in Luan's site's repository): shorts on a 1080×1920 canvas, the
 * screen's top left corner over his camera; commented videos on 1920×1080, the whole screen with his camera in a
 * corner. The live's own are put back afterwards.
 */
const PROFILES = { short: "Shorts", video: "Vídeo" } as const
const BACK = "rlr:obs:back"

/** Into the profile and scenes for a short or a video. Never on air. */
async function intoProfile(client: Obs, name: string) {
  if ((await client.call("GetStreamStatus")).outputActive) throw new Error("OBS is live: record off air.")
  const profile = String((await client.call("GetProfileList")).currentProfileName)
  const collection = String((await client.call("GetSceneCollectionList")).currentSceneCollectionName)
  if (profile === name && collection === name) return
  try {
    // Only the live's is kept to go back to, not another of the studio's.
    if (!(Object.values(PROFILES) as string[]).includes(profile)) localStorage.setItem(BACK, JSON.stringify({ profile, collection }))
  } catch {
    // Put back by hand then.
  }
  if (profile !== name) await client.call("SetCurrentProfile", { profileName: name })
  if (collection !== name) await client.call("SetCurrentSceneCollection", { sceneCollectionName: name })
  // The collection's sources (the camera) take a moment to start.
  await new Promise((resolve) => setTimeout(resolve, 2000))
}

/** Back to the live's profile and scenes, once the recording has stopped. */
async function backToLive(client: Obs) {
  let back: { profile: string; collection: string } | undefined
  try {
    back = JSON.parse(localStorage.getItem(BACK) ?? "null") ?? undefined
  } catch {
    back = undefined
  }
  if (!back) return
  for (let i = 0; i < 20 && (await client.recording()).active; i++) await new Promise((resolve) => setTimeout(resolve, 500))
  await client.call("SetCurrentSceneCollection", { sceneCollectionName: back.collection })
  await client.call("SetCurrentProfile", { profileName: back.profile })
  localStorage.removeItem(BACK)
}

/** Connecting to OBS, then starting and stopping its recording, with how long it's been going. */
function ObsControls({ obs, short }: { obs: ReturnType<typeof useObs>; short: boolean }) {
  const [problem, setProblem] = useState<string>()
  const [switched, setSwitched] = useState(false)
  const [asking, setAsking] = useState(false)
  const [settings, setSettings] = useState(savedObs)
  const elapsed = useElapsed(obs.recording)

  if (!obs.client) {
    return (
      <div className="relative">
        <Group>
          <Choice active={false} onClick={() => (settings.password ? void obs.connect(settings) : setAsking(true))}>
            {obs.connecting ? "Connecting to OBS…" : "Connect OBS"}
          </Choice>
          <Choice active={asking} onClick={() => setAsking(!asking)}>
            ⚙
          </Choice>
        </Group>
        {(asking || obs.error) && (
          <form
            onSubmit={(event) => {
              event.preventDefault()
              setAsking(false)
              void obs.connect(settings)
            }}
            className="absolute bottom-full left-0 mb-2 w-72 space-y-2 rounded-lg border border-white/10 bg-[#0b1430]/95 p-3 text-[12px] backdrop-blur"
          >
            {obs.error && <p className="text-[#ff8a8a]">{obs.error}</p>}
            <label className="block">
              <span className="text-white/60">Address</span>
              <input value={settings.url} onChange={(event) => setSettings({ ...settings, url: event.target.value })} className="mt-1 w-full rounded bg-white/10 px-2 py-1" type="text" />
            </label>
            <label className="block">
              <span className="text-white/60">Password (OBS → Tools → WebSocket Server Settings)</span>
              <input value={settings.password} onChange={(event) => setSettings({ ...settings, password: event.target.value })} className="mt-1 w-full rounded bg-white/10 px-2 py-1" type="password" />
            </label>
            <p className="text-white/40">Kept in this browser only.</p>
            <button className="rounded-full bg-[#f4f5f7] px-3 py-1 font-medium text-[#002fa7]">Connect</button>
          </form>
        )}
      </div>
    )
  }

  const recording = obs.recording?.active
  const client = obs.client
  const toggle = async () => {
    setProblem(undefined)
    try {
      if (recording) await client.call("StopRecord")
      else {
        await intoProfile(client, short ? PROFILES.short : PROFILES.video).then(() => setSwitched(true))
        await client.call("StartRecord")
      }
    } catch (error) {
      setProblem(String((error as Error).message ?? error))
    }
  }
  return (
    <Group>
      {problem && <span className="px-2.5 py-1.5 text-[#ff8a8a]">{problem}</span>}
      {switched && !recording && (
        <Choice active={false} onClick={() => void backToLive(client).then(() => setSwitched(false), (error) => setProblem(String(error.message ?? error)))}>
          Back to the live's OBS
        </Choice>
      )}
      <button
        onClick={() => void toggle()}
        className={`flex items-center gap-1.5 whitespace-nowrap px-2.5 py-1.5 ${recording ? "bg-[#e5484d] text-white" : "text-white/75 hover:bg-white/10"}`}
      >
        <span className={`h-2 w-2 rounded-full ${recording ? "animate-pulse bg-white" : "bg-[#e5484d]"}`} />
        {recording ? `Recording ${elapsed}` : short ? "Record a short" : "Record a video"}
      </button>
    </Group>
  )
}

/** How long OBS has been recording, ticking. */
function useElapsed(recording?: Recording) {
  const [, tick] = useState(0)
  useEffect(() => {
    if (!recording?.active) return
    const timer = setInterval(() => tick((n) => n + 1), 1000)
    return () => clearInterval(timer)
  }, [recording])
  if (!recording?.active) return ""
  const seconds = Math.floor((recording.duration + performance.now() - recording.since) / 1000)
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`
}

/**
 * The studio's lining up: the session's when found (moved for a recording that started later, the game's own), by
 * hand otherwise; and the nudge, kept per session.
 */
export function useLineUp(replay: Replay, lookup?: Lookup, vod?: File) {
  const sync = useMemo(
    () => (lookup?.status === "found" ? forRecording(lookup.sync, vod?.name ?? "") : byHand(replay)),
    [lookup, replay, vod],
  )
  const key = nudgeKey(sync, replay)
  const [nudges, setNudges] = useState<Record<string, number>>({})
  const nudge = nudges[key] ?? readNudge(key)
  const setNudge = (value: number) => {
    setNudges((current) => ({ ...current, [key]: value }))
    try {
      localStorage.setItem(key, String(value))
    } catch {
      // Not kept past this visit.
    }
  }
  return { sync, nudge, setNudge }
}
