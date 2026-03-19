import { Injectable } from '@nestjs/common';

export type HealthResponse = {
  status: 'ok';
  service: 'backend';
  timestamp: string;
};

@Injectable()
export class AppService {
  getHealth(): HealthResponse {
    return {
      status: 'ok',
      service: 'backend',
      timestamp: new Date().toISOString(),
    };
  }
}
