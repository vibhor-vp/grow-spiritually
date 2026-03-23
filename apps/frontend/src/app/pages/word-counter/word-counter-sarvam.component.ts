import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  computed,
  inject,
  signal,
} from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { environment } from 'apps/frontend/src/environments/environment';

type TimerPreset = {
  label: string;
  value: string;
  totalSeconds: number;
};

type SarvamTranscriptionResponse = {
  request_id?: string | null;
  transcript?: string | null;
  language_code?: string | null;
  language_probability?: number | null;
};

type QueuedTranscription = {
  audioChunk: Blob;
  sessionId: number;
};

@Component({
  selector: 'app-word-counter-sarvam',
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
export class SarvamWordCounterComponent implements OnDestroy {
  private readonly http = inject(HttpClient);

  private intervalId: number | null = null;
  private recordingStopTimeoutId: number | null = null;
  private audioContext: AudioContext | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private microphoneStream: MediaStream | null = null;
  private transcriptionQueue: QueuedTranscription[] = [];
  private isProcessingChunk = false;
  private currentSessionId = 0;
  private acceptedSessionId: number | null = null;
  private readonly chunkDurationMs = 4000;
  private readonly sarvamConfig = {
    model: 'saaras:v3',
    mode: 'transcribe',
    languageCode: 'hi-IN',
  } as const;

  protected readonly presets: TimerPreset[] = [
    { label: 'राम', value: 'राम', totalSeconds: 5 * 60 },
    { label: 'राधा', value: 'राधा', totalSeconds: 15 * 60 },
  ];

  protected readonly selectedPreset = signal('राम');
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
    const hasTarget = this.targetWord().length > 0;

    return !this.isRunning() && hasTime && hasTarget;
  });

  protected readonly listeningStatus = computed(() => {
    if (!this.speechSupported()) {
      return 'MediaRecorder or microphone access is not supported on this browser.';
    }

    if (this.speechError()) {
      return this.speechError();
    }

    if (this.isListening()) {
      return `Listening for "${this.targetWord().trim()}" via Sarvam STT`;
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
    this.stopSpeechCapture();
    this.audioContext?.close().catch(() => undefined);
  }

  protected onPresetChange(presetValue: string): void {
    this.selectedPreset.set(presetValue);

    const preset = this.presets.find((item) => item.value === presetValue);
    if (!preset) {
      return;
    }

    this.updateTargetWord(preset.value);
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

    this.currentSessionId += 1;
    this.acceptedSessionId = this.currentSessionId;
    this.transcriptionQueue = [];
    this.targetWordCount.set(0);
    this.finalWordCount.set(null);
    this.liveTranscript.set('');
    this.speechError.set(null);
    this.isRunning.set(true);
    this.clearTimer();
    void this.startSpeechCapture(this.currentSessionId);

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
    this.acceptedSessionId = null;
    this.transcriptionQueue = [];
    this.stopSpeechCapture();
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
    const finishedSessionId = this.acceptedSessionId;
    this.isRunning.set(false);
    this.clearTimer();
    this.isListening.set(false);
    this.finalWordCount.set(this.targetWordCount());
    void this.playCompletionSound();
    this.stopSpeechCapture();

    if (finishedSessionId !== this.acceptedSessionId) {
      this.finalWordCount.set(this.targetWordCount());
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

    if (this.recordingStopTimeoutId !== null) {
      window.clearTimeout(this.recordingStopTimeoutId);
      this.recordingStopTimeoutId = null;
    }
  }

  private hasSpeechSupport(): boolean {
    return Boolean(
      typeof window !== 'undefined' &&
        typeof navigator !== 'undefined' &&
        typeof MediaRecorder !== 'undefined' &&
        navigator.mediaDevices,
    );
  }

  private async startSpeechCapture(sessionId: number): Promise<void> {
    if (!this.speechSupported()) {
      this.speechError.set(
        'MediaRecorder or microphone access is not supported on this browser.',
      );
      return;
    }

    this.stopSpeechCapture();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.microphoneStream = stream;
      this.startRecorderSegment(stream, sessionId);
    } catch {
      this.isListening.set(false);
      this.speechError.set('Microphone access failed.');
    }
  }

  private stopSpeechCapture(): void {
    if (this.recordingStopTimeoutId !== null) {
      window.clearTimeout(this.recordingStopTimeoutId);
      this.recordingStopTimeoutId = null;
    }

    const recorder = this.mediaRecorder;
    const stream = this.microphoneStream;
    this.mediaRecorder = null;
    this.microphoneStream = null;

    if (recorder && recorder.state !== 'inactive') {
      recorder.stop();
    } else {
      stream?.getTracks().forEach((track) => track.stop());
    }

    this.isListening.set(false);
  }

  private startRecorderSegment(stream: MediaStream, sessionId: number): void {
    const mimeType = this.resolveRecorderMimeType();
    const recorder = mimeType
      ? new MediaRecorder(stream, { mimeType })
      : new MediaRecorder(stream);

    recorder.ondataavailable = (event) => {
      // Later segments can be tiny or empty right around stop/start boundaries.
      if (event.data.size < 1024) {
        return;
      }

      this.transcriptionQueue.push({ audioChunk: event.data, sessionId });
      void this.processNextChunk();
    };

    recorder.onerror = () => {
      this.isListening.set(false);
      this.speechError.set('Microphone capture failed while recording audio.');
    };

    recorder.onstart = () => {
      this.isListening.set(true);
    };

    recorder.onstop = () => {
      this.isListening.set(false);
      if (this.mediaRecorder === recorder) {
        this.mediaRecorder = null;
      }

      if (
        this.isRunning() &&
        this.acceptedSessionId === sessionId &&
        this.microphoneStream === stream &&
        stream.active
      ) {
        this.startRecorderSegment(stream, sessionId);
        return;
      }

      stream.getTracks().forEach((track) => track.stop());
    };

    this.mediaRecorder = recorder;
    recorder.start();
    this.recordingStopTimeoutId = window.setTimeout(() => {
      if (this.mediaRecorder === recorder && recorder.state === 'recording') {
        recorder.stop();
      }
    }, this.chunkDurationMs);
  }

  private async processNextChunk(): Promise<void> {
    if (this.isProcessingChunk) {
      return;
    }

    const nextChunk = this.transcriptionQueue.shift();
    if (!nextChunk) {
      return;
    }

    this.isProcessingChunk = true;

    try {
      await this.transcribeChunk(nextChunk);
    } finally {
      this.isProcessingChunk = false;

      if (this.transcriptionQueue.length > 0) {
        void this.processNextChunk();
      }
    }
  }

  private async transcribeChunk({
    audioChunk,
    sessionId,
  }: QueuedTranscription): Promise<void> {
    const formData = new FormData();
    const fileName = this.buildChunkFilename(audioChunk.type);

    formData.append('file', audioChunk, fileName);
    formData.append('model', this.sarvamConfig.model);
    formData.append('mode', this.sarvamConfig.mode);
    formData.append('languageCode', this.sarvamConfig.languageCode);

    try {
      const response = await firstValueFrom(
        this.http.post<SarvamTranscriptionResponse>(
          `${environment.apiUrl}/sarvam/speech-to-text`,
          formData,
        ),
      );

      if (this.acceptedSessionId !== sessionId) {
        return;
      }

      const transcript = response.transcript?.trim() ?? '';
      if (!transcript) {
        return;
      }

      this.liveTranscript.set(transcript);

      const matchCount = this.countMatches(transcript);
      if (matchCount <= 0) {
        return;
      }

      this.targetWordCount.update((count) => {
        const nextCount = count + matchCount;

        if (!this.isRunning()) {
          this.finalWordCount.set(nextCount);
        }

        return nextCount;
      });
    } catch {
      if (this.acceptedSessionId === sessionId) {
        this.speechError.set('Sarvam speech-to-text request failed.');
      }
    }
  }

  private buildChunkFilename(mimeType: string): string {
    const extension =
      mimeType.includes('webm')
        ? 'webm'
        : mimeType.includes('ogg')
          ? 'ogg'
          : 'wav';

    return `speech-chunk.${extension}`;
  }

  private resolveRecorderMimeType(): string | null {
    const supportedMimeTypes = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus',
      'audio/ogg',
    ];

    return (
      supportedMimeTypes.find((mimeType) =>
        MediaRecorder.isTypeSupported(mimeType),
      ) ?? null
    );
  }

  private countMatches(transcript: string): number {
    const escapedTarget = this.escapeRegExp(this.targetWord().trim());
    if (!escapedTarget) {
      return 0;
    }

    const matchRegex = new RegExp(
      `(^|[\\s,.;:!?()"'-]|[।॥])${escapedTarget}(?=$|[\\s,.;:!?()"'-]|[।॥])`,
      'gu',
    );

    return (transcript.match(matchRegex) || []).length;
  }

  private escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private async playCompletionSound(): Promise<void> {
    const audioContext = this.audioContext ?? new window.AudioContext();
    this.audioContext = audioContext;

    if (audioContext.state === 'suspended') {
      await audioContext.resume();
    }

    const beeps = [0, 0.22, 0.44, 0.66, 0.88, 1.10, 1.32, 1.54];

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
