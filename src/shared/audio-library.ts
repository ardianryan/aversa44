export interface AversaAudioTrack {
  id: string;
  title: string;
  vibe: string;
  bpm: number;
  chords: number[][];
  bassline: number[];
}

export const AVERSA_AUDIO_TRACKS: AversaAudioTrack[] = [
  {
    id: 'theatrical-gala',
    title: 'Theatrical Gala Fanfare',
    vibe: 'Megah & Seremonial (Pembukaan / Guest Star)',
    bpm: 112,
    chords: [
      [261.63, 329.63, 392.0], // C4 maj
      [220.0, 261.63, 329.63], // A3 min
      [174.61, 220.0, 261.63], // F3 maj
      [196.0, 246.94, 293.66], // G3 maj
    ],
    bassline: [130.81, 110.0, 87.31, 98.0],
  },
  {
    id: 'upbeat-festival',
    title: 'Aversa Festival Pulse',
    vibe: 'Energik & Modern (Promo Tiket / Merch)',
    bpm: 124,
    chords: [
      [293.66, 349.23, 440.0], // D min
      [233.08, 293.66, 349.23], // Bb maj
      [261.63, 329.63, 392.0], // C maj
      [220.0, 277.18, 329.63], // A maj
    ],
    bassline: [146.83, 116.54, 130.81, 110.0],
  },
  {
    id: 'hype-countdown',
    title: 'Royal Stage Countdown',
    vibe: 'Dramatis & Tegas (Countdown / Pengumuman)',
    bpm: 118,
    chords: [
      [246.94, 293.66, 369.99], // B min
      [196.0, 246.94, 293.66], // G maj
      [293.66, 369.99, 440.0], // D maj
      [220.0, 277.18, 329.63], // A maj
    ],
    bassline: [123.47, 98.0, 146.83, 110.0],
  },
  {
    id: 'warm-nostalgia',
    title: 'Memories Since 1982',
    vibe: 'Hangat & Emosional (Alumni / Recap Momen)',
    bpm: 96,
    chords: [
      [261.63, 329.63, 392.0, 493.88], // C maj7
      [174.61, 220.0, 261.63, 329.63], // F maj7
      [220.0, 261.63, 329.63, 392.0], // A min7
      [196.0, 246.94, 293.66, 349.23], // G7
    ],
    bassline: [130.81, 87.31, 110.0, 98.0],
  },
];

/**
 * Synthesizes a clean multi-layer Web Audio accompaniment directly into `destNode`
 * for zero-CORS browser preview and Reels/Story WebM video mixing.
 */
export function startSynthBgm(
  ctx: AudioContext,
  destNode: AudioNode,
  trackId: string,
  durationSec: number
): () => void {
  const track = AVERSA_AUDIO_TRACKS.find((t) => t.id === trackId) || AVERSA_AUDIO_TRACKS[0]!;
  const stepSec = 60 / track.bpm / 2; // 8th note grid
  const totalSteps = Math.max(4, Math.ceil(durationSec / stepSec));
  const master = ctx.createGain();
  master.gain.setValueAtTime(0.001, ctx.currentTime);
  master.gain.exponentialRampToValueAtTime(0.24, ctx.currentTime + 0.35);
  const fadeStart = Math.max(ctx.currentTime + 0.4, ctx.currentTime + durationSec - 0.65);
  master.gain.setValueAtTime(0.24, fadeStart);
  master.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + durationSec);
  master.connect(destNode);

  const activeNodes: AudioNode[] = [master];

  for (let s = 0; s < totalSteps; s++) {
    const t = ctx.currentTime + s * stepSec;
    const barIdx = Math.floor(s / 8) % track.chords.length;
    const chord = track.chords[barIdx]!;
    const bassFreq = track.bassline[barIdx]!;

    // Pad / Chord pulse on beat 0 & 4 of each bar
    if (s % 4 === 0) {
      for (const freq of chord) {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, t);
        g.gain.setValueAtTime(0.001, t);
        g.gain.linearRampToValueAtTime(0.11, t + 0.04);
        g.gain.exponentialRampToValueAtTime(0.001, t + stepSec * 3.8);
        osc.connect(g);
        g.connect(master);
        osc.start(t);
        osc.stop(t + stepSec * 3.9);
        activeNodes.push(osc);
      }
    }

    // Bass groove
    if (s % 2 === 0) {
      const bOsc = ctx.createOscillator();
      const bGain = ctx.createGain();
      bOsc.type = 'sine';
      bOsc.frequency.setValueAtTime(bassFreq, t);
      bGain.gain.setValueAtTime(0.001, t);
      bGain.gain.linearRampToValueAtTime(0.24, t + 0.02);
      bGain.gain.exponentialRampToValueAtTime(0.001, t + stepSec * 1.7);
      bOsc.connect(bGain);
      bGain.connect(master);
      bOsc.start(t);
      bOsc.stop(t + stepSec * 1.8);
      activeNodes.push(bOsc);
    }

    // Arpeggio shimmer
    const arpFreq = chord[s % chord.length]! * 2;
    const aOsc = ctx.createOscillator();
    const aGain = ctx.createGain();
    aOsc.type = 'sine';
    aOsc.frequency.setValueAtTime(arpFreq, t);
    aGain.gain.setValueAtTime(0.001, t);
    aGain.gain.linearRampToValueAtTime(0.06, t + 0.015);
    aGain.gain.exponentialRampToValueAtTime(0.001, t + stepSec * 0.9);
    aOsc.connect(aGain);
    aGain.connect(master);
    aOsc.start(t);
    aOsc.stop(t + stepSec * 0.95);
    activeNodes.push(aOsc);
  }

  return () => {
    try {
      master.disconnect();
    } catch {
      // already disconnected
    }
  };
}
