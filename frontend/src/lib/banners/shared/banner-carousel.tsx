'use client'
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import type { BannerLocale, Carousel } from './banner-model'
import './banner-carousel.css'
export function swipeDirection(dx:number,dy:number){return Math.abs(dx)>=45&&Math.abs(dx)>Math.abs(dy)*1.5?(dx<0?1:-1):0}
export function BannerCarousel({carousel,locale,preview=false,previewWidth,resolveLink=(url:string)=>url,assetUrl=(url:string)=>url}:{carousel:Carousel;locale:BannerLocale;preview?:boolean;previewWidth?:number;resolveLink?:(url:string)=>string;assetUrl?:(url:string)=>string}){
 const slides=carousel.banners.filter(b=>b.active), [index,setIndex]=useState(0),[hover,setHover]=useState(false),[focus,setFocus]=useState(false),[hidden,setHidden]=useState(false),[reduced,setReduced]=useState(true),[paused,setPaused]=useState(false)
 const [interaction,setInteraction]=useState(0),[visited,setVisited]=useState<number[]>([0]),start=useRef<{x:number;y:number}|null>(null)
 const current=Math.min(index,Math.max(0,slides.length-1))
 const choose=(i:number)=>{setInteraction(v=>v+1);const next=(i+slides.length)%slides.length;setIndex(next);setVisited(v=>v.includes(next)?v:[...v,next])}
 useEffect(()=>{const media=window.matchMedia('(prefers-reduced-motion: reduce)');const motion=()=>setReduced(media.matches),visibility=()=>setHidden(document.hidden);motion();visibility();media.addEventListener('change',motion);document.addEventListener('visibilitychange',visibility);return()=>{media.removeEventListener('change',motion);document.removeEventListener('visibilitychange',visibility)}},[])
 useEffect(()=>{
  if(!carousel.autoplay||slides.length<2||hover||focus||hidden||reduced||paused)return
  const timer=setTimeout(()=>{const next=(current+1)%slides.length;setIndex(next);setVisited(v=>v.includes(next)?v:[...v,next])},carousel.interval)
  return()=>clearTimeout(timer)
 },[carousel.autoplay,carousel.interval,slides.length,current,hover,focus,hidden,reduced,paused,visited,interaction])
 if(!slides.length)return null
 const sr=locale==='sr'
 return <section className="tb-carousel" aria-label={sr?'Kolekcije':'Collections'} aria-roledescription={sr?'Karusel':'Carousel'}
  onMouseEnter={()=>setHover(true)} onMouseLeave={()=>setHover(false)} onFocus={()=>setFocus(true)} onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget))setFocus(false)}}
  onTouchStart={e=>{if(e.touches.length===1)start.current={x:e.touches[0].clientX,y:e.touches[0].clientY}}} onTouchCancel={()=>{start.current=null}}
  onTouchEnd={e=>{if(!start.current||!e.changedTouches.length)return;const d=swipeDirection(e.changedTouches[0].clientX-start.current.x,e.changedTouches[0].clientY-start.current.y);start.current=null;if(d&&slides.length>1)choose(current+d)}}>
  <div className="tb-slides">{slides.map((b,i)=>{
   const t=b.texts[locale],active=i===current,load=i===0||visited.includes(i)
   return <article key={b.id} className={`tb-banner tb-align-${b.align} tb-tone-${b.tone}${active?' tb-active':''}`} aria-hidden={!active} aria-label={`${i+1} / ${slides.length}`} style={{'--tb-gradient':`${b.gradient}%`} as CSSProperties}>
    <div className="tb-banner-copy"><h2>{t.title}</h2>{t.subtitle&&<p className="tb-subtitle">{t.subtitle}</p>}{t.description&&<p className="tb-description">{t.description}</p>}
     <div className="tb-banner-actions">{(['primary','secondary'] as const).map(kind=>t[`${kind}Label`]&&t[`${kind}Url`]&&<a key={kind} href={preview?undefined:resolveLink(t[`${kind}Url`])} aria-disabled={preview||undefined} onClick={preview?e=>e.preventDefault():undefined}>{t[`${kind}Label`]}</a>)}</div>
    </div>
    <div className="tb-banner-image">{load&&b.desktop&&<picture>{!previewWidth&&b.mobile&&<source media="(max-width: 900px)" srcSet={assetUrl(b.mobile)} />}<img src={assetUrl(previewWidth && previewWidth<=900 && b.mobile ? b.mobile : b.desktop)} alt={t.alt} loading={i===0?'eager':'lazy'} fetchPriority={i===0?'high':'auto'} style={{objectFit:b.fit}} /></picture>}</div>
   </article>
  })}</div>
  {slides.length>1&&<div className="tb-banner-controls"><div className="tb-banner-dots" role="group" aria-label={sr?'Izaberite baner':'Choose a banner'}>{slides.map((b,i)=><button key={b.id} type="button" aria-label={`${sr?'Prikaži baner':'Show banner'} ${i+1}: ${b.texts[locale].title}`} aria-pressed={i===current} onClick={()=>choose(i)}><span /></button>)}</div>
   {carousel.autoplay&&!reduced&&<button type="button" className="tb-pause" onClick={()=>setPaused(v=>!v)} aria-label={paused?(sr?'Nastavi smenjivanje':'Resume rotation'):(sr?'Pauziraj smenjivanje':'Pause rotation')}>{paused?'▶':'Ⅱ'}</button>}
  </div>}
 </section>
}
