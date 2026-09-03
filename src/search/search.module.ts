import { Module } from '@nestjs/common';
import { ScopesModule } from '@/scopes/scopes.module';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';

@Module({
  imports: [ScopesModule],
  controllers: [SearchController],
  providers: [SearchService],
})
export class SearchModule {}
