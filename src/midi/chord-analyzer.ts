// src/midi/chord-analyzer.ts

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

interface ChordDefinition {
  name: string;
  intervals: number[];
}

// 構成音が多い順（複雑な順）にソートしておく
const CHORD_DEFINITIONS: ChordDefinition[] = [
  // 9th, 11th, 13th...
  { name: "maj9", intervals: [0, 4, 7, 11, 14] }, // 14はオクターブ上の2
  { name: "9", intervals: [0, 4, 7, 10, 14] },
  { name: "min9", intervals: [0, 3, 7, 10, 14] },
  
  // 7th Chords
  { name: "maj7", intervals: [0, 4, 7, 11] },
  { name: "min7", intervals: [0, 3, 7, 10] },
  { name: "7", intervals: [0, 4, 7, 10] },
  { name: "m7b5", intervals: [0, 3, 6, 10] },
  { name: "dim7", intervals: [0, 3, 6, 9] },

  // Triads
  { name: "maj", intervals: [0, 4, 7] },
  { name: "min", intervals: [0, 3, 7] },
  { name: "dim", intervals: [0, 3, 6] },
  { name: "aug", intervals: [0, 4, 8] },
  { name: "sus4", intervals: [0, 5, 7] },
  { name: "sus2", intervals: [0, 2, 7] },
];

// テンションノートの命名規則
const TENSION_NAMES = new Map<number, string>([
  [1, "b9"],
  [2, "9"],
  [3, "#9"],
  [5, "11"],
  [6, "#11"],
  [8, "b13"],
  [9, "13"],
]);

/**
 * MIDIノート番号の配列からコード名を特定する
 * @param noteNumbers - 同時に鳴っているノートのMIDI番号配列
 * @returns コード名 (例: "Cmaj7", "G7/B") or null
 */
function identifyChord(noteNumbers: number[]): string | null {
  if (noteNumbers.length < 3) return null;

  const pitchClasses = [...new Set(noteNumbers.map(n => n % 12))];

  for (const potentialRoot of pitchClasses) {
    const intervals = pitchClasses.map(pc => (pc - potentialRoot + 12) % 12).sort((a, b) => a - b);

    // 複雑なコード定義から順番にチェック
    for (const definition of CHORD_DEFINITIONS) {
      // 演奏音がコード定義の音をすべて含んでいるかチェック
      const isMatch = definition.intervals.every(defInterval => {
        // オクターブを考慮してチェック (例: 9thは14だが、2としても扱えるように)
        return intervals.includes(defInterval) || intervals.includes(defInterval % 12);
      });

      if (isMatch) {
        const rootName = NOTE_NAMES[potentialRoot];
        let chordName = `${rootName}${definition.name}`;

        // テンションやaddノートを検出
        const definitionIntervals = definition.intervals.map(i => i % 12);
        const remainingIntervals = intervals.filter(int => !definitionIntervals.includes(int));
        
        const tensions: string[] = [];
        for (const interval of remainingIntervals) {
            if (TENSION_NAMES.has(interval)) {
                tensions.push(TENSION_NAMES.get(interval)!);
            }
        }
        if (tensions.length > 0) {
            chordName += `(${tensions.join(',')})`;
        }

        // ベース音をチェックしてオンコードを判定
        const bassNote = Math.min(...noteNumbers) % 12;
        if (bassNote !== potentialRoot) {
          chordName += `/${NOTE_NAMES[bassNote]}`;
        }
        
        return chordName; // 最も複雑で最初に一致したものを返す
      }
    }
  }
  return null;
}

export interface ChordEvent {
  startTime: number; // 開始ティック
  endTime: number;   // 終了ティック
  chordName: string; // コード名
  notes: number[];   // 構成音のMIDI番号
}

export function analyzeChords(events: any[], ppq: number, groupingThresholdMs: number = 50): ChordEvent[] {
  const noteOnEvents = events
    .filter(e => e.type === 'noteOn' && e.velocity > 0)
    .sort((a, b) => a.tick - b.tick);

  if (noteOnEvents.length === 0) {
    return [];
  }

  // Find the first tempo event to calculate time differences. Default to 120 BPM.
  let tempo = 120;
  const tempoEvent = events.find(e => e.type === 'meta' && e.subtype === 'setTempo');
  if (tempoEvent) {
    tempo = 60000000 / tempoEvent.microsecondsPerBeat;
  }
  const tickToMs = (tick: number) => (tick / ppq) * (60000 / tempo);

  const clusters: { notes: number[], tick: number }[] = [];
  if (noteOnEvents.length > 0) {
    let currentCluster = { notes: [noteOnEvents[0].noteNumber], tick: noteOnEvents[0].tick };

    for (let i = 1; i < noteOnEvents.length; i++) {
      const prevNote = noteOnEvents[i-1];
      const currentNote = noteOnEvents[i];
      const timeDiff = tickToMs(currentNote.tick - prevNote.tick);

      if (timeDiff < groupingThresholdMs) {
        currentCluster.notes.push(currentNote.noteNumber);
      } else {
        clusters.push(currentCluster);
        currentCluster = { notes: [currentNote.noteNumber], tick: currentNote.tick };
      }
    }
    clusters.push(currentCluster);
  }

  const chordProgression: ChordEvent[] = [];

  for (const cluster of clusters) {
    const chordName = identifyChord(cluster.notes);
    if (chordName) {
      if (chordProgression.length > 0) {
        const lastChord = chordProgression[chordProgression.length - 1];
        // Avoid adding duplicate chords in a row
        if (lastChord.chordName === chordName) {
            continue;
        }
        lastChord.endTime = cluster.tick;
      }
      chordProgression.push({
        startTime: cluster.tick,
        endTime: -1, // Placeholder, will be set by the next chord or at the end
        chordName,
        notes: cluster.notes,
      });
    }
  }

  if (chordProgression.length > 0) {
    const lastEventTick = noteOnEvents[noteOnEvents.length - 1].tick;
    chordProgression[chordProgression.length - 1].endTime = lastEventTick;
  }

  return chordProgression;
}
