# Changelog

Notable changes are recorded here. Version numbers follow Semantic Versioning.

## Unreleased

## 0.2.1 - 2026-11-23

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
