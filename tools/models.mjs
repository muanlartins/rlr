// Builds public/models from the source models (see README for where to get them).
// Cars keep their wheels as separate nodes, so the player can spin and steer them.
// The stadium loses its textures (we paint it ourselves) and its pitch (we draw an
// exact one), and its thousands of parts are merged into one mesh per material.
import { NodeIO } from "@gltf-transform/core"
import { ALL_EXTENSIONS } from "@gltf-transform/extensions"
import { dedup, flatten, join, meshopt, prune, simplify, textureCompress, weld } from "@gltf-transform/functions"
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from "meshoptimizer"
import { copyFileSync } from "node:fs"
import { homedir } from "node:os"
import sharp from "sharp"

const SOURCE = "assets-src"
const OUT = "public/models"

/** Parts of the stadium model that make up its pitch, replaced by our own. */
const PITCH = ["play_lambert1", "play_Glassdome1", "playOuter1"]

await MeshoptEncoder.ready
await MeshoptDecoder.ready
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ "meshopt.encoder": MeshoptEncoder, "meshopt.decoder": MeshoptDecoder })

async function car(source, name) {
  const doc = await io.read(source)
  await doc.transform(
    dedup(),
    prune(),
    textureCompress({ encoder: sharp, targetFormat: "webp", resize: [1024, 1024] }),
    meshopt({ encoder: MeshoptEncoder, level: "medium" }),
  )
  await io.write(`${OUT}/${name}.glb`, doc)
}

async function stadium(source, name) {
  const doc = await io.read(source)
  const root = doc.getRoot()
  for (const texture of root.listTextures()) texture.dispose()
  for (const node of root.listNodes()) {
    const material = node.getMesh()?.listPrimitives()[0]?.getMaterial()?.getName() ?? ""
    if (PITCH.some((part) => material.startsWith(part))) node.dispose()
  }
  await doc.transform(
    dedup(),
    flatten(),
    join({ keepNamed: false }),
    weld(),
    simplify({ simplifier: MeshoptSimplifier, ratio: 0.5, error: 0.0005 }),
    prune(),
    meshopt({ encoder: MeshoptEncoder, level: "medium" }),
  )
  await io.write(`${OUT}/${name}.glb`, doc)
}

await car(`${homedir()}/repos/losfeld-visualizer/assets/octane.glb`, "octane")
await car(`${SOURCE}/fennec.glb`, "fennec")
await stadium(`${SOURCE}/champions_field.glb`, "stadium")
copyFileSync(`${homedir()}/repos/muanlartins/public/models/ball.glb`, `${OUT}/ball.glb`)
