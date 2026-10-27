export type WishlistSnapshot = { ids: string[]; pending: string[]; ready: boolean; error: boolean }
export type WishlistApi = { list: () => Promise<string[]>; set: (id: string, saved: boolean) => Promise<void> }
/** One account-scoped store, shared by every heart and the header. */
export class WishlistState {
  private snapshot: WishlistSnapshot = { ids: [], pending: [], ready: false, error: false }
  private listeners = new Set<() => void>()
  private loading: Promise<void> | null = null
  private disposed = false
  constructor(private api: WishlistApi) {}
  getSnapshot = () => this.snapshot
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  private update(patch: Partial<WishlistSnapshot>) {
    if (this.disposed) return
    this.snapshot = { ...this.snapshot, ...patch }
    this.listeners.forEach(listener => listener())
  }
  dispose() { this.disposed = true; this.snapshot = { ids: [], pending: [], ready: false, error: false }; this.listeners.clear() }
  activate() { this.disposed = false }
  load = (): Promise<void> => {
    if (this.loading) return this.loading
    if (this.snapshot.pending.length) return Promise.resolve()
    this.loading = this.api.list().then(ids => this.update({ ids, ready: true, error: false }))
      .catch(() => this.update({ error: true }))
      .finally(() => { this.loading = null })
    return this.loading
  }
  set = async (id: string, saved: boolean) => {
    if (this.loading) await this.loading
    if (this.disposed || !this.snapshot.ready || this.snapshot.pending.includes(id)) return
    this.update({ pending: [...this.snapshot.pending, id], error: false })
    try {
      await this.api.set(id, saved)
      this.update({ ids: saved ? [...new Set([id, ...this.snapshot.ids])] : this.snapshot.ids.filter(value => value !== id) })
    } catch {
      // Keep the last confirmed state. The retry action reloads the account
      // before the customer attempts another change.
      this.update({ error: true })
    } finally {
      this.update({ pending: this.snapshot.pending.filter(value => value !== id) })
    }
  }
}
