import test from 'node:test'
import assert from 'node:assert/strict'
import { load, hooks, find } from '../test-support/component-harness.mjs'

test('device preview uses storefront gutters at selected viewport breakpoints', () => {
 const { previewGutter } = load('backend/src/admin/routes/homepage-banners/device-preview.tsx', { react: {} })
 for (const [width, gutter] of [[320,16],[360,16],[390,20],[480,20],[481,32],[768,32],[1100,32],[1200,48],[2560,80]]) {
  assert.equal(previewGutter(width), gutter)
 }
})

test('preview fits a narrow admin viewport without changing device layout, and tracks content resize', async () => {
 const h = hooks(), observed = [], cleanups = []
 let resize, disconnected = false
 const react = { ...h.react, useEffect(fn, deps) { h.react.useEffect(() => { cleanups.push(fn()) }, deps) } }
 const { DevicePreview } = load('backend/src/admin/routes/homepage-banners/device-preview.tsx', { react }, {
  ResizeObserver: class {
   constructor(callback) { resize = callback }
   observe(element) { observed.push(element) }
   disconnect() { disconnected = true }
  },
 })
 const render = () => h.render(() => DevicePreview({ width:768, children:'Banner' }))
 let tree = render()
 const host = { clientWidth:320 }, canvas = { offsetHeight:600 }
 tree.props.ref.current = host
 find(tree,n=>n.props.className==='banner-preview-canvas').props.ref.current = canvas
 await h.flush(); tree=render()
 assert.deepEqual(observed,[host,canvas])
 const frame=()=>find(tree,n=>n.props.className==='banner-preview-frame').props.style
 const content=()=>find(tree,n=>n.props.className==='banner-preview-canvas').props
 assert.equal(frame().width,320);assert.equal(frame().height,250)
 assert.equal(content().style.width,768);assert.equal(content().style.paddingInline,32)
 assert.equal(content().children,'Banner')
 canvas.offsetHeight=720;resize();tree=render();assert.equal(frame().height,300)
 host.clientWidth=1400;resize();tree=render()
 assert.equal(frame().width,768);assert.equal(frame().height,720)
 assert.equal(content().style.transform,'scale(1)')
 cleanups.forEach(fn=>fn?.());assert.equal(disconnected,true)
})
