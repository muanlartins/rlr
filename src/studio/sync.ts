import type { Replay } from "../replay/model"
import { gaps } from "../replay/sample"

/**
 * Lining a replay up with the stream's recording, through the session the
 * stream's "Partidas" dock publishes on muanlartins' site repository
 * (content/matches/<id>.json and <id>.events.json): when the recording
 * started, when each match started, and each match's events by wall clock.
 *
 * While the ball is in play a replay's time runs with the wall clock, but
 * across each goal replay the game shows it loses a couple of seconds. So
 * the replay is cut at its gaps into runs, and each run gets its own offset
 * from the kickoff it holds: video = replay time + the run's offset.
 */

export interface Session {
  id: string
  outputs?: { kind: "record" | "stream"; start: string; end?: string }[]
  matches: { id: string; start: string; at: string; mode: string; result: string; score: [number, number]; overtime: boolean }[]
}

export interface Entry {
  t: number
  type: string
  name?: string
  by?: string
  kmh?: number
  /** Who touched the ball last (goals, the crossbar). */
  last?: string
}

export interface Events {
  id: string
  matches: { id: string; start: string; log: Entry[] }[]
}

/** A stretch of the replay with no gap in it, and how far ahead of it the video is. */
interface Run {
  from: number
  to: number
  offset: number
}

export interface Sync {
  /** The session and which of its matches (0-based); none when lined up by hand. */
  session?: Session
  index?: number
  /** When the recording started, ISO. */
  recording?: string
  runs: Run[]
  /** How far, on average, the replay's goals land from the dock's (seconds). */
  error: number
  /** The dock's events of the match, by replay time, for the timeline. */
  events: (Entry & { time: number })[]
}

const LISTING = "https://api.github.com/repos/muanlartins/muanlartins/contents/content/matches"

/** The published sessions within a day of the replay's date, with their events. */
export async function sessionsNear(date: string): Promise<{ session: Session; events: Events }[]> {
  const day = new Date(`${date.slice(0, 10)}T12:00:00Z`)
  const days = [-1, 0, 1].map((shift) => new Date(+day + shift * 86_400_000).toISOString().slice(0, 10))
  const files: { name: string; download_url: string }[] = await (await fetch(LISTING)).json()
  const ids = files.filter((file) => file.name.endsWith(".events.json") && days.some((day) => file.name.startsWith(day))).map((file) => file.name.replace(".events.json", ""))
  const url = (name: string) => files.find((file) => file.name === name)!.download_url
  return Promise.all(
    ids.map(async (id) => {
      const [session, events] = await Promise.all([fetch(url(`${id}.json`)).then((r) => r.json()), fetch(url(`${id}.events.json`)).then((r) => r.json())])
      return { session, events }
    }),
  )
}

/** The match this replay is, among the sessions, lined up; undefined when none fits. */
export function findMatch(replay: Replay, candidates: { session: Session; events: Events }[]): Sync | undefined {
  let best: Sync | undefined
  for (const { session, events } of candidates) {
    const recording = session.outputs?.find((output) => output.kind === "record")?.start
    if (!recording) continue
    session.matches.forEach((match, index) => {
      const log = events.matches.find((logged) => logged.id === match.id)
      if (!log) return
      const sync = line(replay, session, index, recording, log)
      if (sync && (!best || sync.error < best.error)) best = sync
    })
  }
  return best && best.error < 1 ? best : undefined
}

/** Seconds from one ISO time to another. */
const between = (from: string, to: string) => (Date.parse(to) - Date.parse(from)) / 1000

function line(replay: Replay, session: Session, index: number, recording: string, log: Events["matches"][number]): Sync | undefined {
  const base = between(recording, log.start)
  const kicks = log.log.filter((entry) => entry.type === "kickoff").map((entry) => base + entry.t)
  // The dock also logs a goal when the game's goal replay ends; that one comes with "replay-end" at the same moment.
  const ends = new Set(log.log.filter((entry) => entry.type === "replay-end").map((entry) => entry.t))
  const goals = log.log.filter((entry) => entry.type === "goal" && !ends.has(entry.t)).map((entry) => base + entry.t)
  if (!kicks.length || Math.abs(kicks.length - replay.kickoffs.length) > 1) return

  // The runs between the replay's gaps, each with the offset of the kickoff in it.
  const holes = gaps(replay.times)
  const edges = [replay.times[0], ...holes.flat(), replay.times[replay.times.length - 1]]
  const runs: Run[] = []
  for (let i = 0; i < edges.length; i += 2) runs.push({ from: edges[i], to: edges[i + 1], offset: NaN })

  // Pair the kickoffs in order; when one side has an extra, try both ways and keep the closer.
  let chosen: { runs: Run[]; error: number } | undefined
  for (const shift of [0, 1, -1]) {
    const paired = runs.map((run) => ({ ...run }))
    replay.kickoffs.forEach((kickoff, k) => {
      const dock = kicks[k + shift]
      const run = paired.find((run) => kickoff.go >= run.from && kickoff.go <= run.to)
      if (dock !== undefined && run && Number.isNaN(run.offset)) run.offset = dock - kickoff.go
    })
    // A run without a kickoff (the celebration after the last goal) keeps the one before it.
    paired.forEach((run, i) => {
      if (Number.isNaN(run.offset)) run.offset = paired.slice(0, i).reverse().find((before) => !Number.isNaN(before.offset))?.offset ?? NaN
    })
    const first = paired.find((run) => !Number.isNaN(run.offset))
    if (!first) continue
    paired.forEach((run) => Number.isNaN(run.offset) && (run.offset = first.offset))
    const misses = replay.goals.map((goal) => {
      const video = goal.time + runAt(paired, goal.time).offset
      return Math.min(...goals.map((dock) => Math.abs(dock - video)), 99)
    })
    const error = misses.length ? misses.reduce((sum, miss) => sum + miss, 0) / misses.length : 99
    if (!chosen || error < chosen.error) chosen = { runs: paired, error }
  }
  if (!chosen) return

  const sync: Sync = { session, index, recording, runs: chosen.runs, error: chosen.error, events: [] }
  sync.events = log.log
    .filter((entry) => entry.type === "stat")
    .map((entry) => ({ ...entry, time: toReplay(sync, base + entry.t).time }))
  return sync
}

/**
 * The same lining up for a recording that started later than the session's: the game's own file (`hh-mm-ss
 * Jogo.mp4`) only starts once the game is first on screen, a minute or more after OBS's recording. Its name says
 * when, to the second (OBS names it as it opens it, a fraction of a second before the first frame, hence the half).
 */
export function forRecording(sync: Sync, name: string): Sync {
  const named = name.match(/^(\d{2})-(\d{2})-(\d{2}) Jogo\./i)
  if (!named || !sync.recording) return sync
  const began = new Date(sync.recording)
  const opened = new Date(began)
  opened.setHours(+named[1], +named[2], +named[3], 500)
  const later = (+opened - +began) / 1000
  if (later <= 0 || later > 12 * 3600) return sync
  return {
    ...sync,
    recording: opened.toISOString(),
    runs: sync.runs.map((run) => ({ ...run, offset: run.offset - later })),
  }
}

/** Without a session: one offset for the whole replay, set by hand (goal replays will drift it). */
export function byHand(replay: Replay): Sync {
  return { runs: [{ from: replay.times[0], to: replay.times[replay.times.length - 1], offset: 0 }], error: NaN, events: [] }
}

/** The run a replay time belongs to: in a gap, the one before it. */
function runAt(runs: Run[], time: number) {
  return runs.findLast((run) => run.from <= time) ?? runs[0]
}

/** The video second showing a replay time. */
export function toVideo(sync: Sync, time: number) {
  return time + runAt(sync.runs, time).offset
}

/** The replay time a video second shows; `held` while the video shows something the replay doesn't have (the game's goal replay). */
export function toReplay(sync: Sync, video: number): { time: number; held: boolean } {
  const { runs } = sync
  for (let i = 0; i < runs.length; i++) {
    const time = video - runs[i].offset
    if (time < runs[i].from) return { time: runs[i].from, held: true }
    if (time <= runs[i].to) return { time, held: false }
    const next = runs[i + 1]
    if (next && video - next.offset < next.from) return { time: runs[i].to, held: true }
  }
  return { time: runs[runs.length - 1].to, held: true }
}
