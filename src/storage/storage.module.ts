import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import * as Minio from 'minio';
import { STORAGE_ENV } from './storage.constants';
import { MINIO_CLIENT, StorageService } from './storage.service';

@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: MINIO_CLIENT,
      useFactory: (configService: ConfigService): Minio.Client => {
        return new Minio.Client({
          endPoint: configService.getOrThrow<string>(STORAGE_ENV.MINIO_ENDPOINT),
          port: parseInt(configService.getOrThrow<string>(STORAGE_ENV.MINIO_PORT), 10),
          useSSL: configService.get<string>(STORAGE_ENV.MINIO_USE_SSL) === 'true',
          accessKey: configService.getOrThrow<string>(STORAGE_ENV.MINIO_ACCESS_KEY),
          secretKey: configService.getOrThrow<string>(STORAGE_ENV.MINIO_SECRET_KEY),
        });
      },
      inject: [ConfigService],
    },
    StorageService,
  ],
  exports: [StorageService],
})
export class StorageModule {}
