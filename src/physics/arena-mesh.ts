/**
 * The soccar arena's walls for RocketSim, drawn by us from RLBot's
 * measurements (the same as `scene/field.ts`, here in the game's units: uu,
 * Z up) rather than dumped from the game, so they can be published. RocketSim
 * adds the floor, the ceiling and the side walls itself, as planes; these are
 * the rest: the back walls around the goals, the cut corners, the goals and
 * the curved ramp where the floor meets the walls.
 *
 * The game's ramps aren't quite circular; here they're a quarter circle of
 * RAMP uu, so the walls are a little off from the game's near the floor.
 */

export interface Mesh {
  /** x, y, z per vertex, in uu. */
  vertices: Float32Array
  /** Three vertex indices per triangle. */
  indices: Int32Array
}

const SIDE = 4096
const BACK = 5120
const CORNER = 8064
const HEIGHT = 2044
const GOAL = { halfWidth: 892.755, height: 642.775, depth: 880 }
/** The floor-to-wall ramp's radius. */
export const RAMP = 256
/** How many flat strips make up the ramp's curve. */
const STRIPS = 10

class Builder {
  vertices: number[] = []
  indices: number[] = []

  point(x: number, y: number, z: number) {
    this.vertices.push(x, y, z)
    return this.vertices.length / 3 - 1
  }

  quad(a: number, b: number, c: number, d: number) {
    this.indices.push(a, b, c, a, c, d)
  }

  /** An upright rectangle from (x1, y1) to (x2, y2), between heights z1 and z2. */
  wall(x1: number, y1: number, x2: number, y2: number, z1: number, z2: number) {
    this.quad(this.point(x1, y1, z1), this.point(x2, y2, z1), this.point(x2, y2, z2), this.point(x1, y1, z2))
  }

  mesh(): Mesh {
    return { vertices: new Float32Array(this.vertices), indices: new Int32Array(this.indices) }
  }
}

/** Both ends' back walls, around the goal's mouth. */
function backWalls() {
  const walls = new Builder()
  const end = CORNER - BACK
  for (const y of [BACK, -BACK]) {
    walls.wall(-end, y, -GOAL.halfWidth, y, 0, HEIGHT)
    walls.wall(GOAL.halfWidth, y, end, y, 0, HEIGHT)
    walls.wall(-GOAL.halfWidth, y, GOAL.halfWidth, y, GOAL.height, HEIGHT)
  }
  return walls.mesh()
}

/** The four cut corners, where |x| + |y| = CORNER. */
function corners() {
  const walls = new Builder()
  for (const sx of [1, -1])
    for (const sy of [1, -1]) walls.wall(sx * SIDE, sy * (CORNER - SIDE), sx * (CORNER - BACK), sy * BACK, 0, HEIGHT)
  return walls.mesh()
}

/** Each goal's sides, roof and back; the floor plane is its floor. */
function goals() {
  const box = new Builder()
  const w = GOAL.halfWidth
  const h = GOAL.height
  for (const s of [1, -1]) {
    const mouth = s * BACK
    const back = s * (BACK + GOAL.depth)
    box.wall(-w, mouth, -w, back, 0, h)
    box.wall(w, mouth, w, back, 0, h)
    box.wall(-w, back, w, back, 0, h)
    box.quad(box.point(-w, mouth, h), box.point(w, mouth, h), box.point(w, back, h), box.point(-w, back, h))
  }
  return box.mesh()
}

/**
 * The floor's outline, counter-clockwise seen from above, with the goals'
 * posts as points of their own so the ramp can stop at each mouth. `gap`
 * marks the edges that are a goal's mouth.
 */
const OUTLINE: { x: number; y: number; gap?: boolean }[] = [
  { x: SIDE, y: CORNER - SIDE },
  { x: CORNER - BACK, y: BACK },
  { x: GOAL.halfWidth, y: BACK, gap: true },
  { x: -GOAL.halfWidth, y: BACK },
  { x: BACK - CORNER, y: BACK },
  { x: -SIDE, y: CORNER - SIDE },
  { x: -SIDE, y: SIDE - CORNER },
  { x: BACK - CORNER, y: -BACK },
  { x: -GOAL.halfWidth, y: -BACK, gap: true },
  { x: GOAL.halfWidth, y: -BACK },
  { x: CORNER - BACK, y: -BACK },
  { x: SIDE, y: SIDE - CORNER },
]

/** The point `distance` in from outline point `i`, on both its edges' offset lines. */
function inset(i: number, distance: number): [number, number] {
  const n = OUTLINE.length
  const [prev, here, next] = [OUTLINE[(i + n - 1) % n], OUTLINE[i], OUTLINE[(i + 1) % n]]
  const inward = (a: typeof here, b: typeof here) => {
    const dx = b.x - a.x
    const dy = b.y - a.y
    const length = Math.hypot(dx, dy)
    return [-dy / length, dx / length]
  }
  const [ax, ay] = inward(prev, here)
  const [bx, by] = inward(here, next)
  let mx = ax + bx
  let my = ay + by
  const length = Math.hypot(mx, my)
  mx /= length
  my /= length
  const scale = distance / (mx * ax + my * ay)
  return [here.x + mx * scale, here.y + my * scale]
}

/** The quarter-circle ramp along the whole outline but the goals' mouths, closed at each post. */
function ramps() {
  const ramp = new Builder()
  const n = OUTLINE.length
  // rings[k][i]: outline point i, k strips up the curve (0 on the floor, STRIPS on the wall).
  const rings: number[][] = []
  for (let k = 0; k <= STRIPS; k++) {
    const angle = (k / STRIPS) * (Math.PI / 2)
    const distance = RAMP * (1 - Math.sin(angle))
    const height = RAMP * (1 - Math.cos(angle))
    rings.push(OUTLINE.map((_, i) => ramp.point(...inset(i, distance), height)))
  }
  for (let i = 0; i < n; i++) {
    if (OUTLINE[i].gap) continue
    const j = (i + 1) % n
    for (let k = 0; k < STRIPS; k++) ramp.quad(rings[k][i], rings[k][j], rings[k + 1][j], rings[k + 1][i])
  }
  // Caps at the posts: the curve's profile, down to where the wall meets the floor.
  OUTLINE.forEach((point, i) => {
    const after = OUTLINE[(i + n - 1) % n].gap
    if (!point.gap && !after) return
    const foot = ramp.point(point.x, point.y, 0)
    for (let k = 0; k < STRIPS; k++) ramp.indices.push(foot, rings[k][i], rings[k + 1][i])
  })
  return ramp.mesh()
}

/** Every mesh of the arena, for RocketSim and to draw. */
export function arenaMeshes(): Mesh[] {
  return [backWalls(), corners(), goals(), ramps()]
}

/** The ramp alone, to draw on the pitch. */
export function rampMesh(): Mesh {
  return ramps()
}
