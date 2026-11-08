/**
 * The player's controls from a gamepad (the game's default layout on an
 * Xbox or PlayStation controller) or the keyboard and mouse, read once a
 * tick. One-shot presses (ball cam, reset) are counted, not held.
 */
import { IDLE, type Controls } from "./sim"

const DEADZONE = 0.12
/** The standard gamepad mapping's buttons. */
const A = 0, B = 1, X = 2, Y = 3, LB = 4, RB = 5, LT = 6, RT = 7, BACK = 8, START = 9

export const HELP = {
  pad: "RT/LT drive · A jump · B boost · X powerslide and air roll · LB/RB air roll · Y ball cam · Start resets",
  keys: "W/S drive · A/D steer · Space or right click jump · Shift or left click boost · C powerslide · Q/E air roll · B ball cam · R resets",
}

const stick = (value: number) => (Math.abs(value) < DEADZONE ? 0 : (value - Math.sign(value) * DEADZONE) / (1 - DEADZONE))

export class Input {
  private keys = new Set<string>()
  private mouse = new Set<number>()
  private padWas = new Set<number>()
  /** Presses waiting to be taken. */
  ballCam = 0
  reset = 0
  /** Which device moved last, for the help line. */
  device: "pad" | "keys" = "keys"

  private down = (event: KeyboardEvent) => {
    if (event.repeat) return
    this.device = "keys"
    this.keys.add(event.code)
    if (event.code === "KeyB") this.ballCam++
    if (event.code === "KeyR") this.reset++
    if (event.code === "Space") event.preventDefault()
  }
  private up = (event: KeyboardEvent) => this.keys.delete(event.code)
  private press = (event: MouseEvent) => {
    this.device = "keys"
    this.mouse.add(event.button)
  }
  private release = (event: MouseEvent) => this.mouse.delete(event.button)
  private menu = (event: Event) => event.preventDefault()
  private blur = () => {
    this.keys.clear()
    this.mouse.clear()
  }

  constructor(private target: HTMLElement) {
    window.addEventListener("keydown", this.down)
    window.addEventListener("keyup", this.up)
    window.addEventListener("blur", this.blur)
    target.addEventListener("mousedown", this.press)
    window.addEventListener("mouseup", this.release)
    target.addEventListener("contextmenu", this.menu)
  }

  dispose() {
    window.removeEventListener("keydown", this.down)
    window.removeEventListener("keyup", this.up)
    window.removeEventListener("blur", this.blur)
    this.target.removeEventListener("mousedown", this.press)
    window.removeEventListener("mouseup", this.release)
    this.target.removeEventListener("contextmenu", this.menu)
  }

  read(): Controls {
    const pad = navigator.getGamepads?.().find((each) => each?.connected && each.mapping === "standard")
    const fromPad = pad ? this.readPad(pad) : undefined
    return fromPad ?? this.readKeys()
  }

  private readPad(pad: Gamepad): Controls | undefined {
    const held = (button: number) => pad.buttons[button]?.pressed ?? false
    const value = (button: number) => pad.buttons[button]?.value ?? 0
    for (const [button, count] of [[Y, "ballCam"], [START, "reset"], [BACK, "reset"]] as const) {
      if (held(button) && !this.padWas.has(button)) this[count]++
    }
    this.padWas = new Set(pad.buttons.flatMap((button, index) => (button.pressed ? [index] : [])))
    const x = stick(pad.axes[0] ?? 0)
    const y = stick(pad.axes[1] ?? 0)
    const throttle = value(RT) - value(LT)
    const active = x !== 0 || y !== 0 || throttle !== 0 || this.padWas.size > 0
    if (active) this.device = "pad"
    if (this.device !== "pad") return undefined
    const freeRoll = held(X)
    const rollButtons = (held(RB) ? 1 : 0) - (held(LB) ? 1 : 0)
    return {
      throttle,
      steer: x,
      pitch: y,
      yaw: freeRoll ? 0 : x,
      roll: freeRoll ? x : rollButtons,
      jump: held(A),
      boost: held(B),
      handbrake: held(X),
    }
  }

  private readKeys(): Controls {
    const key = (...codes: string[]) => codes.some((code) => this.keys.has(code))
    const axis = (minus: boolean, plus: boolean) => (plus ? 1 : 0) - (minus ? 1 : 0)
    const forward = axis(key("KeyS", "ArrowDown"), key("KeyW", "ArrowUp"))
    const turn = axis(key("KeyA", "ArrowLeft"), key("KeyD", "ArrowRight"))
    const freeRoll = key("KeyC")
    if (!this.keys.size && !this.mouse.size) return IDLE
    return {
      throttle: forward,
      steer: turn,
      // W leans the nose down in the air, as in the game.
      pitch: -forward,
      yaw: freeRoll ? 0 : turn,
      roll: freeRoll ? turn : axis(key("KeyQ"), key("KeyE")),
      jump: key("Space") || this.mouse.has(2),
      boost: key("ShiftLeft", "ShiftRight") || this.mouse.has(0),
      handbrake: freeRoll,
    }
  }
}
