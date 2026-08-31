import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import * as Minio from 'minio';
import { MINIO_CLIENT, StorageService } from './storage.service';

@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: MINIO_CLIENT,
      useFactory: (configService: ConfigService): Minio.Client => {
        return new Minio.Client({
          endPoint: configService.getOrThrow<string>('MINIO_ENDPOINT'),
          port: parseInt(configService.getOrThrow<string>('MINIO_PORT'), 10),
          useSSL: configService.get<string>('MINIO_USE_SSL') === 'true',
          accessKey: configService.getOrThrow<string>('MINIO_ACCESS_KEY'),
          secretKey: configService.getOrThrow<string>('MINIO_SECRET_KEY'),
        });
      },
      inject: [ConfigService],
    },
    StorageService,
  ],
  exports: [StorageService],
})
export class StorageModule {}
