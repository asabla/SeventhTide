type Cue =
  | "rope"
  | "brace"
  | "channel"
  | "wake"
  | "wake-bell"
  | "buoy-chain"
  | "buoy-echo";

let audio: AudioContext | undefined;
let output: GainNode | undefined;
let enabled = false;

export function soundToggle(
  button: HTMLElement,
  indicator: HTMLElement,
  preview: () => Cue,
) {
  if (!window.AudioContext) {
    button.hidden = true;
    return;
  }
  button.addEventListener("click", () => {
    enabled = !enabled;
    button.setAttribute("aria-pressed", String(enabled));
    indicator.textContent = enabled ? "on" : "off";
    if (audio && output)
      output.gain.setTargetAtTime(enabled ? 1 : 0, audio.currentTime, 0.025);
    if (!enabled) return;
    if (!audio) {
      audio = new AudioContext();
      output = audio.createGain();
      output.connect(audio.destination);
    }
    void audio.resume().then(
      () => playCue(preview()),
      () => undefined,
    );
  });
}

export function playCue(cue: Cue) {
  if (!enabled || !audio || audio.state !== "running") return;
  const ctx = audio;
  const now = ctx.currentTime;
  if (cue === "buoy-chain" || cue === "buoy-echo") {
    const chainFirst = cue === "buoy-chain";
    const chain = now + (chainFirst ? 0 : 0.55);
    const bell = now + (chainFirst ? 0.55 : 0);
    for (const beat of [chain, chain + 0.19])
      noise(ctx, beat, {
        duration: 0.16,
        attack: 0.007,
        volume: 0.35,
        pitch: [550, 180],
        resonance: 2.2,
      });
    tone(ctx, bell, 205, 0.68, 0.09);
    tone(ctx, bell, chainFirst ? 342 : 319, 0.48, 0.065);
    tone(ctx, bell, 527, 0.23, 0.035);
    return;
  }
  if (cue === "channel") {
    tone(ctx, now, 392, 0.34);
    tone(ctx, now + 0.14, 587, 0.48);
    return;
  }
  if (cue === "wake") {
    noise(ctx, now, {
      duration: 0.78,
      attack: 0.12,
      volume: 0.15,
      pitch: [610, 140],
      resonance: 0.7,
    });
    creak(ctx, now + 0.14);
    // The surf falls away before the knock under the raft.
    noise(ctx, now + 1.02, {
      duration: 0.35,
      attack: 0.006,
      volume: 0.42,
      pitch: [280, 80],
      resonance: 2,
    });
    tone(ctx, now + 1.02, 91, 0.27, 0.1);
    return;
  }
  if (cue === "wake-bell") {
    for (const [pitch, duration, volume] of [
      [186, 1.5, 0.09],
      [311, 0.85, 0.065],
      [435, 0.42, 0.04],
    ] as const)
      tone(ctx, now, pitch, duration, volume);
    tone(ctx, now + 0.54, 311, 0.7, 0.018);
    return;
  }
  if (cue === "rope") {
    creak(ctx, now);
    return;
  }
  noise(ctx, now, {
    duration: 0.14,
    attack: 0.006,
    volume: 0.34,
    pitch: [340, 85],
    resonance: 1.5,
  });
  tone(ctx, now, 122, 0.1);
}

function creak(ctx: AudioContext, start: number) {
  noise(ctx, start, {
    duration: 0.4,
    attack: 0.09,
    volume: 0.23,
    pitch: [580, 190],
    resonance: 3,
    rope: true,
  });
}

function noise(
  ctx: AudioContext,
  start: number,
  {
    duration,
    attack,
    volume,
    pitch,
    resonance,
    rope,
  }: {
    duration: number;
    attack: number;
    volume: number;
    pitch: [number, number];
    resonance: number;
    rope?: boolean;
  },
) {
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
  filter.Q.value = resonance;
  filter.frequency.setValueAtTime(pitch[0], start);
  filter.frequency.exponentialRampToValueAtTime(pitch[1], start + duration);
  source
    .connect(filter)
    .connect(envelope(ctx, start, attack, duration, volume));
  source.start(start);
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
  if (output) gain.connect(output);
  return gain;
}

function tone(
  ctx: AudioContext,
  start: number,
  pitch: number,
  duration: number,
  volume = 0.075,
) {
  const sound = ctx.createOscillator();
  sound.frequency.value = pitch;
  sound.connect(envelope(ctx, start, 0.006, duration, volume));
  sound.start(start);
  sound.stop(start + duration);
}
