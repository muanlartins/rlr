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

/** The 34 boost pads, as [x, z] in metres and whether each is big, Blue's end first (as the game lays them out). */
export const PADS: { pos: [number, number]; big: boolean }[] = (
  [
    [0, -4240], [-1792, -4184], [1792, -4184], [-3072, -4096, 1], [3072, -4096, 1], [-940, -3308], [940, -3308], [0, -2816],
    [-3584, -2484], [3584, -2484], [-1788, -2300], [1788, -2300], [-2048, -1036], [2048, -1036], [0, -1024],
    [-3584, 0, 1], [-1024, 0], [1024, 0], [3584, 0, 1],
    [0, 1024], [-2048, 1036], [2048, 1036], [-1788, 2300], [1788, 2300], [-3584, 2484], [3584, 2484],
    [0, 2816], [-940, 3308], [940, 3308], [-3072, 4096, 1], [3072, 4096, 1], [-1792, 4184], [1792, 4184], [0, 4240],
  ] as [number, number, number?][]
).map(([x, z, big]) => ({ pos: [x / 100, z / 100], big: big === 1 }))
