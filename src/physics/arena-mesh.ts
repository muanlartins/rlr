/**
 * The soccar arena's walls for RocketSim, drawn by us rather than dumped from
 * the game, so they can be published. RocketSim adds the floor, the ceiling and
 * the side walls itself, as planes; these are the rest, in the game's units
 * (uu, Z up):
 *
 * - the walls all round, seen from above: the back walls, the corners (45°,
 *   rounded into the back and side walls) and the side walls;
 * - the curved ramp where the floor meets them: 256 uu along the side walls
 *   and corners, 160 along the back walls, narrowing towards each goal and
 *   wrapping round its post into the goal;
 * - the curved ramp where they meet the ceiling, 508 uu all round;
 * - the goals.
 *
 * The measurements are RLBot's (the pitch's size, the corners where
 * |x| + |y| = 8064, the goals) and, for the curves, taken off the community's
 * arena model in rl_ball_sym (MIT); the shapes are ours, fitted with circles,
 * so they're within a few dozen uu of the game's.
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
/** The corners' rounding where they meet the back and side walls, seen from above. */
const FILLET = 925
/** The floor ramp's radius: along the side walls and corners, along the back walls, and at the posts. */
const RAMP = { side: 256, back: 160, post: 96 }
/** Where, along the back wall, the ramp starts narrowing towards the post. */
const NARROWS_FROM = 1350
/** How far into the goal the ramp round the post runs along its side wall before it's gone. */
const INTO_GOAL = 150
/** The ceiling ramp's radius. */
const TOP = 508
/** Flat strips across each ramp's curve. */
const STRIPS = 8

/** A point on the walls' outline at floor level, with the way into the pitch and the floor ramp's radius there. */
interface Sample {
  x: number
  y: number
  /** The inward normal. */
  nx: number
  ny: number
  ramp: number
  /** On a goal's mouth, where there's no wall below the crossbar. */
  mouth?: boolean
}

class Builder {
  vertices: number[] = []
  indices: number[] = []

  point(x: number, y: number, z: number) {
    this.vertices.push(x, y, z)
    return this.vertices.length / 3 - 1
  }

  /** A triangle, unless it has no area (where a ramp narrows to nothing). */
  triangle(a: number, b: number, c: number) {
    const v = this.vertices
    const [ax, ay, az] = [v[b * 3] - v[a * 3], v[b * 3 + 1] - v[a * 3 + 1], v[b * 3 + 2] - v[a * 3 + 2]]
    const [bx, by, bz] = [v[c * 3] - v[a * 3], v[c * 3 + 1] - v[a * 3 + 1], v[c * 3 + 2] - v[a * 3 + 2]]
    const area = Math.hypot(ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx)
    if (area > 1) this.indices.push(a, b, c)
  }

  quad(a: number, b: number, c: number, d: number) {
    this.triangle(a, b, c)
    this.triangle(a, c, d)
  }

  /** Rows of points (each row the same length) joined into a surface. */
  grid(rows: number[][]) {
    for (let r = 0; r + 1 < rows.length; r++)
      for (let i = 0; i + 1 < rows[r].length; i++) this.quad(rows[r][i], rows[r][i + 1], rows[r + 1][i + 1], rows[r + 1][i])
  }

  mesh(): Mesh {
    return { vertices: new Float32Array(this.vertices), indices: new Int32Array(this.indices) }
  }
}

/** A straight stretch of wall, sampled every `step` uu or less, both ends included. */
function line(from: [number, number], to: [number, number], normal: [number, number], ramp: (x: number, y: number) => number, step = 128): Sample[] {
  const length = Math.hypot(to[0] - from[0], to[1] - from[1])
  const count = Math.max(1, Math.ceil(length / step))
  return Array.from({ length: count + 1 }, (_, k) => {
    const x = from[0] + ((to[0] - from[0]) * k) / count
    const y = from[1] + ((to[1] - from[1]) * k) / count
    return { x, y, nx: normal[0], ny: normal[1], ramp: ramp(x, y) }
  })
}

/** A rounded stretch: the wall at `center - FILLET · normal`, the normal turning from angle `a` to `b`. */
function arc(center: [number, number], a: number, b: number, ramp: (share: number) => number): Sample[] {
  const count = 10
  return Array.from({ length: count + 1 }, (_, k) => {
    const angle = a + ((b - a) * k) / count
    const nx = Math.cos(angle)
    const ny = Math.sin(angle)
    return { x: center[0] - FILLET * nx, y: center[1] - FILLET * ny, nx, ny, ramp: ramp(k / count) }
  })
}

/**
 * One quarter of the outline, Blue's end on the right (x ≥ 0, y ≤ 0): from the
 * post along the back wall, round the corner, to the middle of the side wall.
 */
function quarter(): Sample[] {
  const deg = Math.PI / 180
  const tangent = FILLET * Math.tan(22.5 * deg)
  const diagonal: [number, number] = [Math.SQRT1_2, Math.SQRT1_2]
  const corner1: [number, number] = [CORNER - BACK, -BACK]
  const corner2: [number, number] = [SIDE, SIDE - CORNER]
  const a1: [number, number] = [corner1[0] - tangent, -BACK]
  const b1: [number, number] = [corner1[0] + tangent * diagonal[0], corner1[1] + tangent * diagonal[1]]
  const a2: [number, number] = [corner2[0] - tangent * diagonal[0], corner2[1] - tangent * diagonal[1]]
  const b2: [number, number] = [SIDE, corner2[1] + tangent]
  const inward = [-Math.SQRT1_2, Math.SQRT1_2] as [number, number]
  const narrowing = (x: number) => RAMP.post + (RAMP.back - RAMP.post) * Math.min(1, (x - GOAL.halfWidth) / (NARROWS_FROM - GOAL.halfWidth))
  const samples = [
    ...line([GOAL.halfWidth, -BACK], [NARROWS_FROM, -BACK], [0, 1], narrowing, 64),
    ...line([NARROWS_FROM, -BACK], a1, [0, 1], () => RAMP.back).slice(1),
    ...arc([a1[0], a1[1] + FILLET], 90 * deg, 135 * deg, (share) => RAMP.back + (RAMP.side - RAMP.back) * share).slice(1),
    ...line(b1, a2, inward, () => RAMP.side).slice(1),
    ...arc([a2[0] + FILLET * inward[0], a2[1] + FILLET * inward[1]], 135 * deg, 180 * deg, () => RAMP.side).slice(1),
    ...line(b2, [SIDE, 0], [-1, 0], () => RAMP.side, 512).slice(1),
  ]
  return samples
}

const mirrorY = (s: Sample): Sample => ({ ...s, y: -s.y, ny: -s.ny })
const mirrorX = (s: Sample): Sample => ({ ...s, x: -s.x, nx: -s.nx })

/** Both side strips of the outline, each from post to post, and the whole loop with the mouths. */
function outline() {
  const q = quarter()
  const right = [...q, ...q.map(mirrorY).reverse().slice(1)]
  const left = right.map(mirrorX).reverse()
  const mouth = (y: number, ny: number, from: number, to: number) =>
    line([from, y], [to, y], [0, ny], () => 0, 256).map((s) => ({ ...s, mouth: true }))
  const loop = [...right, ...mouth(BACK, -1, GOAL.halfWidth, -GOAL.halfWidth), ...left, ...mouth(-BACK, 1, -GOAL.halfWidth, GOAL.halfWidth)]
  return { strips: [right, left], loop }
}

/** The floor ramp's profile: `k` strips up from the floor, how far from the wall and how high. */
function rampAt(radius: number, k: number) {
  const angle = (k / STRIPS) * (Math.PI / 2)
  return { out: radius * (1 - Math.sin(angle)), up: radius * (1 - Math.cos(angle)) }
}

function floorRamps(strips: Sample[][]) {
  const ramp = new Builder()
  for (const strip of strips) {
    const rows = Array.from({ length: STRIPS + 1 }, (_, k) =>
      strip.map((s) => {
        const { out, up } = rampAt(s.ramp, k)
        return ramp.point(s.x + s.nx * out, s.y + s.ny * out, up)
      }),
    )
    ramp.grid(rows)
  }
  // Round each post: the ramp turns about the post's edge from facing the pitch to facing into the goal, then
  // narrows to nothing along the goal's side wall.
  for (const sx of [1, -1])
    for (const sy of [1, -1]) {
      const post = { x: sx * GOAL.halfWidth, y: sy * BACK }
      const facing = Math.atan2(-sy, 0)
      const into = Math.atan2(0, -sx)
      let turn = into - facing
      if (turn > Math.PI) turn -= 2 * Math.PI
      if (turn < -Math.PI) turn += 2 * Math.PI
      const round = Array.from({ length: 9 }, (_, k) => {
        const angle = facing + (turn * k) / 8
        return { x: post.x, y: post.y, nx: Math.cos(angle), ny: Math.sin(angle), ramp: RAMP.post }
      })
      const inside = Array.from({ length: 5 }, (_, k) => ({ x: post.x, y: post.y + sy * (INTO_GOAL * (k + 1)) / 5, nx: -sx, ny: 0, ramp: RAMP.post * (1 - (k + 1) / 5) }))
      const path = [...round, ...inside]
      ramp.grid(Array.from({ length: STRIPS + 1 }, (_, k) => path.map((s) => {
        const { out, up } = rampAt(s.ramp, k)
        return ramp.point(s.x + s.nx * out, s.y + s.ny * out, up)
      })))
    }
  return ramp.mesh()
}

/** The upright walls between the floor ramp (or the crossbar) and the ceiling ramp; the side walls are RocketSim's planes. */
function walls(loop: Sample[]) {
  const wall = new Builder()
  const top = HEIGHT - TOP
  for (let i = 0; i < loop.length; i++) {
    const a = loop[i]
    const b = loop[(i + 1) % loop.length]
    if (Math.hypot(b.x - a.x, b.y - a.y) < 1) continue
    if (Math.abs(a.x) === SIDE && Math.abs(b.x) === SIDE) continue
    const mouth = a.mouth && b.mouth
    const bottomA = mouth ? GOAL.height : a.ramp
    const bottomB = mouth ? GOAL.height : b.ramp
    wall.quad(wall.point(a.x, a.y, bottomA), wall.point(b.x, b.y, bottomB), wall.point(b.x, b.y, top), wall.point(a.x, a.y, top))
  }
  return wall.mesh()
}

/** The ceiling ramp all round. */
function ceilingRamp(loop: Sample[]) {
  const ramp = new Builder()
  const ring = [...loop, loop[0]]
  ramp.grid(
    Array.from({ length: STRIPS + 1 }, (_, k) => {
      const angle = (k / STRIPS) * (Math.PI / 2)
      const out = TOP * (1 - Math.sin(angle))
      const down = TOP * (1 - Math.cos(angle))
      return ring.map((s) => ramp.point(s.x + s.nx * out, s.y + s.ny * out, HEIGHT - down))
    }),
  )
  return ramp.mesh()
}

/** Each goal's sides, roof and back; the floor plane is its floor. */
function goals() {
  const box = new Builder()
  const w = GOAL.halfWidth
  const h = GOAL.height
  const upright = (x1: number, y1: number, x2: number, y2: number) => box.quad(box.point(x1, y1, 0), box.point(x2, y2, 0), box.point(x2, y2, h), box.point(x1, y1, h))
  for (const s of [1, -1]) {
    const mouth = s * BACK
    const back = s * (BACK + GOAL.depth)
    upright(-w, mouth, -w, back)
    upright(w, mouth, w, back)
    upright(-w, back, w, back)
    box.quad(box.point(-w, mouth, h), box.point(w, mouth, h), box.point(w, back, h), box.point(-w, back, h))
  }
  return box.mesh()
}

/** Every mesh of the arena, for RocketSim. */
export function arenaMeshes(): Mesh[] {
  const { strips, loop } = outline()
  return [floorRamps(strips), walls(loop), ceilingRamp(loop), goals()]
}

/** The floor ramps alone, to draw on the pitch. */
export function rampMesh(): Mesh {
  return floorRamps(outline().strips)
}
