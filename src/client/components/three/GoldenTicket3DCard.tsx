import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

interface GoldenTicket3DCardProps {
  holderName: string;
  tierName: string;
  tierCategory: string;
  seatZone: string;
  ticketCode?: string;
  paused?: boolean;
}

/**
 * Renders an interactive 360-degree rotatable 3D Golden Ticket plaque
 * using Three.js PBR metallic gold foil and live CanvasTexture engraving.
 */
export const GoldenTicket3DCard: React.FC<GoldenTicket3DCardProps> = ({
  holderName,
  tierName,
  tierCategory,
  seatZone,
  ticketCode = 'AVR44-GOLDEN-PASS',
  paused = false,
}) => {
  const hostRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const textureRef = useRef<THREE.CanvasTexture | null>(null);
  const canvasTexSourceRef = useRef<HTMLCanvasElement | null>(null);

  const drawTicketFace = (canvas: HTMLCanvasElement) => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;

    // Gold foil brushed gradient base
    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, '#B6580B');
    grad.addColorStop(0.25, '#E09D17');
    grad.addColorStop(0.5, '#FDF39D');
    grad.addColorStop(0.75, '#F5C538');
    grad.addColorStop(1, '#B6580B');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Inner Obsidian Mahogany filigree frame
    ctx.strokeStyle = '#310603';
    ctx.lineWidth = 10;
    ctx.strokeRect(24, 24, w - 48, h - 48);
    ctx.lineWidth = 3;
    ctx.strokeRect(40, 40, w - 80, h - 80);

    // Top Header
    ctx.fillStyle = '#310603';
    ctx.textAlign = 'center';
    ctx.font = 'bold 24px Georgia, serif';
    ctx.fillText('SMA NEGERI 1 GEDEG • KABUPATEN MOJOKERTO', w / 2, 92);

    ctx.font = '900 44px Georgia, serif';
    ctx.fillText('THE GOLDEN TICKET • AVERSA 44', w / 2, 150);

    // Divider line
    ctx.fillStyle = '#7D1B05';
    ctx.fillRect(100, 175, w - 200, 3);

    // Holder Info Block
    ctx.fillStyle = '#310603';
    ctx.textAlign = 'left';
    ctx.font = 'bold 20px sans-serif';
    ctx.fillText('PEMEGANG TIKET RESMI:', 76, 228);

    ctx.font = '900 38px sans-serif';
    ctx.fillText((holderName || 'NAMA PEMESAN').toUpperCase().slice(0, 28), 76, 275);

    ctx.fillStyle = '#7D1B05';
    ctx.font = 'bold 24px sans-serif';
    ctx.fillText(tierName.slice(0, 44), 76, 326);

    ctx.fillStyle = '#310603';
    ctx.font = '600 21px sans-serif';
    ctx.fillText(`Zona: ${seatZone} • Kategori: ${tierCategory}`, 76, 366);

    // Bottom Strip
    ctx.fillStyle = '#310603';
    ctx.fillRect(40, h - 108, w - 80, 68);
    ctx.fillStyle = '#FDF39D';
    ctx.font = 'bold 22px monospace';
    ctx.fillText(`KODE: ${ticketCode}`, 70, h - 66);
    ctx.textAlign = 'right';
    ctx.font = 'bold 21px sans-serif';
    ctx.fillText('17 DESEMBER 2026 • PUNCAK AVERSA', w - 70, h - 66);
  };

  useEffect(() => {
    if (canvasTexSourceRef.current && textureRef.current) {
      drawTicketFace(canvasTexSourceRef.current);
      textureRef.current.needsUpdate = true;
    }
  }, [holderName, tierName, tierCategory, seatZone, ticketCode]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      setFailed(true);
      return;
    }

    const w = host.clientWidth || 340;
    const h = host.clientHeight || 220;
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.innerHTML = '';
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, w / h, 0.1, 50);
    camera.position.set(0, 0, 5.2);

    const amb = new THREE.AmbientLight(0xffffff, 1.3);
    scene.add(amb);
    const dir = new THREE.DirectionalLight(0xfdf39d, 2.2);
    dir.position.set(3, 4, 5);
    scene.add(dir);

    const texCanvas = document.createElement('canvas');
    texCanvas.width = 1024;
    texCanvas.height = 512;
    canvasTexSourceRef.current = texCanvas;
    drawTicketFace(texCanvas);

    const frontTex = new THREE.CanvasTexture(texCanvas);
    frontTex.colorSpace = THREE.SRGBColorSpace;
    textureRef.current = frontTex;

    const cardGeo = new THREE.BoxGeometry(3.8, 1.9, 0.08);
    const goldEdgeMat = new THREE.MeshStandardMaterial({
      color: 0xe09d17,
      metalness: 0.9,
      roughness: 0.25,
    });
    const faceMat = new THREE.MeshStandardMaterial({
      map: frontTex,
      metalness: 0.65,
      roughness: 0.28,
    });

    const card = new THREE.Mesh(cardGeo, [
      goldEdgeMat,
      goldEdgeMat,
      goldEdgeMat,
      goldEdgeMat,
      faceMat,
      faceMat,
    ]);
    scene.add(card);

    let dragging = false;
    let targetRotY = 0;
    let targetRotX = 0;
    let lastX = 0;
    let lastY = 0;

    const down = (e: PointerEvent) => {
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
    };
    const move = (e: PointerEvent) => {
      if (!dragging) return;
      targetRotY += (e.clientX - lastX) * 0.012;
      targetRotX += (e.clientY - lastY) * 0.008;
      lastX = e.clientX;
      lastY = e.clientY;
    };
    const up = () => {
      dragging = false;
    };

    renderer.domElement.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);

    const onResize = () => {
      if (!host) return;
      const nw = host.clientWidth || 340;
      const nh = host.clientHeight || 220;
      camera.aspect = nw / nh;
      camera.updateProjectionMatrix();
      renderer.setSize(nw, nh);
    };
    window.addEventListener('resize', onResize);

    const clock = new THREE.Clock();
    let raf = 0;
    let t = 0;
    const renderLoop = () => {
      const dt = Math.min(clock.getDelta(), 0.05);
      if (!paused && !dragging) {
        t += dt;
        card.rotation.y += (Math.sin(t * 0.9) * 0.26 + targetRotY - card.rotation.y) * 0.08;
        card.rotation.x += (Math.cos(t * 0.7) * 0.08 + targetRotX - card.rotation.x) * 0.08;
      } else {
        card.rotation.y += (targetRotY - card.rotation.y) * 0.14;
        card.rotation.x += (targetRotX - card.rotation.x) * 0.14;
      }
      renderer.render(scene, camera);
      raf = requestAnimationFrame(renderLoop);
    };
    renderLoop();

    return () => {
      cancelAnimationFrame(raf);
      renderer.domElement.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('resize', onResize);
      cardGeo.dispose();
      goldEdgeMat.dispose();
      faceMat.dispose();
      frontTex.dispose();
      renderer.dispose();
    };
  }, [paused]);

  if (failed) {
    return (
      <div className="rounded-xl border-2 border-[#F5C538] bg-gradient-to-br from-[#B6580B] via-[#F5C538] to-[#E09D17] p-5 text-[#310603]">
        <p className="text-xs font-bold tracking-[0.2em] uppercase">THE GOLDEN TICKET • AVERSA 44</p>
        <p className="mt-2 text-xl font-extrabold">{holderName || 'NAMA PEMESAN'}</p>
        <p className="text-sm font-bold text-[#7D1B05]">{tierName}</p>
        <p className="mt-2 text-xs font-semibold">Zona: {seatZone} • 17 Desember 2026</p>
      </div>
    );
  }

  return (
    <div className="relative rounded-2xl border border-[#F5C538]/40 bg-[#1A021D]/80 p-3">
      <div
        ref={hostRef}
        aria-label="Pratinjau Golden Ticket 3D interaktif, geser untuk memutar 360 derajat"
        className="w-full h-[185px] sm:h-[220px] cursor-grab active:cursor-grabbing touch-pan-y"
      />
      <p className="text-center text-xs text-[#F7D160]/90 mt-1">
        Geser kartu emas 3D untuk memutar 360°
      </p>
    </div>
  );
};
