import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  health() {
    return {
      ok: true,
      service: 'shad-clinic-api',
      timestamp: new Date().toISOString()
    };
  }
}
