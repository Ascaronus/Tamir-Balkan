import { useEffect, useRef, useState, type ReactNode } from 'react'

// Match .store-container / --store-gutter at the selected storefront viewport,
// not at the width of the administrator's browser window.
export function previewGutter(width: number) {
 if (width <= 360) return 16
 if (width <= 480) return 20
 if (width <= 1100) return 32
 return Math.min(80, Math.max(48, width * .05 - 48))
}

export function DevicePreview({ width, children }: { width: number; children: ReactNode }) {
 const viewport = useRef<HTMLDivElement>(null), canvas = useRef<HTMLDivElement>(null)
 const [geometry, setGeometry] = useState({ scale: 1, height: 0 })
 useEffect(() => {
  const host = viewport.current, content = canvas.current
  if (!host || !content) return
  const measure = () => {
   const scale = Math.min(1, host.clientWidth / width)
   const height = content.offsetHeight
   setGeometry(previous => previous.scale === scale && previous.height === height ? previous : { scale, height })
  }
  measure()
  const observer = new ResizeObserver(measure)
  observer.observe(host)
  observer.observe(content)
  return () => observer.disconnect()
 }, [width])
 return <div ref={viewport} className="banner-preview-viewport">
  <div className="banner-preview-frame" style={{ width: width * geometry.scale, height: geometry.height * geometry.scale }}>
   <div ref={canvas} className="banner-preview-canvas" style={{ width, paddingInline: previewGutter(width), transform: `scale(${geometry.scale})` }}>
    {children}
   </div>
  </div>
 </div>
}
