import { useEffect, useState } from "react"
import { Choice, Group } from "../ui/controls"
import { canKeep, fromFiles, pick, remembered, reopen, type DirectoryHandle, type Live, type LiveMatch } from "./lives"

/**
 * The studio's way in for Luan: his lives folder, each day with its matches; a match opens with its replay,
 * the day's recording and the studio, already lined up.
 */

export interface Library {
  name: string
  lives: Live[]
}

/** Opening the lives folder: the one remembered (a click, as the browser asks), or a new one. */
export function LibraryButtons({ onLibrary }: { onLibrary: (library: Library) => void }) {
  const [kept, setKept] = useState<DirectoryHandle>()
  const [error, setError] = useState<string>()
  const [reading, setReading] = useState(false)
  useEffect(() => void remembered().then(setKept), [])

  const run = async (read: () => Promise<Library>) => {
    setError(undefined)
    setReading(true)
    try {
      const library = await read()
      if (library.lives.length) onLibrary(library)
      else setError(`No lives in ${library.name}: pick Videos\\Lives, or a day's folder in it.`)
    } catch (caught) {
      // Closing the picker isn't an error.
      if (!(caught instanceof DOMException && caught.name === "AbortError")) setError(String(caught instanceof Error ? caught.message : caught))
    } finally {
      setReading(false)
    }
  }

  const button = "rounded-full border border-white/25 px-5 py-2 font-medium text-[#f4f5f7] hover:bg-white/10 disabled:opacity-50"
  return (
    <div className="mt-3 flex flex-col items-center gap-2">
      <div className="flex flex-wrap items-center justify-center gap-3">
        {kept && (
          <button disabled={reading} onClick={() => void run(async () => ({ name: kept.name, lives: await reopen(kept) }))} className={button}>
            {reading ? "Reading…" : `Open ${kept.name}`}
          </button>
        )}
        {canKeep ? (
          <button disabled={reading} onClick={() => void run(pick)} className={button}>
            {kept ? "Another lives folder…" : "Open a lives folder…"}
          </button>
        ) : (
          <label className={`${button} cursor-pointer`}>
            Open a lives folder…
            <input
              type="file"
              className="hidden"
              // Chosen as a folder: React has no prop for it.
              ref={(input) => input?.setAttribute("webkitdirectory", "")}
              onChange={(event) => {
                const files = event.target.files
                if (files) void run(async () => ({ name: files[0]?.webkitRelativePath.split("/")[0] ?? "", lives: fromFiles(files) }))
              }}
            />
          </label>
        )}
      </div>
      {error && <p className="text-[13px] text-[#ff9b9e]">{error}</p>}
    </div>
  )
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
const dayName = (date: string) => `${+date.slice(8, 10)} ${MONTHS[+date.slice(5, 7) - 1]} ${date.slice(0, 4)}`
const won = (match: LiveMatch) => /^vit/i.test(match.result)

/** The lives, newest first, each with its matches. */
export function LibraryList({ library, current, onOpen, onClose }: { library: Library; current?: { date: string; number: number }; onOpen: (live: Live, match: LiveMatch) => void; onClose: () => void }) {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 text-left">
      <div className="mb-4 flex items-baseline justify-between gap-4">
        <h2 className="text-xl font-medium">Lives</h2>
        <button onClick={onClose} className="text-[13px] text-white/50 hover:text-white">
          Close {library.name}
        </button>
      </div>
      <div className="max-h-[60vh] space-y-5 overflow-y-auto pr-1">
        {library.lives.map((live) => (
          <section key={live.date}>
            <h3 className="mb-2 text-[13px] uppercase tracking-[0.15em] text-white/50">
              {dayName(live.date)}
              {!live.recordings.length && <span className="ml-2 normal-case tracking-normal text-[#ff9b9e]">no recording</span>}
            </h3>
            <div className="flex flex-wrap gap-2">
              {live.matches.map((match) => {
                const here = current?.date === live.date && current.number === match.number
                return (
                  <button
                    key={match.number}
                    onClick={() => onOpen(live, match)}
                    className={`rounded-lg border px-3 py-2 text-left text-[13px] ${here ? "border-[#85a7ff] bg-white/10" : "border-white/10 bg-[#0b1430] hover:border-white/30"}`}
                  >
                    <span className="block text-white/45">Match {match.number}</span>
                    <span className={won(match) ? "text-[#85a7ff]" : "text-white/85"}>{match.result}</span>
                  </button>
                )
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}

/** In the player: the day's previous and next match, and back to the list. */
export function MatchPicker({ live, match, onOpen, onList }: { live: Live; match: LiveMatch; onOpen: (live: Live, match: LiveMatch) => void; onList: () => void }) {
  const at = live.matches.indexOf(match)
  const previous = live.matches[at - 1]
  const next = live.matches[at + 1]
  return (
    <Group>
      <Choice active={false} onClick={onList}>
        Lives
      </Choice>
      <Choice active={false} onClick={() => previous && onOpen(live, previous)}>
        <span className={previous ? "" : "opacity-30"}>‹</span>
      </Choice>
      <span className="whitespace-nowrap px-2 py-1.5 text-white/85">
        {dayName(live.date)} · Match {match.number} · <span className={won(match) ? "text-[#85a7ff]" : ""}>{match.result}</span>
      </span>
      <Choice active={false} onClick={() => next && onOpen(live, next)}>
        <span className={next ? "" : "opacity-30"}>›</span>
      </Choice>
    </Group>
  )
}
