import { defineRouteConfig } from '@medusajs/admin-sdk'
import { ArrowDownMini, ArrowUpMini, ArrowUpTray, EllipsisHorizontal, Eye, EyeSlash, Photo, Plus, Trash } from '@medusajs/icons'
import { Alert, Badge, Button, Container, Drawer, DropdownMenu, FocusModal, Heading, IconButton, Input, Label, Select, StatusBadge, Switch, Table, Tabs, Text, Textarea, usePrompt } from '@medusajs/ui'
import { useEffect, useRef, useState } from 'react'
import { BannerCarousel } from '../../../shared/banner-carousel'
import { DevicePreview } from './device-preview'
import { emptyText, intervals, moveBanner, type Banner, type BannerLocale, type BannerText, type Carousel } from '../../../shared/banner-model'
import './banners.css'

type State = { draft: Carousel; published: Carousel; previous: Carousel | null; revision: number }
type Action = 'saveDraft' | 'publishSettings' | 'publishAll' | 'publish' | 'deactivate' | 'delete' | 'restore'
async function request<T>(body?: unknown, path = '/admin/homepage-banners'): Promise<T> {
 const res = await fetch(path, { method: body ? 'POST' : 'GET', credentials: 'include', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) })
 const json = await res.json()
 if (!res.ok) throw Error(json.message || 'Request failed')
 return json
}
const asset = (url: string) => url.startsWith('/design/') ? `https://tamir.rs${url}` : url
// Publication stamps do not represent a content change.
export function sameBannerContent(a: Banner, b: Banner) {
 return JSON.stringify({ ...a, updatedAt: '' }) === JSON.stringify({ ...b, updatedAt: '' })
}
const confirmations: Record<Exclude<Action, 'saveDraft'>, { title: string; description: string; confirmText: string }> = {
 publish: { title: 'Publish this banner?', description: 'Save all pending edits as drafts, then make only this banner live on the storefront.', confirmText: 'Publish banner' },
 publishAll: { title: 'Publish the entire carousel?', description: 'All banners, their order and carousel settings will be updated on the live storefront.', confirmText: 'Publish carousel' },
 publishSettings: { title: 'Publish settings and order?', description: 'Apply autoplay and the order of already published banners. Banner images and text will stay as published.', confirmText: 'Publish settings' },
 deactivate: { title: 'Hide this banner?', description: 'Remove this banner from the live storefront. Keep its draft so you can edit and publish it again.', confirmText: 'Hide banner' },
 delete: { title: 'Delete this banner?', description: 'Remove this banner from both drafts and the live storefront. Uploaded image files are retained.', confirmText: 'Delete banner' },
 restore: { title: 'Restore the previous publication?', description: 'Replace the live carousel with its previous published version. Your current drafts will be kept.', confirmText: 'Restore publication' },
}

export default function HomepageBanners() {
 const [state, setState] = useState<State | null>(null), [draft, setDraft] = useState<Carousel | null>(null)
 const [selected, setSelected] = useState<string | null>(null), [editorOpen, setEditorOpen] = useState(false)
 const [pendingAction, setPendingAction] = useState<Action | 'upload' | null>(null)
 const [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('')
 const [preview, setPreview] = useState<'all' | 'single' | null>(null), [width, setWidth] = useState(1200), [locale, setLocale] = useState<BannerLocale>('sr')
 const [editLocale, setEditLocale] = useState<BannerLocale>('sr')
 const drag = useRef<number | null>(null), lock = useRef(false), editorTrigger = useRef<HTMLElement | null>(null), previewTrigger = useRef<HTMLElement | null>(null)
 const rowTriggers = useRef<Record<string, HTMLButtonElement | null>>({})
 const prompt = usePrompt()
 useEffect(() => { request<State>().then(s => { setState(s); setDraft(s.draft) }).catch(e => setError(e.message)) }, [])
 const dirty = Boolean(state && draft && JSON.stringify(draft) !== JSON.stringify(state.draft))
 useEffect(() => {
  if (!dirty) return
  const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
  window.addEventListener('beforeunload', warn)
  return () => window.removeEventListener('beforeunload', warn)
 }, [dirty])
 const banner = draft?.banners.find(b => b.id === selected)
 const patch = (values: Partial<Banner>) => setDraft(c => c ? { ...c, banners: c.banners.map(b => b.id === selected ? { ...b, ...values } : b) } : c)
 const edit = (id: string, trigger?: HTMLElement) => { editorTrigger.current = trigger || null; setSelected(id); setEditLocale('sr'); setEditorOpen(true) }
 const showPreview = (mode: 'all' | 'single', trigger?: HTMLElement, id?: string) => {
  previewTrigger.current = trigger || null
  if (id) setSelected(id)
  setPreview(mode)
 }
 const act = async (action: Action, id?: string) => {
  if (!state || !draft || lock.current) return
  lock.current = true; setBusy(true)
  try {
   if (action !== 'saveDraft' && !await prompt({ ...confirmations[action], variant: action === 'delete' ? 'danger' : 'confirmation', cancelText: 'Cancel' })) return
   setError(''); setMessage(''); setPendingAction(action)
   let saved = state
   if (dirty || action === 'saveDraft') saved = await request<State>({ action: 'saveDraft', draft, revision: saved.revision })
   // Keep revision current even when subsequent publication validation fails.
   setState(saved); setDraft(saved.draft)
   if (action !== 'saveDraft') saved = await request<State>({ action, id, revision: saved.revision })
   setState(saved); setDraft(saved.draft)
   if (action === 'delete' && id === selected) { setEditorOpen(false); setSelected(null) }
   setMessage(action === 'saveDraft' ? 'Draft saved. The live storefront is unchanged.' : action === 'delete' ? 'Banner deleted.' : action === 'deactivate' ? 'Banner hidden from the storefront.' : 'Live storefront updated.')
  } catch (e) { setError((e as Error).message) }
  finally { lock.current = false; setBusy(false); setPendingAction(null) }
 }
 const upload = async (file: File | undefined, kind: 'desktop' | 'mobile') => {
  if (!file || !banner || lock.current) return
  lock.current = true; setBusy(true); setError(''); setMessage(''); setPendingAction('upload')
  const target = banner.id
  try {
   const data = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.onerror = () => reject(Error('Could not read file')); reader.readAsDataURL(file) })
   const media = await request<{ url: string }>({ mime: file.type, data }, '/admin/homepage-banners/media')
   setDraft(c => c ? { ...c, banners: c.banners.map(b => b.id === target ? { ...b, [kind]: media.url } : b) } : c)
  } catch (e) { setError((e as Error).message) }
  finally { lock.current = false; setBusy(false); setPendingAction(null) }
 }
 const reload = async () => {
  if (!dirty || await prompt({ title: 'Discard unsaved edits?', description: 'Reload the last saved drafts. Edits that have not been saved will be lost.', confirmText: 'Discard and reload', cancelText: 'Keep editing', variant: 'danger' })) window.location.reload()
 }
 if (!draft || !state) return <Container><Heading>Homepage Banners</Heading>{error ? <div className="mt-4 space-y-3"><Alert variant="error">{error}</Alert><Button variant="secondary" onClick={() => void reload()}>Reload</Button></div> : <Text role="status" className="mt-2 text-ui-fg-subtle">Loading banners…</Text>}</Container>
 const addBanner = (trigger?: HTMLElement) => {
  if (busy) return
  const id = 'banner_' + crypto.randomUUID()
  setDraft({ ...draft, banners: [...draft.banners, { id, name: 'New banner', active: true, desktop: '', mobile: '', align: 'left', tone: 'dark', gradient: 34, fit: 'cover', texts: { sr: emptyText(), en: emptyText() }, updatedAt: '' }] })
  edit(id, trigger)
 }
 const notices = <>{error && <Alert variant="error" role="alert"><div className="space-y-2"><Text>{error}</Text><Button variant="secondary" size="small" disabled={busy} onClick={() => void reload()}>Reload saved drafts</Button></div></Alert>}{message && <Alert variant="success" role="status">{message}</Alert>}</>
 return <main className="banner-admin space-y-4">
  <Container className="p-0">
   <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-4">
    <div><Heading>Homepage Banners</Heading><Text size="small" className="text-ui-fg-subtle">Manage the banners shown on your store’s homepage.</Text></div>
    <div className="flex flex-wrap items-center gap-2">
     <Button size="small" variant="secondary" disabled={busy || !draft.banners.length} onClick={e => showPreview('all', e.currentTarget)}><Eye />Preview Carousel</Button>
     <Button size="small" disabled={busy} onClick={e => addBanner(e.currentTarget)}><Plus />Add banner</Button>
    </div>
   </div>
   <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ui-border-base px-6 py-4">
    <div className="flex flex-wrap items-center gap-2"><Badge color={dirty ? 'orange' : 'grey'} size="2xsmall">{dirty ? 'Unsaved changes' : 'Draft saved'}</Badge><Text size="small" className="text-ui-fg-subtle">Save your edits, preview, then publish to make them live.</Text></div>
    <div className="flex flex-wrap items-center gap-2">
     <Button size="small" variant="secondary" disabled={busy || !dirty} isLoading={pendingAction === 'saveDraft'} onClick={() => void act('saveDraft')}>Save Draft</Button>
     <Button size="small" disabled={busy} isLoading={pendingAction === 'publishAll'} onClick={() => void act('publishAll')}>Publish carousel</Button>
     <DropdownMenu><DropdownMenu.Trigger asChild><IconButton size="small" variant="transparent" disabled={busy} aria-label="More carousel actions"><EllipsisHorizontal /></IconButton></DropdownMenu.Trigger>
      <DropdownMenu.Content align="end">
       <DropdownMenu.Item disabled={busy} onSelect={() => void act('publishSettings')}>Publish settings &amp; order only</DropdownMenu.Item>
       <DropdownMenu.Separator />
       <DropdownMenu.Item disabled={busy || !state.previous} onSelect={() => void act('restore')}>Restore previous publication</DropdownMenu.Item>
      </DropdownMenu.Content>
     </DropdownMenu>
    </div>
   </div>
  </Container>
  {!editorOpen && notices}
  <Container className="p-0">
   <div className="border-b border-ui-border-base px-6 py-4"><Heading level="h2">Carousel settings</Heading></div>
   <div className="flex flex-wrap items-center justify-between gap-6 px-6 py-4">
    <div className="flex items-center gap-3"><Switch id="banner-autoplay" checked={draft.autoplay} disabled={busy} onCheckedChange={autoplay => setDraft({ ...draft, autoplay })} /><div><Label htmlFor="banner-autoplay">Automatic slideshow</Label><Text size="small" className="text-ui-fg-subtle">{draft.autoplay ? 'Rotate banners automatically. Visitors can still browse manually.' : 'Off — visitors switch banners manually.'}</Text></div></div>
    <div className="w-full space-y-2 sm:w-48"><Label htmlFor="banner-interval">Time between slides</Label><Select value={String(draft.interval)} disabled={busy || !draft.autoplay} onValueChange={value => setDraft({ ...draft, interval: Number(value) })}><Select.Trigger id="banner-interval"><Select.Value /></Select.Trigger><Select.Content>{intervals.map(i => <Select.Item key={i} value={String(i)}>{i / 1000} seconds</Select.Item>)}</Select.Content></Select></div>
   </div>
  </Container>
  <Container className="p-0">
   <div className="flex flex-wrap items-center justify-between gap-2 px-6 py-4"><div className="flex items-center gap-2"><Heading level="h2">Banners</Heading><Badge size="2xsmall">{draft.banners.length}</Badge></div><Text size="small" className="text-ui-fg-subtle">Drag rows or use the arrows to change the order.</Text></div>
   {!draft.banners.length ? <div className="flex flex-col items-center gap-3 border-t border-ui-border-base px-6 py-12 text-center"><Photo className="text-ui-fg-muted" /><Heading level="h3">Create your first banner</Heading><Text size="small" className="text-ui-fg-subtle">Add an image and text in Serbian and English, then preview your banner.</Text><Button size="small" onClick={e => addBanner(e.currentTarget)}><Plus />Add banner</Button></div> : <div className="overflow-x-auto">
    <Table className="min-w-[680px]"><Table.Header><Table.Row><Table.HeaderCell className="w-28 pl-6">Order</Table.HeaderCell><Table.HeaderCell>Banner</Table.HeaderCell><Table.HeaderCell>Status</Table.HeaderCell><Table.HeaderCell className="pr-6 text-right">Actions</Table.HeaderCell></Table.Row></Table.Header>
     <Table.Body>{draft.banners.map((b, i) => {
      const pub = state.published.banners.find(p => p.id === b.id), changed = Boolean(pub && !sameBannerContent(pub, b))
      const status = pub?.active ? changed ? 'Unpublished changes' : 'Published' : pub ? 'Inactive' : 'Draft'
      return <Table.Row key={b.id} draggable={!busy} onDragStart={e => { drag.current = i; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', b.id) }} onDragEnd={() => { drag.current = null }} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); if (!busy && drag.current !== null) setDraft(moveBanner(draft, drag.current, i)); drag.current = null }}>
       <Table.Cell className="pl-6"><div className="flex items-center gap-1"><Text size="small" className="mr-1 tabular-nums text-ui-fg-subtle">{i + 1}</Text><IconButton size="small" variant="transparent" disabled={busy || i === 0} aria-label={`Move ${b.name} up`} onClick={() => setDraft(moveBanner(draft, i, i - 1))}><ArrowUpMini /></IconButton><IconButton size="small" variant="transparent" disabled={busy || i === draft.banners.length - 1} aria-label={`Move ${b.name} down`} onClick={() => setDraft(moveBanner(draft, i, i + 1))}><ArrowDownMini /></IconButton></div></Table.Cell>
       <Table.Cell><div className="flex min-w-0 items-center gap-3 py-2">{b.desktop ? <img draggable={false} className="h-12 w-20 shrink-0 rounded-md border border-ui-border-base object-cover" src={asset(b.desktop)} alt="" /> : <div className="flex h-12 w-20 shrink-0 items-center justify-center rounded-md border border-ui-border-base bg-ui-bg-subtle text-ui-fg-muted"><Photo /></div>}<div className="min-w-0"><Button type="button" size="small" variant="transparent" className="banner-name h-auto justify-start whitespace-normal p-0 text-left" disabled={busy} onClick={e => edit(b.id, e.currentTarget)}>{b.name || 'Untitled banner'}</Button><Text size="xsmall" className="text-ui-fg-subtle">{b.updatedAt ? `Saved ${new Date(b.updatedAt).toLocaleString()}` : 'Not saved yet'}</Text></div></div></Table.Cell>
       <Table.Cell><div className="space-y-1"><StatusBadge color={pub?.active ? changed ? 'orange' : 'green' : 'grey'}>{status}</StatusBadge>{!b.active && <Text size="xsmall" className="text-ui-fg-subtle">Excluded from next publication</Text>}</div></Table.Cell>
       <Table.Cell className="pr-6"><div className="flex items-center justify-end gap-2"><Button size="small" variant="secondary" disabled={busy} onClick={e => edit(b.id, e.currentTarget)}>Edit</Button><DropdownMenu><DropdownMenu.Trigger asChild><IconButton size="small" variant="transparent" disabled={busy} ref={node => { rowTriggers.current[b.id] = node }} aria-label={`Actions for ${b.name || 'untitled banner'}`}><EllipsisHorizontal /></IconButton></DropdownMenu.Trigger><DropdownMenu.Content align="end">
        <DropdownMenu.Item onSelect={() => showPreview('single', rowTriggers.current[b.id] || undefined, b.id)}><Eye />Preview banner</DropdownMenu.Item>
        <DropdownMenu.Item disabled={busy} onSelect={() => void act('publish', b.id)}><ArrowUpTray />Publish banner</DropdownMenu.Item>
        <DropdownMenu.Item disabled={busy || !pub?.active} onSelect={() => void act('deactivate', b.id)}><EyeSlash />Hide from storefront</DropdownMenu.Item>
        <DropdownMenu.Separator /><DropdownMenu.Item className="text-ui-fg-error" disabled={busy} onSelect={() => void act('delete', b.id)}><Trash />Delete banner</DropdownMenu.Item>
       </DropdownMenu.Content></DropdownMenu></div></Table.Cell>
      </Table.Row>
     })}</Table.Body>
    </Table>
   </div>}
  </Container>
  <Drawer open={editorOpen && Boolean(banner)} onOpenChange={open => { if (!busy) setEditorOpen(open) }}>
   <Drawer.Content className="banner-editor sm:max-w-[720px]" onCloseAutoFocus={e => { if (editorTrigger.current?.isConnected) { e.preventDefault(); editorTrigger.current.focus() } }}>
    <Drawer.Header><Drawer.Title className="text-ui-fg-base font-medium">Edit banner</Drawer.Title><Drawer.Description className="text-ui-fg-subtle">Changes stay in your draft until you publish. Closing this panel keeps your edits.</Drawer.Description></Drawer.Header>
    {banner && <>
     <Drawer.Body className="min-h-0 overflow-y-auto">
      <div className="space-y-4">{notices}{pendingAction === 'upload' && <Text role="status" className="text-ui-fg-subtle">Uploading image…</Text>}</div>
      <fieldset disabled={busy} className="min-w-0 space-y-6 border-0 p-0" aria-busy={busy}>
       <section className="space-y-4">
        <div className="space-y-2"><Label htmlFor="banner-name">Internal name</Label><Input id="banner-name" value={banner.name} maxLength={120} onChange={e => patch({ name: e.target.value })} /><Text size="small" className="text-ui-fg-subtle">Only visible in the admin. Use a name you can recognise in the list.</Text></div>
        <div className="flex items-start gap-3 rounded-lg border border-ui-border-base p-4"><Switch id="banner-active" checked={banner.active} disabled={busy} onCheckedChange={active => patch({ active })} /><div><Label htmlFor="banner-active">Include in carousel</Label><Text size="small" className="text-ui-fg-subtle">This takes effect when you publish, not immediately.</Text></div></div>
       </section>
       <section className="space-y-4 border-t border-ui-border-base pt-6">
        <div><Heading level="h2">Images</Heading><Text size="small" className="text-ui-fg-subtle">PNG, JPEG, WebP or AVIF. The desktop image is also used on mobile unless you upload a mobile image.</Text></div>
        <div className="grid gap-4 sm:grid-cols-2">{(['desktop', 'mobile'] as const).map(kind => <div key={kind} className="space-y-3 rounded-lg border border-ui-border-base p-4">
         <Label htmlFor={`banner-image-${kind}`}>{kind === 'desktop' ? 'Desktop image (required)' : 'Mobile image (optional)'}</Label>
         <div className="flex h-32 items-center justify-center overflow-hidden rounded-md bg-ui-bg-subtle">{banner[kind] ? <img className="h-full w-full object-contain" src={asset(banner[kind])} alt={`${kind} banner preview`} /> : <div className="flex flex-col items-center gap-2 text-ui-fg-muted"><Photo /><Text size="small">No image uploaded</Text></div>}</div>
         <input className="sr-only" id={`banner-image-${kind}`} type="file" accept="image/png,image/jpeg,image/webp,image/avif" disabled={busy} onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; void upload(file, kind) }} />
         <div className="flex flex-wrap items-center gap-2"><Button size="small" variant="secondary" disabled={busy} type="button" onClick={() => document.getElementById(`banner-image-${kind}`)?.click()}><ArrowUpTray />{banner[kind] ? 'Replace image' : 'Upload image'}</Button>{banner[kind] && <IconButton size="small" variant="transparent" disabled={busy} aria-label={`Remove ${kind} image`} onClick={() => patch({ [kind]: '' })}><Trash /></IconButton>}</div>
        </div>)}</div>
       </section>
       <section className="space-y-4 border-t border-ui-border-base pt-6">
        <div><Heading level="h2">Text and links</Heading><Text size="small" className="text-ui-fg-subtle">Add a title and image description in both languages before publishing.</Text></div>
        <Tabs value={editLocale} onValueChange={value => setEditLocale(value as BannerLocale)}><Tabs.List><Tabs.Trigger value="sr">Serbian (SR)</Tabs.Trigger><Tabs.Trigger value="en">English (EN)</Tabs.Trigger></Tabs.List>
         {(['sr', 'en'] as const).map(lang => <Tabs.Content key={lang} value={lang} className="mt-4 space-y-4">
          {(['title', 'subtitle', 'description', 'alt'] as const).map(key => {
           const id = `banner-${lang}-${key}`
           const props = { id, value: banner.texts[lang][key], maxLength: key === 'description' ? 1000 : 250, onChange: (e: { target: { value: string } }) => patch({ texts: { ...banner.texts, [lang]: { ...banner.texts[lang], [key]: e.target.value } } }) }
           return <div key={key} className="space-y-2"><Label htmlFor={id}>{({ title: 'Title (required)', subtitle: 'Subtitle', description: 'Description', alt: 'Image description / alt text (required)' })[key]}</Label>{key === 'description' ? <Textarea {...props} rows={3} /> : <Input {...props} />}{key === 'alt' && <Text size="small" className="text-ui-fg-subtle">Describe the image for people using screen readers.</Text>}</div>
          })}
          {(['primary', 'secondary'] as const).map(kind => <div key={kind} className="space-y-3 rounded-lg border border-ui-border-base p-4"><Heading level="h3">{kind === 'primary' ? 'Primary button' : 'Secondary button (optional)'}</Heading><div className="grid gap-3 sm:grid-cols-2">{(['Label', 'Url'] as const).map(suffix => {
           const key = `${kind}${suffix}` as keyof BannerText, id = `banner-${lang}-${key}`
           return <div key={key} className="space-y-2"><Label htmlFor={id}>{suffix === 'Label' ? 'Button text' : 'Link destination'}</Label><Input id={id} value={banner.texts[lang][key]} maxLength={suffix === 'Url' ? 2000 : 250} placeholder={suffix === 'Url' ? '/products or https://…' : 'Explore the collection'} onChange={e => patch({ texts: { ...banner.texts, [lang]: { ...banner.texts[lang], [key]: e.target.value } } })} /></div>
          })}</div><Text size="small" className="text-ui-fg-subtle">Fill in both fields to show this button. Use a store path, an anchor such as #catalog-products, or an HTTPS link.</Text></div>)}
         </Tabs.Content>)}
        </Tabs>
       </section>
       <section className="space-y-4 border-t border-ui-border-base pt-6">
        <Heading level="h2">Appearance</Heading>
        <div className="grid gap-4 sm:grid-cols-2">
         <div className="space-y-2"><Label htmlFor="banner-align">Text position</Label><Select value={banner.align} disabled={busy} onValueChange={value => patch({ align: value as Banner['align'] })}><Select.Trigger id="banner-align"><Select.Value /></Select.Trigger><Select.Content><Select.Item value="left">Left</Select.Item><Select.Item value="center">Centre</Select.Item><Select.Item value="right">Right</Select.Item></Select.Content></Select></div>
         <div className="space-y-2"><Label htmlFor="banner-tone">Text colour</Label><Select value={banner.tone} disabled={busy} onValueChange={value => patch({ tone: value as Banner['tone'] })}><Select.Trigger id="banner-tone"><Select.Value /></Select.Trigger><Select.Content><Select.Item value="dark">Dark text</Select.Item><Select.Item value="light">Light text</Select.Item></Select.Content></Select></div>
         <div className="space-y-2"><Label htmlFor="banner-fit">Desktop image fit</Label><Select value={banner.fit} disabled={busy} onValueChange={value => patch({ fit: value as Banner['fit'] })}><Select.Trigger id="banner-fit"><Select.Value /></Select.Trigger><Select.Content><Select.Item value="contain">Show entire image</Select.Item><Select.Item value="cover">Fill area (may crop)</Select.Item></Select.Content></Select></div>
         <div className="space-y-2"><Label htmlFor="banner-gradient">Background fade (%)</Label><Input id="banner-gradient" type="number" min={0} max={100} value={banner.gradient} onChange={e => patch({ gradient: Number(e.target.value) })} /><Text size="small" className="text-ui-fg-subtle">Adjust the fade behind the text. Check readability in preview.</Text></div>
        </div>
       </section>
      </fieldset>
     </Drawer.Body>
     <Drawer.Footer className="flex-wrap gap-y-2">
      <Text size="xsmall" className="w-full text-ui-fg-subtle">Save Draft saves all pending edits. Publish banner makes only this banner live.</Text>
      <Button size="small" variant="secondary" disabled={busy} onClick={e => showPreview('single', e.currentTarget)}>Preview</Button>
      <Button size="small" variant="secondary" disabled={busy || !dirty} isLoading={pendingAction === 'saveDraft'} onClick={() => void act('saveDraft')}>Save Draft</Button>
      <Button size="small" disabled={busy} isLoading={pendingAction === 'publish'} onClick={() => void act('publish', banner.id)}>Publish banner</Button>
     </Drawer.Footer>
    </>}
   </Drawer.Content>
  </Drawer>
  <FocusModal open={Boolean(preview)} onOpenChange={open => { if (!open) setPreview(null) }}>
   <FocusModal.Content onCloseAutoFocus={e => { if (previewTrigger.current?.isConnected) { e.preventDefault(); previewTrigger.current.focus() } }}>
    <FocusModal.Header><FocusModal.Title className="font-medium">{preview === 'all' ? 'Preview Carousel' : 'Banner Preview'}</FocusModal.Title><Badge size="2xsmall">Draft preview</Badge></FocusModal.Header>
    <FocusModal.Body className="min-h-0 overflow-auto">
     <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ui-border-base px-6 py-3">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Preview device">{([[1200, 'Desktop'], [768, 'Tablet'], [390, 'Mobile']] as const).map(([size, label]) => <Button size="small" variant={width === size ? 'primary' : 'secondary'} key={size} aria-pressed={width === size} onClick={() => setWidth(size)}>{label}</Button>)}</div>
      <div className="flex gap-2" role="group" aria-label="Preview language">{(['sr', 'en'] as const).map(l => <Button size="small" variant={locale === l ? 'primary' : 'secondary'} key={l} aria-pressed={locale === l} onClick={() => setLocale(l)}>{l.toUpperCase()}</Button>)}</div>
     </div>
     <div className="banner-preview-scroll bg-ui-bg-subtle p-4"><DevicePreview width={width}>
      {preview && <BannerCarousel key={`${width}:${locale}:${preview}:${selected}`} carousel={{ ...draft, banners: preview === 'single' && banner ? [{ ...banner, active: true }] : draft.banners }} locale={locale} preview previewWidth={width} assetUrl={asset} />}
      {preview === 'all' && !draft.banners.some(b => b.active) && <Text className="p-6 text-center">No banners are included. Enable “Include in carousel” in a banner’s editor to preview it here.</Text>}
     </DevicePreview></div>
    </FocusModal.Body>
    <FocusModal.Footer><FocusModal.Description className="mr-auto text-sm text-ui-fg-subtle">Includes unsaved edits. Links are disabled. Nothing is published from this preview.</FocusModal.Description><FocusModal.Close asChild><Button size="small" variant="secondary">Close preview</Button></FocusModal.Close></FocusModal.Footer>
   </FocusModal.Content>
  </FocusModal>
 </main>
}
export const config = defineRouteConfig({ label: 'Homepage Banners', icon: Photo })
