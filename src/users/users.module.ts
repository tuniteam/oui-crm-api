import { Module } from '@nestjs/common';
import { AuditLogModule } from '@/audit-log/audit-log.module';
import { AuthModule } from '@/auth/auth.module';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [AuthModule, AuditLogModule],
  controllers: [UsersController],
  providers: [UsersService],
})
export class UsersModule {}
