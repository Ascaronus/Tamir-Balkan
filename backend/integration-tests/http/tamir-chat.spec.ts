import { medusaIntegrationTestRunner } from '@medusajs/test-utils'
import { ContainerRegistrationKeys, Modules } from '@medusajs/framework/utils'
import jwt from 'jsonwebtoken'
import sharp from 'sharp'
import { randomUUID, randomBytes } from 'node:crypto'
import { setupChat } from '../../src/utils/chat/schema'
import { defaultChatConfig } from '../../src/shared/chat-config'
jest.setTimeout(120000)
medusaIntegrationTestRunner({
  inApp: true,
  testSuite: ({ api, getContainer }) => {
    it('chat HTTP isolates accounts and claimed guests and protects admin secrets', async () => {
      const container = getContainer(),
        db = container.resolve(ContainerRegistrationKeys.PG_CONNECTION)
      await setupChat(db)
      await db('tamir_chat_settings')
        .where({ id: 1 })
        .update({ config: JSON.stringify({ ...defaultChatConfig, enabled: true }) })
      const { data: keys } = await container
          .resolve(ContainerRegistrationKeys.QUERY)
          .graph({ entity: 'api_key', fields: ['token'], filters: { type: 'publishable' } }),
        secret = container.resolve(ContainerRegistrationKeys.CONFIG_MODULE).projectConfig.http.jwtSecret!
      const a = await container
          .resolve(Modules.CUSTOMER)
          .createCustomers({ email: 'chat-a@example.test', has_account: true, first_name: 'Ana' }),
        b = await container
          .resolve(Modules.CUSTOMER)
          .createCustomers({ email: 'chat-b@example.test', has_account: true })
      const cfg = (id?: string, guest?: string) => ({
        validateStatus: () => true,
        headers: {
          'x-publishable-api-key': keys[0].token,
          ...(id
            ? {
                authorization: `Bearer ${jwt.sign({ actor_id: id, actor_type: 'customer', auth_identity_id: 'auth_' + id, app_metadata: { customer_id: id } }, secret, { expiresIn: '5m' })}`,
              }
            : {}),
          ...(guest ? { 'x-tamir-chat-guest': guest } : {}),
        },
      })
      expect((await api.get('/admin/tamir-chat/settings', cfg())).status).toBe(401)
      const g = await api.post('/store/chat/session', { locale: 'sr', guest: { name: 'Marko' } }, cfg())
      expect(g.status).toBe(200)
      expect(g.data.guest_token).toMatch(/^[a-f0-9]{64}$/)
      const id = g.data.conversation.id
      expect((await api.get('/store/chat/messages?id=' + id, cfg())).status).toBe(404)
      expect((await api.get('/store/chat/messages?id=' + id, cfg(b.id))).status).toBe(404)
      const auth = await api.post('/store/chat/session', { locale: 'en' }, cfg(a.id))
      expect(auth.status).toBe(200)
      expect(auth.data.guest_token).toBeUndefined()
      const body = { id: auth.data.conversation.id, text: 'Hello', clientId: randomUUID() }
      for (let i = 0; i < 2; i++) expect((await api.post('/store/chat/messages', body, cfg(a.id))).status).toBe(200)
      expect((await api.get('/store/chat/messages?id=' + body.id, cfg(a.id))).data.messages).toHaveLength(1)
      expect((await api.get('/store/chat/messages?id=' + body.id, cfg())).status).toBe(404)
      const photo = await sharp(randomBytes(128 * 128 * 3), { raw: { width: 128, height: 128, channels: 3 } }).png().toBuffer()
      const attachment = { id: body.id, text: '', clientId: randomUUID(), image: 'data:image/png;base64,' + photo.toString('base64') }
      // The static upload parser accepts >8 KB while regular messages retain their smaller limit.
      const upload = await api.post('/store/chat/image-message', attachment, cfg(a.id))
      expect(upload.status).toBe(200)
      expect((await api.post('/store/chat/image-message', attachment, cfg(a.id))).data.id).toBe(upload.data.id)
      const imageUrl = `/store/chat/image?id=${body.id}&image=${upload.data.id}`
      const downloaded = await api.get(imageUrl, { ...cfg(a.id), responseType: 'arraybuffer' })
      expect(downloaded.status).toBe(200)
      expect(downloaded.headers['content-type']).toContain('image/jpeg')
      expect(downloaded.headers['cache-control']).toContain('no-store')
      expect((await api.get(imageUrl, cfg())).status).toBe(404)
      expect((await api.get(imageUrl, cfg(b.id))).status).toBe(404)
      expect((await api.post('/store/chat/image-message', attachment, cfg(b.id))).status).toBe(404)
      const oversizedText = await api.post('/store/chat/messages', { ...body, text: 'x'.repeat(9000) }, cfg(a.id))
      expect(oversizedText.status).toBe(413)
      expect(oversizedText.data).toEqual({ code: 'PAYLOAD_TOO_LARGE' })
      const oversizedImage = await api.post('/store/chat/image-message', { ...attachment, image: 'x'.repeat(7 * 1024 * 1024) }, cfg(a.id))
      expect(oversizedImage.status).toBe(413)
      expect(oversizedImage.data).toEqual({ code: 'PAYLOAD_TOO_LARGE' })
      expect((await api.post('/store/chat/image-message', { ...attachment, image: 'data:image/svg+xml;base64,PHN2Zy8+' }, cfg(a.id))).status).toBe(400)
      expect((await api.get('/admin/tamir-chat/image?id=' + body.id + '&image=' + upload.data.id, cfg())).status).toBe(401)

      expect((await api.post('/store/chat/claim', {}, cfg(a.id, g.data.guest_token))).status).toBe(200)
      expect((await api.get('/store/chat/messages?id=' + id, cfg(undefined, g.data.guest_token))).status).toBe(404)
      expect((await api.get('/store/chat/messages?id=' + id, cfg(a.id))).status).toBe(200)
      expect((await api.post('/hooks/tamir-chat', { update_id: 1 }, cfg())).status).toBe(401)
      const reader = await container.resolve(Modules.USER).createUsers({ email: 'chat-reader@example.test' })
      await db('tamir_chat_operator').insert({
        id: randomUUID(),
        name: 'Reader',
        user_id: reader.id,
        role: 'viewer',
        enabled: true,
        available: false,
      })
      const viewer = {
        validateStatus: () => true,
        headers: {
          authorization: `Bearer ${jwt.sign({ actor_id: reader.id, actor_type: 'user', auth_identity_id: 'auth_' + reader.id, app_metadata: { user_id: reader.id } }, secret, { expiresIn: '5m' })}`,
        },
      }
      expect((await api.get('/admin/tamir-chat/conversations', viewer)).status).toBe(200)
      expect((await api.get('/admin/tamir-chat/image?id=' + body.id + '&image=' + upload.data.id, viewer)).status).toBe(200)
      expect((await api.get('/admin/tamir-chat/settings', viewer)).status).toBe(403)
      expect((await api.post('/admin/tamir-chat/secrets', { kind: 'telegram', value: 'bad' }, viewer)).status).toBe(403)
    })
  },
})
