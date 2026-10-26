import type { MouseEvent, PointerEvent } from "react"

const backdropPresses = new WeakSet<HTMLDialogElement>()

type DialogPoint = { currentTarget: HTMLDialogElement; target: EventTarget; clientX: number; clientY: number }
function isBackdrop(event: DialogPoint) {
  if (event.target !== event.currentTarget) return false
  const bounds = event.currentTarget.getBoundingClientRect()
  return event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom
}

/** Only a press and release on the backdrop dismisses an optional dialog. */
export function trackDialogBackdropPress(event: PointerEvent<HTMLDialogElement>) {
  backdropPresses.delete(event.currentTarget)
  if (event.button === 0 && isBackdrop(event)) backdropPresses.add(event.currentTarget)
}

export function dismissDialogFromBackdrop(event: MouseEvent<HTMLDialogElement>, onDismiss?: () => void) {
  const startedOutside = backdropPresses.delete(event.currentTarget)
  if (!startedOutside || event.detail === 0 || !isBackdrop(event)) return
  if (onDismiss) onDismiss()
  else event.currentTarget.close()
}
