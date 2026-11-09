import { useEffect, useState } from "react"
import { ACTIONS, DEFAULTS, keyName, padName, saveBindings, type Bindings, type KeyAction, type PadAction } from "../physics/bindings"
import type { Input } from "../physics/input"

/** What's waiting for a press to bind: a controller button or a key. */
type Catching = { kind: "pad"; action: PadAction } | { kind: "keys"; action: KeyAction }

/**
 * The controls: each action's controller button and key, changed by clicking
 * one and pressing the new one; the stick's deadzone and pitch. Saved in this
 * browser as they change.
 */
export function ControlsSheet({ input, onClose }: { input: Input; onClose: () => void }) {
  const [bindings, setBindings] = useState<Bindings>(input.bindings)
  const [catching, setCatching] = useState<Catching>()
  const [pad, setPad] = useState(input.padName)

  // The controller can be plugged in while the sheet is open; the browser shows it after its first press.
  useEffect(() => {
    const timer = setInterval(() => setPad(navigator.getGamepads?.().find((each) => each?.connected)?.id.replace(/\s*\(.*$/, "")), 500)
    return () => clearInterval(timer)
  }, [])
  useEffect(() => () => input.cancel(), [input])
  useEffect(() => {
    const close = (event: KeyboardEvent) => event.key === "Escape" && !catching && onClose()
    window.addEventListener("keydown", close)
    return () => window.removeEventListener("keydown", close)
  }, [catching, onClose])

  const change = (next: Bindings) => {
    input.bindings = next
    saveBindings(next)
    setBindings(next)
  }
  const bind = (target: Catching) => {
    setCatching(target)
    input.catch(target.kind, (code) => {
      setCatching(undefined)
      if (code === undefined) return
      if (target.kind === "pad") change({ ...input.bindings, pad: { ...input.bindings.pad, [target.action]: code as number } })
      else change({ ...input.bindings, keys: { ...input.bindings.keys, [target.action]: code as string } })
    })
  }
  const waiting = (kind: "pad" | "keys", action: string) => catching?.kind === kind && catching.action === action

  return (
    <div className="absolute inset-0 z-20 grid place-items-center bg-[#050a1a]/60 p-4 backdrop-blur-sm" onMouseDown={(event) => event.target === event.currentTarget && !catching && onClose()}>
      <div className="w-full max-w-xl rounded-2xl border border-white/10 bg-[#0b1430] p-5 text-[13px] shadow-2xl">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-[17px] font-medium">Controls</h2>
          <span className="text-white/50">{pad ? `${pad} connected` : "No controller yet: press any button on it"}</span>
        </div>

        <div className="mt-4 grid grid-cols-[1fr_9rem_9rem] items-center gap-x-2 gap-y-1">
          <span />
          <span className="px-2 text-[12px] text-white/45">Controller</span>
          <span className="px-2 text-[12px] text-white/45">Keyboard and mouse</span>
          {ACTIONS.map((row) => (
            <Row key={row.name} name={row.name}>
              {row.pad ? (
                <Binding waiting={waiting("pad", row.pad)} onClick={() => bind({ kind: "pad", action: row.pad! })}>
                  {padName(bindings.pad[row.pad])}
                </Binding>
              ) : (
                <span className="px-2 text-white/35">Left stick</span>
              )}
              {row.key ? (
                <Binding waiting={waiting("keys", row.key)} onClick={() => bind({ kind: "keys", action: row.key! })}>
                  {keyName(bindings.keys[row.key])}
                </Binding>
              ) : (
                <span />
              )}
            </Row>
          ))}
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-white/10 pt-4">
          <label className="flex items-center gap-3">
            <span className="text-white/70">Stick deadzone</span>
            <input
              type="range"
              min={0}
              max={0.4}
              step={0.01}
              value={bindings.deadzone}
              onChange={(event) => change({ ...bindings, deadzone: Number(event.target.value) })}
              className="w-32 accent-[#85a7ff]"
            />
            <span className="w-9 font-mono tabular-nums text-white/60">{Math.round(bindings.deadzone * 100)}%</span>
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-white/70">
            <input type="checkbox" checked={bindings.invertPitch} onChange={(event) => change({ ...bindings, invertPitch: event.target.checked })} className="accent-[#85a7ff]" />
            Invert pitch
          </label>
          <div className="ml-auto flex gap-2">
            <button onClick={() => change(structuredClone(DEFAULTS))} className="rounded-full px-3 py-1.5 text-white/60 hover:bg-white/10 hover:text-white">
              Game defaults
            </button>
            <button onClick={onClose} className="rounded-full bg-[#f4f5f7] px-4 py-1.5 font-medium text-[#002fa7]">
              Done
            </button>
          </div>
        </div>
        <p className="mt-3 text-[12px] text-white/40">Click a button or key, then press the new one. Esc keeps the old key.</p>
      </div>
    </div>
  )
}

function Row({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <>
      <span className="text-white/80">{name}</span>
      {children}
    </>
  )
}

function Binding({ waiting, onClick, children }: { waiting: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`truncate rounded-lg border px-2 py-1 text-left transition-colors ${waiting ? "animate-pulse border-[#85a7ff] bg-[#85a7ff]/15 text-white" : "border-white/10 bg-white/[0.04] text-white/85 hover:border-white/25"}`}
    >
      {waiting ? "Press one…" : children}
    </button>
  )
}
