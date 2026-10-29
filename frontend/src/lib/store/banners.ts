import { sdk } from '@/lib/medusa'
import { initialCarousel, type Carousel } from '@/lib/banners/shared/banner-model'
export async function homepageBanners():Promise<Carousel>{
 try{return await sdk.client.fetch<Carousel>('/store/homepage-banners',{cache:'no-store'})}catch{return initialCarousel}
}
