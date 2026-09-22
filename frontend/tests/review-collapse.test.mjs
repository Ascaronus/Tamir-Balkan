import test from 'node:test'
import assert from 'node:assert/strict'
import {load,hooks,find} from '../test-support/component-harness.mjs'

function setup(score) {
 const parent = hooks(), item = hooks()
 let active = parent
 const react = Object.fromEntries(Object.keys(parent.react).map(k=>[k,(...args)=>active.react[k](...args)]))
 const review={id:'r1',name:'Igor',rating:5,body:'Good product',score,up:0,down:0,created_at:'2026-09-22',voted:false}
 const component=load('frontend/src/components/reviews/ProductReviews.tsx',{
  react,'next/link':{},'@/components/auth/AuthProvider':{useAuth:()=>({customer:null,isReady:true})},
  '@/components/i18n/LocaleProvider':{useLocaleContext:()=>({t:k=>k,locale:'en'})},
  '@/components/security/Captcha':{useCaptcha:()=>({captcha:null})},
  '@/lib/reviews/client':{listReviews:async()=>({reviews:[review],count:1,rating:5}),reviewErrorKey:()=>''},
  '@/lib/reviews/rating':{reviewCollapsed:s=>s<0},'./Stars':{Stars:'stars',ReviewIcon:'icon',Thumb:'thumb'}
 },{window:{location:{hash:''},addEventListener(){},removeEventListener(){}}})
 return { parent, review,
  render(){active=parent;return parent.render(()=>component.ProductReviews({productId:'p1',initial:{count:1,rating:5}}))},
  renderItem(node){active=item;return item.render(()=>node.type(node.props))}
 }
}
for(const score of [-3,-1,0,2]) test(`review score ${score}: default, manual toggle, and whole-section toggle`,async()=>{
 const s=setup(score)
 let tree=s.render()
 assert.equal(find(tree,n=>n.props?.id==='product-review-content').props.hidden,false)
 await s.parent.flush(); tree=s.render()
 const node=find(tree,n=>typeof n.type==='function'&&n.props.review)
 let item=s.renderItem(node)
 assert.equal(find(item,n=>n.props?.id==='review-body-r1').props.hidden,score<0)
 const toggle=()=>find(item,n=>n.type==='button'&&n.props['aria-controls']==='review-body-r1')
 toggle().props.onClick();item=s.renderItem(node)
 assert.equal(find(item,n=>n.props?.id==='review-body-r1').props.hidden,score>=0)
 const all=()=>find(tree,n=>n.type==='button'&&n.props['aria-controls']==='product-review-content')
 all().props.onClick();tree=s.render()
 assert.equal(find(tree,n=>n.props?.id==='product-review-content').props.hidden,true)
 assert.ok(find(tree,n=>n.props?.review),'reviews remain mounted while section is hidden')
 all().props.onClick();tree=s.render();item=s.renderItem(node)
 assert.equal(find(item,n=>n.props?.id==='review-body-r1').props.hidden,score>=0)
 toggle().props.onClick();item=s.renderItem(node)
 assert.equal(find(item,n=>n.props?.id==='review-body-r1').props.hidden,score<0)
})
