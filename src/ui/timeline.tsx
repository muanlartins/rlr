import { usePlayback, type Playback } from "../playback"
import type { Replay } from "../replay/model"
import { momentAt } from "../replay/sample"
import { TEAMS } from "../scene/field"

const SPEEDS = [0.25, 0.5, 1, 2]

/** Play, pause, speed, and a scrubber marked with the goals and demos. */
export function Timeline({ replay, playback }: { replay: Replay; playback: Playback }) {
  usePlayback(playback)
  const { start, end, time, playing, speed } = playback
  const at = (seconds: number) => `${((seconds - start) / (end - start)) * 100}%`

  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-[#0b1430]/85 px-3 py-2 backdrop-blur">
      <button
        onClick={() => playback.set({ playing: !playing })}
        className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#f4f5f7] text-[#002fa7]"
        aria-label={playing ? "Pause" : "Play"}
      >
        {playing ? <PauseIcon /> : <PlayIcon />}
      </button>
      <span className="w-12 shrink-0 text-right font-mono text-[13px] tabular-nums text-white/80">{clock(replay, time)}</span>
      <div className="relative h-9 flex-1">
        <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-white/15" />
        <div className="absolute left-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-[#85a7ff]" style={{ width: at(time) }} />
        {replay.goals.map((goal) => (
          <button
            key={goal.time}
            onClick={() => playback.seek(goal.time - 5)}
            title={`${goal.scorer ?? TEAMS[goal.team].name} · ${goal.score.join("–")}`}
            className="absolute top-0 h-3 w-3 -translate-x-1/2 rotate-45 rounded-[2px] border border-white/60"
            style={{ left: at(goal.time), background: TEAMS[goal.team].color }}
          />
        ))}
        {replay.demos.map((demo) => (
          <span
            key={demo.time}
            title={`${demo.attacker} demolished ${demo.victim}`}
            className="absolute bottom-0 h-2 w-0.5 -translate-x-1/2 bg-white/50"
            style={{ left: at(demo.time) }}
          />
        ))}
        <input
          type="range"
          min={start}
          max={end}
          step={0.001}
          value={time}
          onChange={(event) => playback.seek(Number(event.target.value))}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          aria-label="Playhead"
        />
        <span className="pointer-events-none absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow" style={{ left: at(time) }} />
      </div>
      <div className="flex shrink-0 overflow-hidden rounded-lg border border-white/10 text-[12px]">
        {SPEEDS.map((value) => (
          <button
            key={value}
            onClick={() => playback.set({ speed: value })}
            className={value === speed ? "bg-white/90 px-2 py-1 text-[#002fa7]" : "px-2 py-1 text-white/70 hover:bg-white/10"}
          >
            {value === 0.25 ? "¼" : value === 0.5 ? "½" : value}×
          </button>
        ))}
      </div>
    </div>
  )
}

/** The match clock at a time, as the game shows it: 4:32, or +0:41 in overtime. */
export function clock(replay: Replay, time: number) {
  const { frame } = momentAt(replay.times, time)
  const left = replay.clock[frame]
  const overtime = left === 0 && replay.clock.findIndex((value) => value === 0) < frame - 30
  const seconds = Math.ceil(overtime ? time - replay.times[replay.clock.findIndex((value) => value === 0)] : left)
  return `${overtime ? "+" : ""}${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 16 16" className="ml-0.5 h-4 w-4 fill-current">
      <path d="M4 2.5v11l9-5.5z" />
    </svg>
  )
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4 fill-current">
      <path d="M4 2.5h3v11H4zM9 2.5h3v11H9z" />
    </svg>
  )
}
