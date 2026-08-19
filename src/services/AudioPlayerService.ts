export class AudioPlayerService {
  private static instance: AudioPlayerService;
  private currentAudio: HTMLAudioElement | null = null;
  private isPlayingState: boolean = false;

  private constructor() {}

  static getInstance(): AudioPlayerService {
    if (!AudioPlayerService.instance) {
      AudioPlayerService.instance = new AudioPlayerService();
    }
    return AudioPlayerService.instance;
  }

  playBlob(blob: Blob): Promise<void> {
    this.stop();
    const url = URL.createObjectURL(blob);
    this.currentAudio = new Audio(url);
    this.isPlayingState = true;

    return new Promise((resolve, reject) => {
      if (!this.currentAudio) return resolve();
      this.currentAudio.onended = () => {
        this.isPlayingState = false;
        URL.revokeObjectURL(url);
        resolve();
      };
      this.currentAudio.onerror = (e) => {
        this.isPlayingState = false;
        URL.revokeObjectURL(url);
        reject(e);
      };
      this.currentAudio.play().catch((err) => {
        this.isPlayingState = false;
        reject(err);
      });
    });
  }

  stop(): void {
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio.currentTime = 0;
      this.currentAudio = null;
    }
    this.isPlayingState = false;
  }

  isPlaying(): boolean {
    return this.isPlayingState;
  }
}

export const audioPlayerService = AudioPlayerService.getInstance();
