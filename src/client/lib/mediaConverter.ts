export const IMAGE_INPUT_ACCEPT = 'image/*,.heic,.heif';
export const VIDEO_INPUT_ACCEPT = 'video/*,.mov,.qt,.mp4,.m4v';

export interface NormalizedImage { dataUrl: string; width: number; height: number }
export interface PreparedVideo { objectUrl: string; durationSec: number; width: number; height: number }

let ffmpegPromise: Promise<import('@ffmpeg/ffmpeg').FFmpeg> | null = null;
async function getFfmpeg() {
  if (!ffmpegPromise) {
    ffmpegPromise = Promise.all([
      import('@ffmpeg/ffmpeg'), import('@ffmpeg/core?url'), import('@ffmpeg/core/wasm?url'),
    ]).then(async ([{ FFmpeg }, core, wasm]) => {
      const ffmpeg = new FFmpeg();
      await ffmpeg.load({ coreURL: core.default, wasmURL: wasm.default });
      return ffmpeg;
    }).catch((error) => { ffmpegPromise = null; throw error; });
  }
  return ffmpegPromise;
}

async function transcode(input: Blob, inputExt: string, onStatus?: (text: string) => void, speed = 1): Promise<Blob> {
  onStatus?.('Menyiapkan konverter video di perangkat...');
  const ffmpeg = await getFfmpeg();
  const { fetchFile } = await import('@ffmpeg/util');
  const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const source = `input-${id}.${inputExt}`;
  const target = `output-${id}.mp4`;
  const progress = ({ progress: value }: { progress: number }) => {
    const percent = Math.min(99, Math.max(0, Math.round(value * 100)));
    onStatus?.(percent ? `Mengonversi video ke MP4 (${percent}%)...` : 'Mengonversi video ke MP4. Proses ini dapat memerlukan beberapa menit...');
  };
  ffmpeg.on('progress', progress);
  try {
    await ffmpeg.writeFile(source, await fetchFile(input));
    const filters: string[] = [];
    if (Math.abs(speed - 1) > 0.001) {
      const tempo: number[] = [];
      let remaining = speed;
      while (remaining < 0.5) { tempo.push(0.5); remaining /= 0.5; }
      while (remaining > 2) { tempo.push(2); remaining /= 2; }
      tempo.push(remaining);
      filters.push('-vf', `setpts=PTS/${speed.toFixed(6)}`, '-af', tempo.map((value) => `atempo=${value.toFixed(6)}`).join(','));
    }
    const result = await ffmpeg.exec(['-i', source, ...filters, '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-movflags', '+faststart', target]);
    if (result !== 0) throw new Error('Konversi video gagal. Coba gunakan video lain.');
    const data = await ffmpeg.readFile(target);
    if (!(data instanceof Uint8Array) || !data.length) throw new Error('Hasil konversi video kosong.');
    return new Blob([new Uint8Array(data)], { type: 'video/mp4' });
  } finally {
    ffmpeg.off('progress', progress);
    await ffmpeg.deleteFile(source).catch(() => {});
    await ffmpeg.deleteFile(target).catch(() => {});
  }
}

export async function convertToMp4InBrowser(blob: Blob, onStatus?: (text: string) => void): Promise<Blob> {
  return transcode(blob, 'webm', onStatus);
}

export async function ensureMp4Duration(blob: Blob, targetSec: number, onStatus?: (text: string) => void): Promise<Blob> {
  const readDuration = async (file: Blob) => {
    const url = URL.createObjectURL(file);
    try { return (await probeVideo(url)).durationSec; } finally { URL.revokeObjectURL(url); }
  };
  const actual = await readDuration(blob);
  const tolerance = Math.max(0.3, targetSec * 0.04);
  if (Math.abs(actual - targetSec) <= tolerance) return blob;
  onStatus?.('Menyesuaikan durasi video di perangkat...');
  const corrected = await transcode(blob, 'mp4', onStatus, actual / targetSec);
  const duration = await readDuration(corrected);
  if (Math.abs(duration - targetSec) > tolerance) throw new Error('Durasi video belum sesuai. Coba ekspor lagi dengan tab tetap terbuka.');
  return corrected;
}

async function loadImage(blob: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(blob);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Format gambar tidak dapat dibaca.'));
      img.src = url;
    });
  } finally { URL.revokeObjectURL(url); }
}

export async function normalizeImageInBrowser(file: File, maxDim = 2048): Promise<NormalizedImage> {
  let img: HTMLImageElement;
  try { img = await loadImage(file); }
  catch (error) {
    const header = new Uint8Array(await file.slice(0, 16).arrayBuffer());
    const brand = String.fromCharCode(...header.slice(8, 12)).toLowerCase();
    if (!/\.(heic|heif)$/i.test(file.name) && !/hei[cf]/i.test(file.type) && !['heic','heix','hevc','hevx','mif1','msf1'].includes(brand)) throw error;
    const { default: heic2any } = await import('heic2any');
    const converted = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.92 });
    img = await loadImage(Array.isArray(converted) ? converted[0]! : converted);
  }
  const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
  const width = Math.max(1, Math.round(img.naturalWidth * scale));
  const height = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Kanvas browser tidak tersedia.');
  ctx.drawImage(img, 0, 0, width, height);
  return { dataUrl: canvas.toDataURL('image/png'), width, height };
}

async function probeVideo(url: string): Promise<PreparedVideo> {
  const video = document.createElement('video');
  video.preload = 'auto'; video.muted = true; video.playsInline = true;
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => finish(false), 8000);
    const finish = (ok: boolean) => {
      window.clearTimeout(timer);
      const result = { objectUrl: url, durationSec: video.duration, width: video.videoWidth, height: video.videoHeight };
      video.removeAttribute('src'); video.load();
      if (ok && result.width > 0 && result.height > 0 && Number.isFinite(result.durationSec) && result.durationSec > 0) resolve(result);
      else reject(new Error('Video tidak dapat diputar di browser ini.'));
    };
    video.onloadeddata = () => finish(true);
    video.onerror = () => finish(false);
    video.src = url;
  });
}

export async function prepareVideoInBrowser(file: File, onStatus?: (text: string) => void): Promise<PreparedVideo> {
  const url = URL.createObjectURL(file);
  try { return await probeVideo(url); }
  catch {
    URL.revokeObjectURL(url);
    if (!/\.(mov|qt|mp4|m4v)$/i.test(file.name) && !/quicktime|mp4/i.test(file.type)) throw new Error('Video tidak dapat dibaca. Gunakan MP4 atau MOV.');
    const mp4 = await transcode(file, 'mov', onStatus);
    const convertedUrl = URL.createObjectURL(mp4);
    try { return await probeVideo(convertedUrl); }
    catch (error) { URL.revokeObjectURL(convertedUrl); throw error; }
  }
}
