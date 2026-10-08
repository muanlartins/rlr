import type { Replay } from "./model"

/** Parses a .replay file in a worker. */
export function loadReplay(bytes: ArrayBuffer, name: string): Promise<Replay> {
  const worker = new Worker(new URL("./parse.worker.ts", import.meta.url), { type: "module" })
  return new Promise<Replay>((resolve, reject) => {
    worker.onmessage = (event: MessageEvent<{ replay?: Replay; error?: string }>) => {
      if (event.data.replay) resolve(event.data.replay)
      else reject(new Error(event.data.error))
    }
    worker.onerror = (event) => reject(new Error(event.message))
    worker.postMessage({ bytes, name }, [bytes])
  }).finally(() => worker.terminate())
}
