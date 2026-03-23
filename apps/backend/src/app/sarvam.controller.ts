import {
  BadRequestException,
  Body,
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { SarvamService } from './sarvam.service';

@Controller('sarvam')
export class SarvamController {
  constructor(private readonly sarvamService: SarvamService) {}

  @Post('speech-to-text')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: 15 * 1024 * 1024,
      },
    }),
  )
  async speechToText(
    @UploadedFile()
    file:
      | {
          buffer: Buffer;
          originalname?: string;
          mimetype?: string;
        }
      | undefined,
    @Body()
    body: {
      model?: string;
      mode?: string;
      languageCode?: string;
    },
  ) {
    if (!file) {
      throw new BadRequestException('Audio file is required.');
    }

    return this.sarvamService.transcribe({
      fileBuffer: file.buffer,
      fileName: file.originalname || 'speech.webm',
      mimeType: file.mimetype || 'audio/webm',
      model: body.model,
      mode: body.mode,
      languageCode: body.languageCode,
    });
  }
}
