const { test } = require('node:test')
const assert = require('node:assert/strict')
require('ts-node/register/transpile-only')
const sharp = require('sharp')
const { prepareImage, IMAGE_MAX_BYTES } = require('../src/utils/chat/images')
const source = () => sharp({ create: { width: 32, height: 24, channels: 3, background: '#913456' } })
test('chat images decode JPEG/PNG/WebP, strip metadata and use bounded private JPEGs', async () => {
  for (const format of ['jpeg', 'png', 'webp']) {
    const input = await source().withMetadata().toFormat(format).toBuffer()
    const result = await prepareImage(`data:image/${format};base64,${input.toString('base64')}`)
    const meta = await sharp(result.content).metadata()
    assert.equal(meta.format, 'jpeg')
    assert.equal(meta.exif, undefined)
    assert.equal(result.width, 32)
    assert.equal(result.height, 24)
    assert.equal(result.mime, 'image/jpeg')
  }
  const large = await sharp({ create: { width: 2000, height: 1000, channels: 3, background: 'white' } }).png().toBuffer()
  const resized = await prepareImage(`data:image/png;base64,${large.toString('base64')}`)
  assert.equal(resized.width, 1600)
  assert.equal(resized.height, 800)
})
test('chat image validation rejects SVG, corrupt data, MIME mismatch, animation and excessive size/pixels', async () => {
  const png = await source().png().toBuffer()
  const animated = await sharp(Buffer.concat([Buffer.alloc(12, 0), Buffer.alloc(12, 255)]), { raw: { width: 2, height: 4, pageHeight: 2, channels: 3 } }).webp().toBuffer()
  const huge = await sharp({ create: { width: 5000, height: 5000, channels: 3, background: 'white' } }).png().toBuffer()
  for (const value of [
    'data:image/svg+xml;base64,PHN2Zy8+',
    'data:image/png;base64,YmFk',
    `data:image/jpeg;base64,${png.toString('base64')}`,
    `data:image/webp;base64,${animated.toString('base64')}`,
    `data:image/png;base64,${huge.toString('base64')}`,
  ]) await assert.rejects(prepareImage(value), /CHAT_IMAGE_INVALID/)
  await assert.rejects(prepareImage('x'.repeat(Math.ceil(IMAGE_MAX_BYTES / 3) * 4 + 65)), /CHAT_IMAGE_TOO_LARGE/)
})
