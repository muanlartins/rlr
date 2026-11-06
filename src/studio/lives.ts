/**
 * Luan's lives on disk, as `scripts/videos.py` (in his site's repository) files them:
 *
 *     Videos\Lives\<date>\<hh-mm-ss> Live.mp4            the stream's recording, named for when it started
 *     Videos\Lives\<date>\<hh-mm-ss> Câmera.mkv          the webcam alone
 *     Videos\Lives\<date>\<hh-mm-ss> Jogo.mp4            the game alone, no camera or overlays
 *     Videos\Lives\<date>\Replays\Partida 02 - Vitória 5-4 (prorrogação).replay
 *
 * Picking `Lives` (or `Videos`, or one day's folder) once is enough: the folder is remembered in IndexedDB
 * and, where the browser lets a page keep folders (Edge, Chrome), the next visit only asks to read it again.
 */

/** A file in the folder, read when it's needed. */
export interface Found {
  name: string
  /** Last modified, ms. */
  modified: number
  file: () => Promise<File>
}

export interface LiveMatch {
  /** Its number in the day, from the name: "Partida 02 - …". */
  number: number
  /** "Vitória 5-4 (prorrogação)". */
  result: string
  replay: Found
}

export interface Live {
  date: string
  /** The day's recordings (the game alone and the stream's), earliest first. */
  recordings: Found[]
  matches: LiveMatch[]
}

const DAY = /^\d{4}-\d{2}-\d{2}$/
const RECORDING = /^(\d{2})-(\d{2})-(\d{2}) (Live|Jogo)\.(mp4|mkv|mov)$/i
const MATCH = /^Partida (\d+) - (.+)\.replay$/i

/**
 * The day's recording that holds a match: the last one started before its replay was saved. The game's own (from
 * 11-06 on), so Luan's camera goes on top of a commentary or a short only once; the stream's (camera, crowd and
 * overlays baked in) for the days before it, while it's on disk.
 */
export function recordingFor(live: Live, match: LiveMatch): Found | undefined {
  const streams = live.recordings.filter((recording) => / Live\./i.test(recording.name))
  const games = live.recordings.filter((recording) => / Jogo\./i.test(recording.name))
  return latest(games, live, match) ?? latest(streams, live, match)
}

function latest(recordings: Found[], live: Live, match: LiveMatch): Found | undefined {
  const saved = new Date(match.replay.modified)
  const savedAt = saved.getHours() * 3600 + saved.getMinutes() * 60 + saved.getSeconds()
  const startOf = (recording: Found) => {
    const [, h, m, s] = recording.name.match(RECORDING)!
    return +h * 3600 + +m * 60 + +s
  }
  const sameDay = saved.toLocaleDateString("sv") === live.date
  return (sameDay && recordings.findLast((recording) => startOf(recording) <= savedAt)) || recordings[recordings.length - 1]
}

/** Files by their path inside the picked folder ("2026-11-05/Replays/Partida 01 - ….replay"). */
type Tree = Map<string, Found>

function lives(tree: Tree): Live[] {
  const days = new Map<string, Live>()
  for (const [path, found] of tree) {
    const parts = path.split("/")
    // The day is the nearest folder named like one; the picked folder may be Videos, Lives or a day.
    const at = parts.findLastIndex((part) => DAY.test(part))
    if (at < 0) continue
    const date = parts[at]
    const rest = parts.slice(at + 1)
    const live = days.get(date) ?? { date, recordings: [], matches: [] }
    days.set(date, live)
    if (rest.length === 1 && RECORDING.test(rest[0])) live.recordings.push(found)
    const match = rest.length === 2 && rest[0] === "Replays" ? rest[1].match(MATCH) : null
    if (match) live.matches.push({ number: +match[1], result: match[2], replay: found })
  }
  for (const live of days.values()) {
    live.recordings.sort((a, b) => a.name.localeCompare(b.name))
    live.matches.sort((a, b) => a.number - b.number)
  }
  return [...days.values()].filter((live) => live.matches.length).sort((a, b) => b.date.localeCompare(a.date))
}

// --- Folders, through the File System Access API where there is one ---------------------------------------

interface DirectoryHandle {
  kind: "directory"
  name: string
  values(): AsyncIterable<DirectoryHandle | FileHandle>
  queryPermission(options: { mode: "read" }): Promise<PermissionState>
  requestPermission(options: { mode: "read" }): Promise<PermissionState>
}
interface FileHandle {
  kind: "file"
  name: string
  getFile(): Promise<File>
}
type Picker = (options: { id: string; mode: "read"; startIn: string }) => Promise<DirectoryHandle>

/** Whether this browser can keep a folder between visits. */
export const canKeep = typeof window !== "undefined" && "showDirectoryPicker" in window

/** Only what matters is walked: day folders, their recordings and their Replays. */
async function walk(dir: DirectoryHandle, path: string, tree: Tree, depth = 0) {
  for await (const entry of dir.values()) {
    const at = path ? `${path}/${entry.name}` : entry.name
    if (entry.kind === "file") {
      if (RECORDING.test(entry.name) || MATCH.test(entry.name)) {
        const modified = (await entry.getFile()).lastModified
        tree.set(at, { name: entry.name, modified, file: () => entry.getFile() })
      }
    } else if (depth < 3 && (DAY.test(entry.name) || entry.name === "Lives" || entry.name === "Replays")) {
      await walk(entry, at, tree, depth + 1)
    }
  }
}

async function read(dir: DirectoryHandle): Promise<Live[]> {
  const tree: Tree = new Map()
  // The picked folder's own name counts, when it's a day.
  await walk(dir, DAY.test(dir.name) ? dir.name : "", tree)
  return lives(tree)
}

/** Asks for the folder, remembers it and reads it. */
export async function pick(): Promise<{ name: string; lives: Live[] }> {
  const dir = await (window as unknown as { showDirectoryPicker: Picker }).showDirectoryPicker({ id: "rlr-lives", mode: "read", startIn: "videos" })
  await remember(dir)
  return { name: dir.name, lives: await read(dir) }
}

/** The folder picked before, if the browser kept it. */
export async function remembered(): Promise<DirectoryHandle | undefined> {
  try {
    return await store("readonly", (s) => s.get(KEY))
  } catch {
    return undefined
  }
}

/** Reads the remembered folder; the browser asks again for permission when a visit starts (needs a click). */
export async function reopen(dir: DirectoryHandle): Promise<Live[]> {
  if ((await dir.queryPermission({ mode: "read" })) !== "granted" && (await dir.requestPermission({ mode: "read" })) !== "granted") {
    throw new Error("Reading the folder wasn't allowed.")
  }
  return read(dir)
}

/** Without the API (Firefox, Safari): a folder chosen through `<input webkitdirectory>`, for this visit only. */
export function fromFiles(files: FileList): Live[] {
  const tree: Tree = new Map()
  for (const file of files) {
    if (RECORDING.test(file.name) || MATCH.test(file.name)) {
      tree.set(file.webkitRelativePath || file.name, { name: file.name, modified: file.lastModified, file: async () => file })
    }
  }
  return lives(tree)
}

export type { DirectoryHandle }

// --- IndexedDB: one store, one key ----------------------------------------------------------------------------

const KEY = "lives"

function store<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest): Promise<T> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open("rlr:studio", 1)
    open.onupgradeneeded = () => open.result.createObjectStore("folders")
    open.onerror = () => reject(open.error)
    open.onsuccess = () => {
      try {
        const request = run(open.result.transaction("folders", mode).objectStore("folders"))
        request.onsuccess = () => resolve(request.result as T)
        request.onerror = () => reject(request.error)
      } catch (error) {
        // A folder the browser can't store (DataCloneError) throws here, not through the request.
        reject(error)
      }
    }
  })
}

async function remember(dir: DirectoryHandle) {
  try {
    await store("readwrite", (s) => s.put(dir, KEY))
  } catch {
    // Kept for this visit only.
  }
}
