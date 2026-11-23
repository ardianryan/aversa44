/** Short synthesized transition sounds, scheduled on the same timeline as the canvas. */
export function scheduleStudioSfx(ctx: AudioContext, destination: AudioNode, times: number[], duration = 0.4) {
  for (const time of times) {
    const length = Math.round(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    const source = ctx.createBufferSource(); source.buffer = buffer;
    const filter = ctx.createBiquadFilter(); filter.type = 'bandpass'; filter.Q.value = 1.2;
    const start = ctx.currentTime + Math.max(0, time);
    filter.frequency.setValueAtTime(350, start);
    filter.frequency.exponentialRampToValueAtTime(2400, start + duration * 0.8);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.linearRampToValueAtTime(0.13, start + duration * 0.3);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    source.connect(filter).connect(gain).connect(destination);
    source.start(start); source.stop(start + duration + 0.01);
  }
}
