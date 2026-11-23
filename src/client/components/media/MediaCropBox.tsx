import React, { useEffect, useRef, useState } from 'react';
import { ResponsiveSheet } from '../ui/ResponsiveSheet.tsx';
import { MAX_MEDIA_ZOOM, MIN_MEDIA_ZOOM, applyPanDelta, applyZoomLevel, clampMediaFraming, type MediaFraming } from '../../../shared/media-framing.ts';

interface MediaCropBoxProps {
  src: string; srcWidth: number; srcHeight: number; frameWidth: number; frameHeight: number;
  framing: MediaFraming; onChange: (next: MediaFraming) => void; onRemove?: () => void; label?: string;
}

export const MediaCropBox: React.FC<MediaCropBoxProps> = ({ src, srcWidth, srcHeight, frameWidth, frameHeight, framing, onChange, onRemove, label = 'Atur foto' }) => {
  const [open, setOpen] = useState(false);
  const [interacting, setInteracting] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const current = useRef(framing);
  current.current = clampMediaFraming(framing, srcWidth, srcHeight, frameWidth, frameHeight);
  const changeRef = useRef(onChange); changeRef.current = onChange;
  const commit = (next: MediaFraming) => { current.current = next; changeRef.current(next); };
  const zoom = (value: number) => commit(applyZoomLevel(current.current, value, srcWidth, srcHeight, frameWidth, frameHeight));
  const move = (dx: number, dy: number) => {
    const rect = boxRef.current?.getBoundingClientRect();
    if (rect) commit(applyPanDelta(current.current, dx, dy, rect.width, rect.height, srcWidth, srcHeight, frameWidth, frameHeight));
  };
  useEffect(() => {
    if (!open) return;
    // The sheet mounts after its open state changes.
    let frame = requestAnimationFrame(() => { frame = requestAnimationFrame(attach); });
    let element: HTMLDivElement | null = null;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      const next = applyZoomLevel(current.current, current.current.zoom - event.deltaY * (event.ctrlKey ? 0.012 : 0.002), srcWidth, srcHeight, frameWidth, frameHeight);
      current.current = next; changeRef.current(next);
    };
    function attach() { element = boxRef.current; element?.addEventListener('wheel', wheel, { passive: false }); }
    return () => { cancelAnimationFrame(frame); element?.removeEventListener('wheel', wheel); pointers.current.clear(); };
  }, [open, srcWidth, srcHeight, frameWidth, frameHeight]);
  const metric = () => {
    const values = [...pointers.current.values()];
    if (values.length < 2) return null;
    const [a, b] = values as [{x:number;y:number},{x:number;y:number}];
    return { distance: Math.max(1, Math.hypot(a.x-b.x,a.y-b.y)), x:(a.x+b.x)/2, y:(a.y+b.y)/2 };
  };
  const end = (e: React.PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(e.pointerId);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    setInteracting(pointers.current.size > 0);
  };
  const f = current.current;
  const scale = Math.max(frameWidth / srcWidth, frameHeight / srcHeight) * f.zoom;
  const width = srcWidth * scale / frameWidth * 100, height = srcHeight * scale / frameHeight * 100;
  const photo = <img src={src} alt={label} draggable={false} className="pointer-events-none absolute max-w-none select-none" style={{width:`${width}%`,height:`${height}%`,left:`${(100-width)/2+f.panX*100}%`,top:`${(100-height)/2+f.panY*100}%`}} />;
  const button = 'min-h-[44px] min-w-[44px] rounded-lg border border-[#F5C538]/40 px-3 text-sm font-bold text-[#FDF39D] disabled:opacity-40';
  return <>
    <div className="rounded-xl border border-[#F5C538]/30 bg-[#18021B] p-3 space-y-3">
      <button type="button" onClick={() => setOpen(true)} className="block w-full text-left" aria-label={`Atur crop ${label}`}>
        <div className="relative overflow-hidden rounded-lg bg-[#140117]" style={{aspectRatio:`${frameWidth}/${frameHeight}`,maxWidth:`${180*frameWidth/frameHeight}px`}}>{photo}</div>
        <span className="flex min-h-[44px] items-center justify-between gap-2 text-sm font-bold text-[#FDF39D]"><span>{label}</span><span>Atur crop</span></span>
      </button>
      {onRemove && <button type="button" onClick={onRemove} className="min-h-[44px] px-3 text-sm text-[#F5B8CB]">Hapus foto</button>}
    </div>
    <ResponsiveSheet open={open} onClose={() => setOpen(false)} title={`Atur crop ${label}`} subtitle="Geser foto. Cubit dengan dua jari atau scroll untuk memperbesar. Perubahan langsung terlihat di poster.">
      <div className="space-y-4">
        <div className="flex justify-center rounded-xl bg-[#140117] p-3">
          <div ref={boxRef} role="group" tabIndex={0} aria-label="Area crop foto, gunakan tombol panah untuk menggeser" className="relative w-full touch-none overflow-hidden border-2 border-[#F5C538] outline-none focus-visible:ring-2 focus-visible:ring-[#FDF39D] cursor-grab active:cursor-grabbing" style={{aspectRatio:`${frameWidth}/${frameHeight}`,maxWidth:`${Math.min(480,380*frameWidth/frameHeight)}px`}}
            onPointerDown={e => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); pointers.current.set(e.pointerId,{x:e.clientX,y:e.clientY});setInteracting(true); }}
            onPointerMove={e => { const old=pointers.current.get(e.pointerId);if(!old)return;const before=metric();pointers.current.set(e.pointerId,{x:e.clientX,y:e.clientY});const after=metric();if(before&&after){zoom(current.current.zoom*after.distance/before.distance);move(after.x-before.x,after.y-before.y);}else move(e.clientX-old.x,e.clientY-old.y); }}
            onPointerUp={end} onPointerCancel={end} onLostPointerCapture={end}
            onDoubleClick={() => commit({zoom:1,panX:0,panY:0})}
            onKeyDown={e => {const d=e.shiftKey?24:8;const directions:Record<string,number[]>={ArrowLeft:[-d,0],ArrowRight:[d,0],ArrowUp:[0,-d],ArrowDown:[0,d]};if(directions[e.key]){e.preventDefault();move(directions[e.key]![0]!,directions[e.key]![1]!);}if(e.key==='+'||e.key==='='){e.preventDefault();zoom(f.zoom+0.1);}if(e.key==='-'){e.preventDefault();zoom(f.zoom-0.1);}}}>
            {photo}
            <div aria-hidden="true" className={`pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3 ${interacting?'opacity-90':'opacity-40'}`}>{Array.from({length:9},(_,i)=><span key={i} className="border border-[#FFF5D6]/40" />)}</div>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2"><button type="button" className={button} aria-label="Perkecil foto" disabled={f.zoom<=MIN_MEDIA_ZOOM} onClick={()=>zoom(f.zoom-0.2)}>−</button><output className="min-w-14 text-center text-sm tabular-nums text-[#FDF39D]">{f.zoom.toFixed(2)}×</output><button type="button" className={button} aria-label="Perbesar foto" disabled={f.zoom>=MAX_MEDIA_ZOOM} onClick={()=>zoom(f.zoom+0.2)}>+</button></div>
          <button type="button" className={button} onClick={()=>commit({zoom:1,panX:0,panY:0})}>Reset posisi</button>
        </div>
        <p className="text-sm text-[#FFF5D6]">Bingkai ini mengikuti ruang foto pada layout pilihan. Gunakan tombol panah saat area foto mendapat fokus untuk menggeser dengan keyboard.</p>
        <button type="button" onClick={()=>setOpen(false)} className="min-h-[44px] w-full rounded-xl bg-[#F5C538] px-4 font-bold text-[#310603]">Selesai</button>
      </div>
    </ResponsiveSheet>
  </>;
};
