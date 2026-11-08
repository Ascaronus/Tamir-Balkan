import test from 'node:test'
import assert from 'node:assert/strict'
import {load,hooks} from '../test-support/component-harness.mjs'

test('stock refresh rejects stale responses, refreshes on focus and fails without inventing zero stock',async()=>{
 const h=hooks(),requests=[],listeners={},cleanups=[]
 const react={...h.react,useEffect(fn,deps){h.react.useEffect(()=>{cleanups.splice(0).forEach(f=>f?.());cleanups.push(fn())},deps)}}
 const {useVariantStock}=load('frontend/src/lib/cart/useVariantStock.ts',{react,'./cart-client':{getVariantStock:(ids,channel,signal)=>new Promise((resolve,reject)=>requests.push({ids,channel,signal,resolve,reject}))}},
 {AbortController,window:{addEventListener:(key,fn)=>listeners[key]=fn,removeEventListener:key=>delete listeners[key]}})
 let ids=['v1'],revision='cart:1';const render=()=>h.render(()=>useVariantStock(ids,'sc_store',revision))
 assert.deepEqual(Object.keys(render()),[]);await h.flush()
 assert.equal(requests.length,1);assert.equal(requests[0].channel,'sc_store')
 ids=['v2'];render();await h.flush();assert.equal(requests[0].signal.aborted,true)
 requests[0].resolve({v1:1});await h.flush();assert.equal(render().v1,undefined)
 requests[1].resolve({v2:3});await h.flush();assert.equal(render().v2,3)
 listeners.focus();requests[2].resolve({v2:1});await h.flush();assert.equal(render().v2,1)
 revision='cart:2';assert.equal(render().v2,undefined);await h.flush()
 requests[3].reject(Error('offline'));await h.flush();assert.equal(render().v2,undefined)
 listeners.focus();requests[4].resolve({v2:null});await h.flush();assert.equal(render().v2,null)
 cleanups.forEach(f=>f?.());assert.equal(requests[4].signal.aborted,true);assert.equal(listeners.focus,undefined)
})
