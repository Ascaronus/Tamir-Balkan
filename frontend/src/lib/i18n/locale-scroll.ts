const storageKey = "tamir:locale-scroll"
const maxAge = 60_000

type SavedPosition = { path: string; hash: string; x: number; y: number; savedAt: number }

// Fetch the localized route through Next, without unloading the document/session.
export function navigateWithLocaleScroll(path: string, navigate: (href: string, options: { scroll: false }) => void) {
  const target = new URL(path, window.location.origin)
  const position: SavedPosition = {
    path: target.pathname + target.search,
    hash: target.hash,
    x: window.scrollX,
    y: window.scrollY,
    savedAt: Date.now(),
  }
  try { window.sessionStorage.setItem(storageKey, JSON.stringify(position)) } catch {
    // Storage restrictions must not prevent changing language.
  }
  // Restore the fragment only after navigation, without jumping to its anchor.
  navigate(position.path, { scroll: false })
}

export function restoreLocaleScroll(): (() => void) | undefined {
  let position: SavedPosition
  try {
    const raw = window.sessionStorage.getItem(storageKey)
    if (!raw) return
    position = JSON.parse(raw)
    if (!position || position.path !== window.location.pathname + window.location.search ||
      typeof position.hash !== "string" || (position.hash !== "" && !position.hash.startsWith("#")) ||
      !Number.isFinite(position.x) || !Number.isFinite(position.y) ||
      !Number.isFinite(position.savedAt) || Date.now() - position.savedAt > maxAge || position.savedAt > Date.now()) {
      window.sessionStorage.removeItem(storageKey)
      return
    }
  } catch { return }

  // replaceState restores the fragment for sharing without navigating to its element.
  window.history.replaceState(window.history.state, "", position.path + position.hash)
  const restore = () => window.scrollTo({ left: position.x, top: position.y, behavior: "instant" })
  restore()
  let frame = 0
  const finish = () => {
    frame = window.requestAnimationFrame(() => {
      restore()
      try { window.sessionStorage.removeItem(storageKey) } catch { /* Storage may be blocked. */ }
    })
  }
  if (document.readyState === "complete") finish()
  else window.addEventListener("load", finish, { once: true })
  return () => {
    window.cancelAnimationFrame(frame)
    window.removeEventListener("load", finish)
  }
}
