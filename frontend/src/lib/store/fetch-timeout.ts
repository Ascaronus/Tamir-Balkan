/**
 * M8 (аудит 23.10): у каждого обращения витрины к Medusa должен быть дедлайн.
 * Без него зависший backend держит RSC-рендер открытым (pages/404.tsx и
 * лимиты pm2 этого не спасают), а в браузере такой запрос висит до обрыва
 * соединения.
 *
 * Реализация намеренно переносимая: эти же fetcher'ы работают и на сервере, и
 * в браузере через прокси `/api/medusa/*` (CatalogClient, WishlistPage,
 * ShopSidebar, RelatedProducts, cart-client). `AbortSignal.timeout` и
 * `AbortSignal.any` там есть не во всех поддерживаемых Safari/Firefox, поэтому
 * обычный AbortController + setTimeout + ручной перенос внешнего сигнала.
 *
 * Обязателен `done()` в finally: иначе на каждый запрос остаётся живой таймер
 * и слушатель на внешнем AbortSignal.
 */

/** Разумный потолок для store-запросов: healthcheck бэкенда отвечает быстрее. */
export const STORE_FETCH_TIMEOUT_MS = 8000

export type TimedSignal = {
  signal: AbortSignal
  /** Снять таймер и слушатель внешнего сигнала. */
  done: () => void
}

export function timedSignal(
  external?: AbortSignal,
  timeoutMs: number = STORE_FETCH_TIMEOUT_MS
): TimedSignal {
  const controller = new AbortController()
  const timer = setTimeout(() => {
    controller.abort(new DOMException("store fetch timed out", "TimeoutError"))
  }, timeoutMs)

  const relay = () => controller.abort(external?.reason)
  if (external) {
    if (external.aborted) controller.abort(external.reason)
    else external.addEventListener("abort", relay, { once: true })
  }

  return {
    signal: controller.signal,
    done: () => {
      clearTimeout(timer)
      external?.removeEventListener("abort", relay)
    },
  }
}
