/**
 * The player's controls from a gamepad or the keyboard and mouse, by the
 * bindings (`bindings.ts`: the game's defaults unless changed), read once a
 * tick. One-shot presses (ball cam, try again) are counted, not held.
 */
import { keyName, loadBindings, padName, type Bindings } from "./bindings"
import { IDLE, type Controls } from "./sim"

export class Input {
  private keys = new Set<string>()
  private padWas = new Set<number>()
  private catching?: { kind: "pad" | "keys"; done: (code: number | string | undefined) => void; frame?: number }
  bindings: Bindings = loadBindings()
  /** Presses waiting to be taken. */
  ballCam = 0
  reset = 0
  /** Which device moved last, for the help line. */
  device: "pad" | "keys" = "keys"
  /** The connected controller's name, as the browser has it. */
  padName?: string

  private pressed(code: string, event: Event) {
    if (this.catching?.kind === "keys") {
      event.preventDefault()
      const done = this.catching.done
      this.catching = undefined
      done(code === "Escape" ? undefined : code)
      return
    }
    this.device = "keys"
    this.keys.add(code)
    const { keys } = this.bindings
    if (code === keys.ballCam) this.ballCam++
    if (code === keys.reset) this.reset++
    if (Object.values(keys).includes(code) && code !== "Mouse0" && code !== "Mouse2") event.preventDefault()
  }
  private down = (event: KeyboardEvent) => {
    if (event.repeat || event.target instanceof HTMLInputElement) return
    this.pressed(event.code, event)
  }
  private up = (event: KeyboardEvent) => this.keys.delete(event.code)
  /** A click on the page's own buttons and panels (marked `data-ui`) isn't a jump or a boost. */
  private press = (event: MouseEvent) => {
    if (!this.catching && (event.target as Element).closest?.("[data-ui]")) return
    this.pressed(`Mouse${event.button}`, event)
  }
  private release = (event: MouseEvent) => this.keys.delete(`Mouse${event.button}`)
  private menu = (event: Event) => event.preventDefault()
  private blur = () => this.keys.clear()

  constructor(private target: HTMLElement) {
    window.addEventListener("keydown", this.down)
    window.addEventListener("keyup", this.up)
    window.addEventListener("blur", this.blur)
    target.addEventListener("mousedown", this.press)
    window.addEventListener("mouseup", this.release)
    target.addEventListener("contextmenu", this.menu)
  }

  dispose() {
    this.cancel()
    window.removeEventListener("keydown", this.down)
    window.removeEventListener("keyup", this.up)
    window.removeEventListener("blur", this.blur)
    this.target.removeEventListener("mousedown", this.press)
    window.removeEventListener("mouseup", this.release)
    this.target.removeEventListener("contextmenu", this.menu)
  }

  /** Waits for the next key or click (`keys`, Escape gives up) or controller button (`pad`) to bind. */
  catch(kind: "pad" | "keys", done: (code: number | string | undefined) => void) {
    this.cancel()
    this.catching = { kind, done }
    if (kind !== "pad") return
    const held = new Set(this.padButtons())
    const poll = () => {
      if (!this.catching) return
      const now = this.padButtons()
      const fresh = now.find((button) => !held.has(button))
      for (const button of [...held]) if (!now.includes(button)) held.delete(button)
      if (fresh !== undefined) {
        this.catching = undefined
        this.padWas = new Set(now)
        done(fresh)
        return
      }
      this.catching.frame = requestAnimationFrame(poll)
    }
    this.catching.frame = requestAnimationFrame(poll)
  }

  cancel() {
    if (this.catching?.frame) cancelAnimationFrame(this.catching.frame)
    this.catching = undefined
  }

  /** The bound names, for the help line. */
  name(kind: "pad", action: keyof Bindings["pad"]): string
  name(kind: "keys", action: keyof Bindings["keys"]): string
  name(kind: "pad" | "keys", action: string) {
    return kind === "pad" ? padName(this.bindings.pad[action as keyof Bindings["pad"]]) : keyName(this.bindings.keys[action as keyof Bindings["keys"]])
  }

  read(): Controls {
    if (this.catching) return IDLE
    const pad = this.pad()
    this.padName = pad?.id.replace(/\s*\(.*$/, "")
    const fromPad = pad ? this.readPad(pad) : undefined
    return fromPad ?? this.readKeys()
  }

  private pad() {
    return navigator.getGamepads?.().find((each) => each?.connected && each.mapping === "standard") ?? undefined
  }

  private padButtons() {
    const pad = this.pad()
    return pad ? pad.buttons.flatMap((button, index) => (button.pressed ? [index] : [])) : []
  }

  private readPad(pad: Gamepad): Controls | undefined {
    const { pad: bound, deadzone, invertPitch } = this.bindings
    const held = (button: number) => pad.buttons[button]?.pressed ?? false
    const value = (button: number) => pad.buttons[button]?.value ?? 0
    const stick = (raw: number) => (Math.abs(raw) < deadzone ? 0 : (raw - Math.sign(raw) * deadzone) / (1 - deadzone))
    for (const [button, count] of [[bound.ballCam, "ballCam"], [bound.reset, "reset"]] as const) {
      if (held(button) && !this.padWas.has(button)) this[count]++
    }
    this.padWas = new Set(this.padButtons())
    const x = stick(pad.axes[0] ?? 0)
    const y = stick(pad.axes[1] ?? 0) * (invertPitch ? -1 : 1)
    const throttle = value(bound.throttle) - value(bound.reverse)
    const active = x !== 0 || y !== 0 || throttle !== 0 || this.padWas.size > 0
    if (active) this.device = "pad"
    if (this.device !== "pad") return undefined
    const freeRoll = held(bound.powerslide)
    const rollButtons = (held(bound.rollRight) ? 1 : 0) - (held(bound.rollLeft) ? 1 : 0)
    return {
      throttle,
      steer: x,
      pitch: y,
      yaw: freeRoll ? 0 : x,
      roll: freeRoll ? x : rollButtons,
      jump: held(bound.jump),
      boost: held(bound.boost),
      handbrake: freeRoll,
    }
  }

  private readKeys(): Controls {
    if (!this.keys.size) return IDLE
    const { keys: bound, invertPitch } = this.bindings
    const key = (code: string) => this.keys.has(code)
    const axis = (minus: boolean, plus: boolean) => (plus ? 1 : 0) - (minus ? 1 : 0)
    const forward = axis(key(bound.back), key(bound.forward))
    const turn = axis(key(bound.left), key(bound.right))
    const freeRoll = key(bound.powerslide)
    return {
      throttle: forward,
      steer: turn,
      // Forward leans the nose down in the air, as in the game.
      pitch: -forward * (invertPitch ? -1 : 1),
      yaw: freeRoll ? 0 : turn,
      roll: freeRoll ? turn : axis(key(bound.rollLeft), key(bound.rollRight)),
      jump: key(bound.jump),
      boost: key(bound.boost),
      handbrake: freeRoll,
    }
  }
}
