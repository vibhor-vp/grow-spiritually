import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaService } from './prisma.service';
import { SarvamController } from './sarvam.controller';
import { SarvamService } from './sarvam.service';

@Module({
  imports: [],
  controllers: [AppController, SarvamController],
  providers: [AppService, PrismaService, SarvamService],
})
export class AppModule {}
