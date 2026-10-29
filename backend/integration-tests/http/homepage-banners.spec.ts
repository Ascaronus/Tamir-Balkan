import { medusaIntegrationTestRunner } from '@medusajs/test-utils'
import { ContainerRegistrationKeys, Modules } from '@medusajs/framework/utils'
import { setupBanners } from '../../src/utils/homepage-banners'
import jwt from 'jsonwebtoken'
jest.setTimeout(120000)
medusaIntegrationTestRunner({inApp:true,testSuite:({api,getContainer})=>{
 it('banner HTTP requires admin permission, isolates drafts and publishes explicit revisions',async()=>{
  const container=getContainer(),db=container.resolve(ContainerRegistrationKeys.PG_CONNECTION);await setupBanners(db)
  const user=await container.resolve(Modules.USER).createUsers({email:'admin@tamir.local'})
  const other=await container.resolve(Modules.USER).createUsers({email:'banner-other@example.test'})
  const secret=container.resolve(ContainerRegistrationKeys.CONFIG_MODULE).projectConfig.http.jwtSecret!
  const token=(id:string)=>jwt.sign({actor_id:id,actor_type:'user',auth_identity_id:'auth_'+id,app_metadata:{user_id:id}},secret,{expiresIn:'5m'})
  const options=(id?:string)=>({validateStatus:()=>true,headers:id?{authorization:`Bearer ${token(id)}`}:{}})
  expect((await api.get('/admin/homepage-banners',options())).status).toBe(401)
  expect((await api.get('/admin/homepage-banners',options(other.id))).status).toBe(403)
  const get=await api.get('/admin/homepage-banners',options(user.id));expect(get.status).toBe(200)
  const original=get.data.published,draft=get.data.draft;draft.banners[0].texts.en.title='Unpublished test'
  const save=await api.post('/admin/homepage-banners',{action:'saveDraft',draft,revision:get.data.revision},options(user.id));expect(save.status).toBe(200);expect(save.data.published).toEqual(original)
  const publish=await api.post('/admin/homepage-banners',{action:'publishAll',revision:save.data.revision},options(user.id));expect(publish.status).toBe(200);expect(publish.data.published.banners[0].texts.en.title).toBe('Unpublished test')
  expect((await api.post('/admin/homepage-banners',{action:'publishAll',revision:save.data.revision},options(user.id))).status).toBe(409)
  expect((await api.post('/admin/homepage-banners/media',{mime:'image/svg+xml',data:Buffer.from('<svg/>').toString('base64')},options(user.id))).status).toBe(400)
 })
}})
