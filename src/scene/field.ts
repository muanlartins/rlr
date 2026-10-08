/**
 * The standard soccar pitch, in metres (RLBot's "useful game values"):
 * side walls at x = ±40.96, back walls at z = ±51.2, the corners cut where
 * |x| + |z| = 80.64, the ceiling at 20.48, and goals 17.86 wide, 6.43 tall
 * and 8.8 deep.
 */
export const SIDE = 40.96
export const BACK = 51.2
export const CORNER = 80.64
export const CEILING = 20.48
export const GOAL = { halfWidth: 8.9276, height: 6.4278, depth: 8.8 }
export const BALL_RADIUS = 0.9125

/** The floor's outline, counter-clockwise from Orange's right corner, as [x, z]. */
export const OUTLINE: [number, number][] = [
  [SIDE, CORNER - SIDE],
  [CORNER - BACK, BACK],
  [BACK - CORNER, BACK],
  [-SIDE, CORNER - SIDE],
  [-SIDE, SIDE - CORNER],
  [BACK - CORNER, -BACK],
  [CORNER - BACK, -BACK],
  [SIDE, SIDE - CORNER],
]

export const TEAMS = [
  { name: "Blue", color: "#2f6bff", deep: "#0a2a8a" },
  { name: "Orange", color: "#ff8a1f", deep: "#8a3a00" },
] as const
