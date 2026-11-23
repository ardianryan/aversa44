import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

interface AversaHeroStage3DProps {
  paused: boolean;
  onTogglePause: () => void;
  pointerX: number;
  pointerY: number;
  reducedMotion: boolean;
}

/**
 * Interactive 3D Three.js Stage extruding the authentic Master V6 Emblem SVG
 * into centered 24K PBR Metallic Gold using PMREM RoomEnvironment reflections.
 */
export const AversaHeroStage3D: React.FC<AversaHeroStage3DProps> = ({
  paused,
  onTogglePause,
  pointerX,
  pointerY,
  reducedMotion,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const pointerRef = useRef({ x: pointerX, y: pointerY });
  const pausedRef = useRef(paused || reducedMotion);
  const [webglReady, setWebglReady] = useState(false);
  const [webglFailed, setWebglFailed] = useState(false);

  useEffect(() => {
    pointerRef.current = { x: pointerX, y: pointerY };
  }, [pointerX, pointerY]);

  useEffect(() => {
    pausedRef.current = paused || reducedMotion;
  }, [paused, reducedMotion]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance',
      });
    } catch {
      setWebglFailed(true);
      return;
    }

    const initW = container.clientWidth || 380;
    const initH = container.clientHeight || 380;
    renderer.setSize(initW, initH);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.35;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();

    // PMREM Environment Map so high-metalness gold reflects bright highlights cleanly
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const roomEnv = new RoomEnvironment();
    const envRT = pmremGenerator.fromScene(roomEnv, 0.04);
    scene.environment = envRT.texture;
    scene.environmentIntensity = 1.25;
    roomEnv.dispose();
    pmremGenerator.dispose();

    const camera = new THREE.PerspectiveCamera(38, initW / initH, 0.1, 100);
    camera.position.set(0, 0, 8.8);

    // Theatrical Key, Rim & Fill Lights
    const ambientLight = new THREE.AmbientLight(0xfdf39d, 0.7);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xfff1b8, 2.4);
    keyLight.position.set(4, 6, 7);
    scene.add(keyLight);

    const magentaRimLight = new THREE.PointLight(0xf5b8cb, 3.6, 18);
    magentaRimLight.position.set(-4.5, -2.5, 4);
    scene.add(magentaRimLight);

    const mintFillLight = new THREE.PointLight(0xa0d9ca, 2.4, 16);
    mintFillLight.position.set(4.5, -3.0, 3.5);
    scene.add(mintFillLight);

    const emblemGroup = new THREE.Group();
    scene.add(emblemGroup);

    const geometriesToDispose: THREE.BufferGeometry[] = [];
    const materialsToDispose: THREE.Material[] = [];

    // Load exact Master V6 SVG Emblem and center vertices mathematically at (0,0,0)
    const svgLoader = new SVGLoader();
    new THREE.FileLoader().load(
      '/assets/svg/logo-symbol-color.svg',
      (source) => {
        if (typeof source !== 'string') {
          setWebglFailed(true);
          return;
        }
        // The mesh uses its own facet materials; SVGLoader cannot interpret SVG paint servers or clipping.
        const svg = source.replace(/url\(#depthGrad\)/g, '#D48911').replace(/\s+clip-path="url\(#[^"]+\)"/g, '');
        const data = svgLoader.parse(svg);
        const svgRoot = new THREE.Group();
        const facetConfigs: Record<
          string,
          { color: number; depth: number; z: number; roughness: number; metalness: number }
        > = {
          'facet-base': { color: 0xd48911, depth: 75, z: 0, roughness: 0.28, metalness: 0.9 },
          'facet-marigold': { color: 0xe09d17, depth: 55, z: 42, roughness: 0.24, metalness: 0.92 },
          'facet-vivid': { color: 0xf5c538, depth: 45, z: 78, roughness: 0.18, metalness: 0.96 },
          'facet-champagne': { color: 0xfdf39d, depth: 34, z: 108, roughness: 0.14, metalness: 0.98 },
        };

        const builtEntries: Array<{ geom: THREE.ExtrudeGeometry; mat: THREE.MeshStandardMaterial; z: number }> = [];
        const unionBox = new THREE.Box3();

        for (const pathItem of data.paths) {
          const id = (pathItem.userData?.node as Element | undefined)?.getAttribute('id') || '';
          const cfg = facetConfigs[id] || {
            color: 0xf5c538,
            depth: 45,
            z: 20,
            roughness: 0.2,
            metalness: 0.94,
          };
          const shapes = SVGLoader.createShapes(pathItem);
          const mat = new THREE.MeshStandardMaterial({
            color: cfg.color,
            roughness: cfg.roughness,
            metalness: cfg.metalness,
            emissive: new THREE.Color(cfg.color),
            emissiveIntensity: 0.16,
          });
          materialsToDispose.push(mat);

          for (const shape of shapes) {
            const geom = new THREE.ExtrudeGeometry(shape, {
              depth: cfg.depth,
              bevelEnabled: true,
              bevelThickness: 12,
              bevelSize: 8,
              bevelSegments: 2,
              curveSegments: 10,
            });
            geom.computeBoundingBox();
            if (geom.boundingBox) {
              const shiftedBox = geom.boundingBox.clone();
              shiftedBox.min.z += cfg.z;
              shiftedBox.max.z += cfg.z;
              unionBox.union(shiftedBox);
            }
            geometriesToDispose.push(geom);
            builtEntries.push({ geom, mat, z: cfg.z });
          }
        }

        // Translate every geometry directly so the union center sits cleanly at (0,0,0)
        const rawCenter = unionBox.getCenter(new THREE.Vector3());
        const rawSize = unionBox.getSize(new THREE.Vector3());
        const maxSpan = Math.max(rawSize.x, rawSize.y, 1);
        const targetWorldScale = 4.2 / maxSpan;

        for (const entry of builtEntries) {
          entry.geom.translate(-rawCenter.x, -rawCenter.y, -rawCenter.z);
          const mesh = new THREE.Mesh(entry.geom, entry.mat);
          mesh.position.z = entry.z;
          svgRoot.add(mesh);
        }

        // Flip Y for SVG -> WebGL coordinates while preserving centered pivot (0,0,0)
        svgRoot.scale.set(targetWorldScale, -targetWorldScale, targetWorldScale);
        emblemGroup.add(svgRoot);
        setWebglReady(true);
      },
      undefined,
      () => {
        setWebglFailed(true);
      }
    );

    // Golden Stardust Orbit Rings centered at (0,0,0)
    const ringGeo1 = new THREE.TorusGeometry(2.55, 0.026, 12, 96);
    const ringMat1 = new THREE.MeshStandardMaterial({
      color: 0xf7d160,
      metalness: 0.96,
      roughness: 0.16,
      emissive: 0xe09d17,
      emissiveIntensity: 0.25,
    });
    const ring1 = new THREE.Mesh(ringGeo1, ringMat1);
    ring1.rotation.set(Math.PI * 0.38, Math.PI * 0.14, 0);
    scene.add(ring1);
    geometriesToDispose.push(ringGeo1);
    materialsToDispose.push(ringMat1);

    const ringGeo2 = new THREE.TorusGeometry(2.95, 0.015, 10, 96);
    const ringMat2 = new THREE.MeshStandardMaterial({
      color: 0xa0d9ca,
      metalness: 0.7,
      roughness: 0.25,
      transparent: true,
      opacity: 0.72,
    });
    const ring2 = new THREE.Mesh(ringGeo2, ringMat2);
    ring2.rotation.set(-Math.PI * 0.34, Math.PI * 0.25, 0.3);
    scene.add(ring2);
    geometriesToDispose.push(ringGeo2);
    materialsToDispose.push(ringMat2);

    // Golden Stardust Particle Cloud
    const particleCount = 240;
    const posArray = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount; i++) {
      const r = 1.9 + Math.random() * 2.6;
      const theta = Math.random() * Math.PI * 2;
      const phi = (Math.random() - 0.5) * Math.PI;
      posArray[i * 3] = r * Math.cos(theta) * Math.cos(phi);
      posArray[i * 3 + 1] = r * Math.sin(phi) * 0.9;
      posArray[i * 3 + 2] = (Math.random() - 0.5) * 2.8;
    }
    const particleGeo = new THREE.BufferGeometry();
    particleGeo.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
    const particleMat = new THREE.PointsMaterial({
      color: 0xfdf39d,
      size: 0.068,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
    });
    const particles = new THREE.Points(particleGeo, particleMat);
    scene.add(particles);
    geometriesToDispose.push(particleGeo);
    materialsToDispose.push(particleMat);

    // Drag-to-rotate touch/mouse support
    let isDragging = false;
    let dragOffsetY = 0;
    let dragOffsetX = 0;
    let lastX = 0;
    let lastY = 0;

    const onPointerDown = (e: PointerEvent) => {
      isDragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!isDragging) return;
      dragOffsetY += (e.clientX - lastX) * 0.008;
      dragOffsetX += (e.clientY - lastY) * 0.006;
      lastX = e.clientX;
      lastY = e.clientY;
    };
    const onPointerUp = () => {
      isDragging = false;
    };

    const domEl = renderer.domElement;
    domEl.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);

    const handleResize = () => {
      if (!container) return;
      const w = Math.max(200, container.clientWidth);
      const h = Math.max(200, container.clientHeight);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };

    const ro = new ResizeObserver(handleResize);
    ro.observe(container);

    const clock = new THREE.Clock();
    let rafId = 0;
    let elapsedAccum = 0;

    const animate = () => {
      const delta = Math.min(clock.getDelta(), 0.05);
      if (!pausedRef.current) {
        elapsedAccum += delta;
        emblemGroup.rotation.y +=
          (Math.sin(elapsedAccum * 0.7) * 0.38 + pointerRef.current.x * 0.35 + dragOffsetY - emblemGroup.rotation.y) *
          0.08;
        emblemGroup.rotation.x += (-pointerRef.current.y * 0.22 + dragOffsetX - emblemGroup.rotation.x) * 0.08;
        emblemGroup.position.y = Math.sin(elapsedAccum * 1.4) * 0.09;
        ring1.rotation.z += delta * 0.26;
        ring2.rotation.z -= delta * 0.19;
        particles.rotation.y += delta * 0.09;
      } else {
        emblemGroup.rotation.y += (dragOffsetY - emblemGroup.rotation.y) * 0.1;
        emblemGroup.rotation.x += (dragOffsetX - emblemGroup.rotation.x) * 0.1;
      }
      renderer.render(scene, camera);
      rafId = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
      domEl.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      geometriesToDispose.forEach((g) => g.dispose());
      materialsToDispose.forEach((m) => m.dispose());
      envRT.dispose();
      renderer.dispose();
    };
  }, []);

  return (
    <div className="relative w-full h-[320px] sm:h-[380px] lg:h-[430px] flex items-center justify-center select-none">
      {/* Radial Golden Stage Spotlight behind the 3D Emblem */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-6 rounded-full bg-[radial-gradient(circle,rgba(245,197,56,0.28)_0%,rgba(157,27,104,0.16)_48%,transparent_72%)] blur-xl"
      />

      {/* Fallback / Immediate First-Paint Image (R-40 LCP fetchpriority="high") */}
      <img
        src="/assets/png/logo-symbol-color.png"
        alt="Lambang Resmi Dies Natalis ke-44 SMA Negeri 1 Gedeg"
        width={380}
        height={380}
        fetchPriority="high"
        className={`absolute inset-0 m-auto w-56 h-56 sm:w-72 sm:h-72 object-contain drop-shadow-[0_18px_45px_rgba(245,197,56,0.35)] transition-opacity duration-500 ${
          webglReady && !webglFailed ? 'opacity-0 pointer-events-none' : 'opacity-100'
        }`}
      />

      {/* Interactive Three.js WebGL Stage */}
      {!webglFailed && (
        <div
          ref={containerRef}
          aria-label="Model 3D interaktif lambang Rajawali 44 SMA Negeri 1 Gedeg. Geser untuk memutar."
          className="relative z-10 w-full h-full cursor-grab active:cursor-grabbing touch-pan-y"
        />
      )}

      {/* Accessible Motion Pause/Play Control (antislop R-39 for >5s animations) */}
      <button
        type="button"
        onClick={onTogglePause}
        aria-pressed={paused}
        className="absolute bottom-2 right-2 sm:right-3 z-20 inline-flex items-center gap-2 min-h-[44px] px-3.5 py-2 rounded-lg bg-[#220519]/90 border border-[#F5C538]/40 text-xs font-semibold text-[#FDF39D] hover:border-[#F5C538] transition-colors"
      >
        <span>{paused || reducedMotion ? 'Putar 3D' : 'Jeda 3D'}</span>
      </button>
    </div>
  );
};
