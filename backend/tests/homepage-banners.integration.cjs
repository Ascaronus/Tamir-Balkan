const {test,before,after}=require('node:test'),assert=require('node:assert/strict')
require('ts-node/register/transpile-only')
const {assertNonProduction}=require('../test-support/guard-env.cjs')
const connection=process.env.TEST_REVIEWS_DB_URL;assertNonProduction(connection,'TEST_REVIEWS_DB_URL')
const knex=require('knex'),schema='banners_test_'+process.pid,root=knex({client:'pg',connection}),db=knex({client:'pg',connection,searchPath:[schema]})
const {setupBanners,bannerState,changeBanners}=require('../src/utils/homepage-banners')
before(async()=>{await root.raw(`CREATE SCHEMA ${schema}`);await setupBanners(db);await setupBanners(db)})
after(async()=>{await db.destroy();await root.raw(`DROP SCHEMA ${schema} CASCADE`);await root.destroy()})
test('SQL drafts, atomic publication, concurrency, settings, deactivate, delete and rollback',async()=>{
 let state=await bannerState(db);assert.equal(state.draft.banners.length,1)
 const original=JSON.parse(JSON.stringify(state.published)),draft=JSON.parse(JSON.stringify(state.draft));draft.banners[0].texts.en.title='Draft title';draft.interval=10000
 state=await changeBanners(db,{action:'saveDraft',draft,revision:state.revision},async()=>{});assert.deepEqual(state.published,original)
 const revision=state.revision
 const results=await Promise.allSettled([0,1].map(()=>changeBanners(db,{action:'publishAll',revision},async()=>{})))
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.find(r=>r.status==='rejected').reason.status,409)
 state=await bannerState(db);assert.equal(state.published.banners[0].texts.en.title,'Draft title');assert.equal(state.published.interval,10000)
 await assert.rejects(()=>changeBanners(db,{action:'publishAll',revision:state.revision},async()=>{throw Error('missing image')}),/missing image/);assert.equal((await bannerState(db)).revision,state.revision)
 state=await changeBanners(db,{action:'restore',revision:state.revision},async()=>{});assert.deepEqual(state.published,original);assert.equal(state.draft.banners[0].texts.en.title,'Draft title')
 state=await changeBanners(db,{action:'deactivate',id:'banner_original',revision:state.revision},async()=>{});assert.equal(state.published.banners[0].active,false)
 state=await changeBanners(db,{action:'delete',id:'banner_original',revision:state.revision},async()=>{});assert.equal(state.published.banners.length,0);assert.equal(state.draft.banners.length,0)
})
test('SQL individual publication and settings/order do not publish other draft content',async()=>{
 const {initialCarousel,moveBanner}=require('../src/shared/banner-model')
 let state=await bannerState(db),draft=JSON.parse(JSON.stringify(initialCarousel));draft.banners.push({...draft.banners[0],id:'banner_second'})
 state=await changeBanners(db,{action:'saveDraft',draft,revision:state.revision},async()=>{})
 state=await changeBanners(db,{action:'publish',id:'banner_second',revision:state.revision},async()=>{});assert.deepEqual(state.published.banners.map(b=>b.id),['banner_second'])
 state=await changeBanners(db,{action:'publish',id:'banner_original',revision:state.revision},async()=>{});assert.deepEqual(state.published.banners.map(b=>b.id),['banner_original','banner_second'])
 draft=moveBanner(JSON.parse(JSON.stringify(state.draft)),0,1);draft.interval=3000;draft.banners[0].texts.en.title='Still private'
 state=await changeBanners(db,{action:'saveDraft',draft,revision:state.revision},async()=>{})
 state=await changeBanners(db,{action:'publishSettings',revision:state.revision},async()=>{});assert.equal(state.published.interval,3000);assert.equal(state.published.banners[0].id,'banner_second');assert.notEqual(state.published.banners[0].texts.en.title,'Still private')
})
test('restoring a deleted published banner returns it to the editable list',async()=>{
 let state=await bannerState(db)
 const id=state.published.banners[0].id
 state=await changeBanners(db,{action:'delete',id,revision:state.revision},async()=>{})
 assert.equal(state.draft.banners.some(b=>b.id===id),false)
 state=await changeBanners(db,{action:'restore',revision:state.revision},async()=>{})
 assert.equal(state.published.banners.some(b=>b.id===id),true);assert.equal(state.draft.banners.some(b=>b.id===id),true)
})
