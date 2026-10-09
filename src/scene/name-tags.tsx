import { useFrame } from "@react-three/fiber"
import type { RefObject } from "react"
import { Quaternion, Vector3 } from "three"
import type { Playback } from "../playback"
import type { Replay } from "../replay/model"
import { momentAt, poseAt } from "../replay/sample"

/** How far above a car's centre its name sits. */
const ABOVE = new Vector3(0, 1.1, 0)

const point = new Vector3()
const ignored = new Quaternion()

/**
 * Keeps each car's name tag (plain elements over the canvas, one per car in
 * `tags`) above its car on screen, and hides it while the car is gone or behind the camera.
 */
export function NameTags({ replay, playback, tags }: { replay: Replay; playback: Playback; tags: RefObject<(HTMLElement | null)[]> }) {
  useFrame(({ camera, size }) => {
    const moment = momentAt(replay.times, playback.time)
    replay.cars.forEach((car, index) => {
      const tag = tags.current[index]
      if (!tag) return
      const shown = poseAt(car, replay.times, moment, point, ignored) && point.add(ABOVE).project(camera).z < 1
      tag.style.visibility = shown ? "visible" : "hidden"
      if (shown) tag.style.transform = `translate(${((point.x + 1) / 2) * size.width}px, ${((1 - point.y) / 2) * size.height}px) translate(-50%, -50%)`
    })
  })
  return null
}
