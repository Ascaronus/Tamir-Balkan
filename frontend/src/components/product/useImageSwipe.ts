"use client"

import { useRef, type MouseEvent, type TouchEvent } from "react"

type Gesture = { id: number; x: number; y: number; key: string; axis: "horizontal" | "vertical" | null; moved: boolean }

/** Keep native vertical scrolling/pinch zoom; only a deliberate horizontal drag changes the image. */
export function useImageSwipe(onSwipe: (direction: number) => void, imageKey: string) {
  const gesture = useRef<Gesture | null>(null)
  const suppressClickUntil = useRef(0)

  function update(point: { clientX: number; clientY: number }, start: Gesture) {
    const dx = point.clientX - start.x, dy = point.clientY - start.y
    if (Math.max(Math.abs(dx), Math.abs(dy)) >= 10) {
      start.moved = true
      if (!start.axis) start.axis = Math.abs(dx) > Math.abs(dy) * 1.5 ? "horizontal" : "vertical"
    }
    return { dx, dy }
  }

  return {
    onTouchStart(event: TouchEvent<HTMLElement>) {
      suppressClickUntil.current = 0
      if (event.touches.length !== 1) { gesture.current = null; suppressClickUntil.current = event.timeStamp + 500; return }
      const touch = event.touches[0]
      gesture.current = { id: touch.identifier, x: touch.clientX, y: touch.clientY, key: imageKey, axis: null, moved: false }
    },
    onTouchMove(event: TouchEvent<HTMLElement>) {
      const start = gesture.current
      if (!start) return
      if (event.touches.length !== 1) { gesture.current = null; suppressClickUntil.current = event.timeStamp + 500; return }
      const touch = Array.from(event.touches).find(point => point.identifier === start.id)
      if (touch) update(touch, start)
    },
    onTouchEnd(event: TouchEvent<HTMLElement>) {
      const start = gesture.current
      gesture.current = null
      if (!start) { suppressClickUntil.current = event.timeStamp + 500; return }
      const touch = Array.from(event.changedTouches).find(point => point.identifier === start.id)
      if (!touch || event.touches.length) { suppressClickUntil.current = event.timeStamp + 500; return }
      const { dx, dy } = update(touch, start)
      if (start.moved) suppressClickUntil.current = event.timeStamp + 500
      if (start.key === imageKey && start.axis === "horizontal" && Math.abs(dx) >= 45 && Math.abs(dx) > Math.abs(dy) * 1.5) onSwipe(dx < 0 ? 1 : -1)
    },
    onTouchCancel(event: TouchEvent<HTMLElement>) {
      gesture.current = null
      suppressClickUntil.current = event.timeStamp + 500
    },
    onClickCapture(event: MouseEvent<HTMLElement>) {
      if (event.detail !== 0 && event.timeStamp <= suppressClickUntil.current) { event.preventDefault(); event.stopPropagation() }
      suppressClickUntil.current = 0
    },
  }
}
