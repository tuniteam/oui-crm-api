import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PgBoss } from 'pg-boss';
import { ApiMessages } from '@/common/messages';

@Injectable()
export class JobsService implements OnModuleInit, OnModuleDestroy {
  private boss: PgBoss;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    const dbUrl = this.configService.get<string>('DATABASE_URL');
    if (!dbUrl) throw new Error(ApiMessages.errors.message.CONFIG_MISSING('DATABASE_URL'));
    this.boss = new PgBoss(dbUrl);
    await this.boss.start();
  }

  async onModuleDestroy() {
    await this.boss.stop();
  }

  async createJob(queue: string, data: Record<string, unknown>): Promise<string | null> {
    return this.boss.send(queue, data);
  }

  async getJobById(queue: string, id: string) {
    return this.boss.getJobById(queue, id);
  }
}
