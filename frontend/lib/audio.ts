'use client';

let audioContext: AudioContext | null = null;

const ensureContext = () => {
  if (typeof window === "undefined") return null;
  if (!audioContext) {
    const AudioContextCtor =
      window.AudioContext ??
      ((window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext);
    if (!AudioContextCtor) return null;
    audioContext = new AudioContextCtor();
  }
  return audioContext;
};

const playTone = (frequency: number, durationMs: number) => {
  const ctx = ensureContext();
  if (!ctx) return;

  const oscillator = ctx.createOscillator();
  const gainNode = ctx.createGain();

  oscillator.type = "sine";
  oscillator.frequency.value = frequency;

  gainNode.gain.value = 0.12;

  oscillator.connect(gainNode);
  gainNode.connect(ctx.destination);

  const now = ctx.currentTime;
  oscillator.start(now);
  oscillator.stop(now + durationMs / 1000);
};

export const playCue = (kind: "success" | "error") => {
  if (typeof window === "undefined") return;

  if (kind === "success") {
    playTone(880, 90);
  } else {
    playTone(220, 220);
  }
};

export const playToolCue = (result: { success: boolean }) => {
  playCue(result.success ? "success" : "error");
};
