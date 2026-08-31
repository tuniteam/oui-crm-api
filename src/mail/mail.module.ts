import { Module } from '@nestjs/common';
import { MailService } from './mail.service';
import { EmailLogService } from './email-log.service';

@Module({
  providers: [MailService, EmailLogService],
  exports: [MailService, EmailLogService],
})
export class MailModule {}