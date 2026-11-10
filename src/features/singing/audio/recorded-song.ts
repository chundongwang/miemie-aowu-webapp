export type RecordedSong = {
  id: string;
  title: string;
  audioUrl: string;
  instrumentalUrl?: string;
  beatsUrl?: string;
  lyricsUrl: string;
  referenceUrl: string;
  performanceUrl?: string;
  durationSeconds: number;
  sourceType: string;
  containsOriginalVocals: boolean;
};
