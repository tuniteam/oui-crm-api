import { Module } from '@nestjs/common';
import { AuthModule } from '@/auth/auth.module';
import { ReferenceItemsController } from './reference-items.controller';
import { ReferenceItemsService } from './reference-items.service';

@Module({
  imports: [AuthModule],
  controllers: [ReferenceItemsController],
  providers: [ReferenceItemsService],
})
export class ReferenceItemsModule {}
