import test from 'node:test'
import assert from 'node:assert/strict'
import { detectBrowserLocale, locales, defaultLocale } from '../src/lib/i18n/config.ts'
import { load } from '../test-support/component-harness.mjs'

const detect = value => detectBrowserLocale(value, locales, defaultLocale)
test('browser language matches regional English and Serbian', () => {
 for (const value of ['en', 'en-US,en;q=0.9', 'EN-gb']) assert.equal(detect(value), 'en')
 for (const value of ['sr', 'sr-Latn-RS,en;q=0.8', 'sr-Cyrl']) assert.equal(detect(value), 'sr')
})
test('unsupported primary language defaults to Serbian even with English secondary', () => {
 assert.equal(detect('ru-RU,ru;q=0.9,en;q=0.8'), 'sr')
 assert.equal(detect('de-DE'), 'sr')
})
test('language priorities, malformed values and empty headers', () => {
 assert.equal(detect('sr;q=0.5,en;q=0.9'), 'en')
 assert.equal(detect('en;q=0,sr;q=1'), 'sr')
 for (const value of [null, '', '*', 'en;q=bad', 'en;q=2']) assert.equal(detect(value), 'sr')
})
test('new supported languages and regional tags need no detector changes', () => {
 assert.equal(detectBrowserLocale('de-AT', ['sr', 'en', 'de'], 'sr'), 'de')
 assert.equal(detectBrowserLocale('pt-BR', ['sr', 'pt-PT', 'pt-BR'], 'sr'), 'pt-BR')
 assert.equal(detectBrowserLocale('sr-Latn-RS', ['sr-Cyrl', 'sr-Latn'], 'sr-Cyrl'), 'sr-Latn')
})
test('manual preference wins; invalid preference uses browser language', async () => {
 let saved = 'sr'
 const config=load('frontend/src/lib/i18n/config.ts')
 const server=load('frontend/src/lib/i18n/server.ts',{
  'next/headers':{cookies:async()=>({get:()=>({value:saved})}),headers:async()=>({get:()=> 'en-US'})},
  '@/lib/i18n/config':config,
  '@/lib/i18n/messages':{},
  '@/lib/i18n/translator':{},
 })
 assert.equal(await server.getLocale(),'sr')
 saved='invalid'
 assert.equal(await server.getLocale(),'en')
})
