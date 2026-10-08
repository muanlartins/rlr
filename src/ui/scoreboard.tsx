import { usePlayback, type Playback } from "../playback"
import type { Replay } from "../replay/model"
import { momentAt } from "../replay/sample"
import { TEAMS } from "../scene/field"
import { clock } from "./timeline"

/** The score and clock up top, and each team's players with their boost. */
export function Scoreboard({ replay, playback }: { replay: Replay; playback: Playback }) {
  usePlayback(playback)
  const { time } = playback
  const { frame } = momentAt(replay.times, time)
  const score = replay.goals.filter((goal) => goal.time <= time).at(-1)?.score ?? [0, 0]

  return (
    <div className="pointer-events-none flex items-start justify-between gap-4">
      {([0, 1] as const).map((team) => (
        <ul key={team} className={team ? "order-3 space-y-1 text-right" : "order-1 space-y-1"}>
          {replay.cars.filter((car) => car.team === team).map((car) => (
            <li key={car.id} className="w-40 rounded-md bg-[#0b1430]/70 px-2 py-1 text-[12px] text-white backdrop-blur">
              <span className="block truncate">{car.name}</span>
              <span className="mt-1 block h-1 overflow-hidden rounded-full bg-white/15">
                <span className="block h-full rounded-full" style={{ width: `${car.boost[frame]}%`, background: TEAMS[team].color, marginLeft: team ? "auto" : 0 }} />
              </span>
            </li>
          ))}
        </ul>
      ))}
      <div className="order-2 flex items-stretch overflow-hidden rounded-lg text-white shadow-lg">
        <span className="grid w-12 place-items-center text-xl font-semibold" style={{ background: TEAMS[0].color }}>{score[0]}</span>
        <span className="grid place-items-center bg-[#0b1430]/90 px-3 font-mono text-[15px] tabular-nums">{clock(replay, time)}</span>
        <span className="grid w-12 place-items-center text-xl font-semibold" style={{ background: TEAMS[1].color }}>{score[1]}</span>
      </div>
    </div>
  )
}
