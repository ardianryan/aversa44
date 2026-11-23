export type StudioMediaMode = 'photo' | 'video';

export const MAX_STUDIO_PHOTOS = 3;
export const STUDIO_TRANSITION_SEC = 2.2;
export const MIN_VIDEO_CLIP_SEC = 2.0;
export const MAX_VIDEO_CLIP_SEC = 20.0;
export const DEFAULT_VIDEO_CLIP_SEC = 10.0;

export interface MediaTimelinePlan {
  introSec: number;
  highlightSec: number;
  mainTransitionSec: number;
  mainStartSec: number;
  mainHoldSec: number;
  outroStartSec: number;
  totalDurationSec: number;
}

export function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

export function computeMediaTimeline(params: {
  mediaMode: StudioMediaMode;
  photoCount: number;
  clipDurationSec: number;
  includeOutro: boolean;
}): MediaTimelinePlan {
  const { mediaMode, photoCount, clipDurationSec, includeOutro } = params;
  const introSec = 1.8 + STUDIO_TRANSITION_SEC / 2;
  const highlightSec = 2.6 + STUDIO_TRANSITION_SEC;
  const mainTransitionSec = introSec + highlightSec;
  const mainStartSec = mainTransitionSec + STUDIO_TRANSITION_SEC / 2;
  let mainHoldSec = 5.4;

  if (mediaMode === 'video') {
    const valid = Number.isFinite(clipDurationSec) && clipDurationSec > 0
      ? clamp(clipDurationSec, MIN_VIDEO_CLIP_SEC, MAX_VIDEO_CLIP_SEC)
      : 8.0;
    mainHoldSec = Number(valid.toFixed(2));
  } else {
    const count = clamp(Math.floor(photoCount) || 1, 1, MAX_STUDIO_PHOTOS);
    mainHoldSec = count === 1 ? 5.2 : count === 2 ? 6.8 : 9.0;
  }

  const outroStartSec = Number((mainStartSec + mainHoldSec + (includeOutro ? STUDIO_TRANSITION_SEC / 2 : 0)).toFixed(2));
  const totalDurationSec = includeOutro
    ? Number((outroStartSec + STUDIO_TRANSITION_SEC / 2 + 2.8).toFixed(1))
    : Number((outroStartSec + 0.5).toFixed(1));

  return {
    introSec,
    highlightSec,
    mainTransitionSec,
    mainStartSec,
    mainHoldSec,
    outroStartSec,
    totalDurationSec,
  };
}

export function clampTrimWindow(
  durationSec: number,
  rawStart: number,
  rawEnd: number,
  editedSide: 'start' | 'end'
): { trimStart: number; trimEnd: number } {
  const safeDur = Math.max(0.5, Number.isFinite(durationSec) ? durationSec : 10);
  const minSpan = Math.min(MIN_VIDEO_CLIP_SEC, safeDur);
  const maxSpan = Math.min(MAX_VIDEO_CLIP_SEC, safeDur);

  let start = clamp(rawStart, 0, safeDur);
  let end = clamp(rawEnd, 0, safeDur);

  if (editedSide === 'start') {
    start = clamp(start, 0, Math.max(0, safeDur - minSpan));
    if (end - start < minSpan) end = Math.min(safeDur, start + minSpan);
    else if (end - start > maxSpan) end = Math.min(safeDur, start + maxSpan);
  } else {
    end = clamp(end, minSpan, safeDur);
    if (end - start < minSpan) start = Math.max(0, end - minSpan);
    else if (end - start > maxSpan) start = Math.max(0, end - maxSpan);
  }

  return {
    trimStart: Number(start.toFixed(1)),
    trimEnd: Number(end.toFixed(1)),
  };
}

export interface PhotoSlideState {
  primaryIdx: number;
  nextIdx: number | null;
  wipeProgress: number;
  localProgressPrimary: number;
}

export function computePhotoSlideState(
  photoCount: number,
  elapsedInMain: number,
  mainHoldSec: number
): PhotoSlideState {
  const count = clamp(Math.floor(photoCount) || 1, 1, MAX_STUDIO_PHOTOS);
  const safeHold = Math.max(1, mainHoldSec);
  const t = clamp(elapsedInMain, 0, safeHold);

  if (count === 1) {
    return {
      primaryIdx: 0,
      nextIdx: null,
      wipeProgress: 0,
      localProgressPrimary: clamp(t / safeHold, 0, 1),
    };
  }

  const segLen = safeHold / count;
  const wipeDur = Math.min(0.55, segLen * 0.28);
  const rawIdx = Math.min(count - 1, Math.floor(t / segLen));
  const segStart = rawIdx * segLen;
  const segElapsed = t - segStart;

  if (rawIdx < count - 1 && segElapsed >= segLen - wipeDur) {
    const wipeP = clamp((segElapsed - (segLen - wipeDur)) / wipeDur, 0, 1);
    return {
      primaryIdx: rawIdx,
      nextIdx: rawIdx + 1,
      wipeProgress: wipeP,
      localProgressPrimary: clamp(segElapsed / segLen, 0, 1),
    };
  }

  return {
    primaryIdx: rawIdx,
    nextIdx: null,
    wipeProgress: 0,
    localProgressPrimary: clamp(segElapsed / segLen, 0, 1),
  };
}
