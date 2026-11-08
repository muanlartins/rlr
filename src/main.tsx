import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { App } from "./app"
import { PlayPage } from "./play/play"
import "./index.css"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {new URLSearchParams(location.search).has("play") ? <PlayPage onClose={() => (location.search = "")} /> : <App />}
  </StrictMode>,
)
