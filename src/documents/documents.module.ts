import { Module } from '@nestjs/common';
import { FilesModule } from '@/files/files.module';
import { PricingModule } from '@/pricing/pricing.module';
import { DocumentRenderService } from './document-render.service';
import { QuoteDocumentService } from './quote-document.service';

/**
 * US-02-08 — la chaîne documentaire (SPEC-02 §5.3). Elle n'expose aucune route : ce sont les
 * devis et les réglages qui offrent leurs documents, ce module fournit le moteur.
 */
@Module({
  imports: [FilesModule, PricingModule],
  providers: [DocumentRenderService, QuoteDocumentService],
  exports: [DocumentRenderService, QuoteDocumentService],
})
export class DocumentsModule {}
