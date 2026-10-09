/**
 * A tactics board: cars, the ball and the pads placed by hand, and marks
 * drawn on the pitch. Positions are scene space (metres, Y up, Blue's goal
 * at -z), like a replay's.
 */
import { Euler, Quaternion, Vector3 } from "three"
import type { Body, CameraSettings, Replay } from "../replay/model"
import type { Tool } from "../ui/sketch"
import { momentAt, poseAt } from "../replay/sample"
import { RIDE } from "../scene/car"
import { BALL_RADIUS, PADS } from "../scene/field"
import { available } from "../scene/pads"

export interface Piece {
  id: string
  name: string
  /** 0 Blue, 1 Orange. */
  team: 0 | 1
  body: Body
  /** The centre of mass. */
  pos: [number, number, number]
  /** Heading, nose up and roll, in radians: an Euler in "YZX" order, since a car's own X is ahead. */
  rot: [number, number, number]
  /** 0–100. */
  boost: number
  /** The player's camera, for a car taken from a replay. */
  camera?: CameraSettings
}

/** Something drawn on the pitch: its points as [x, z]. */
export interface Mark {
  tool: Tool
  color: string
  points: [number, number][]
}

export interface Board {
  cars: Piece[]
  ball: [number, number, number]
  /** Per pad in `PADS`, whether it's taken. */
  taken: boolean[]
  marks: Mark[]
}

/** Where a car's centre and the ball's sit when resting on the floor. */
export const REST = { car: RIDE, ball: BALL_RADIUS }

export const EMPTY: Board = { cars: [], ball: [0, REST.ball, 0], taken: PADS.map(() => false), marks: [] }

/** The heading that points a car at `x`, `z` from `from`. */
export function headingTo(from: [number, number, number], x: number, z: number) {
  return Math.atan2(-(z - from[2]), x - from[0])
}

let next = 0
/** A new car for `team` at [x, z], facing the ball. */
export function newCar(board: Board, team: 0 | 1, x: number, z: number): Piece {
  const pos: [number, number, number] = [x, REST.car, z]
  const count = board.cars.filter((car) => car.team === team).length
  return {
    id: `${Date.now().toString(36)}-${next++}`,
    name: `${team ? "Orange" : "Blue"} ${count + 1}`,
    team,
    body: "octane",
    pos,
    rot: [headingTo(pos, board.ball[0], board.ball[2]), 0, 0],
    boost: 33,
  }
}

/**
 * Kickoff spots for Blue, as [x, z]: the two corners, then the two back
 * spots, then the far back. Orange's are the same turned around the centre.
 */
const SPOTS: [number, number][] = [[-20.48, -25.6], [20.48, -25.6], [-2.56, -38.4], [2.56, -38.4], [0, -46.08]]
/** Which spots each kickoff uses. */
const KICKOFFS = { 1: [0], 2: [0, 1], 3: [0, 1, 4] } as const

/** A kickoff for `size` players a side, everyone on 33 boost. */
export function kickoff(size: 1 | 2 | 3): Board {
  let board: Board = { ...EMPTY, taken: PADS.map(() => false) }
  for (const team of [0, 1] as const) {
    for (const spot of KICKOFFS[size]) {
      const [x, z] = SPOTS[spot]
      board = { ...board, cars: [...board.cars, newCar(board, team, team ? -x : x, team ? -z : z)] }
    }
  }
  return board
}

const position = new Vector3()
const rotation = new Quaternion()
const euler = new Euler(0, 0, 0, "YZX")

/** Where a piece is and how it's turned, as three.js has them. */
export function poseOf(piece: Piece, position: Vector3, rotation: Quaternion) {
  const [heading, nose, roll] = piece.rot
  position.fromArray(piece.pos)
  rotation.setFromEuler(euler.set(roll, heading, nose))
}

/** A replay's moment set out on a board: every car where it was, the ball, the boost and the pads. */
export function fromReplay(replay: Replay, time: number): Board {
  const moment = momentAt(replay.times, time)
  const cars = replay.cars.flatMap((car, index): Piece[] => {
    if (!poseAt(car, replay.times, moment, position, rotation)) return []
    euler.setFromQuaternion(rotation)
    return [{
      // Not the player's id: that's their platform account, and the board goes into links.
      id: String(index),
      name: car.name,
      team: car.team,
      body: car.body,
      pos: position.toArray(),
      rot: [euler.y, euler.z, euler.x],
      boost: Math.round(car.boost[moment.frame]),
      camera: car.camera,
    }]
  })
  const ball: [number, number, number] = poseAt(replay.ball, replay.times, moment, position, rotation) ? position.toArray() : [0, REST.ball, 0]
  // A replay carries its own pad positions; match each to the standard layout.
  const taken = PADS.map(({ pos: [x, z] }) => {
    const pad = replay.pads.find((pad) => Math.hypot(pad.pos[0] - x, pad.pos[2] - z) < 1)
    return pad ? !available(pad, time) : false
  })
  return { cars, ball, taken, marks: [] }
}

/** A board as text for a link: JSON, base64url-encoded, with numbers to the centimetre. */
export function encode(board: Board) {
  const json = JSON.stringify(board, (_, value) => (typeof value === "number" ? Math.round(value * 100) / 100 : value))
  const bytes = new TextEncoder().encode(json)
  return btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join("")).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "")
}

export function decode(text: string): Board | undefined {
  try {
    const binary = atob(text.replaceAll("-", "+").replaceAll("_", "/"))
    const board = JSON.parse(new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)))) as Board
    return board.cars && board.ball && board.taken && board.marks ? board : undefined
  } catch {
    return undefined
  }
}
