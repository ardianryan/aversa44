# Changelog

Notable changes are recorded here. Version numbers follow Semantic Versioning.

## Unreleased

## 0.2.6 - 2026-11-24

- Media Studio (Mobile): Fix invisible uploaded video on iOS/Android by keeping the source `<video>` inside the viewport (`2x2px`, `opacity: 0.01`) instead of `-9999px` offscreen (preventing mobile WebKit/Blink compositor culling), forcing a 0.05s frame decode on `loadedmetadata`, and capturing/rendering a poster snapshot fallback during `probeVideo`.

## 0.2.5 - 2026-11-24

- Media Studio: Fix social media upload spinning/rejection by always transcoding `MediaRecorder` output (including Chrome/Safari fragmented MP4) to standard Constant Frame Rate (`30fps`), H.264 High@L4.1 (`yuv420p`, keyframe interval `60`), AAC 48kHz stereo, `+faststart` MP4.
- Media Studio: Keep a silent 48kHz Web Audio keep-alive stream connected during recording so `MediaRecorder` always emits continuous audio timestamps.

## 0.2.4 - 2026-11-24

- Media Studio: Fix video playback/export freezing around 10s by unlocking `<video>` synchronously on user gesture, guarding `onSeeked` against mid-playback state updates, and adding a playback stall recovery watchdog.
- Media Studio: Enlarge canvas typography (headline, subtitle, badge, footer, header, and sponsor labels) for crisp mobile readability.
- Media Studio: Enrich canvas and studio UI with ReactBits (`SplitText`, `StarBorder`, `AnimatedContent`, `AuroraBackground`) and Anime.js motion, plus animated corner filigrees, drifting golden stardust particles, and badge shimmer sweep.

## 0.2.3 - 2026-11-24

- Media Studio (Mobile iOS & Android): Fix blank video canvas & missing audio on mobile browsers by rendering the source `<video>` offscreen (`opacity-0` 1x1px) instead of `display: none`, forcing first-frame GPU decode on load, and attaching temporary probe `<video>` elements to `document.body` with `loadedmetadata` fallback.
- Media Studio (Mobile iOS & Android): Use native `<video>` audio playback in preview, `captureStream` audio mixing on Android/Desktop export (with Web Audio fallback for iOS Safari), and JPEG memory optimization for high-MP mobile camera photos.

## 0.2.2 - 2026-11-24

- Media Studio: Enable full cross-device video & photo support, including iPhone HEIC image decoding and H.264 (yuv420p) + AAC audio + faststart MP4 export for seamless QuickTime and iOS Safari playback.
- Media Studio: Restore video audio playback in both live canvas preview and exported MP4 files, with an instant mute/unmute toggle control.
- Media Studio: Unlock video duration limits (supporting clips from 0.5 seconds up to 30 minutes) without forced 10-second truncation.
- Media Studio: Add interactive video cropping, panning, and zoom via MediaCropBox with automatic poster frame extraction.
- Cloud Streaming: Fix YouTube "not receiving enough video" stream health warnings by correcting FLV timestamp pacing (setts monotonic advance) and enabling multi-threaded x264enc encoding.
- Cloud Streaming: Clean up audio resampling to prevent distortion and clicks during live OBS broadcasts.
- OBS Overlay: Enforce persistent horizontal layout for Official Media Partner brand pill across all viewport widths and enlarge sponsor typography for 1080p broadcasts.

- Replace the static fallback slate with an animated 1080p looping video (Anime.js timeline plus canvas stardust, aurora and orbital ring effects) served to the stream engine over an internal RTSP loop.
- Force square pixels (`pixel-aspect-ratio=1/1`) in the stream pipeline so YouTube receives a true 16:9 frame instead of a pillarboxed, squeezed picture.
- Fix choppy and distorted audio by keeping source timestamps, using gentler resampling, larger queues, and normalising the fallback WAV to 48 kHz stereo before mixing.
- Lower the default 1080p bitrate to 4800 kbps for steadier delivery on small VPS instances.
- Show the Official Media Partner label and logo side by side in OBS overlays and enlarge overlay text and sponsor logos for 1080p legibility.

## 0.2.0 - 2026-11-23

- Add cloud live streaming worker (`aversa44-stream`) with single-encode GStreamer and FFmpeg remuxing pipeline, seamless fallback slate, and automatic OBS disconnect/reconnect recovery.
- Add Live Kit cloud streaming management panel in Office dashboard (`/office/live-kit`) with encrypted YouTube stream key storage (AES-256-GCM), fallback WAV audio management, and real-time worker heartbeat telemetry.
- Support RTMP and SRT OBS ingestion with source credential verification and Tailscale network binding.
- Update Portainer stack deployment to coordinate web application, streaming worker, and PostgreSQL with shared cloud data volume.
- Enhance Media Studio with full Canva-aligned template suite and local audio generation workflows.
- Harden backend RBAC and add automated verification suite for cloud stream secrets and endpoints.

## 0.1.1 - 2026-11-23

- Protect office login, checkout, and wallet verification requests with server-validated Cloudflare Turnstile.
- Trust client IP addresses only from explicitly configured reverse proxies and add per-process request limits.
- Add Portainer and reverse proxy deployment examples and security verification checks.

## 0.1.0 - 2026-11-23

- Prepare reproducible CI, container builds and version-tagged releases.
- Update dependencies and build the server as a production JavaScript bundle.
- Consolidate duplicate creative credits while preserving their roles.
- Add citation metadata and MIT licensing for project code.

Historical changes before this changelog were not reconstructed as releases.
