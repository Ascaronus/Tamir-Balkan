import { sdk } from '@/lib/medusa'
import { timedSignal } from './fetch-timeout'
import { initialCarousel, type Carousel } from '@/lib/banners/shared/banner-model'
export async function homepageBanners():Promise<Carousel>{
 // Зависший бэкенд не должен держать главную открытой: после дедлайна остаётся статический баннер.
 // Баннеры правятся админкой редко — 5 минут серверного кэша Next, локаль не влияет на ответ.
 const t=timedSignal(); try{return await sdk.client.fetch<Carousel>('/store/homepage-banners',{next:{revalidate:300},signal:t.signal})}catch{return initialCarousel}finally{t.done()}
}
