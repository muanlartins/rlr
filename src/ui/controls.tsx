import type { ReactNode } from "react"

/** A strip of buttons. */
export function Group({ children }: { children: ReactNode }) {
  return <div className="flex items-center overflow-hidden rounded-lg border border-white/10 bg-[#0b1430]/85 backdrop-blur">{children}</div>
}

/** A button in a `Group`, lit while `active`. */
export function Choice({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button onClick={onClick} className={active ? "flex flex-1 items-center justify-center whitespace-nowrap bg-white/90 px-2.5 py-1.5 text-[#002fa7]" : "flex flex-1 items-center justify-center whitespace-nowrap px-2.5 py-1.5 text-white/75 hover:bg-white/10"}>
      {children}
    </button>
  )
}
