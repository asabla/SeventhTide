type Cue = "rope" | "brace" | "channel";

let audio: AudioContext | undefined;
let enabled = false;

export function soundToggle(button: HTMLElement, indicator: HTMLElement) {
  if (!window.AudioContext) {
    button.hidden = true;
    return;
  }
  button.addEventListener("click", () => {
    enabled = !enabled;
    button.setAttribute("aria-pressed", String(enabled));
    indicator.textContent = enabled ? "on" : "off";
    if (!enabled) return;
    audio ??= new AudioContext();
    void audio.resume().then(
      () => playCue("brace"),
      () => undefined,
    );
  });
}

export function playCue(cue: Cue) {
  if (!enabled || !audio || audio.state !== "running") return;
  const ctx = audio;
  const now = ctx.currentTime;
  if (cue === "channel") {
    tone(ctx, now, 392, 0.34);
    tone(ctx, now + 0.14, 587, 0.48);
    return;
  }

  const rope = cue === "rope";
  const duration = rope ? 0.4 : 0.14;
  const buffer = ctx.createBuffer(
    1,
    Math.ceil(ctx.sampleRate * duration),
    ctx.sampleRate,
  );
  const samples = buffer.getChannelData(0);
  for (let i = 0; i < samples.length; i++) {
    const friction = rope ? 0.55 + 0.45 * Math.sin(i / 170) : 1;
    samples[i] = (2 * Math.random() - 1) * friction;
  }
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.Q.value = rope ? 3 : 1.5;
  filter.frequency.setValueAtTime(rope ? 580 : 340, now);
  filter.frequency.exponentialRampToValueAtTime(
    rope ? 190 : 85,
    now + duration,
  );
  const gain = envelope(
    ctx,
    now,
    rope ? 0.09 : 0.006,
    duration,
    rope ? 0.23 : 0.34,
  );
  source.connect(filter).connect(gain);
  source.start(now);
  if (!rope) tone(ctx, now, 122, 0.1);
}

function envelope(
  ctx: AudioContext,
  start: number,
  attack: number,
  duration: number,
  volume: number,
) {
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + attack);
  gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
  gain.connect(ctx.destination);
  return gain;
}

function tone(
  ctx: AudioContext,
  start: number,
  pitch: number,
  duration: number,
) {
  const sound = ctx.createOscillator();
  sound.frequency.value = pitch;
  sound.connect(envelope(ctx, start, 0.006, duration, 0.075));
  sound.start(start);
  sound.stop(start + duration);
}
