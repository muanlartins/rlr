import { usePlayback, type Playback } from "../playback"
import type { Replay } from "../replay/model"
import { momentAt } from "../replay/sample"
import { TEAMS } from "../scene/field"
import { clock } from "./timeline"

/**
 * The score and clock up top, and each team's players with their boost. With
 * `onFollow`, a player is also the way to see from their car (and their number
 * key says so); the one followed is lit.
 */
export function Scoreboard({ replay, playback, followed, onFollow }: { replay: Replay; playback: Playback; followed?: number; onFollow?: (car: number) => void }) {
  usePlayback(playback)
  const { time } = playback
  const { frame } = momentAt(replay.times, time)
  const score = replay.goals.filter((goal) => goal.time <= time).at(-1)?.score ?? [0, 0]

  return (
    <div className="pointer-events-none flex items-start justify-between gap-4">
      {([0, 1] as const).map((team) => (
        <ul key={team} className={team ? "order-3 space-y-1 text-right" : "order-1 space-y-1"}>
          {replay.cars.map((car, index) => {
            if (car.team !== team) return null
            const lit = followed === index
            return (
              <li key={car.id}>
                <button
                  onClick={() => onFollow?.(index)}
                  disabled={!onFollow}
                  title={onFollow ? `See from ${car.name}'s car (${index + 1})` : undefined}
                  className={`pointer-events-auto block w-44 rounded-md px-2 py-1 text-[12px] backdrop-blur transition-colors ${team ? "text-right" : "text-left"} ${
                    lit ? "bg-[#f4f5f7]/95 text-[#002fa7]" : "bg-[#0b1430]/70 text-white enabled:hover:bg-[#0b1430]/95"
                  }`}
                >
                  <span className={`flex items-center gap-1.5 ${team ? "flex-row-reverse" : ""}`}>
                    <span className="truncate">{car.name}</span>
                    {onFollow && <span className={`shrink-0 font-mono text-[10px] ${team ? "mr-auto" : "ml-auto"} ${lit ? "text-[#002fa7]/60" : "text-white/35"}`}>{index + 1}</span>}
                  </span>
                  <span className={`mt-1 block h-1 overflow-hidden rounded-full ${lit ? "bg-[#002fa7]/15" : "bg-white/15"}`}>
                    <span className="block h-full rounded-full" style={{ width: `${car.boost[frame]}%`, background: TEAMS[team].color, marginLeft: team ? "auto" : 0 }} />
                  </span>
                </button>
              </li>
            )
          })}
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
