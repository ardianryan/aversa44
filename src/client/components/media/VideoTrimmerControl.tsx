import React, { useEffect, useRef, useState } from 'react';
import { ResponsiveSheet } from '../ui/ResponsiveSheet.tsx';
import { clampTrimWindow, MAX_VIDEO_CLIP_SEC } from '../../../shared/media-timeline.ts';
import { type MediaFraming } from '../../../shared/media-framing.ts';

export interface VideoClipState {
  objectUrl: string;
  durationSec: number;
  trimStart: number;
  trimEnd: number;
  mutedOriginal: boolean;
  coverTime?: number;
  width?: number;
  height?: number;
  framing?: MediaFraming;
  posterDataUrl?: string;
}
interface VideoTrimmerControlProps { clip: VideoClipState; onChange: (next: VideoClipState) => void; }
type DragMode = 'start' | 'end' | 'window' | 'scrub';
const formatTime = (sec:number) => `${Math.floor(sec/60).toString().padStart(2,'0')}:${(sec%60).toFixed(1).padStart(4,'0')}`;

export const VideoTrimmerControl: React.FC<VideoTrimmerControlProps> = ({clip,onChange}) => {
  const [open,setOpen]=useState(false), [playing,setPlaying]=useState(false), [time,setTime]=useState(clip.trimStart);
  const [thumbnails,setThumbnails]=useState<string[]>([]);
  const [thumbError,setThumbError]=useState(false);
  const previewRef=useRef<HTMLVideoElement>(null), trackRef=useRef<HTMLDivElement>(null);
  const latest=useRef(clip);latest.current=clip;
  const drag=useRef<{mode:DragMode;x:number;start:number;end:number}|null>(null);
  const duration=Math.max(0.1,clip.durationSec),span=clip.trimEnd-clip.trimStart;
  const seek=(sec:number)=>{const v=previewRef.current;const target=Math.max(0,Math.min(duration-0.01,sec));if(v){v.pause();v.currentTime=target;}setTime(target);};
  const update=(start:number,end:number,side:'start'|'end')=>{
    const range=clampTrimWindow(duration,start,end,side);
    onChange({...latest.current,...range,coverTime:Math.min(range.trimEnd,Math.max(range.trimStart,latest.current.coverTime??range.trimStart))});
    seek(side==='start'?range.trimStart:Math.max(range.trimStart,range.trimEnd-0.05));
  };
  useEffect(()=>{
    if(!open)return;
    let cancelled=false,timer=0;
    let settle:(()=>void)|undefined;
    setThumbnails([]);setThumbError(false);
    const v=document.createElement('video');v.muted=true;v.playsInline=true;v.preload='auto';
    const canvas=document.createElement('canvas');canvas.width=100;canvas.height=64;
    const ctx=canvas.getContext('2d');
    const ready=()=>{void(async()=>{
      for(let i=0;i<10&&!cancelled;i++){
        await new Promise<void>(resolve=>{settle=resolve;v.onseeked=()=>{clearTimeout(timer);resolve();};timer=window.setTimeout(resolve,1800);v.currentTime=Math.min(duration-0.02,0.01+(duration-0.04)*i/9);});
        if(cancelled)break;
        if(ctx&&v.readyState>=2){const s=Math.max(100/v.videoWidth,64/v.videoHeight);ctx.drawImage(v,(100-v.videoWidth*s)/2,(64-v.videoHeight*s)/2,v.videoWidth*s,v.videoHeight*s);const url=canvas.toDataURL('image/jpeg',0.65);setThumbnails(old=>[...old,url]);}else setThumbError(true);
      }
    })();};
    v.addEventListener('loadeddata',ready,{once:true});v.onerror=()=>setThumbError(true);v.src=clip.objectUrl;
    return()=>{cancelled=true;clearTimeout(timer);settle?.();v.removeEventListener('loadeddata',ready);v.onseeked=null;v.onerror=null;v.removeAttribute('src');v.load();};
  },[open,clip.objectUrl,duration]);
  useEffect(()=>{
    if(!playing)return;
    let raf=0;
    const tick=()=>{const v=previewRef.current;if(!v)return;setTime(v.currentTime);if(v.currentTime>=latest.current.trimEnd){v.pause();v.currentTime=latest.current.trimEnd;return;}raf=requestAnimationFrame(tick);};raf=requestAnimationFrame(tick);return()=>cancelAnimationFrame(raf);
  },[playing]);
  const close=()=>{previewRef.current?.pause();setOpen(false);};
  const at=(x:number)=>{const r=trackRef.current!.getBoundingClientRect();return Math.max(0,Math.min(duration,(x-r.left)/r.width*duration));};
  const begin=(e:React.PointerEvent<HTMLElement>,mode:DragMode)=>{e.preventDefault();e.stopPropagation();e.currentTarget.setPointerCapture(e.pointerId);previewRef.current?.pause();drag.current={mode,x:e.clientX,start:clip.trimStart,end:clip.trimEnd};if(mode==='scrub')seek(at(e.clientX));};
  const moving=(e:React.PointerEvent<HTMLElement>)=>{e.stopPropagation();const d=drag.current;if(!d)return;if(d.mode==='start')update(at(e.clientX),d.end,'start');else if(d.mode==='end')update(d.start,at(e.clientX),'end');else if(d.mode==='scrub')seek(at(e.clientX));else{const delta=(e.clientX-d.x)/trackRef.current!.getBoundingClientRect().width*duration;const length=d.end-d.start;const start=Math.max(0,Math.min(duration-length,d.start+delta));onChange({...latest.current,trimStart:start,trimEnd:start+length,coverTime:start});seek(start);}};
  const end=(e:React.PointerEvent<HTMLElement>)=>{e.stopPropagation();drag.current=null;if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);};
  const events={onPointerMove:moving,onPointerUp:end,onPointerCancel:end,onLostPointerCapture:end};
  const key=(e:React.KeyboardEvent,side:'start'|'end')=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const base=side==='start'?clip.trimStart:clip.trimEnd;const val=e.key==='Home'?0:e.key==='End'?duration:base+(e.key==='ArrowRight'?1:-1)*(e.shiftKey?1:0.1);update(side==='start'?val:clip.trimStart,side==='end'?val:clip.trimEnd,side);};
  return <>
    <button type="button" onClick={()=>setOpen(true)} className="flex w-full min-h-[64px] items-center justify-between gap-3 rounded-xl border border-[#F5C538]/40 bg-[#18021B] p-4 text-left"><span><strong className="block text-sm text-[#FDF39D]">Potong video</strong><span className="text-sm text-[#A0D9CA]">{formatTime(clip.trimStart)} - {formatTime(clip.trimEnd)} · {span.toFixed(1)} dtk</span></span><span className="text-sm font-bold text-[#FDF39D]">Edit</span></button>
    <ResponsiveSheet open={open} onClose={close} title="Pilih momen video" subtitle="Seret kedua ujung bingkai emas untuk memotong. Geser bagian tengah untuk memindahkan potongan.">
      <div className="space-y-4">
        <video ref={previewRef} src={clip.objectUrl} muted playsInline preload="auto" className="w-full max-h-[35dvh] rounded-xl bg-[#140117] object-contain" onLoadedData={()=>seek(clip.coverTime??clip.trimStart)} onPlay={()=>setPlaying(true)} onPause={()=>setPlaying(false)} onEnded={()=>setPlaying(false)} onTimeUpdate={e=>setTime(e.currentTarget.currentTime)} />
        <div className="flex flex-wrap items-center justify-between gap-2"><button type="button" onClick={async()=>{const v=previewRef.current;if(!v)return;if(!v.paused){v.pause();return;}v.currentTime=clip.trimStart;try{await v.play();}catch{setPlaying(false);}}} className="min-h-[44px] rounded-lg bg-[#F5C538] px-4 text-sm font-bold text-[#310603]">{playing?'Jeda':'Cek potongan'}</button><output className="text-sm tabular-nums text-[#FFF5D6]">{formatTime(time)} / {formatTime(duration)}</output></div>
        <div ref={trackRef} aria-label="Timeline video" className="relative h-20 w-full touch-none select-none rounded-xl bg-[#140117]" onPointerDown={e=>begin(e,'scrub')} {...events}>
          <div className="absolute inset-0 grid grid-cols-10 overflow-hidden rounded-xl">{Array.from({length:10},(_,i)=><div key={i} className="border-r border-[#F5C538]/20">{thumbnails[i]&&<img src={thumbnails[i]} alt="" draggable={false} className="pointer-events-none h-full w-full object-cover" />}</div>)}</div>
          <div className="pointer-events-none absolute inset-y-0 left-0 bg-[#140117]/75" style={{width:`${clip.trimStart/duration*100}%`}} />
          <div className="pointer-events-none absolute inset-y-0 right-0 bg-[#140117]/75" style={{width:`${(1-clip.trimEnd/duration)*100}%`}} />
          <div className="absolute inset-y-0 border-y-4 border-[#F5C538]" style={{left:`${clip.trimStart/duration*100}%`,width:`${span/duration*100}%`}} onPointerDown={e=>begin(e,'window')} {...events} />
          {(['start','end'] as const).map(side=><button key={side} type="button" role="slider" aria-label={side==='start'?'Awal potongan':'Akhir potongan'} aria-valuemin={0} aria-valuemax={duration} aria-valuenow={side==='start'?clip.trimStart:clip.trimEnd} aria-valuetext={formatTime(side==='start'?clip.trimStart:clip.trimEnd)} onKeyDown={e=>key(e,side)} onPointerDown={e=>begin(e,side)} {...events} className="absolute top-0 z-20 h-20 w-11 cursor-ew-resize touch-none rounded-lg border-2 border-[#F5C538] bg-[#310603]/90 text-xl font-bold text-[#FDF39D] focus-visible:outline-2 focus-visible:outline-[#FDF39D]" style={{left:`clamp(0px, calc(${(side==='start'?clip.trimStart:clip.trimEnd)/duration*100}% - 22px), calc(100% - 44px))`}}>{side==='start'?'‹':'›'}</button>)}
          <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 z-30 w-0.5 bg-[#FFF5D6]" style={{left:`${time/duration*100}%`}} />
        </div>
        <div className="grid grid-cols-2 gap-3">{(['start','end'] as const).map(side=><label key={side} className="text-sm text-[#FDF39D]">{side==='start'?'Mulai (detik)':'Selesai (detik)'}<input type="number" min={0} max={duration} step={0.1} value={Number((side==='start'?clip.trimStart:clip.trimEnd).toFixed(1))} onChange={e=>{const value=e.currentTarget.valueAsNumber;if(Number.isFinite(value))update(side==='start'?value:clip.trimStart,side==='end'?value:clip.trimEnd,side);}} className="mt-1 min-h-[44px] w-full rounded-lg border border-[#F5C538]/40 bg-[#140117] px-3 text-[#FFF5D6]" /></label>)}</div>
        <div className="flex justify-between text-sm text-[#A0D9CA]"><span>{formatTime(clip.trimStart)} - {formatTime(clip.trimEnd)}</span><strong>{span.toFixed(1)} dtk dipilih</strong></div>
        {thumbError&&<p className="text-sm text-[#F5B8CB]">Sebagian thumbnail belum dapat dibaca. Video dan pemilihan rentang tetap dapat digunakan.</p>}
        <label className="block text-sm text-[#FFF5D6]">Lihat posisi video<input type="range" min={0} max={duration} step={0.1} value={time} onChange={e=>seek(Number(e.target.value))} className="block min-h-[44px] w-full accent-[#F5C538]" /></label>
        <button type="button" onClick={()=>onChange({...clip,coverTime:Math.min(clip.trimEnd,Math.max(clip.trimStart,time))})} className="min-h-[44px] rounded-lg border border-[#F5C538]/40 px-4 text-sm font-bold text-[#FDF39D]">Jadikan sampul ({formatTime(Math.min(clip.trimEnd,Math.max(clip.trimStart,time)))})</button>
        <p className="text-sm text-[#FFF5D6]">Rentang video bebas hingga {Math.round(MAX_VIDEO_CLIP_SEC / 60)} menit. Audio asli video dapat diaktifkan atau dibisukan sesuai kebutuhan. Sampul dipakai untuk poster PNG; video dimulai dari awal potongan.</p>
        <button type="button" onClick={close} className="min-h-[44px] w-full rounded-xl bg-[#F5C538] px-4 font-bold text-[#310603]">Selesai</button>
      </div>
    </ResponsiveSheet>
  </>;
};
