const {test}=require('node:test'),assert=require('node:assert/strict')
require('ts-node/register/transpile-only')
const {initialCarousel,carouselInput,safeBannerUrl,moveBanner}=require('../src/shared/banner-model')
const {decodeBannerImage}=require('../src/utils/banner-media')
const {bannerAdmin}=require('../src/utils/banner-http')
const clone=()=>JSON.parse(JSON.stringify(initialCarousel))
test('banner publication validation requires both languages, image, safe paired CTA and bounded settings',()=>{
 assert.equal(carouselInput(clone(),true).banners[0].texts.sr.title,'Toplina koja nas spaja')
 for(const mutate of [c=>c.banners[0].desktop='',c=>c.banners[0].texts.en.title='',c=>c.banners[0].texts.sr.alt='',c=>c.banners[0].texts.en.primaryUrl='javascript:alert(1)',c=>c.banners[0].texts.sr.description='<script>alert(1)</script>',c=>c.interval=2,c=>c.banners[0].gradient=101,c=>c.banners.push(c.banners[0])]){const c=clone();mutate(c);assert.throws(()=>carouselInput(c,true))}
 const draft=clone();draft.banners[0].desktop='';draft.banners[0].texts.en.title='';assert.doesNotThrow(()=>carouselInput(draft))
})
test('banner URL validation rejects script, data, protocol-relative, credentials and controls',()=>{
 for(const bad of ['javascript:alert(1)','data:text/html,test','//evil.test','https://user:pass@evil.test','/\\evil','/foo%0abar','https://evil.test/a b'])assert.equal(safeBannerUrl(bad),false,bad)
 for(const good of ['/catalog','/en/catalog?q=hat','#catalog-products','https://tamir.rs/en'])assert.equal(safeBannerUrl(good),true,good)
})
test('moving banners is immutable and preserves all entries',()=>{const c=clone();c.banners.push({...c.banners[0],id:'banner_2'});const moved=moveBanner(c,0,1);assert.equal(moved.banners[1].id,'banner_original');assert.equal(c.banners[0].id,'banner_original');assert.equal(moveBanner(c,0,-1),c)})
test('upload validates signature, declared MIME, base64, size and rejects SVG',()=>{
 const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aV5sAAAAASUVORK5CYII='
 assert.equal(decodeBannerImage({mime:'image/png',data:png}).extension,'png')
 for(const input of [{mime:'image/jpeg',data:png},{mime:'image/svg+xml',data:Buffer.from('<svg/>').toString('base64')},{mime:'image/png',data:'bad!'}, {mime:'image/png',data:'A'.repeat(8*1024*1024)}])assert.throws(()=>decodeBannerImage(input))
})
test('banner management verifies user actor and explicit administrator permission',async()=>{
 await assert.rejects(()=>bannerAdmin({}),/Administrator/)
 await assert.rejects(()=>bannerAdmin({auth_context:{actor_type:'customer',actor_id:'cus_a'}}),/Administrator/)
 const req=email=>({auth_context:{actor_type:'user',actor_id:'user_a'},scope:{resolve:()=>({retrieveUser:async()=>({email})})}})
 await assert.rejects(()=>bannerAdmin(req('employee@example.test')),/permission/)
 await bannerAdmin(req('admin@tamir.local'))
})
test('public handler exposes only active published data and revalidates ETag without leaking draft',async()=>{
 const {GET}=require('../src/api/store/homepage-banners/route')
 const pub=clone();pub.banners.push({...pub.banners[0],id:'banner_inactive',active:false});let revision=3
 const req={headers:{},scope:{resolve:()=>()=>({where:()=>({first:async()=>({published:pub,draft:{secret:'private draft'},previous:{secret:'previous'},revision})})})}}
 const result={headers:{}},res={setHeader:(k,v)=>result.headers[k]=v,status:n=>{result.status=n;return res},json:v=>result.body=v,end:()=>{result.ended=true}}
 await GET(req,res);assert.equal(result.body.banners.length,1);assert.equal('draft' in result.body,false);assert.equal('previous' in result.body,false);assert.equal('name' in result.body.banners[0],false)
 req.headers['if-none-match']='"banners-3"';await GET(req,res);assert.equal(result.status,304)
 revision=4;delete result.status;await GET(req,res);assert.equal(result.headers.ETag,'"banners-4"');assert.equal(result.body.banners.length,1)
})
test('image upload uses generated persistent filename and publication rejects missing or unregistered media',async()=>{
 const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path')
 const {uploadBannerImage,checkBannerMedia}=require('../src/utils/banner-media')
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'banner-media-')),cwd=process.cwd(),rows=[]
 const db=()=>({insert:async row=>rows.push(row),where:filter=>({first:async()=>rows.find(r=>r.url===filter.url)})})
 try{process.chdir(dir)
 const media=await uploadBannerImage(db,{filename:'../../unsafe',mime:'image/png',data:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aV5sAAAAASUVORK5CYII='})
 assert.match(media.filename,/^media_[a-f0-9-]+\.png$/);assert.equal(rows.length,1);assert.ok((await fs.stat(path.join(dir,'static/banners',media.filename))).size>0)
 const c=clone();c.banners[0].desktop=media.url;await checkBannerMedia(db,c)
 c.banners[0].mobile='https://example.test/unregistered.png';await assert.rejects(()=>checkBannerMedia(db,c),/Upload banner/);c.banners[0].mobile=''
 await fs.unlink(path.join(dir,'static/banners',media.filename));await assert.rejects(()=>checkBannerMedia(db,c),/missing/)
 }finally{process.chdir(cwd);await fs.rm(dir,{recursive:true,force:true})}
})
