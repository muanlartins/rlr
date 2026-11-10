/**
 * Just enough of obs-websocket (v5, built into OBS 28+) to start and stop the
 * recording and drop chapter marks in it (Hybrid MP4 keeps them; OBS 30.2+).
 * The address and password stay in this browser (`rlr:obs`). Chrome lets an
 * https page reach ws://localhost, so this works from the published site too.
 */

export interface ObsSettings {
  url: string
  password: string
}

const KEY = "rlr:obs"

export function savedObs(): ObsSettings {
  try {
    return { url: "ws://localhost:4455", password: "", ...JSON.parse(localStorage.getItem(KEY) ?? "{}") }
  } catch {
    return { url: "ws://localhost:4455", password: "" }
  }
}

export function saveObs(settings: ObsSettings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings))
  } catch {
    // Private windows may refuse; the settings then last for this visit.
  }
}

async function sha256(text: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
}

/** The recording's state as OBS reports it. */
export interface Recording {
  active: boolean
  /** Milliseconds recorded, when it was asked; with `since`, the local clock then. */
  duration: number
  since: number
}

export class Obs {
  private socket?: WebSocket
  private next = 0
  private waiting = new Map<string, { resolve: (data: Record<string, unknown>) => void; reject: (error: Error) => void }>()
  onRecording?: (recording: Recording) => void
  onClose?: () => void

  async connect({ url, password }: ObsSettings) {
    const socket = new WebSocket(url)
    this.socket = socket
    await new Promise<void>((resolve, reject) => {
      socket.onerror = () => reject(new Error(`O OBS não está respondendo em ${url}. O servidor WebSocket está ligado (Ferramentas → Configurações do servidor WebSocket)?`))
      socket.onclose = (event) => {
        reject(new Error(event.code === 4009 ? "O OBS recusou a senha." : "O OBS fechou a conexão."))
        this.onClose?.()
      }
      socket.onmessage = async (message) => {
        const { op, d } = JSON.parse(message.data)
        if (op === 0) {
          const auth = d.authentication && (await sha256((await sha256(password + d.authentication.salt)) + d.authentication.challenge))
          // 64: the Outputs events, which tell when the recording starts and stops.
          socket.send(JSON.stringify({ op: 1, d: { rpcVersion: 1, eventSubscriptions: 64, ...(auth ? { authentication: auth } : {}) } }))
        } else if (op === 2) {
          resolve()
        } else if (op === 5 && d.eventType === "RecordStateChanged") {
          void this.recording()
        } else if (op === 7) {
          const waiting = this.waiting.get(d.requestId)
          this.waiting.delete(d.requestId)
          if (d.requestStatus.result) waiting?.resolve(d.responseData ?? {})
          else waiting?.reject(new Error(d.requestStatus.comment ?? `O OBS não conseguiu ${d.requestType}`))
        }
      }
    })
    await this.recording()
  }

  close() {
    this.socket?.close()
  }

  call(requestType: string, requestData?: Record<string, unknown>) {
    const requestId = String(++this.next)
    return new Promise<Record<string, unknown>>((resolve, reject) => {
      this.waiting.set(requestId, { resolve, reject })
      this.socket?.send(JSON.stringify({ op: 6, d: { requestType, requestId, requestData } }))
    })
  }

  async recording() {
    const status = await this.call("GetRecordStatus")
    const recording = { active: Boolean(status.outputActive), duration: Number(status.outputDuration ?? 0), since: performance.now() }
    this.onRecording?.(recording)
    return recording
  }

  /** A chapter in the recording; false when this OBS can't (it then still has the mark here). */
  async chapter(name: string) {
    try {
      await this.call("CreateRecordChapter", { chapterName: name })
      return true
    } catch {
      return false
    }
  }
}
