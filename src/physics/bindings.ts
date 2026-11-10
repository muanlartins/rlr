/**
 * What each button and key does, the game's defaults unless changed, kept in
 * this browser (`rlr:controls`). A controller's buttons are the standard
 * gamepad mapping's indices; the keyboard's are `KeyboardEvent.code`s, and
 * the mouse's `Mouse0` (left) and `Mouse2` (right).
 */

/** What both a controller and the keyboard have. */
type Common = "jump" | "boost" | "powerslide" | "rollLeft" | "rollRight" | "ballCam" | "reset"
/** A controller's: its triggers, besides the stick. */
export type PadAction = Common | "throttle" | "reverse"
/** The keyboard's: the stick's four ways. */
export type KeyAction = Common | "forward" | "back" | "left" | "right"

export interface Bindings {
  pad: Record<PadAction, number>
  keys: Record<KeyAction, string>
  /** How far a stick moves before it counts, 0–0.5. */
  deadzone: number
  /** Stick up lifts the nose, like a plane's. */
  invertPitch: boolean
}

/** The settings' rows, in order: what each does, and its button and key (either may be missing). */
export const ACTIONS: { name: string; pad?: PadAction; key?: KeyAction }[] = [
  { name: "Acelerar", pad: "throttle", key: "forward" },
  { name: "Ré", pad: "reverse", key: "back" },
  { name: "Virar à esquerda", key: "left" },
  { name: "Virar à direita", key: "right" },
  { name: "Pular", pad: "jump", key: "jump" },
  { name: "Boost", pad: "boost", key: "boost" },
  { name: "Powerslide, air roll livre", pad: "powerslide", key: "powerslide" },
  { name: "Air roll para a esquerda", pad: "rollLeft", key: "rollLeft" },
  { name: "Air roll para a direita", pad: "rollRight", key: "rollRight" },
  { name: "Ball cam", pad: "ballCam", key: "ballCam" },
  { name: "Tentar de novo", pad: "reset", key: "reset" },
]

/** The game's defaults, but Start tries again (there's no menu to open). */
export const DEFAULTS: Bindings = {
  pad: { throttle: 7, reverse: 6, jump: 0, boost: 1, powerslide: 2, rollLeft: 4, rollRight: 5, ballCam: 3, reset: 9 },
  keys: {
    forward: "KeyW", back: "KeyS", left: "KeyA", right: "KeyD",
    jump: "Mouse2", boost: "Mouse0", powerslide: "ShiftLeft", rollLeft: "KeyQ", rollRight: "KeyE", ballCam: "Space", reset: "KeyR",
  },
  deadzone: 0.12,
  invertPitch: false,
}

const SAVED = "rlr:controls"

export function loadBindings(): Bindings {
  try {
    const saved = JSON.parse(localStorage.getItem(SAVED) ?? "null") as Partial<Bindings> | null
    if (!saved) return structuredClone(DEFAULTS)
    return { ...DEFAULTS, ...saved, pad: { ...DEFAULTS.pad, ...saved.pad }, keys: { ...DEFAULTS.keys, ...saved.keys } }
  } catch {
    return structuredClone(DEFAULTS)
  }
}

export function saveBindings(bindings: Bindings) {
  try {
    localStorage.setItem(SAVED, JSON.stringify(bindings))
  } catch {
    // Kept for this visit only.
  }
}

/** A controller button's name on an Xbox pad and a PlayStation one. */
const PAD_NAMES = ["A / ✕", "B / ○", "X / □", "Y / △", "LB / L1", "RB / R1", "LT / L2", "RT / R2", "View / Share", "Menu / Options", "Analógico esquerdo", "Analógico direito", "D-pad cima", "D-pad baixo", "D-pad esquerda", "D-pad direita", "Home"]

const SIDES: Record<string, string> = { Up: "para cima", Down: "para baixo", Left: "esquerda", Right: "direita" }

export const padName = (button: number) => PAD_NAMES[button] ?? `Botão ${button}`

export function keyName(code: string) {
  if (code === "Mouse0") return "Clique esquerdo"
  if (code === "Mouse2") return "Clique direito"
  if (code === "Mouse1") return "Clique do meio"
  if (code.startsWith("Key")) return code.slice(3)
  if (code.startsWith("Digit")) return code.slice(5)
  if (code.startsWith("Arrow")) return `Seta ${SIDES[code.slice(5)] ?? code.slice(5)}`
  if (code === "Space") return "Espaço"
  return code.replace(/Left$/, " (esq.)").replace(/Right$/, " (dir.)").replace(/^Control/, "Ctrl")
}
