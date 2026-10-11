// A soft two-note chime, synthesized so there is no audio file to ship or cache.
const NOTES = [
  { frequency: 880, delay: 0 },
  { frequency: 1318.5, delay: 0.09 },
];
const PEAK_GAIN = 0.06;
const ATTACK = 0.012;
const DECAY = 0.45;

let context: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === "undefined" || !("AudioContext" in window)) {
    return null;
  }
  context ??= new AudioContext();
  return context;
}

/**
 * Browsers keep audio suspended until the user interacts with the page,
 * so the context is unlocked on the first click or key press.
 */
export async function unlockNotificationSound(): Promise<void> {
  const audio = getContext();
  if (!audio || audio.state !== "suspended") {
    return;
  }
  try {
    await audio.resume();
  } catch {
    // Still locked: the chime stays silent and the next interaction tries again.
  }
}

function playNote(audio: AudioContext, frequency: number, start: number) {
  const oscillator = audio.createOscillator();
  const gain = audio.createGain();
  oscillator.type = "sine";
  oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(PEAK_GAIN, start + ATTACK);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + ATTACK + DECAY);
  oscillator.connect(gain).connect(audio.destination);
  oscillator.start(start);
  oscillator.stop(start + ATTACK + DECAY + 0.05);
}

/** Plays the chime; silently does nothing while audio is still locked. */
export function playNotificationSound() {
  const audio = getContext();
  if (!audio || audio.state !== "running") {
    return;
  }
  for (const note of NOTES) {
    playNote(audio, note.frequency, audio.currentTime + note.delay);
  }
}
