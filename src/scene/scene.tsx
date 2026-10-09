import { useFrame } from "@react-three/fiber"
import { Suspense, type RefObject } from "react"
import { Quaternion } from "three"
import type { Playback } from "../playback"
import type { Replay } from "../replay/model"
import { momentAt, poseAt } from "../replay/sample"
import { Arena } from "./arena"
import { Ball } from "./ball"
import { Cameras, type View } from "./cameras"
import { Car } from "./car"
import { NameTags } from "./name-tags"
import { Pads } from "./pads"

const ignored = new Quaternion()

/** The 3D view of a replay at the playhead. `tags` are the players' name tags, drawn over it. */
export function Scene({ replay, playback, view, tags }: { replay: Replay; playback: Playback; view: View; tags: RefObject<(HTMLElement | null)[]> }) {
  return (
    <Arena>
      <Clock playback={playback} />
      <Suspense fallback={null}>
        <Pads replay={replay} playback={playback} />
        <Ball replay={replay} playback={playback} />
        {replay.cars.map((car) => (
          <Car key={car.id} car={car} replay={replay} playback={playback} />
        ))}
      </Suspense>
      <Cameras view={view} replay={replay} playback={playback} />
      <NameTags
        tags={tags}
        // Like the game, no name over the car you're driving.
        place={(index, point) => !(view.kind === "player" && view.car === index) && poseAt(replay.cars[index], replay.times, momentAt(replay.times, playback.time), point, ignored)}
      />
    </Arena>
  )
}

/** Moves the playhead with real time, before anything reads it this frame. */
function Clock({ playback }: { playback: Playback }) {
  useFrame((_, delta) => playback.advance(Math.min(delta, 0.1)), -1)
  return null
}
