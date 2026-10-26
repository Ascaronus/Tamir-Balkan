import test from 'node:test'
import assert from 'node:assert/strict'
import { trackDialogBackdropPress, dismissDialogFromBackdrop } from '../src/lib/dialog-backdrop.ts'
function setup() {
 let closed = 0
 const dialog = { getBoundingClientRect: () => ({ left:100, right:500, top:100, bottom:400 }), close: () => { closed++ } }
 const event = (x, y, target = dialog) => ({ currentTarget:dialog, target, clientX:x, clientY:y, button:0, detail:1 })
 return { dialog, event, closed:() => closed }
}
test('backdrop clicks on each side dismiss an optional dialog', () => {
 for (const [x,y] of [[50,200],[550,200],[200,50],[200,450]]) {
  const s=setup(); trackDialogBackdropPress(s.event(x,y)); dismissDialogFromBackdrop(s.event(x,y)); assert.equal(s.closed(),1)
 }
})
test('content, padding and border clicks do not dismiss', () => {
 for (const [x,y,target] of [[200,200], [100,100], [500,400], [50,200,{}]]) {
  const s=setup(); trackDialogBackdropPress(s.event(x,y,target)); dismissDialogFromBackdrop(s.event(x,y,target)); assert.equal(s.closed(),0)
 }
})
test('dragging between content and backdrop does not dismiss', () => {
 for (const [start,end] of [[200,50],[50,200]]) {
  const s=setup(); trackDialogBackdropPress(s.event(start,200)); dismissDialogFromBackdrop(s.event(end,200)); assert.equal(s.closed(),0)
 }
})
test('state-controlled dialogs dismiss through their callback, only once per press', () => {
 const s=setup();let dismissed=0
 trackDialogBackdropPress(s.event(50,200));dismissDialogFromBackdrop(s.event(50,200),()=>dismissed++)
 dismissDialogFromBackdrop(s.event(50,200),()=>dismissed++)
 assert.equal(dismissed,1);assert.equal(s.closed(),0)
})
test('keyboard and secondary-button events do not dismiss', () => {
 const s=setup();trackDialogBackdropPress({...s.event(50,200),button:2});dismissDialogFromBackdrop(s.event(50,200));assert.equal(s.closed(),0)
 trackDialogBackdropPress(s.event(50,200));dismissDialogFromBackdrop({...s.event(50,200),detail:0});assert.equal(s.closed(),0)
})
