import { useEffect, useRef, useState, type ReactNode } from "react"
import type { Replay } from "../replay/model"
import { TEAMS } from "../scene/field"
import { PadIcon } from "./icons"

/** A button in the player's toolbar: an icon, maybe a word, lit while `active`. `hint` names it (and its key) on hover. */
export function ToolButton({ active = false, onClick, hint, children }: { active?: boolean; onClick: () => void; hint: string; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      title={hint}
      aria-label={hint}
      aria-pressed={active}
      className={`flex h-8 items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 transition-colors ${active ? "bg-[#f4f5f7] text-[#002fa7]" : "text-white/75 hover:bg-white/10 hover:text-white"}`}
    >
      {children}
    </button>
  )
}

/** Buttons that belong together, set in a shallow well. */
export function Segment({ children }: { children: ReactNode }) {
  return <div className="flex items-center gap-0.5 rounded-xl bg-white/[0.06] p-0.5">{children}</div>
}

/**
 * The way into playing a moment: as the player being followed, or, when
 * nobody is, a list of the players to pick from.
 */
export function PlayFromHere({ replay, followed, onPlay }: { replay: Replay; followed?: number; onPlay: (car: number) => void }) {
  const [picking, setPicking] = useState(false)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!picking) return
    const away = (event: PointerEvent) => !box.current?.contains(event.target as Node) && setPicking(false)
    window.addEventListener("pointerdown", away)
    return () => window.removeEventListener("pointerdown", away)
  }, [picking])

  const car = followed === undefined ? undefined : replay.cars[followed]
  return (
    <div ref={box} className="relative">
      <button
        onClick={() => (followed === undefined ? setPicking(!picking) : onPlay(followed))}
        title={car ? `Take ${car.name}'s car from here (J)` : "Take a player's car from here"}
        className="flex h-9 items-center gap-2 rounded-full bg-[#f4f5f7] pl-3 pr-4 font-medium text-[#002fa7] shadow-[0_0_0_4px_rgba(133,167,255,0.18)] transition-transform hover:scale-[1.03]"
      >
        <PadIcon className="h-[18px] w-[18px]" />
        Play from here
        {car && (
          <span className="flex items-center gap-1 text-[#002fa7]/60">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: TEAMS[car.team].color }} />
            <span className="max-w-28 truncate">{car.name}</span>
          </span>
        )}
      </button>
      {picking && (
        <div className="absolute bottom-full right-0 mb-2 w-56 rounded-xl border border-white/10 bg-[#0b1430]/95 p-1.5 shadow-xl backdrop-blur">
          <p className="px-2 pb-1 pt-0.5 text-white/50">Play as</p>
          {replay.cars.map((each, index) => (
            <button
              key={each.id}
              onClick={() => {
                setPicking(false)
                onPlay(index)
              }}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-white/85 hover:bg-white/10"
            >
              <span className="h-2 w-2 rounded-full" style={{ background: TEAMS[each.team].color }} />
              <span className="truncate">{each.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
