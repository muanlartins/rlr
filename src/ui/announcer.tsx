import { usePlayback, type Playback } from "../playback"
import type { Replay } from "../replay/model"
import { TEAMS } from "../scene/field"

/** How long "Go!" stays up after a kickoff starts, in seconds. */
const GO = 0.8

/** What the game puts in the middle of the screen: the kickoff countdown, and the goal until play resets. */
export function Announcer({ replay, playback }: { replay: Replay; playback: Playback }) {
  usePlayback(playback)
  const { time } = playback
  const goal = replay.goals.find((goal) => goal.time <= time && time < goal.reset)
  const kickoff = replay.kickoffs.find((kickoff) => kickoff.countdown <= time && time < kickoff.go + GO)

  if (goal) {
    return (
      <div className="pointer-events-none absolute inset-x-0 top-[22%] flex flex-col items-center gap-2 text-white">
        <span className="rounded-xl px-8 py-2 text-6xl font-bold tracking-tight shadow-2xl" style={{ background: TEAMS[goal.team].color }}>
          Goal!
        </span>
        <span className="rounded-full bg-[#0b1430]/85 px-4 py-1 text-[15px] backdrop-blur">
          {goal.scorer ?? TEAMS[goal.team].name} · {goal.score.join(" – ")}
        </span>
      </div>
    )
  }
  if (kickoff) {
    const count = Math.ceil(kickoff.go - time)
    return (
      <div className="pointer-events-none absolute inset-x-0 top-[22%] text-center text-8xl font-bold tracking-tight text-white drop-shadow-[0_4px_24px_rgba(0,47,167,0.9)]">
        {count > 0 ? count : <span className="text-[#85a7ff]">Go!</span>}
      </div>
    )
  }
  return null
}
