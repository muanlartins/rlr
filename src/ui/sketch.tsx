import { useEffect, useRef, useState, type PointerEvent } from "react"

export type Tool = "pen" | "arrow" | "circle"

export interface Stroke {
  tool: Tool
  color: string
  /** Points as fractions of the view's width and height, so strokes survive a resize. */
  points: [number, number][]
}

export const INKS = ["#f4f5f7", "#ffd23f", "#ff4d5e", "#85a7ff"]

/**
 * A telestrator over the 3D view: freehand lines, arrows and circles. It
 * only takes the mouse while a tool is picked, so the camera still works
 * otherwise.
 */
export function Sketch({ tool, color, strokes, onChange }: { tool?: Tool; color: string; strokes: Stroke[]; onChange: (strokes: Stroke[]) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [drawing, setDrawing] = useState<Stroke>()

  useEffect(() => {
    const element = canvas.current
    if (!element) return
    const paint = () => {
      const ratio = window.devicePixelRatio
      element.width = element.clientWidth * ratio
      element.height = element.clientHeight * ratio
      const g = element.getContext("2d")!
      g.scale(ratio, ratio)
      for (const stroke of drawing ? [...strokes, drawing] : strokes) draw(g, stroke, element.clientWidth, element.clientHeight)
    }
    paint()
    const observer = new ResizeObserver(paint)
    observer.observe(element)
    return () => observer.disconnect()
  }, [strokes, drawing])

  const point = (event: PointerEvent) => {
    const box = canvas.current!.getBoundingClientRect()
    return [(event.clientX - box.left) / box.width, (event.clientY - box.top) / box.height] as [number, number]
  }

  return (
    <canvas
      ref={canvas}
      className="absolute inset-0 h-full w-full"
      style={{ pointerEvents: tool ? "auto" : "none", cursor: tool ? "crosshair" : undefined }}
      onPointerDown={(event) => {
        if (!tool) return
        event.currentTarget.setPointerCapture(event.pointerId)
        setDrawing({ tool, color, points: [point(event)] })
      }}
      onPointerMove={(event) => {
        if (!drawing) return
        const next = point(event)
        setDrawing({ ...drawing, points: drawing.tool === "pen" ? [...drawing.points, next] : [drawing.points[0], next] })
      }}
      onPointerUp={() => {
        if (drawing && drawing.points.length > 1) onChange([...strokes, drawing])
        setDrawing(undefined)
      }}
    />
  )
}

function draw(g: CanvasRenderingContext2D, { tool, color, points }: Stroke, width: number, height: number) {
  if (points.length < 2) return
  const at = points.map(([x, y]) => [x * width, y * height] as const)
  g.strokeStyle = color
  g.fillStyle = color
  g.lineWidth = 5
  g.lineCap = "round"
  g.lineJoin = "round"
  g.shadowColor = "rgba(0, 0, 0, 0.5)"
  g.shadowBlur = 6
  g.beginPath()
  if (tool === "pen") {
    at.forEach(([x, y], index) => (index ? g.lineTo(x, y) : g.moveTo(x, y)))
    g.stroke()
    return
  }
  const [[x0, y0], [x1, y1]] = [at[0], at[at.length - 1]]
  if (tool === "circle") {
    g.ellipse((x0 + x1) / 2, (y0 + y1) / 2, Math.abs(x1 - x0) / 2, Math.abs(y1 - y0) / 2, 0, 0, Math.PI * 2)
    g.stroke()
    return
  }
  const angle = Math.atan2(y1 - y0, x1 - x0)
  const head = 22
  g.moveTo(x0, y0)
  g.lineTo(x1 - Math.cos(angle) * head * 0.6, y1 - Math.sin(angle) * head * 0.6)
  g.stroke()
  g.beginPath()
  g.moveTo(x1, y1)
  g.lineTo(x1 - head * Math.cos(angle - 0.45), y1 - head * Math.sin(angle - 0.45))
  g.lineTo(x1 - head * Math.cos(angle + 0.45), y1 - head * Math.sin(angle + 0.45))
  g.closePath()
  g.fill()
}
