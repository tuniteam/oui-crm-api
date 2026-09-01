import { Module } from '@nestjs/common';
import { AuthModule } from '@/auth/auth.module';
import { ScopeService } from './scope.service';
import { ScopesController } from './scopes.controller';
import { ScopesService } from './scopes.service';

@Module({
  imports: [AuthModule],
  controllers: [ScopesController],
  providers: [ScopesService, ScopeService],
  exports: [ScopeService],
})
export class ScopesModule {}
