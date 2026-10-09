import { useFrame } from "@react-three/fiber"
import type { RefObject } from "react"
import { Vector3 } from "three"

/** How far above a car's centre its name sits. */
const ABOVE = new Vector3(0, 1.1, 0)

const point = new Vector3()

/**
 * Keeps each name tag (plain elements over the canvas, in `tags`) above its
 * car on screen. `place` puts car `index` in `point`, or says it's gone; a
 * tag hides then, and while its car is behind the camera.
 */
export function NameTags({ tags, place }: { tags: RefObject<(HTMLElement | null)[]>; place: (index: number, point: Vector3) => boolean }) {
  useFrame(({ camera, size }) => {
    tags.current.forEach((tag, index) => {
      if (!tag) return
      const shown = place(index, point) && point.add(ABOVE).project(camera).z < 1
      tag.style.visibility = shown ? "visible" : "hidden"
      if (shown) tag.style.transform = `translate(${((point.x + 1) / 2) * size.width}px, ${((1 - point.y) / 2) * size.height}px) translate(-50%, calc(-100% - 4px))`
    })
  })
  return null
}
