import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {load,hooks,find} from '../test-support/component-harness.mjs'
import {createTranslator} from '../src/lib/i18n/translator.ts'
import {localizedPath} from '../src/lib/i18n/paths.ts'
import * as backdrop from '../src/lib/dialog-backdrop.ts'
import {customerDisplayName} from '../src/lib/auth/customer-display-name.ts'
const messages=Object.fromEntries(['en','sr'].map(l=>[l,JSON.parse(readFileSync(new URL(`../src/messages/${l}.json`,import.meta.url),'utf8'))]))
const copy={sr:{signIn:'Prijavi se',signUp:'Registruj se',email:'Email adresa',password:'Lozinka',forgot:'Zaboravili ste lozinku?',failed:'Neuspela prijava',menu:['Moj nalog','Moje porudžbine','Odjavi se'],register:'/rs/nalog/registracija',reset:'/rs/nalog/zaboravljena-lozinka'},en:{signIn:'Sign in',signUp:'Sign up',email:'Email address',password:'Password',forgot:'Forgot password?',failed:'Login failed',menu:['My account','My orders','Sign out'],register:'/en/account/register',reset:'/en/account/forgot-password'}}
function form(locale,login=async()=>{},props={}){
 const h=hooks(),calls={routes:[],success:0,navigation:0};let busy=false
 const {LoginForm}=load('frontend/src/components/auth/LoginForm.tsx',{
  react:h.react,'@/components/i18n/LocalizedLink':{default:'Link'},
  '@/components/i18n/useLocalizedRouter':{useLocalizedRouter:()=>({push:p=>calls.routes.push(p)})},
  '@/components/i18n/LocaleProvider':{useTranslations:()=>createTranslator(messages[locale])},
  '@/components/auth/AuthProvider':{useAuth:()=>({login,isMutating:busy})},
 },{Error})
 const render=()=>h.render(()=>LoginForm({countryCode:'rs',modal:true,onSuccess:()=>calls.success++,onNavigate:()=>calls.navigation++,...props}))
 return {render,calls,setBusy:v=>busy=v}
}
function all(tree,predicate){const out=[];function visit(n){if(Array.isArray(n))return n.forEach(visit);if(n&&typeof n==='object'){if(predicate(n))out.push(n);visit(n.props?.children)}}visit(tree);return out}
const submit=tree=>find(tree,n=>n.type==='form').props.onSubmit({preventDefault(){}})
for(const locale of ['sr','en']){
 test(`component: ${locale} modal labels and independent registration link`,()=>{
  let requests=0;const p=form(locale,async()=>requests++);const tree=p.render();const text=JSON.stringify(tree)
  for(const key of ['email','password','signIn','signUp','forgot'])assert.ok(text.includes(copy[locale][key]),key)
  const buttons=all(tree,n=>n.type==='button');assert.equal(buttons.length,1);assert.equal(buttons[0].props.type,'submit')
  const registration=find(tree,n=>n.type==='Link'&&n.props.children===copy[locale].signUp)
  assert.equal(localizedPath(registration.props.href,locale),copy[locale].register)
  registration.props.onClick();assert.equal(p.calls.navigation,1);assert.equal(requests,0,'empty required fields must not submit or block a navigation link')
  assert.equal(p.calls.success,0)
  const reset=find(tree,n=>n.type==='Link'&&n.props.children===copy[locale].forgot)
  assert.equal(localizedPath(reset.props.href,locale),copy[locale].reset)
  reset.props.onClick();assert.equal(p.calls.navigation,2)
 })
 test(`component: ${locale} failed login keeps email and shows only localized error`,async()=>{
  const p=form(locale,async()=>{throw Error('secret server detail')});let tree=p.render()
  find(tree,n=>n.type==='input'&&n.props.name==='email').props.onChange({target:{value:'person@example.test'}})
  await submit(p.render());tree=p.render()
  assert.equal(find(tree,n=>n.type==='input'&&n.props.name==='email').props.value,'person@example.test')
  assert.equal(find(tree,n=>n.props?.role==='alert').props.children,copy[locale].failed)
  assert.equal(p.calls.success,0);assert.equal(p.calls.routes.length,0);assert.ok(!JSON.stringify(tree).includes('secret server detail'))
 })
 test(`component: ${locale} successful modal login dismisses without route navigation`,async()=>{
  let args;const p=form(locale,async(...values)=>args=values);let tree=p.render()
  find(tree,n=>n.type==='input'&&n.props.name==='email').props.onChange({target:{value:' person@example.test '}})
  find(tree,n=>n.type==='input'&&n.props.name==='password').props.onChange({target:{value:'test-only-password'}})
  await submit(p.render());assert.deepEqual(args,['person@example.test','test-only-password']);assert.equal(p.calls.success,1);assert.deepEqual(p.calls.routes,[])
 })
}
test('component: rapid duplicate submissions use one authentication request',async()=>{
 let finish,count=0;const p=form('en',()=>{count++;return new Promise(r=>finish=r)});const first=submit(p.render());const second=submit(p.render());await second;assert.equal(count,1)
 p.setBusy(true);assert.equal(find(p.render(),n=>n.type==='button').props.disabled,true)
 assert.equal(find(p.render(),n=>n.type==='button').props.children,'Signing in…');finish();await first
})
test('component: existing standalone checkout login still redirects to checkout',async()=>{
 const p=form('en',async()=>{},{modal:false,next:'checkout'});await submit(p.render());assert.deepEqual(p.calls.routes,['/rs/checkout']);assert.equal(p.calls.success,0)
})
test('unit: display name prioritizes first name, profile display name and email prefix',()=>{
 assert.equal(customerDisplayName({first_name:' Igor ',display_name:'Display',email:'fallback@example.test'}),'Igor')
 assert.equal(customerDisplayName({first_name:' ',display_name:'Display',email:'fallback@example.test'}),'Display')
 assert.equal(customerDisplayName({metadata:{display_name:'Profile'},email:'fallback@example.test'}),'Profile')
 assert.equal(customerDisplayName({metadata:{display_name:42},email:'fallback@example.test'}),'fallback')
 assert.equal(customerDisplayName({}),'')
})
function header(locale){
 const h=hooks();let customer=null,ready=true,mutating=false;let logouts=0,focused=0;const listeners={};class OutsideNode {}
 const c=load('frontend/src/components/auth/HeaderAccount.tsx',{
 react:{...h.react,useId:()=> 'menu'},'next/navigation':{usePathname:()=>'/rs'},
 '@/components/i18n/LocalizedLink':{default:'Link'},'@/components/i18n/LocaleProvider':{useLocaleContext:()=>({locale,t:createTranslator(messages[locale])})},
 '@/components/store/DesignIcon':{DesignIcon:'Icon'},'./AuthProvider':{useAuth:()=>({customer,isReady:ready,isMutating:mutating,logout:async()=>{logouts++;customer=null}})},
 './LoginDialog':{LoginDialog:'LoginDialog'},'@/lib/auth/customer-display-name':{customerDisplayName},
 },{Node:OutsideNode,document:{addEventListener:(name,fn)=>listeners[name]=fn,removeEventListener:name=>delete listeners[name]}})
 const render=()=>h.render(()=>c.HeaderAccountControl());const trigger=tree=>find(tree,n=>n.type==='button'&&n.props.className?.includes('trigger'))
 return {render,trigger,flush:h.flush,outside:()=>listeners.pointerdown({target:new OutsideNode()}),setCustomer:v=>customer=v,setReady:v=>ready=v,logouts:()=>logouts,focus:()=>focused,attach:tree=>{trigger(tree).props.ref.current={focus(){focused++}}}}
}
for(const locale of ['sr','en'])test(`component: ${locale} header opens login then account menu and restores guest state on logout`,async()=>{
 const p=header(locale);let tree=p.render();p.attach(tree)
 assert.equal(p.trigger(tree).props['aria-label'],copy[locale].signIn)
 p.trigger(tree).props.onClick();tree=p.render();assert.ok(find(tree,n=>n.type==='LoginDialog'))
 find(tree,n=>n.type==='LoginDialog').props.onDismiss();assert.equal(find(p.render(),n=>n.type==='LoginDialog'),null)
 p.setCustomer({id:'c',first_name:'Igor',email:'igor@example.test'});tree=p.render();assert.equal(p.trigger(tree).props['aria-label'],'Igor')
 p.trigger(tree).props.onClick();tree=p.render();const nav=find(tree,n=>n.type==='nav');assert.ok(nav)
 for(const label of copy[locale].menu)assert.ok(JSON.stringify(nav).includes(label))
 const links=all(nav,n=>n.type==='Link');assert.equal(localizedPath(links[0].props.href,locale),(locale==='sr'?'/rs/nalog':'/en/account')+'?panel=profile');assert.ok(links[1].props.href.endsWith('?panel=orders'))
 await find(nav,n=>n.type==='button').props.onClick();tree=p.render();assert.equal(p.logouts(),1);assert.equal(p.trigger(tree).props['aria-label'],copy[locale].signIn);assert.equal(find(tree,n=>n.type==='nav'),null)
})
test('component: header Escape closes account navigation and restores focus',()=>{
 const p=header('en');p.setCustomer({id:'c',first_name:'Igor'});let tree=p.render();p.attach(tree);p.trigger(tree).props.onClick();tree=p.render();let prevented=false
 tree.props.onKeyDown({key:'Escape',preventDefault(){prevented=true}});assert.equal(prevented,true);assert.equal(find(p.render(),n=>n.type==='nav'),null);assert.equal(p.focus(),1)
})
test('component: header waits for session hydration and truncates long names via dedicated class',()=>{
 const p=header('en');p.setReady(false);assert.equal(p.trigger(p.render()).props.disabled,true);p.setReady(true);p.setCustomer({id:'c',first_name:'A very long customer name'});const tree=p.render();assert.equal(p.trigger(tree).props.title,'A very long customer name');assert.equal(find(tree,n=>n.props?.className==='header-account-name').props.children,'A very long customer name')
})
function dialog(){
 const effects=[],refs=[];let focused=0,shown=0,closed=0,dismissed=0,emailFocus=0
 const document={body:{style:{overflow:'scroll'}}}
 const trigger={current:{isConnected:true,focus(){focused++}}}
 const {LoginDialog}=load('frontend/src/components/auth/LoginDialog.tsx',{
 react:{useId:()=> 'login-title',useRef:value=>{const r={current:value};refs.push(r);return r},useEffect:fn=>effects.push(fn)},
 './LoginForm':{LoginForm:'LoginForm'},'@/components/i18n/LocaleProvider':{useTranslations:()=>createTranslator(messages.en)},'@/lib/dialog-backdrop':backdrop,
 },{document})
 const tree=LoginDialog({trigger,onDismiss:()=>dismissed++})
 const node={showModal(){shown++},close(){closed++},querySelector(){return {focus(){emailFocus++}}},getBoundingClientRect:()=>({left:100,top:100,right:540,bottom:600})}
 tree.props.ref.current=node
 const cleanup=effects[0]()
 return {tree,node,cleanup,document,stats:()=>({focused,shown,closed,dismissed,emailFocus})}
}
test('component lifecycle: dialog uses native modal focus containment, focuses email, locks and restores scrolling',()=>{
 const p=dialog();assert.equal(p.tree.type,'dialog');assert.equal(p.tree.props['aria-labelledby'],'login-title');assert.equal(p.stats().shown,1);assert.equal(p.stats().emailFocus,1);assert.equal(p.document.body.style.overflow,'hidden')
 p.cleanup();assert.equal(p.stats().closed,1);assert.equal(p.stats().focused,1);assert.equal(p.document.body.style.overflow,'scroll')
})
test('component lifecycle: Escape, close button and backdrop dismiss; inside clicks stay open',()=>{
 const p=dialog();p.tree.props.onCancel({preventDefault(){}});find(p.tree,n=>n.type==='button').props.onClick();assert.equal(p.stats().dismissed,2)
 const point=(x,y)=>({currentTarget:p.node,target:p.node,clientX:x,clientY:y,button:0,detail:1})
 p.tree.props.onPointerDown(point(200,200));p.tree.props.onClick(point(200,200));assert.equal(p.stats().dismissed,2)
 p.tree.props.onPointerDown(point(20,20));p.tree.props.onClick(point(20,20));assert.equal(p.stats().dismissed,3);p.cleanup()
})
test('component lifecycle: registration navigation dismisses without forcing focus onto the old header',()=>{
 const p=dialog();find(p.tree,n=>n.type==='LoginForm').props.onNavigate();p.cleanup();assert.equal(p.stats().dismissed,1);assert.equal(p.stats().focused,0);assert.equal(p.document.body.style.overflow,'scroll')
})
test('provider component: session restoration retrieves profile once; login and logout update the same context',async()=>{
 const h=hooks();let profile={id:'c',first_name:'Igor'},lookups=0,logins=0,logouts=0
 const {AuthProvider}=load('frontend/src/components/auth/AuthProvider.tsx',{
 react:h.react,'@/lib/auth/auth-storage':{clearAuthToken(){}},'@/lib/auth/auth-client':{retrieveCustomer:async()=>{lookups++;return profile},login:async()=>{logins++},logout:async()=>{logouts++;profile=null}},
 })
 const render=()=>h.render(()=>AuthProvider({children:null})).props.value
 assert.equal(render().isReady,false);await h.flush();assert.equal(render().customer.first_name,'Igor');assert.equal(lookups,1);assert.equal(render().isReady,true)
 await render().logout();assert.equal(render().customer,null);assert.equal(render().isLoggedIn,false);assert.equal(logouts,1)
 profile={id:'c2',first_name:'Ana'};await render().login('ana@example.test','test-only');assert.equal(render().customer.first_name,'Ana');assert.equal(logins,1);assert.equal(lookups,2)
})
test('component: account menu deep links select the existing profile/orders panels and tabs update their URL',()=>{
 const h=hooks();let selected='profile';const navigations=[]
 const {AccountPageClient}=load('frontend/src/components/auth/AccountPageClient.tsx',{
 react:h.react,'next/navigation':{useSearchParams:()=>new URLSearchParams('panel='+selected)},
 '@/components/i18n/LocalizedLink':{default:'Link'},'./OrderHistoryDetails':{},
 '@/components/i18n/useLocalizedRouter':{useLocalizedRouter:()=>({replace:(...args)=>navigations.push(args)})},
 '@/lib/cart/reorder':{},'@/components/auth/AuthProvider':{useAuth:()=>({customer:{id:'c',first_name:'Igor',email:'igor@example.test'},isReady:true})},
 '@/lib/medusa':{},'@/components/cart/CartProvider':{useCart:()=>({})},'@/components/auth/AccountProfileForm':{AccountProfileForm:'Profile'},
 '@/components/i18n/LocaleProvider':{useLocaleContext:()=>({locale:'en',t:createTranslator(messages.en)})},
 })
 const render=()=>h.render(()=>AccountPageClient({countryCode:'rs'}));let tree=render()
 assert.equal(find(tree,n=>n.props?.id==='account-profile').props.hidden,false);assert.equal(find(tree,n=>n.props?.id==='account-orders').props.hidden,true)
 const nav=find(tree,n=>n.type==='nav');find(nav,n=>n.type==='button'&&n.props.children==='Orders').props.onClick()
 assert.equal(navigations[0][0],'/rs/account?panel=orders');assert.equal(navigations[0][1].scroll,false)
 selected='orders';tree=render();assert.equal(find(tree,n=>n.props?.id==='account-orders').props.hidden,false);assert.equal(find(tree,n=>n.props?.id==='account-profile').props.hidden,true)
})
for(const outcome of ['success','http-error','network-error'])test(`client boundary: ${outcome} logout only resets local cart after server cookie removal succeeds`,async()=>{
 let cleared=0,events=0
 const client=load('frontend/src/lib/auth/auth-client.ts',{
 '@/lib/medusa':{},'@/lib/cart/cart-storage':{clearStoredCartId(){cleared++}},
 },{fetch:async(path,init)=>{assert.equal(path,'/api/auth/logout');assert.equal(init.method,'POST');if(outcome==='network-error')throw Error('offline');return {ok:outcome==='success'}},window:{dispatchEvent(){events++}},Event:class{}})
 if(outcome==='success'){await client.logout();assert.equal(cleared,1);assert.equal(events,1)}
 else {await assert.rejects(client.logout());assert.equal(cleared,0);assert.equal(events,0)}
})
test('component: account dropdown closes on outside pointer press',async()=>{
 const p=header('en');p.setCustomer({id:'c',first_name:'Igor'});p.trigger(p.render()).props.onClick();assert.ok(find(p.render(),n=>n.type==='nav'));await p.flush();p.outside();assert.equal(find(p.render(),n=>n.type==='nav'),null)
})
test('provider component: failed logout keeps the authenticated customer visible',async()=>{
 const h=hooks();const {AuthProvider}=load('frontend/src/components/auth/AuthProvider.tsx',{
 react:h.react,'@/lib/auth/auth-storage':{clearAuthToken(){}},'@/lib/auth/auth-client':{retrieveCustomer:async()=>({id:'c',first_name:'Igor'}),logout:async()=>{throw Error('offline')}},
 })
 const render=()=>h.render(()=>AuthProvider({children:null})).props.value
 render();await h.flush();await assert.rejects(render().logout(),/offline/);assert.equal(render().customer.first_name,'Igor');assert.equal(render().isLoggedIn,true);assert.equal(render().isMutating,false)
})
test('component: existing account page reports a failed logout without redirecting',async()=>{
 const h=hooks();let redirected=false
 const {AccountPageClient}=load('frontend/src/components/auth/AccountPageClient.tsx',{
 react:h.react,'next/navigation':{useSearchParams:()=>new URLSearchParams('panel=profile')},
 '@/components/i18n/LocalizedLink':{default:'Link'},'./OrderHistoryDetails':{},
 '@/components/i18n/useLocalizedRouter':{useLocalizedRouter:()=>({push:()=>redirected=true})},
 '@/lib/cart/reorder':{},'@/components/auth/AuthProvider':{useAuth:()=>({customer:{id:'c',first_name:'Igor'},isReady:true,logout:async()=>{throw Error('offline')}})},
 '@/lib/medusa':{},'@/components/cart/CartProvider':{useCart:()=>({})},'@/components/auth/AccountProfileForm':{AccountProfileForm:'Profile'},
 '@/components/i18n/LocaleProvider':{useLocaleContext:()=>({locale:'en',t:createTranslator(messages.en)})},
 })
 const render=()=>h.render(()=>AccountPageClient({countryCode:'rs'}));await find(render(),n=>n.type==='button'&&n.props.children==='Logout').props.onClick()
 assert.equal(redirected,false);assert.equal(find(render(),n=>n.props?.role==='alert').props.children,'Sign out failed. Please try again.')
})
test('component: mouse hover opens account menu; touch does not; keyboard focus keeps it open',()=>{
 const p=header('en');p.setCustomer({id:'c',first_name:'Igor'})
 p.render().props.onPointerEnter({pointerType:'touch'});assert.equal(find(p.render(),n=>n.type==='nav'),null)
 p.render().props.onPointerEnter({pointerType:'mouse'});assert.ok(find(p.render(),n=>n.type==='nav'))
 p.render().props.onPointerLeave({pointerType:'mouse',currentTarget:{contains:()=>true}});assert.ok(find(p.render(),n=>n.type==='nav'))
 p.render().props.onPointerLeave({pointerType:'mouse',currentTarget:{contains:()=>false}});assert.equal(find(p.render(),n=>n.type==='nav'),null)
})
