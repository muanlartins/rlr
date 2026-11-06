import type { Entry, Events, Session } from "./sync"

/**
 * A live's plays worth a short, found the same way every time: from what the stream's "Partidas" dock logged
 * (goals with km/h, the game's own stats such as aerial goals, epic saves and flip resets) and from what Luan
 * said in the live's transcript at that moment ("que golaço!"). Luan's own plays only. Each gets points, and the
 * day's best come first:
 *
 *   his goal              10, +1 for each 10 km/h, +3 at 100 km/h or more
 *   …aerial, long         +6, +5
 *   …bicycle, flip reset  +8, +10 (when his stat comes up to 5 s before the goal)
 *   …in overtime          +6
 *   his assist            6, +1 for each 20 km/h of the goal
 *   epic save, save       8, 3
 *   flip reset (no goal)  6
 *   his shot on the bar   2, from 90 km/h
 *   what he said          +4 for each excited line from 3 s before to 12 s after, up to +8
 *
 * Times are the dock's: seconds from the match's start (`log.start`).
 */

export interface Play {
  /** The match's number in the day, as the lives folder names its replay ("Partida 02 - …"). */
  number: number
  /** The dock's match id. */
  match: string
  /** The moment itself, and the stretch a short loops: dock seconds. */
  t: number
  from: number
  to: number
  kind: "goal" | "assist" | "save" | "reset" | "bar"
  /** "Goal · 113 km/h · aerial", for the list. */
  label: string
  points: number
  /** The lines that added points, as said. */
  said: string[]
}

/** [video second, text], as the site keeps a live's transcript (content/lives/<date>.transcript.json). */
export type Transcript = [number, string][]

const EXCITED = /gola[çc]o|que gol|caralho|caramba|nossa|meu deus|que isso|absurd|lind[oa]|insan|pancada|que jogada|isso!|uau|mds|cara+lho/i

const between = (from: string, to: string) => (Date.parse(to) - Date.parse(from)) / 1000

/** The local day (Brasília) a match was played, as the lives folder files it. */
const dayOf = (iso: string) => new Date(Date.parse(iso) - 3 * 3600_000).toISOString().slice(0, 10)

export function findPlays(date: string, candidates: { session: Session; events: Events }[], transcript: Transcript = []): Play[] {
  const day = candidates
    .flatMap(({ session, events }) =>
      session.matches.map((match) => ({ match, session, log: events.matches.find((logged) => logged.id === match.id) })),
    )
    .filter(({ match }) => dayOf(match.start ?? match.at) === date)
    .sort((a, b) => Date.parse(a.match.start ?? a.match.at) - Date.parse(b.match.start ?? b.match.at))

  const plays: Play[] = []
  day.forEach(({ match, session, log }, index) => {
    if (!log) return
    const number = index + 1
    const recording = session.outputs?.find((output) => output.kind === "record")?.start
    // The transcript's seconds are the recording's: a dock second is that plus how far into it the match started.
    const base = recording ? between(recording, log.start) : undefined
    const said = (t: number) =>
      base === undefined ? [] : transcript.filter(([second, text]) => second >= base + t - 3 && second <= base + t + 12 && EXCITED.test(text)).map(([, text]) => text)
    const kickoffs = log.log.filter((entry) => entry.type === "kickoff").map((entry) => entry.t)
    const start = (t: number, before: number) => Math.max(kickoffs.findLast((kick) => kick <= t) ?? 0, t - before)
    const mine = (name: string, t: number, before: number, after = 1.5) =>
      log.log.some((entry) => entry.type === "stat" && entry.name === name && entry.by === "me" && entry.t >= t - before && entry.t <= t + after)

    // The dock logs a second "goal" as the game's goal replay ends, with "replay-end" at the same moment.
    const ends = new Set(log.log.filter((entry) => entry.type === "replay-end").map((entry) => entry.t))
    const goals = log.log.filter((entry) => entry.type === "goal" && !ends.has(entry.t))
    const taken = new Set<number>()
    const add = (entry: Entry, kind: Play["kind"], points: number, tags: string[], before: number, after: number) => {
      const lines = said(entry.t)
      const bonus = Math.min(8, 4 * lines.length)
      plays.push({
        number,
        match: match.id,
        t: entry.t,
        from: start(entry.t, before),
        to: entry.t + after,
        kind,
        label: [tags[0], entry.kmh ? `${entry.kmh} km/h` : "", ...tags.slice(1)].filter(Boolean).join(" · "),
        points: Math.round(points + bonus),
        said: lines,
      })
      taken.add(entry.t)
    }

    for (const goal of goals) {
      const kmh = goal.kmh ?? 0
      if (goal.by === "me") {
        const tags = ["Goal"]
        let points = 10 + kmh / 10 + (kmh >= 100 ? 3 : 0)
        if (mine("AerialGoal", goal.t, 1.5)) (points += 6), tags.push("aerial")
        if (mine("LongGoal", goal.t, 1.5)) (points += 5), tags.push("long")
        if (mine("BicycleHit", goal.t, 5)) (points += 8), tags.push("bicycle")
        if (mine("FlipReset", goal.t, 5)) (points += 10), tags.push("flip reset")
        if (mine("OvertimeGoal", goal.t, 1.5)) (points += 6), tags.push("overtime")
        add(goal, "goal", points, tags, 9, 2.5)
      } else if (mine("Assist", goal.t, 1.5)) {
        add(goal, "assist", 6 + kmh / 20, ["Assist"], 9, 2.5)
      }
    }
    for (const entry of log.log) {
      if (entry.type === "stat" && entry.by === "me" && (entry.name === "EpicSave" || entry.name === "Save")) {
        // An epic save is also logged as a save.
        if ([...taken].some((t) => Math.abs(t - entry.t) < 1)) continue
        add(entry, "save", entry.name === "EpicSave" ? 8 : 3, [entry.name === "EpicSave" ? "Epic save" : "Save"], 6, 2.5)
      } else if (entry.type === "stat" && entry.by === "me" && entry.name === "FlipReset" && !goals.some((goal) => goal.by === "me" && goal.t - entry.t >= 0 && goal.t - entry.t <= 5)) {
        add(entry, "reset", 6, ["Flip reset"], 6, 3)
      } else if (entry.type === "crossbar" && entry.last === "me" && (entry.kmh ?? 0) >= 90 && ![...taken].some((t) => Math.abs(t - entry.t) < 3)) {
        add(entry, "bar", 2, ["Off the bar"], 6, 2)
      }
    }
  })
  return plays.sort((a, b) => b.points - a.points || a.number - b.number || a.t - b.t)
}

/** The transcript of a live, when its page is published; none otherwise. */
export async function transcriptOf(date: string): Promise<Transcript> {
  try {
    const response = await fetch(`https://raw.githubusercontent.com/muanlartins/muanlartins/main/content/lives/${date}.transcript.json`)
    return response.ok ? await response.json() : []
  } catch {
    return []
  }
}
