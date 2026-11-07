import test from 'node:test'
import assert from 'node:assert/strict'
import {load,hooks,find} from '../test-support/component-harness.mjs'
const model=load('backend/src/shared/banner-model.ts')
const text=n=>Array.isArray(n)?n.map(text).join(''):typeof n==='string'?n:typeof n==='object'&&n?text(n.props?.children):''
const button=(tree,label)=>find(tree,n=>n.type==='button'&&text(n)===label)
// Medusa UI is a boundary stub: tests exercise page state/actions, not Radix DOM/focus or CSS.
const compound=(name,parts)=>Object.assign(function(){},Object.fromEntries(parts.split(' ').map(p=>[p,`${name}.${p}`])))
const ui={Button:'button',IconButton:'button',Input:'input',Textarea:'textarea',Label:'label',Text:'Text',Heading:'Heading',Container:'Container',Alert:'Alert',Badge:'Badge',StatusBadge:'StatusBadge',Switch:'Switch',Select:compound('Select','Trigger Value Content Item'),Tabs:compound('Tabs','List Trigger Content'),Table:compound('Table','Header Row HeaderCell Body Cell'),DropdownMenu:compound('DropdownMenu','Trigger Content Item Separator'),Drawer:compound('Drawer','Content Header Title Description Body Footer'),FocusModal:compound('FocusModal','Content Header Title Body Footer Description Close')}
const icons=Object.fromEntries(['ArrowDownMini','ArrowUpMini','ArrowUpTray','EllipsisHorizontal','Eye','EyeSlash','Photo','Plus','Trash'].map(x=>[x,`Icon.${x}`]))
const click=n=>n.props.onClick({currentTarget:{}})
const menu=(tree,label)=>find(tree,n=>n.type===ui.DropdownMenu.Item&&text(n)===label)
async function fixture({empty=false,differentTimestamp=false}={}){
 const h=hooks(),calls=[],prompts=[];let confirm=true,fail='',promptResult
 const original=structuredClone(model.initialCarousel);if(empty)original.banners=[]
 const state={draft:original,published:structuredClone(original),previous:null,revision:1}
 if(differentTimestamp)state.published.banners[0].updatedAt='2026-10-31T10:00:00.000Z'
 const request=async(_path,init)=>{if(init.body){const b=JSON.parse(init.body);calls.push(b);if(b.action===fail)return {ok:false,json:async()=>({message:'Publication failed'})};if(b.action==='saveDraft'){state.draft=b.draft;state.revision++}else if(b.action==='publish'){state.previous=state.published;state.published=structuredClone(state.draft);state.revision++}else if(b.action==='delete'){state.draft.banners=state.draft.banners.filter(x=>x.id!==b.id);state.published.banners=state.published.banners.filter(x=>x.id!==b.id);state.revision++}}return {ok:true,json:async()=>structuredClone(state)}}
 const {default:Page}=load('backend/src/admin/routes/homepage-banners/page.tsx',{'react':h.react,'@medusajs/admin-sdk':{defineRouteConfig:x=>x},'@medusajs/ui':{...ui,usePrompt:()=>async props=>{prompts.push(props);return promptResult??confirm}},'@medusajs/icons':icons,'../../../shared/banner-model':model,'../../../shared/banner-carousel':{BannerCarousel:'BannerCarousel'},'./banners.css':{},'./device-preview':{DevicePreview:'DevicePreview'}},{fetch:request,window:{addEventListener(){},removeEventListener(){},location:{reload(){}}},crypto:{randomUUID:()=> 'new'}})
 const render=()=>h.render(()=>Page());render();await h.flush();return {render,h,calls,state,prompts,setConfirm:v=>confirm=v,setFailure:v=>fail=v,setPrompt:v=>promptResult=v}
}
test('admin preview receives unsaved form, locale and actual device width without saving or publishing',async()=>{
 const f=await fixture();let tree=f.render();click(button(tree,'Edit'));tree=f.render()
 find(tree,n=>n.type==='input'&&n.props.value==='Toplina koja nas spaja').props.onChange({target:{value:'Nova kolekcija'}});tree=f.render()
 find(tree,n=>n.type===ui.Drawer).props.onOpenChange(false);tree=f.render();click(button(tree,'Preview Carousel'));tree=f.render()
 click(button(tree,'Mobile'));click(button(tree,'EN'));tree=f.render()
 assert.equal(find(tree,n=>n.type==='DevicePreview').props.width,390);const preview=find(tree,n=>n.type==='BannerCarousel');assert.equal(preview.props.previewWidth,390);assert.equal(preview.props.locale,'en');assert.equal(preview.props.carousel.banners[0].texts.sr.title,'Nova kolekcija');assert.equal(f.calls.length,0);assert.equal(f.state.published.banners[0].texts.sr.title,'Toplina koja nas spaja')
})
test('admin Save Draft leaves publication unchanged; publish needs confirmation and sends current revision',async()=>{
 const f=await fixture();let tree=f.render();click(button(tree,'Edit'));tree=f.render();find(tree,n=>n.type==='input'&&n.props.value==='Winter collection').props.onChange({target:{value:'Changed name'}});tree=f.render()
 click(button(tree,'Save Draft'));await f.h.flush();tree=f.render();assert.deepEqual(f.calls.map(c=>c.action),['saveDraft']);assert.equal(f.state.published.banners[0].name,'Winter collection')
 f.setConfirm(false);click(button(tree,'Publish banner'));await f.h.flush();assert.equal(f.calls.length,1)
 f.setConfirm(true);tree=f.render();click(button(tree,'Publish banner'));await f.h.flush();assert.equal(f.calls[1].action,'publish');assert.equal(f.calls[1].revision,2);assert.equal(f.state.published.banners[0].name,'Changed name')
})
test('empty list offers creation and opens a draft editor without publishing',async()=>{
 const f=await fixture({empty:true});let tree=f.render();assert.ok(find(tree,n=>text(n)==='Create your first banner'));assert.equal(button(tree,'Preview Carousel').props.disabled,true)
 click(button(tree,'Add banner'));tree=f.render();assert.equal(find(tree,n=>n.type===ui.Drawer).props.open,true);assert.equal(find(tree,n=>n.props.id==='banner-name').props.value,'New banner');assert.ok(find(tree,n=>n.type===ui.StatusBadge&&text(n)==='Draft'));assert.equal(f.calls.length,0)
 click(button(tree,'Save Draft'));await f.h.flush();assert.equal(f.state.draft.banners.length,1);assert.equal(f.state.published.banners.length,0)
})
test('closing and reopening editor retains both languages and inclusion; single preview does not enable draft',async()=>{
 const f=await fixture();let tree=f.render();click(button(tree,'Edit'));tree=f.render()
 find(tree,n=>n.props.id==='banner-sr-title').props.onChange({target:{value:'Nova kolekcija'}});tree=f.render()
 find(tree,n=>n.type===ui.Tabs).props.onValueChange('en');tree=f.render();assert.equal(find(tree,n=>n.type===ui.Tabs).props.value,'en')
 find(tree,n=>n.props.id==='banner-en-title').props.onChange({target:{value:'New collection'}});tree=f.render()
 find(tree,n=>n.props.id==='banner-active').props.onCheckedChange(false);tree=f.render()
 find(tree,n=>n.type===ui.Drawer).props.onOpenChange(false);tree=f.render();assert.equal(find(tree,n=>n.type===ui.Drawer).props.open,false)
 click(button(tree,'Edit'));tree=f.render();assert.equal(find(tree,n=>n.props.id==='banner-sr-title').props.value,'Nova kolekcija');assert.equal(find(tree,n=>n.props.id==='banner-en-title').props.value,'New collection');assert.equal(find(tree,n=>n.props.id==='banner-active').props.checked,false)
 click(button(tree,'Preview'));tree=f.render();assert.equal(find(tree,n=>n.type==='BannerCarousel').props.carousel.banners[0].active,true);assert.equal(find(tree,n=>n.props.id==='banner-active').props.checked,false);assert.equal(f.calls.length,0)
})
test('autoplay off disables interval without losing duration or publishing',async()=>{
 const f=await fixture();let tree=f.render();const select=()=>find(tree,n=>n.type===ui.Select&&n.props.value==='6000')
 find(tree,n=>n.props.id==='banner-autoplay').props.onCheckedChange(false);tree=f.render();assert.equal(select().props.disabled,true)
 find(tree,n=>n.props.id==='banner-autoplay').props.onCheckedChange(true);tree=f.render();assert.equal(select().props.disabled,false)
 select().props.onValueChange('10000');tree=f.render();click(button(tree,'Save Draft'));await f.h.flush();assert.equal(f.state.draft.interval,10000);assert.equal(f.state.published.interval,6000)
})
test('row delete requires confirmation and closes the deleted editor',async()=>{
 const f=await fixture();let tree=f.render();click(button(tree,'Edit'));tree=f.render()
 f.setConfirm(false);menu(tree,'Delete banner').props.onSelect();await f.h.flush();assert.equal(f.calls.length,0);assert.equal(f.prompts.at(-1).variant,'danger')
 f.setConfirm(true);tree=f.render();menu(tree,'Delete banner').props.onSelect();await f.h.flush();tree=f.render();assert.equal(f.calls[0].action,'delete');assert.equal(f.calls[0].id,'banner_original');assert.equal(find(tree,n=>n.type===ui.Drawer).props.open,false);assert.equal(f.state.draft.banners.length,0)
})
test('new banner cannot be hidden and restore requires a previous publication',async()=>{
 const f=await fixture({empty:true});let tree=f.render();assert.equal(menu(tree,'Restore previous publication').props.disabled,true)
 click(button(tree,'Add banner'));tree=f.render();assert.equal(menu(tree,'Hide from storefront').props.disabled,true)
})
test('publication error retains saved edits and revision for retry',async()=>{
 const f=await fixture();let tree=f.render();click(button(tree,'Edit'));tree=f.render();find(tree,n=>n.props.id==='banner-name').props.onChange({target:{value:'New draft name'}});tree=f.render()
 f.setFailure('publish');click(button(tree,'Publish banner'));await f.h.flush();tree=f.render();assert.deepEqual(f.calls.map(c=>c.action),['saveDraft','publish']);assert.equal(f.state.published.banners[0].name,'Winter collection');assert.equal(find(tree,n=>n.props.id==='banner-name').props.value,'New draft name');assert.ok(find(tree,n=>n.props.role==='alert'&&text(n).includes('Publication failed')))
 f.setFailure('');click(button(tree,'Publish banner'));await f.h.flush();assert.equal(f.calls.at(-1).revision,2);assert.deepEqual(f.calls.map(c=>c.action),['saveDraft','publish','publish']);assert.equal(f.state.published.banners[0].name,'New draft name')
})
test('confirmation locks duplicate actions and blocks editor dismissal until settled',async()=>{
 const f=await fixture();let tree=f.render();click(button(tree,'Edit'));tree=f.render();let resolve;f.setPrompt(new Promise(r=>resolve=r))
 click(button(tree,'Publish banner'));click(button(tree,'Publish banner'));tree=f.render();assert.equal(f.prompts.length,1);assert.equal(button(tree,'Publish banner').props.disabled,true)
 find(tree,n=>n.type===ui.Drawer).props.onOpenChange(false);tree=f.render();assert.equal(find(tree,n=>n.type===ui.Drawer).props.open,true)
 resolve(false);await f.h.flush();tree=f.render();assert.equal(button(tree,'Publish banner').props.disabled,false);assert.equal(f.calls.length,0)
})
test('reorder arrows update only draft order until saved',async()=>{
 const f=await fixture();let tree=f.render();click(button(tree,'Add banner'));tree=f.render();find(tree,n=>n.type===ui.Drawer).props.onOpenChange(false);tree=f.render()
 find(tree,n=>n.props['aria-label']==='Move New banner up').props.onClick();tree=f.render();click(button(tree,'Save Draft'));await f.h.flush();assert.deepEqual(f.state.draft.banners.map(b=>b.id),['banner_new','banner_original']);assert.deepEqual(f.state.published.banners.map(b=>b.id),['banner_original'])
})
test('publication timestamp alone is not an unpublished content change',async()=>{
 const f=await fixture({differentTimestamp:true});let tree=f.render();assert.ok(find(tree,n=>n.type===ui.StatusBadge&&text(n)==='Published'))
 click(button(tree,'Edit'));tree=f.render();find(tree,n=>n.props.id==='banner-name').props.onChange({target:{value:'Changed'}});tree=f.render();assert.ok(find(tree,n=>n.type===ui.StatusBadge&&text(n)==='Unpublished changes'))
})
for(const [label,action] of [['Publish settings & order only','publishSettings'],['Hide from storefront','deactivate']])test(`native menu sends ${action} only after confirmation`,async()=>{
 const f=await fixture();let tree=f.render();f.setConfirm(false);menu(tree,label).props.onSelect();await f.h.flush();assert.equal(f.calls.length,0)
 f.setConfirm(true);tree=f.render();menu(tree,label).props.onSelect();await f.h.flush();assert.equal(f.calls.length,1);assert.equal(f.calls[0].action,action);assert.equal(f.calls[0].revision,1);if(action==='deactivate')assert.equal(f.calls[0].id,'banner_original')
})
test('publishing carousel saves pending settings before sending the newest revision',async()=>{
 const f=await fixture();let tree=f.render();find(tree,n=>n.props.id==='banner-autoplay').props.onCheckedChange(false);tree=f.render();click(button(tree,'Publish carousel'));await f.h.flush();assert.deepEqual(f.calls.map(c=>c.action),['saveDraft','publishAll']);assert.equal(f.calls[0].draft.autoplay,false);assert.equal(f.calls[1].revision,2)
})
