/**
 * Marimba notes for the store link on the consent page, synthesized with Web Audio (no files).
 * One soft note per permission as its check appears, then a two-note close once the store is
 * really linked, or a muted low double knock when it fails. Same instrument both ways: success
 * climbs high, failure stays low and dull. Quiet on purpose: it backs up what the screen shows.
 */

interface Note {
  frequency: number;
  /** Seconds after the call. */
  offset: number;
  peak: number;
  /** Seconds the fundamental rings; defaults to the marimba's own. */
  ring?: number;
}

/** C5, E5 and G5: the three permissions climb a major triad. */
const PERMISSION_NOTES = [523.3, 659.3, 784];
/** G5 then C6 close the triad an octave up. */
const LINKED_NOTES: Note[] = [
  { frequency: 784, offset: 0, peak: 0.35 },
  { frequency: 1046.5, offset: 0.08, peak: 0.4 },
];
/** G3 twice, short: a knock on wood, "try again" rather than an alarm. */
const FAILED_NOTES: Note[] = [
  { frequency: 196, offset: 0, peak: 0.5, ring: 0.18 },
  { frequency: 196, offset: 0.12, peak: 0.45, ring: 0.22 },
];
/** Low-pass that muffles the knock so it stays dull. */
const FAILED_MUFFLE_FREQUENCY = 900;

const MASTER_GAIN = 0.2;
/** The CSS starts each check's pop 240ms before its third of the link; the note lands as the check shows. */
const CHECK_LEAD_SECONDS = 0.2;
/** Lets the last note ring out before the context is released. */
const RELEASE_MILLISECONDS = 1000;

interface Overtone {
  ratio: number;
  decay: number;
  gain: number;
}

/** A marimba bar: a short fundamental plus the bright, fast-dying overtones of struck wood. */
const MARIMBA: Overtone[] = [
  { ratio: 1, decay: 0.35, gain: 1 },
  { ratio: 4, decay: 0.06, gain: 0.35 },
  { ratio: 10, decay: 0.02, gain: 0.08 },
];

function strike(audioContext: AudioContext, output: AudioNode, note: Note, at: number) {
  for (const overtone of MARIMBA) {
    const decay = overtone.ratio === 1 && note.ring ? note.ring : overtone.decay;
    const oscillator = audioContext.createOscillator();
    const envelope = audioContext.createGain();
    oscillator.frequency.value = note.frequency * overtone.ratio;
    envelope.gain.setValueAtTime(0.0001, at);
    envelope.gain.exponentialRampToValueAtTime(note.peak * overtone.gain, at + 0.005);
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + decay);
    oscillator.connect(envelope).connect(output);
    oscillator.start(at);
    oscillator.stop(at + decay + 0.05);
  }
}

function play(audioContext: AudioContext, output: AudioNode, notes: Note[]) {
  const at = audioContext.currentTime + 0.02;
  for (const note of notes) {
    strike(audioContext, output, note, at + note.offset);
  }
}

export interface LinkChime {
  /** Plays the closing notes; call it only once the server confirmed the link. */
  linked: () => void;
  /** Cuts the permission notes still to come and knocks twice. */
  failed: () => void;
}

const SILENT: LinkChime = { linked: () => {}, failed: () => {} };

/**
 * The chime only backs up what the screen shows, so a context the browser refuses to resume or
 * close leaves the page silent instead of failing the link.
 */
async function settleAudio(operation: () => Promise<void>): Promise<void> {
  try {
    await operation();
  } catch {
    // Audio is optional here: on failure the link simply plays no sound.
  }
}

/**
 * Schedules the permission notes across `linkMilliseconds`, matching the CSS checks. Must start from the
 * submit gesture so the browser lets audio play; without Web Audio it stays silent.
 */
export function startLinkChime(linkMilliseconds: number): LinkChime {
  if (typeof AudioContext === "undefined") {
    return SILENT;
  }

  const audioContext = new AudioContext();
  // Form validation runs before this, so the context can start suspended even within the gesture.
  void settleAudio(() => audioContext.resume());
  const master = audioContext.createGain();
  master.gain.value = MASTER_GAIN;
  master.connect(audioContext.destination);
  // Its own bus, so a failure can silence the notes still scheduled without touching the knock.
  const permissions = audioContext.createGain();
  permissions.connect(master);

  const start = audioContext.currentTime + 0.05;
  const linkSeconds = linkMilliseconds / 1000;
  PERMISSION_NOTES.forEach((frequency, index) => {
    const at = start + (linkSeconds * (index + 1)) / 3 - CHECK_LEAD_SECONDS;
    strike(audioContext, permissions, { frequency, offset: 0, peak: 0.3 }, at);
  });

  // linked() and failed() can both run, and closing a closed context rejects.
  let isReleased = false;
  const release = () => {
    if (isReleased) {
      return;
    }
    isReleased = true;
    setTimeout(() => void settleAudio(() => audioContext.close()), RELEASE_MILLISECONDS);
  };

  return {
    linked: () => {
      play(audioContext, master, LINKED_NOTES);
      release();
    },
    failed: () => {
      // A short fade rather than a hard cut, which would click.
      permissions.gain.setTargetAtTime(0, audioContext.currentTime, 0.01);
      const muffle = audioContext.createBiquadFilter();
      muffle.type = "lowpass";
      muffle.frequency.value = FAILED_MUFFLE_FREQUENCY;
      muffle.connect(master);
      play(audioContext, muffle, FAILED_NOTES);
      release();
    },
  };
}
