import { useRef } from "react"

/** The ring's radius and thickness, in the gauge's own 100 × 100 box. */
const R = 40
const STROKE = 9
const LENGTH = 2 * Math.PI * R

/**
 * The boost meter as the game draws it: a ring that fills clockwise from the
 * bottom, the amount in the middle, and, under it, the speed when it's given.
 * With `onChange` it's a dial: pressing or dragging around the ring sets the boost.
 */
export function BoostGauge({ boost, color, size = 112, speed, onStart, onChange }: { boost: number; color: string; size?: number; speed?: number; onStart?: () => void; onChange?: (boost: number) => void }) {
  const ring = useRef<SVGSVGElement>(null)
  const amount = Math.max(0, Math.min(100, boost))

  const set = (event: { clientX: number; clientY: number }) => {
    const box = ring.current!.getBoundingClientRect()
    const x = event.clientX - (box.left + box.width / 2)
    const y = event.clientY - (box.top + box.height / 2)
    // Clockwise from straight down: 0 at the bottom, 50 at the top.
    const turn = (Math.atan2(-x, y) / (2 * Math.PI) + 1) % 1
    onChange?.(Math.round(turn * 100))
  }

  return (
    <svg
      ref={ring}
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={onChange ? "cursor-pointer touch-none select-none" : "pointer-events-none select-none"}
      onPointerDown={
        onChange &&
        ((event) => {
          onStart?.()
          set(event)
          const target = event.currentTarget
          target.setPointerCapture(event.pointerId)
          const move = (next: PointerEvent) => set(next)
          const up = () => {
            target.removeEventListener("pointermove", move)
            target.removeEventListener("pointerup", up)
          }
          target.addEventListener("pointermove", move)
          target.addEventListener("pointerup", up)
        })
      }
    >
      <circle cx={50} cy={50} r={R + STROKE / 2 + 3} fill="#0b1430" fillOpacity={0.78} />
      <circle cx={50} cy={50} r={R} fill="none" stroke="white" strokeOpacity={0.14} strokeWidth={STROKE} />
      {/* Drawn from the bottom: the circle starts at 3 o'clock, so turn it a quarter. */}
      <circle
        cx={50}
        cy={50}
        r={R}
        fill="none"
        stroke={color}
        strokeWidth={STROKE}
        strokeDasharray={`${(amount / 100) * LENGTH} ${LENGTH}`}
        transform="rotate(90 50 50)"
      />
      <text x={50} y={speed === undefined ? 50 : 47} textAnchor="middle" dominantBaseline="central" fill="white" fontSize={30} fontWeight={600} className="tabular-nums">
        {Math.round(amount)}
      </text>
      {speed !== undefined && (
        <text x={50} y={68} textAnchor="middle" dominantBaseline="central" fill="white" fillOpacity={0.7} fontSize={10} className="tabular-nums">
          {Math.round(speed)} km/h
        </text>
      )}
    </svg>
  )
}
