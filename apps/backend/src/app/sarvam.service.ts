import {
  BadGatewayException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';

type SarvamSpeechToTextOptions = {
  fileBuffer: Buffer;
  fileName: string;
  mimeType: string;
  model?: string;
  mode?: string;
  languageCode?: string;
};

@Injectable()
export class SarvamService {
  private readonly endpoint = 'https://api.sarvam.ai/speech-to-text';

  async transcribe(options: SarvamSpeechToTextOptions) {
    const apiKey = process.env.SARVAM_API_SUBSCRIPTION_KEY;
    if (!apiKey) {
      throw new InternalServerErrorException(
        'SARVAM_API_SUBSCRIPTION_KEY is not configured.',
      );
    }

    const formData = new FormData();
    const audioBytes = new Uint8Array(options.fileBuffer);
    const audioFile = new Blob([audioBytes], {
      type: options.mimeType || 'audio/webm',
    });

    formData.append('file', audioFile, options.fileName || 'speech.webm');
    formData.append('model', options.model || 'saaras:v3');
    formData.append('mode', options.mode || 'transcribe');
    formData.append('language_code', options.languageCode || 'hi-IN');

    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'api-subscription-key': apiKey,
      },
      body: formData,
    });

    const rawBody = await response.text();
    const payload = this.parseJsonSafely(rawBody);

    if (!response.ok) {
      throw new BadGatewayException(
        payload?.message ||
          payload?.detail ||
          payload?.error ||
          rawBody ||
          `Sarvam API request failed with status ${response.status}.`,
      );
    }

    return payload;
  }

  private parseJsonSafely(value: string): Record<string, unknown> | null {
    if (!value) {
      return null;
    }

    try {
      return JSON.parse(value) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
}
