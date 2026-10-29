import test from 'node:test'
import assert from 'node:assert/strict'
import {load,hooks,find} from '../test-support/component-harness.mjs'
const model=load('backend/src/shared/banner-model.ts')
async function fixture(){
 const h=hooks(),calls=[];let confirm=true
 const original=structuredClone(model.initialCarousel),state={draft:original,published:structuredClone(original),previous:null,revision:1}
 const request=async(_path,init)=>{if(init.body){const b=JSON.parse(init.body);calls.push(b);if(b.action==='saveDraft'){state.draft=b.draft;state.revision++}else if(b.action==='publish'){state.previous=state.published;state.published=structuredClone(state.draft);state.revision++}}return {ok:true,json:async()=>structuredClone(state)}}
 const {default:Page}=load('backend/src/admin/routes/homepage-banners/page.tsx',{'react':h.react,'@medusajs/admin-sdk':{defineRouteConfig:x=>x},'../../../shared/banner-model':model,'../../../shared/banner-carousel':{BannerCarousel:'BannerCarousel'},'./banners.css':{}},{fetch:request,window:{addEventListener(){},removeEventListener(){},confirm:()=>confirm,location:{reload(){}}},crypto:{randomUUID:()=> 'new'}})
 const render=()=>h.render(()=>Page());render();await h.flush();return {render,h,calls,state,setConfirm:v=>confirm=v}
}
test('admin preview receives unsaved form, locale and actual device width without saving or publishing',async()=>{
 const f=await fixture();let tree=f.render();find(tree,n=>n.type==='button'&&n.props.children==='Edit').props.onClick();tree=f.render()
 const input=find(tree,n=>n.type==='input'&&n.props.value==='Toplina koja nas spaja');input.props.onChange({target:{value:'Nova kolekcija'}});tree=f.render()
 find(tree,n=>n.type==='button'&&n.props.children==='Preview Carousel').props.onClick();tree=f.render()
 find(tree,n=>n.type==='button'&&n.props.children==='Mobile').props.onClick();find(tree,n=>n.type==='button'&&n.props.children==='EN').props.onClick();tree=f.render()
 const preview=find(tree,n=>n.type==='BannerCarousel');assert.equal(preview.props.previewWidth,390);assert.equal(preview.props.locale,'en');assert.equal(preview.props.carousel.banners[0].texts.sr.title,'Nova kolekcija');assert.equal(f.calls.length,0);assert.equal(f.state.published.banners[0].texts.sr.title,'Toplina koja nas spaja')
})
test('admin Save Draft leaves publication unchanged; publish needs confirmation and sends current revision',async()=>{
 const f=await fixture();let tree=f.render();find(tree,n=>n.type==='button'&&n.props.children==='Edit').props.onClick();tree=f.render();find(tree,n=>n.type==='input'&&n.props.value==='Winter collection').props.onChange({target:{value:'Changed name'}});tree=f.render()
 find(tree,n=>n.type==='button'&&n.props.children==='Save Draft').props.onClick();await f.h.flush();tree=f.render();assert.deepEqual(f.calls.map(c=>c.action),['saveDraft']);assert.equal(f.state.published.banners[0].name,'Winter collection')
 f.setConfirm(false);find(tree,n=>n.type==='button'&&n.props.children==='Publish…').props.onClick();await f.h.flush();assert.equal(f.calls.length,1)
 f.setConfirm(true);tree=f.render();find(tree,n=>n.type==='button'&&n.props.children==='Publish…').props.onClick();await f.h.flush();assert.equal(f.calls[1].action,'publish');assert.equal(f.calls[1].revision,2);assert.equal(f.state.published.banners[0].name,'Changed name')
})
