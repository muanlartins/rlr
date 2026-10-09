import { useSyncExternalStore } from "react"

/**
 * The playhead. The scene reads `time` every frame without re-rendering;
 * React UI subscribes through `usePlayback`. Playing jumps over `gaps`, the
 * stretches the recording has nothing for.
 */
export class Playback {
  time: number
  playing = false
  speed = 1
  private listeners = new Set<() => void>()
  private version = 0

  constructor(readonly start: number, readonly end: number, readonly gaps: [number, number][] = []) {
    this.time = start
  }

  /** Moves the playhead by the real seconds since the last frame. */
  advance(seconds: number) {
    if (!this.playing) return
    const time = this.time + seconds * this.speed
    this.seek(this.gaps.find(([from, to]) => time > from && time < to)?.[1] ?? time)
    if (this.time >= this.end) this.set({ playing: false })
  }

  seek(time: number) {
    this.time = Math.min(this.end, Math.max(this.start, time))
    this.emit()
  }

  set(changes: Partial<Pick<Playback, "playing" | "speed">>) {
    Object.assign(this, changes)
    if (changes.playing && this.time >= this.end) this.time = this.start
    this.emit()
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => void this.listeners.delete(listener)
  }

  snapshot = () => this.version

  private emit() {
    this.version++
    for (const listener of this.listeners) listener()
  }
}

/** Re-renders whenever the playhead moves or its settings change. */
export function usePlayback(playback: Playback) {
  useSyncExternalStore(playback.subscribe, playback.snapshot)
  return playback
}
