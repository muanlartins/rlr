/**
 * A replay's moment being played, try after try: where the try stands, the
 * others and the ball played back from the replay, the hand-over of your car,
 * and whether the play's goal was saved (or scored). Free play is the same
 * with no replay: a kickoff, and a new one after each goal. No React here;
 * the page draws what this says.
 */
import { IDLE, TICK_RATE, type BodyState, type Controls, type Sim } from "../physics/sim"
import type { Goal, Replay } from "../replay/model"
import { bodyAt, carAt, emptyCar, setPads } from "./rewind"
import { Quaternion, Vector3 } from "three"

/** A replay's moment to play from, as one of its players, maybe for one goal (to save it, or score it again). */
export interface From {
  replay: Replay
  time: number
  car: number
  goal?: Goal
}

/**
 * Waiting for the first input (`ready`), the replay running up to the moment with your car still on it
 * (`runup`), the play as it happened until you touch the ball (`replay`), your own play (`yours`), or over.
 */
export type Phase = "ready" | "runup" | "replay" | "yours" | "over"

export interface Result {
  text: string
  /** Saved or scored: true; conceded or missed: false; nothing to judge: undefined. */
  success?: boolean
}

/** How long the replay runs before handing you the car, when it can. */
export const RUN_UP = 2
/** A play's goal counts as saved once the replay's goal time is this far behind. */
const GRACE = 1
/** How far after the moment a replay goal still makes it the play's goal. */
const GOAL_AHEAD = 10
/** How long a try's result shows before the next try. */
export const AFTER = 2.5

export class Session {
  phase: Phase
  /** Seconds since the start of the try (the run-up's start, if any). */
  elapsed = 0
  result?: Result
  tries = 0
  wins = 0
  /** The goal the play is about, and whether you're saving it (rather than scoring it). */
  readonly target?: Goal
  readonly defending: boolean
  private lead = 0
  private ending = 0
  private startTick = 0
  private goals: [number, number] = [0, 0]
  private car = emptyCar()
  private ball: BodyState = { pos: new Vector3(), quat: new Quaternion(), vel: new Vector3(), spin: new Vector3() }

  constructor(
    private sim: Sim,
    readonly from: From | undefined,
    private options: { runUp: boolean; unlimited: boolean },
  ) {
    const mine = from ? from.replay.cars[from.car].team : 0
    this.target = from && (from.goal ?? from.replay.goals.find((goal) => goal.time > from.time && goal.time <= from.time + GOAL_AHEAD))
    this.defending = this.target !== undefined && this.target.team !== mine
    this.phase = from ? "ready" : "yours"
    this.restart()
  }

  get team() {
    return this.from ? this.from.replay.cars[this.from.car].team : 0
  }

  /** The replay's time the try is at. */
  get replayTime() {
    return this.from ? this.from.time - this.lead + this.elapsed : 0
  }

  /** Seconds until your car is yours, during the run-up. */
  get handOverIn() {
    return Math.max(0, this.lead - this.elapsed)
  }

  /** Whether the world stands still (waiting for the first input, or between tries). */
  get still() {
    return this.from !== undefined && (this.phase === "ready" || this.phase === "over")
  }

  setOptions(options: { runUp: boolean; unlimited: boolean }) {
    const changed = options.runUp !== this.options.runUp
    this.options = options
    this.sim.unlimitedBoost(options.unlimited)
    if (changed) this.restart()
  }

  /** Back to the start of a try: the run-up, the moment waiting for your first input, or a kickoff. */
  restart() {
    const { sim, from } = this
    this.elapsed = 0
    this.result = undefined
    if (!from) {
      sim.kickoff()
      this.phase = "yours"
    } else {
      this.lead = this.options.runUp ? leadFor(from) : 0
      const start = from.time - this.lead
      from.replay.cars.forEach((_, index) => sim.setCar(index, carAt(from.replay, index, start, this.car)))
      if (bodyAt(from.replay, from.replay.ball, start, this.ball)) sim.setBall(this.ball)
      setPads(sim, from.replay, start)
      if (this.options.unlimited) sim.unlimitedBoost(true)
      sim.settle()
      this.phase = this.lead > 0 ? "runup" : "ready"
    }
    this.startTick = sim.tick
    this.goals = sim.goals()
  }

  /** Counts down a finished try's result, then starts the next. Real seconds. */
  update(seconds: number) {
    if (this.phase !== "over") return
    this.ending -= seconds
    if (this.ending <= 0) this.restart()
  }

  /** One tick with your inputs. */
  tick(controls: Controls) {
    const { sim, from } = this
    if (this.phase === "over") {
      if (!from) sim.step()
      return
    }
    if (this.phase === "ready") {
      if (!moved(controls)) return
      this.phase = "replay"
    }
    if (!from) {
      sim.controls(0, controls)
      sim.step()
      this.judgeGoals()
      return
    }
    const replay = from.replay
    const time = this.replayTime
    const ended = time > replay.times[replay.times.length - 1]
    const mine = from.car
    replay.cars.forEach((_, index) => {
      if (index === mine && this.phase !== "runup") return
      const car = carAt(replay, index, time, this.car)
      if (ended) car.off = true
      sim.setCar(index, car)
    })
    if (this.phase === "runup" || this.phase === "replay") {
      if (bodyAt(replay, replay.ball, time, this.ball)) sim.setBall(this.ball)
      else if (ended) this.phase = "yours"
      else if (replay.goals.some((goal) => goal.time > from.time - this.lead && goal.time <= time)) {
        return this.finish(this.defending ? { text: "Tomou, como no replay", success: false } : { text: "Como no replay" })
      }
    }
    // Nobody moves while a kickoff counts down: your car waits for the go with the others.
    const counting = replay.kickoffs.some((kickoff) => time >= kickoff.countdown && time < kickoff.go)
    if (counting && this.phase !== "runup") sim.setCar(mine, carAt(replay, mine, time, this.car))
    sim.controls(mine, counting || this.phase === "runup" ? IDLE : controls)
    sim.step()
    this.elapsed += 1 / TICK_RATE
    // Touches during the run-up were the match's, not yours: only those after the hand-over count.
    if (this.phase === "runup" && this.elapsed >= this.lead) {
      this.phase = "replay"
      this.startTick = sim.tick
    }
    if (this.phase === "replay" && sim.touched(mine) > this.startTick) this.phase = "yours"
    if (this.judgeGoals()) return
    // Past the replay's goal and none went in: saved (or, scoring it, missed).
    if (this.target && this.phase !== "runup" && time > this.target.time + GRACE) {
      this.finish(this.defending ? { text: "Defendeu!", success: true } : { text: "Sem gol", success: false })
    }
  }

  /** A goal in the physics ends the try. True if one did. */
  private judgeGoals() {
    const goals = this.sim.goals()
    const scored = goals[0] > this.goals[0] ? 0 : goals[1] > this.goals[1] ? 1 : undefined
    this.goals = goals
    if (scored === undefined) return false
    if (!this.from) this.finish({ text: "Gol" })
    else if (!this.target) this.finish({ text: scored === this.team ? "Gol do seu time" : "Gol do adversário" })
    else if (scored === this.team) this.finish({ text: this.defending ? "Defendeu e marcou!" : "Marcou!", success: true })
    else this.finish({ text: this.defending ? "Tomou o gol" : "O outro time marcou", success: false })
    return true
  }

  private finish(result: Result) {
    this.phase = "over"
    this.result = result
    this.ending = AFTER
    if (result.success !== undefined) {
      this.tries++
      if (result.success) this.wins++
    }
  }
}

/** Any stick, trigger or button: what starts a moment that waits. */
function moved(controls: Controls) {
  return controls.throttle !== 0 || controls.steer !== 0 || controls.pitch !== 0 || controls.roll !== 0 || controls.jump || controls.boost || controls.handbrake
}

/**
 * How long a run-up the moment can have: RUN_UP, or less where the replay
 * has no ball that far back (a goal, the recording's start), or none.
 */
function leadFor(from: From) {
  const { replay, time } = from
  for (const lead of [RUN_UP, RUN_UP / 2]) {
    const start = time - lead
    if (start < replay.times[0]) continue
    if (replay.goals.some((goal) => goal.time > start && goal.time <= time)) continue
    let ok = true
    for (let t = start; t <= time; t += 0.1) {
      if (!bodyAt(replay, replay.ball, t, scratch)) ok = false
    }
    if (ok) return lead
  }
  return 0
}

const scratch: BodyState = { pos: new Vector3(), quat: new Quaternion(), vel: new Vector3(), spin: new Vector3() }
