import { useEffect, useRef, useState, type ReactNode } from "react"
import { usePlayback, type Playback } from "../playback"
import type { Goal, Replay } from "../replay/model"
import { momentAt } from "../replay/sample"
import { TEAMS } from "../scene/field"

const SPEEDS = [0.25, 0.5, 1, 2]
/** Watching or playing a goal starts this long before it. */
export const GOAL_LEAD = 5

/** A moment from outside the replay to show on the scrubber: the stream dock's shots, saves… */
export interface Tick {
  time: number
  label: string
}

/**
 * Play, pause, speed, and a scrubber marked with the goals and demos; in the
 * studio also with the play being looked at (`range`) and Luan's own moments (`ticks`).
 * `children` is a toolbar under it, in the same panel. A goal's marker opens
 * what to do with it: watch it, or (`onPlayGoal`) save it or score it again
 * as one of the players.
 */
export function Timeline({
  replay,
  playback,
  range,
  ticks = [],
  onPlayGoal,
  children,
}: {
  replay: Replay
  playback: Playback
  range?: [number, number]
  ticks?: Tick[]
  onPlayGoal?: (goal: Goal, car: number) => void
  children?: ReactNode
}) {
  usePlayback(playback)
  const [open, setOpen] = useState<Goal>()
  const { start, end, time, playing, speed } = playback
  const at = (seconds: number) => `${((seconds - start) / (end - start)) * 100}%`

  return (
    <div className="rounded-2xl border border-white/10 bg-[#0b1430]/85 backdrop-blur">
    <div className="flex items-center gap-3 px-3 py-2">
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
        {range && (
          <div
            className="absolute top-1/2 h-3 -translate-y-1/2 rounded-sm border border-[#ffd166] bg-[#ffd166]/25"
            style={{ left: at(range[0]), width: `calc(${at(range[1])} - ${at(range[0])})` }}
          />
        )}
        {ticks.map((tick) => (
          <button
            key={`${tick.time}-${tick.label}`}
            onClick={() => playback.seek(tick.time - 3)}
            title={tick.label}
            className="absolute bottom-0 z-10 h-3 w-1.5 -translate-x-1/2 rounded-full bg-[#ffd166] hover:scale-125"
            style={{ left: at(tick.time) }}
          />
        ))}
        {replay.goals.map((goal) => (
          <button
            key={goal.time}
            onClick={() => (onPlayGoal ? setOpen(open === goal ? undefined : goal) : playback.seek(goal.time - GOAL_LEAD))}
            title={`${goal.scorer ?? TEAMS[goal.team].name} · ${goal.score.join("–")}`}
            className={`absolute top-0 z-10 h-3 w-3 -translate-x-1/2 rotate-45 rounded-[2px] border transition-transform hover:scale-125 ${open === goal ? "scale-125 border-white" : "border-white/60"}`}
            style={{ left: at(goal.time), background: TEAMS[goal.team].color }}
          />
        ))}
        {open && onPlayGoal && (
          <GoalMenu
            replay={replay}
            goal={open}
            left={at(open.time)}
            onWatch={() => {
              setOpen(undefined)
              playback.seek(open.time - GOAL_LEAD)
            }}
            onPlay={(car) => {
              setOpen(undefined)
              onPlayGoal(open, car)
            }}
            onClose={() => setOpen(undefined)}
          />
        )}
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
    {children && <div className="border-t border-white/10 px-3 py-2">{children}</div>}
    </div>
  )
}

/** What to do with a goal: watch it, save it as one of the team that conceded, or score it again as one of the scorers. */
function GoalMenu({ replay, goal, left, onWatch, onPlay, onClose }: { replay: Replay; goal: Goal; left: string; onWatch: () => void; onPlay: (car: number) => void; onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const away = (event: PointerEvent) => !box.current?.contains(event.target as Node) && !(event.target as Element).closest?.("[title]") && onClose()
    const escape = (event: KeyboardEvent) => event.key === "Escape" && onClose()
    window.addEventListener("pointerdown", away)
    window.addEventListener("keydown", escape)
    return () => {
      window.removeEventListener("pointerdown", away)
      window.removeEventListener("keydown", escape)
    }
  }, [onClose])
  const players = (team: 0 | 1) =>
    replay.cars.flatMap((car, index) =>
      car.team === team
        ? [
            <button key={car.id} onClick={() => onPlay(index)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-white/85 hover:bg-white/10">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: TEAMS[team].color }} />
              <span className="truncate">{car.name}</span>
            </button>,
          ]
        : [],
    )
  const conceded = (goal.team === 0 ? 1 : 0) as 0 | 1
  return (
    <div
      ref={box}
      className="absolute bottom-full z-30 mb-3 w-60 -translate-x-1/2 rounded-xl border border-white/10 bg-[#0b1430]/95 p-1.5 text-[12px] shadow-2xl backdrop-blur"
      style={{ left: `clamp(7.5rem, ${left}, calc(100% - 7.5rem))` }}
    >
      <div className="flex items-center gap-2 px-2 pb-1.5 pt-1">
        <span className="h-2.5 w-2.5 rotate-45 rounded-[2px]" style={{ background: TEAMS[goal.team].color }} />
        <span className="truncate font-medium text-white">{goal.scorer ?? TEAMS[goal.team].name}</span>
        <span className="ml-auto tabular-nums text-white/50">{goal.score.join("–")}</span>
      </div>
      <button onClick={onWatch} className="flex w-full items-center rounded-lg px-2 py-1.5 text-left text-white/85 hover:bg-white/10">
        Watch it from {GOAL_LEAD} s before
      </button>
      <p className="mt-1.5 border-t border-white/10 px-2 pb-0.5 pt-2 text-white/45">Save it as</p>
      {players(conceded)}
      <p className="mt-1 px-2 pb-0.5 pt-1.5 text-white/45">Score it again as</p>
      {players(goal.team)}
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
