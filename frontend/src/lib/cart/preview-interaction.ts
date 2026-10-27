/** Pointer and keyboard share one disclosure; timers never fetch cart data. */
export class CartPreviewInteraction {
  private opening: ReturnType<typeof setTimeout> | undefined
  private closing: ReturnType<typeof setTimeout> | undefined
  private hovered = false
  private focused = false
  private dismissed = false
  private open = false
  constructor(private change: (open: boolean) => void) {}
  private clearTimers() { clearTimeout(this.opening); clearTimeout(this.closing); this.opening = this.closing = undefined }
  private show() { if (!this.dismissed && !this.open) { this.open = true; this.change(true) } }
  enterPointer() {
    this.hovered = true; this.dismissed = false; clearTimeout(this.closing)
    if (!this.open && !this.opening) this.opening = setTimeout(() => { this.opening = undefined; this.show() }, 180)
  }
  leavePointer() { this.hovered = false; this.scheduleClose() }
  focusWithin(keyboard: boolean) {
    this.focused = true; clearTimeout(this.closing)
    if (keyboard) { clearTimeout(this.opening); this.opening = undefined; this.show() }
  }
  blurOutside() { this.focused = false; this.dismissed = false; this.scheduleClose() }
  private scheduleClose() {
    if (this.hovered || this.focused) return
    clearTimeout(this.opening); this.opening = undefined; clearTimeout(this.closing)
    this.closing = setTimeout(() => { this.closing = undefined; this.open = false; this.change(false) }, 220)
  }
  dismiss() { this.clearTimers(); this.dismissed = true; this.open = false; this.change(false) }
  dispose() { this.clearTimers() }
}
export function cartPreviewPosition(anchor: { right: number; bottom: number }, viewport: { width: number; height: number }) {
  const width = Math.min(380, Math.max(0, viewport.width - 32))
  const left = Math.max(16, Math.min(anchor.right - width, viewport.width - width - 16))
  const top = Math.max(16, Math.min(anchor.bottom + 8, viewport.height - 160))
  return { width, left, top, maxHeight: Math.max(0, Math.min(520, viewport.height - top - 16)) }
}
