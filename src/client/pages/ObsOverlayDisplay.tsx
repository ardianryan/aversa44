import { StageOrnaments } from '../components/motion/StageOrnaments.tsx';
import { SceneMotion } from '../components/motion/SceneMotion.tsx';
import { BroadcastPanelMotion, type BroadcastPanelOrigin } from '../components/motion/BroadcastPanelMotion.tsx';
import AnimatedContent from '../components/reactbits/AnimatedContent.tsx';
import { useAnimatedSwap } from '../components/reactbits/useAnimatedSwap.ts';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { VelvetStage } from '../components/reactbits/VelvetStage.tsx';
import { ShinyText } from '../components/reactbits/ShinyText.tsx';
import { StarBorder } from '../components/reactbits/StarBorder.tsx';
import { SplitText } from '../components/reactbits/SplitText.tsx';
import type { MediaSponsor, ObsOverlay, TimelineEvent } from '../types.ts';

interface ObsStatePayload {
  overlay: ObsOverlay;
  eventMeta: any;
  timeline: TimelineEvent[];
  sponsors: MediaSponsor[];
}

export const ObsOverlayDisplay: React.FC = () => {
  const [incomingState, setState] = useState<ObsStatePayload | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [stinger, setStinger] = useState<{ label: string; key: number } | null>(null);
  const stateRevision = useRef(0);
  const stingerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [sponsorIdx, setSponsorIdx] = useState(0);
  const [countdownText, setCountdownText] = useState('');
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  const params = new URLSearchParams(window.location.search);
  const overlaySlug = (params.get('overlay') || '').trim();
  const token = (params.get('token') || '').trim();

  // Keep OBS Browser Source canvas 100% transparent
  useEffect(() => {
    const prevHtml = document.documentElement.style.background;
    const prevBody = document.body.style.background;
    document.documentElement.style.background = 'transparent';
    document.body.style.background = 'transparent';
    document.body.classList.remove('bg-[#1A021D]');
    return () => {
      document.documentElement.style.background = prevHtml;
      document.body.style.background = prevBody;
    };
  }, []);

  const loadState = useCallback(async () => {
    if (!overlaySlug || !token) {
      setAuthError('Parameter ?overlay= dan ?token= wajib disertakan untuk OBS Browser Source.');
      return;
    }
    const revision = ++stateRevision.current;
    try {
      const res = await fetch(
        `/api/obs/state?overlay=${encodeURIComponent(overlaySlug)}&token=${encodeURIComponent(token)}`
      );
      const data = await res.json();
      if (revision !== stateRevision.current) return;
      if (!res.ok || !data.success) {
        setAuthError(data.error || 'Token OBS tidak valid.');
        return;
      }
      setAuthError(null);
      setState({
        overlay: data.overlay,
        eventMeta: data.eventMeta,
        timeline: data.timeline || [],
        sponsors: data.sponsors || [],
      });
    } catch {
      // keep existing state on transient network glitch
    }
  }, [overlaySlug, token]);

  useEffect(() => {
    void loadState();
    if (!overlaySlug || !token) return;

    const sse = new EventSource(
      `/api/obs/stream?overlay=${encodeURIComponent(overlaySlug)}&token=${encodeURIComponent(token)}`
    );

    sse.addEventListener('open', () => { void loadState(); });

    sse.addEventListener('state_updated', (ev) => {
      try {
        const parsed = JSON.parse((ev as MessageEvent).data);
        stateRevision.current += 1;
        setState(parsed);
      } catch {
        // ignore parse error
      }
    });

    sse.addEventListener('sponsors_updated', () => {
      void loadState();
    });

    sse.addEventListener('stinger', (ev) => {
      try {
        const parsed = JSON.parse((ev as MessageEvent).data);
        setStinger({ label: parsed.label || 'LIVE • AVERSA 44', key: Date.now() });
        if (stingerTimer.current) clearTimeout(stingerTimer.current);
        stingerTimer.current = setTimeout(() => setStinger(null), 2800);
      } catch {
        // ignore
      }
    });

    const fallbackPoll = window.setInterval(() => {
      void loadState();
    }, 15000);

    return () => {
      sse.close();
      if (stingerTimer.current) clearTimeout(stingerTimer.current);
      window.clearInterval(fallbackPoll);
    };
  }, [overlaySlug, token, loadState]);

  // Rotate Corner Sponsor Bug every 5 seconds
  useEffect(() => {
    const t = window.setInterval(() => setSponsorIdx((n) => n + 1), 5000);
    return () => window.clearInterval(t);
  }, []);

  const modeKey = incomingState ? JSON.stringify([
    incomingState.overlay.layout_preset,
    incomingState.overlay.theme_mode,
    incomingState.overlay.transition_preset,
  ]) : '';
  const pulseKey = incomingState ? JSON.stringify([
    incomingState.overlay.lower_third_title,
    incomingState.overlay.lower_third_subtitle,
    incomingState.overlay.corner_bug_text,
    incomingState.overlay.show_countdown,
    incomingState.overlay.show_sponsors,
  ]) : '';

  const motionDisabled = reducedMotion || incomingState?.overlay.transition_preset === 'cut';
  const scene = useAnimatedSwap(incomingState, modeKey, motionDisabled);
  const state = scene.value;
  const sponsorSwap = useAnimatedSwap(sponsorIdx, String(Math.floor(sponsorIdx / 2)), reducedMotion || state?.overlay.transition_preset === 'cut');

  const headerCameraPreset = Boolean(incomingState && incomingState.overlay.layout_preset !== 'standby_soon');
  const showHeaderBug = Boolean(headerCameraPreset && incomingState?.overlay.layout_preset === 'corner_bug');
  const showHeaderPartner = Boolean(
    headerCameraPreset &&
    incomingState?.overlay.layout_preset !== 'sponsor_wall' &&
    incomingState?.eventMeta?.officialMediaPartner
  );
  const bugSwap = useAnimatedSwap(showHeaderBug, showHeaderBug ? 'on' : 'off', motionDisabled);
  const partnerSwap = useAnimatedSwap(showHeaderPartner, showHeaderPartner ? 'on' : 'off', motionDisabled);

  // Live countdown ticker
  useEffect(() => {
    const iso = state?.eventMeta?.peakDateIso || '2026-12-17T19:00:00+07:00';
    const update = () => {
      const diff = Math.max(0, new Date(iso).getTime() - Date.now());
      const d = Math.floor(diff / 86400000);
      const h = Math.floor((diff / 3600000) % 24);
      const m = Math.floor((diff / 60000) % 60);
      setCountdownText(`H-${d} • ${String(h).padStart(2, '0')}j ${String(m).padStart(2, '0')}m`);
    };
    update();
    const id = window.setInterval(update, 30000);
    return () => window.clearInterval(id);
  }, [state?.eventMeta?.peakDateIso]);

  if (authError) {
    return (
      <div className="min-h-dvh flex items-center justify-center p-6 bg-transparent">
        <div className="rounded-2xl border-2 border-[#F5C538] bg-[#1A021D]/95 p-6 max-w-md text-center space-y-2 shadow-2xl">
          <div className="text-sm font-extrabold text-[#FDF39D]">OBS Browser Source AVERSA 44</div>
          <p className="text-xs text-[#F5B8CB]">{authError}</p>
        </div>
      </div>
    );
  }

  if (!state) return null;

  const { overlay, sponsors, timeline, eventMeta } = state;

  const isLight = overlay.theme_mode === 'light';
  const motionOff = reducedMotion || overlay.transition_preset === 'cut';

  const panelStyle = isLight
    ? 'bg-[#FFF5D6]/92 border-[#E09D17]/80 text-[#310603] backdrop-blur-md'
    : 'bg-[#18021B]/88 border-[#F5C538]/45 text-[#FFF5D6] backdrop-blur-md';

  const transitionAnimClass = overlay.transition_preset === 'cut' ? 'obs-enter-cut' : '';
  const reveal = (text: string, centered = false) => <SplitText key={text} text={text} className={centered ? 'justify-center' : ''} delayMs={90} staggerMs={30} reducedMotion={motionOff} />;
  const rankedSponsors = [...sponsors].filter(sp => sp.is_active).sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);
  const primarySponsors = rankedSponsors.slice(0, 3);
  const supporting = rankedSponsors.slice(3);
  const supportingPageSize = 12;
  const supportingPage = Math.floor(sponsorSwap.value / 2) % Math.max(1, Math.ceil(supporting.length / supportingPageSize));
  const visibleSponsors = supporting.slice(supportingPage * supportingPageSize, supportingPage * supportingPageSize + supportingPageSize);
  const supportingRows = Math.max(1, Math.ceil(visibleSponsors.length / 6));
  const supportingCols = visibleSponsors.length > 0 ? Math.min(6, Math.ceil(visibleSponsors.length / supportingRows)) : 1;

  const ribbonPageSize = 5;
  const ribbonPage = Math.floor(sponsorSwap.value / 2) % Math.max(1, Math.ceil(supporting.length / ribbonPageSize));
  const ribbonSupporting = supporting.slice(ribbonPage * ribbonPageSize, ribbonPage * ribbonPageSize + ribbonPageSize);
  const activeRotatingSponsor = rankedSponsors.length > 0 ? rankedSponsors[sponsorIdx % rankedSponsors.length] : null;

  const staticFrame = (children: React.ReactNode, className = '') => (
    <StarBorder disabled={motionOff} speed="8s" className={`obs-frame ${className}`}>
      <div className={`obs-panel ${panelStyle}`}>{children}</div>
    </StarBorder>
  );

  const motionFrame = (
    children: React.ReactNode,
    className = '',
    options: { origin?: BroadcastPanelOrigin; leaving?: boolean; pulse?: string } = {},
  ) => (
    <BroadcastPanelMotion
      preset={overlay.transition_preset}
      origin={options.origin ?? 'bottom'}
      leaving={options.leaving ?? scene.leaving}
      pulseKey={options.pulse ?? ''}
      disabled={motionOff}
      className={className}
    >
      <StarBorder disabled={motionOff} speed="8s" className="obs-frame">
        <div className={`obs-panel ${panelStyle}`}>{children}</div>
      </StarBorder>
    </BroadcastPanelMotion>
  );

  const frame = (children: React.ReactNode, className = '') => (
    <StarBorder disabled={motionOff} speed="8s" className={`obs-frame ${className}`}>
      <SceneMotion disabled={motionOff} className={`obs-panel ${panelStyle}`}>{children}</SceneMotion>
    </StarBorder>
  );

  const renderSponsorLogo = (sp: MediaSponsor, heightClass = 'h-7') => {
    const src = isLight ? sp.logo_url : sp.dark_logo_url || sp.logo_url;
    const needsBox = !isLight && sp.boxed && !sp.dark_logo_url;
    return (
      <img
        key={sp.id}
        src={src}
        alt={sp.name}
        className={`${heightClass} max-w-full w-auto object-contain ${
          needsBox ? 'rounded-lg bg-[#FFF5D6] px-2.5 py-1 shadow-sm' : ''
        }`}
      />
    );
  };

  const hasCredits = Boolean(eventMeta.officialMediaPartner) || (overlay.show_sponsors && rankedSponsors.length > 0);
  const hasSponsors = overlay.show_sponsors && rankedSponsors.length > 0;
  const isCameraPreset = overlay.layout_preset !== 'standby_soon';

  const renderSponsorBar = (includePartner = false) => (
    <div className={`obs-sponsor-bar ${supporting.length > 0 ? 'obs-sponsor-bar-has-grid' : ''}`}>
      {hasSponsors && (
        <div className="obs-sponsor-bar-main">
          <span className="obs-sponsor-bar-label">Didukung oleh</span>
          <div className="obs-sponsor-smart-stack">
            <div
              className="obs-smart-primary"
              style={{ '--smart-cols': Math.max(1, primarySponsors.length) } as React.CSSProperties}
            >
              {primarySponsors.map((sp) => (
                <div key={sp.id} className="obs-sponsor-bar-item">
                  {renderSponsorLogo(sp, supporting.length > 0 ? 'obs-bar-primary-logo' : 'obs-bar-logo')}
                </div>
              ))}
            </div>
            {visibleSponsors.length > 0 && (
              <div
                key={supportingPage}
                className={`obs-smart-supporting ${sponsorSwap.leaving ? 'obs-logos-leaving' : ''}`}
                style={{ '--smart-cols': supportingCols } as React.CSSProperties}
              >
                {visibleSponsors.map((sp, idx) => (
                  <AnimatedContent
                    key={sp.id}
                    trigger="mount"
                    duration={0.65}
                    distance={motionOff ? 0 : 10}
                    delay={motionOff ? 0 : idx * 0.04}
                    animateOpacity={!motionOff}
                  >
                    <div className="obs-sponsor-bar-item">{renderSponsorLogo(sp, 'obs-bar-supporting-logo')}</div>
                  </AnimatedContent>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
      {includePartner && eventMeta.officialMediaPartner && (
        <div className="obs-official-partner">
          <span className="obs-sponsor-bar-label">Official Media Partner</span>
          <img src={eventMeta.officialMediaPartner} alt="Official Media Partner" />
        </div>
      )}
    </div>
  );

  const renderCredits = (includePartner = true) => <div className="obs-credits">
    {hasSponsors && <div className="obs-credit-sponsors"><p className="obs-credit-label">Didukung oleh</p><div className="obs-primary-sponsors">{rankedSponsors.slice(0, 3).map(sp => <div key={sp.id}>{renderSponsorLogo(sp, 'obs-primary-logo')}</div>)}</div>{visibleSponsors.length > 0 && <div key={supportingPage} className={`obs-supporting-sponsors ${sponsorSwap.leaving ? 'obs-logos-leaving' : ''}`}>{visibleSponsors.map(sp => <AnimatedContent key={sp.id} trigger="mount" duration={0.8} distance={motionOff ? 0 : 16} delay={motionOff ? 0 : visibleSponsors.indexOf(sp) * 0.07} animateOpacity={!motionOff}>{renderSponsorLogo(sp, 'obs-supporting-logo')}</AnimatedContent>)}</div>}</div>}
    {includePartner && eventMeta.officialMediaPartner && <div className="obs-official-partner"><p className="obs-credit-label">Official Media Partner</p><img src={eventMeta.officialMediaPartner} alt="Official Media Partner" /></div>}
  </div>;

  const credits = renderCredits();

  const renderFullFrameRibbon = () => (
    <div className="obs-full-ribbon">
      <span className="obs-full-ribbon-label">Didukung oleh</span>
      <div className="obs-ribbon-group">
        {primarySponsors.map((sp) => (
          <div key={sp.id} className="obs-sponsor-bar-item">
            {renderSponsorLogo(sp, 'obs-ribbon-primary-logo')}
          </div>
        ))}
      </div>
      {ribbonSupporting.length > 0 && (
        <>
          <span aria-hidden="true" className="obs-ribbon-divider" />
          <div
            key={ribbonPage}
            className={`obs-ribbon-group ${sponsorSwap.leaving ? 'obs-logos-leaving' : ''}`}
          >
            {ribbonSupporting.map((sp, idx) => (
              <AnimatedContent
                key={sp.id}
                trigger="mount"
                duration={0.55}
                distance={motionOff ? 0 : 10}
                delay={motionOff ? 0 : idx * 0.04}
                animateOpacity={!motionOff}
              >
                <div className="obs-sponsor-bar-item">
                  {renderSponsorLogo(sp, 'obs-ribbon-supporting-logo')}
                </div>
              </AnimatedContent>
            ))}
          </div>
        </>
      )}
    </div>
  );

  const identityLockup = (
    <div className="obs-full-identity">
      <img className="obs-full-school" src="/assets/extracted/logo-sman1gedeg.png" alt="SMAN 1 Gedeg" />
      <span className="obs-full-anniversary"><img src="/assets/svg/dies-natalis-44-tight.svg" alt="Lambang Dies Natalis ke-44" /></span>
      <img className="obs-full-wordmark" src="/assets/svg/aversa-wordmark-tight.svg" alt="AVERSA" />
    </div>
  );

  const headerOverlay = incomingState?.overlay || overlay;
  const headerPartnerUrl = incomingState?.eventMeta?.officialMediaPartner || eventMeta.officialMediaPartner;

  return (
    <div className={`obs-stage ${isLight ? 'obs-light' : ''} ${reducedMotion ? 'obs-still' : ''} ${hasCredits ? 'obs-has-credits' : ''} ${scene.leaving ? 'obs-scene-leaving' : ''}`} data-layout={overlay.layout_preset}>
      {headerCameraPreset && (
        <div aria-hidden="true" className="obs-edge">
          {['top-0 left-0', 'top-0 right-0 scale-x-[-1]', 'bottom-0 left-0 scale-y-[-1]', 'bottom-0 right-0 scale-[-1]'].map(position => (
            <img key={position} src="/assets/brandkit/item-ornate-corner-filigree.svg" alt="" className={`absolute w-10 sm:w-16 opacity-75 ${position}`} />
          ))}
        </div>
      )}

      {/* Persistent TV-style Top Header (never flickers across camera preset switches) */}
      {headerCameraPreset && (
        <div className="obs-full-header">
          <div className="obs-header-left">
            {staticFrame(identityLockup, 'obs-full-brand')}
            {bugSwap.value && motionFrame(
              <div className="obs-bug">
                <div>
                  <h1 className="obs-bug-label">{reveal(headerOverlay.corner_bug_text)}</h1>
                  {headerOverlay.show_countdown && <p data-motion-detail className="obs-subtitle">{countdownText}</p>}
                </div>
              </div>,
              'obs-bug-pill',
              { origin: 'left', leaving: bugSwap.leaving, pulse: headerOverlay.corner_bug_text }
            )}
          </div>
          {partnerSwap.value && headerPartnerUrl && motionFrame(
            <div className="obs-full-partner">
              <span className="obs-full-partner-label">
                <ShinyText text="Official Media Partner" disabled={motionOff} />
              </span>
              <span aria-hidden="true" className="obs-partner-divider" />
              <img src={headerPartnerUrl} alt="Official Media Partner" />
            </div>,
            'obs-full-partner-frame',
            { origin: 'top', leaving: partnerSwap.leaving }
          )}
        </div>
      )}

      <div key={`composition-${scene.key}`} className={`obs-composition ${transitionAnimClass}`}>
        {isCameraPreset && (
          <div className="obs-bottom-stack">
            {overlay.layout_preset === 'full_frame' && hasSponsors && (
              <div className="obs-full-ribbon-wrap">
                {motionFrame(renderFullFrameRibbon(), 'obs-full-ribbon-frame', { origin: 'bottom' })}
              </div>
            )}
            {overlay.layout_preset === 'lower_third' && (
              motionFrame(
                <div className="obs-lower-grid">
                  <div className="obs-copy">
                    <p data-motion-detail className="obs-eyebrow">
                      <ShinyText text={overlay.corner_bug_text} disabled={motionOff} />
                    </p>
                    <h1>{reveal(overlay.lower_third_title)}</h1>
                    <AnimatedContent
                      key={`sub-${overlay.lower_third_subtitle}`}
                      trigger="mount"
                      wipe={motionOff ? 'none' : 'right'}
                      blur={motionOff ? 0 : 4}
                      distance={motionOff ? 0 : 18}
                      duration={0.55}
                      animateOpacity={!motionOff}
                    >
                      <p data-motion-detail className="obs-subtitle">{overlay.lower_third_subtitle}</p>
                    </AnimatedContent>
                  </div>
                  {(overlay.show_countdown || (hasSponsors && activeRotatingSponsor)) && (
                    <div className="obs-meta">
                      {overlay.show_countdown && (
                        <div className="obs-countdown">
                          <span>Puncak acara</span>
                          <strong>{countdownText}</strong>
                        </div>
                      )}
                      {hasSponsors && activeRotatingSponsor && (
                        <div className={`obs-inline-sponsor ${overlay.show_countdown ? 'obs-inline-sponsor-divided' : ''}`}>
                          <span className="obs-inline-sponsor-label">Didukung oleh</span>
                          <AnimatedContent
                            key={`rot-${activeRotatingSponsor.id}`}
                            trigger="mount"
                            distance={motionOff ? 0 : 12}
                            scale={motionOff ? 1 : 0.94}
                            blur={motionOff ? 0 : 4}
                            duration={0.55}
                            animateOpacity={!motionOff}
                          >
                            <div className="obs-inline-sponsor-slot">
                              {renderSponsorLogo(activeRotatingSponsor, 'obs-inline-sponsor-logo')}
                            </div>
                          </AnimatedContent>
                        </div>
                      )}
                    </div>
                  )}
                </div>,
                '',
                { origin: 'bottom', pulse: pulseKey }
              )
            )}
            {overlay.layout_preset === 'guest_spotlight' && (
              motionFrame(
                <div className="obs-guest-grid">
                  <AnimatedContent
                    trigger="mount"
                    wipe={motionOff ? 'none' : 'up'}
                    distance={motionOff ? 0 : 20}
                    stagger={motionOff ? 0 : 0.12}
                    duration={0.65}
                    animateOpacity={!motionOff}
                    className="obs-guest-art"
                    aria-hidden="true"
                  >
                    <img src="/assets/extracted/guest-niken-salindry.png" alt="" />
                    <img src="/assets/extracted/guest-kembange-jagad.png" alt="" />
                  </AnimatedContent>
                  <div className="obs-copy">
                    <p data-motion-detail className="obs-eyebrow">
                      <ShinyText text="Panggung AVERSA 44" disabled={motionOff} />
                    </p>
                    <h1>{reveal(overlay.lower_third_title)}</h1>
                    <AnimatedContent
                      key={`gs-sub-${overlay.lower_third_subtitle}`}
                      trigger="mount"
                      wipe={motionOff ? 'none' : 'right'}
                      blur={motionOff ? 0 : 4}
                      distance={motionOff ? 0 : 16}
                      duration={0.55}
                      animateOpacity={!motionOff}
                    >
                      <p data-motion-detail className="obs-subtitle">{overlay.lower_third_subtitle}</p>
                    </AnimatedContent>
                    <p data-motion-detail className="obs-detail">
                      {eventMeta.peakDateLabel || '17 Desember 2026'} • {eventMeta.guestStarVenue || 'Lapangan Tengah SMAN 1 Gedeg'}
                    </p>
                  </div>
                </div>,
                '',
                { origin: 'bottom', pulse: pulseKey }
              )
            )}
            {overlay.layout_preset === 'rundown_schedule' && (
              <div className="obs-rundown">
                {motionFrame(
                  <>
                    <div className="obs-heading">
                      <h1>{reveal('Rangkaian Acara')}</h1>
                    </div>
                    <AnimatedContent
                      trigger="mount"
                      direction="horizontal"
                      distance={motionOff ? 0 : 20}
                      stagger={motionOff ? 0 : 0.08}
                      duration={0.55}
                      animateOpacity={!motionOff}
                      className="obs-schedule-list"
                    >
                      {timeline.length ? timeline.slice(0, 4).map((ev, index) => (
                        <div key={ev.id} className="obs-schedule-row">
                          <span className="obs-event-number">{String(index + 1).padStart(2, '0')}</span>
                          <div>
                            <p className="obs-subtitle">{ev.date_label}</p>
                            <h2>{ev.title}</h2>
                          </div>
                        </div>
                      )) : <p>Rangkaian acara akan diumumkan.</p>}
                    </AnimatedContent>
                  </>,
                  '',
                  { origin: 'left' }
                )}
              </div>
            )}
            {overlay.layout_preset === 'sponsor_wall' && (
              motionFrame(
                <>
                  <div className="obs-heading">
                    <div>
                      <p data-motion-detail className="obs-eyebrow">
                        <ShinyText text="AVERSA 44" disabled={motionOff} />
                      </p>
                      <h1>{reveal('Terima kasih, mitra & sponsor')}</h1>
                    </div>
                  </div>
                  {hasCredits ? renderCredits(true) : <p>Belum ada logo mitra yang ditampilkan.</p>}
                </>,
                '',
                { origin: 'bottom' }
              )
            )}
          </div>
        )}

        {overlay.layout_preset === 'standby_soon' && (
          <div className="obs-standby">
            <VelvetStage reducedMotion={reducedMotion} />
            <img src="/assets/brandkit/aversa-media-curtain.svg" alt="" className="obs-curtain curtain-velvet-sway" />
            <StageOrnaments disabled={motionOff} />
            <div className="obs-standby-top-identity">{frame(identityLockup, 'obs-full-brand')}</div>
            {hasCredits && <div className="obs-standby-credits">{frame(renderSponsorBar(true), 'obs-sponsor-strip-frame')}</div>}
            <SceneMotion disabled={motionOff} className="obs-standby-copy"><img data-motion-detail className="obs-main-logo" src="/assets/extracted/aversa-tophat-2026.png" alt="AVERSA 2026" /><p data-motion-detail className="obs-eyebrow">SMA Negeri 1 Gedeg • 1982 - 2026</p><h1>{reveal(overlay.lower_third_title, true)}</h1><p data-motion-detail className="obs-subtitle">{overlay.lower_third_subtitle}</p>
              {overlay.show_countdown && frame(<div className="obs-countdown"><span>Siaran segera dimulai</span><strong>{countdownText}</strong></div>, 'obs-standby-countdown')}
            </SceneMotion>
          </div>
        )}
      </div>
      {stinger && <div key={stinger.key} className="aversa-stinger obs-stinger fixed inset-0 z-50 flex items-center justify-center bg-[#360538]"><VelvetStage reducedMotion={reducedMotion} /><div className="aversa-stinger-content"><img src="/assets/png/logo-symbol-color.png" alt="AVERSA 44" /><h1><ShinyText text={stinger.label} disabled={reducedMotion} /></h1>{hasCredits && renderSponsorBar(true)}</div></div>}
    </div>
  );
};
