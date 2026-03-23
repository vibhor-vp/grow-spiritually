import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  computed,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';

type TimerPreset = {
  label: string;
  value: string;
  totalSeconds: number;
};

type SpeechRecognitionAlternative = {
  transcript: string;
};

type SpeechRecognitionResultLike = {
  isFinal: boolean;
  0: SpeechRecognitionAlternative;
};

type SpeechRecognitionEventLike = Event & {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
};

type SpeechRecognitionLike = EventTarget & {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: Event) => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

@Component({
  selector: 'app-word-counter',
  standalone: true,
  imports: [
    FormsModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
  ],
  templateUrl: './word-counter.component.html',
  styleUrl: './word-counter.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WordCounterComponent implements OnDestroy {
  private intervalId: number | null = null;
  private audioContext: AudioContext | null = null;
  private recognition: SpeechRecognitionLike | null = null;
  private shouldRestartRecognition = false;
  private isClosingSession = false;

  protected readonly presets: TimerPreset[] = [
    { label: 'राम', value: 'राम', totalSeconds: 5 * 60 },
    { label: 'राधा', value: 'राधा', totalSeconds: 15 * 60 },
    // { label: '30 minutes', value: '30-min', totalSeconds: 30 * 60 },
    // { label: '1 hour', value: '60-min', totalSeconds: 60 * 60 },
  ];

  protected readonly selectedPreset = signal('15-min');
  protected readonly hours = signal(0);
  protected readonly minutes = signal(0);
  protected readonly seconds = signal(30);
  protected readonly remainingSeconds = signal(30);
  protected readonly isRunning = signal(false);
  protected readonly targetWord = signal('राम');
  protected readonly liveTranscript = signal('');
  protected readonly targetWordCount = signal(0);
  protected readonly finalWordCount = signal<number | null>(null);
  protected readonly isListening = signal(false);
  protected readonly speechSupported = signal(this.hasSpeechSupport());
  protected readonly speechError = signal<string | null>(null);

  protected readonly totalSeconds = computed(
    () => this.hours() * 3600 + this.minutes() * 60 + this.seconds(),
  );

  protected readonly displayTime = computed(() =>
    [this.displayHours(), this.displayMinutes(), this.displaySeconds()].join(':'),
  );

  protected readonly progress = computed(() => {
    const total = this.totalSeconds();
    if (total <= 0) {
      return 0;
    }

    const elapsed = total - this.remainingSeconds();
    return Math.min(100, Math.max(0, (elapsed / total) * 100));
  });

  protected readonly canStart = computed(() => {
    const hasTime = this.remainingSeconds() > 0;
    // const hasTarget = this.normalizeText(this.targetWord()).length > 0;
    const hasTarget = this.targetWord().length > 0;

    return !this.isRunning() && hasTime && hasTarget;
  });

  protected readonly listeningStatus = computed(() => {
    if (!this.speechSupported()) {
      return 'Speech recognition is not supported on this browser.';
    }

    if (this.speechError()) {
      return this.speechError();
    }

    if (this.isListening()) {
      return `Listening for "${this.targetWord().trim()}"`;
    }

    if (this.isRunning()) {
      return 'Preparing microphone...';
    }

    return 'Microphone is idle.';
  });

  constructor() {
    this.onPresetChange(this.selectedPreset());
  }

  ngOnDestroy(): void {
    this.clearTimer();
    this.stopRecognition();
    this.audioContext?.close().catch(() => undefined);
  }

  protected onPresetChange(presetValue: string): void {
    this.selectedPreset.set(presetValue);

    const preset = this.presets.find((item) => item.value === presetValue);
    if (!preset) {
      return;
    }

    this.updateTargetWord(preset.value)
    // this.applyTime(preset.totalSeconds);
  }

  protected updateField(
    unit: 'hours' | 'minutes' | 'seconds',
    rawValue: string | number,
  ): void {
    const value = this.parseValue(rawValue, unit === 'hours' ? 23 : 59);

    if (unit === 'hours') {
      this.hours.set(value);
    }

    if (unit === 'minutes') {
      this.minutes.set(value);
    }

    if (unit === 'seconds') {
      this.seconds.set(value);
    }

    if (!this.isRunning()) {
      this.remainingSeconds.set(this.totalSeconds());
    }
  }

  protected updateTargetWord(rawValue: string): void {
    this.targetWord.set(rawValue);
    this.speechError.set(null);
  }

  protected startTimer(): void {
    if (!this.canStart()) {
      return;
    }

    this.isClosingSession = false;
    this.targetWordCount.set(0);
    this.finalWordCount.set(null);
    this.liveTranscript.set('');
    this.speechError.set(null);
    this.isRunning.set(true);
    this.clearTimer();
    this.startRecognition();

    this.intervalId = window.setInterval(() => {
      const nextValue = this.remainingSeconds() - 1;

      if (nextValue <= 0) {
        this.remainingSeconds.set(0);
        this.completeSession();
        return;
      }

      this.remainingSeconds.set(nextValue);
    }, 1000);
  }

  protected pauseTimer(): void {
    this.isRunning.set(false);
    this.clearTimer();
    this.stopRecognition();
  }

  protected resetTimer(): void {
    this.pauseTimer();
    this.remainingSeconds.set(this.totalSeconds());
    this.targetWordCount.set(0);
    this.finalWordCount.set(null);
    this.liveTranscript.set('');
    this.speechError.set(null);
  }

  protected displayHours(): string {
    return String(Math.floor(this.remainingSeconds() / 3600)).padStart(2, '0');
  }

  protected displayMinutes(): string {
    return String(Math.floor((this.remainingSeconds() % 3600) / 60)).padStart(
      2,
      '0',
    );
  }

  protected displaySeconds(): string {
    return String(this.remainingSeconds() % 60).padStart(2, '0');
  }

  private completeSession(): void {
    this.isRunning.set(false);
    this.clearTimer();
    this.shouldRestartRecognition = false;
    this.isClosingSession = true;
    this.isListening.set(false);

    if (!this.recognition) {
      this.finishCompletedSession();
      return;
    }

    // Stop microphone capture immediately but let Web Speech flush any pending final result before onend.
    this.recognition.stop();
  }

  private finishCompletedSession(): void {
    this.isClosingSession = false;
    this.finalWordCount.set(this.targetWordCount());
    void this.playCompletionSound();
  }

  private applyTime(totalSeconds: number): void {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    this.hours.set(hours);
    this.minutes.set(minutes);
    this.seconds.set(seconds);

    if (!this.isRunning()) {
      this.remainingSeconds.set(totalSeconds);
    }
  }

  private parseValue(rawValue: string | number, max: number): number {
    const parsed = Number(rawValue);

    if (!Number.isFinite(parsed)) {
      return 0;
    }

    return Math.max(0, Math.min(max, Math.floor(parsed)));
  }

  private clearTimer(): void {
    if (this.intervalId !== null) {
      window.clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  private hasSpeechSupport(): boolean {
    return Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
  }

  private startRecognition(): void {
    if (!this.speechSupported()) {
      this.speechError.set('Speech recognition is not supported on this browser.');
      return;
    }

    const RecognitionCtor =
      window.SpeechRecognition ?? window.webkitSpeechRecognition;

    if (!RecognitionCtor) {
      return;
    }

    this.stopRecognition();

    const recognition = new RecognitionCtor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'hi-IN';

    recognition.onresult = (event) => {
      let latestTranscript = '';

      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const transcript = result[0]?.transcript ?? '';

        latestTranscript = transcript;
        console.log('[WebSpeech] Heard transcript:', {
          transcript,
          isFinal: result.isFinal,
        });

        if (result.isFinal) {
          const matchCount = this.countMatches(transcript);

          if (matchCount > 0) {
            this.targetWordCount.update((count) => {
              const nextCount = count + matchCount;
              console.log('[WebSpeech] Target word matched:', {
                target: this.targetWord(),
                transcript,
                matchCount,
                totalCount: nextCount,
              });
              return nextCount;
            });
          }
        }
      }

      if (!this.isClosingSession) {
        this.liveTranscript.set(latestTranscript.trim());
      }
    };

    recognition.onend = () => {
      console.log('[WebSpeech] Recognition ended');
      this.isListening.set(false);
      this.recognition = null;

      if (this.isClosingSession) {
        this.finishCompletedSession();
        return;
      }

      if (this.shouldRestartRecognition && this.isRunning()) {
        console.log('[WebSpeech] Restarting recognition');
        recognition.start();
        this.isListening.set(true);
      }
    };

    recognition.onerror = (event) => {
      console.log('[WebSpeech] Recognition error:', event);
      this.shouldRestartRecognition = false;
      this.isListening.set(false);

      if (this.isClosingSession) {
        this.recognition = null;
        this.finishCompletedSession();
        return;
      }

      this.speechError.set('Microphone access failed or speech recognition stopped.');
    };

    this.recognition = recognition;
    this.shouldRestartRecognition = true;
    recognition.start();
    this.isListening.set(true);
  }

  private stopRecognition(): void {
    this.shouldRestartRecognition = false;

    if (!this.recognition) {
      this.isListening.set(false);
      return;
    }

    this.recognition.onend = null;
    this.recognition.onerror = null;
    this.recognition.onresult = null;
    this.recognition.stop();
    this.recognition = null;
    this.isListening.set(false);
    this.isClosingSession = false;
  }

  private countMatches(transcript: string): number {
    const hindiRegex = new RegExp(`(^|\\s)${this.targetWord()}(?=\\s|$)`, "gu");

    const count = (transcript.match(hindiRegex) || []).length;
    return count;
  }

  private normalizeText(value: string): string {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private async playCompletionSound(): Promise<void> {
    const audioContext = this.audioContext ?? new window.AudioContext();
    this.audioContext = audioContext;

    if (audioContext.state === 'suspended') {
      await audioContext.resume();
    }

    const beeps = [0, 0.22, 0.44, 0.66, 0.88];

    for (const offset of beeps) {
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.type = 'sine';
      oscillator.frequency.value = 880;
      gainNode.gain.setValueAtTime(0.0001, audioContext.currentTime + offset);
      gainNode.gain.exponentialRampToValueAtTime(
        0.18,
        audioContext.currentTime + offset + 0.02,
      );
      gainNode.gain.exponentialRampToValueAtTime(
        0.0001,
        audioContext.currentTime + offset + 0.18,
      );

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      oscillator.start(audioContext.currentTime + offset);
      oscillator.stop(audioContext.currentTime + offset + 0.2);
    }
  }
}
