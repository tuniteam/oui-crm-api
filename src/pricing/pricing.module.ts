import { Module } from '@nestjs/common';
import { PricingService } from './pricing.service';

/**
 * Moteur tarifaire (SPEC-04). Exporté sans contrôleur : les routes du lot L2 qui l'exposent
 * (`POST /quotes/simulate`, la grille tarifaire) arrivent aux phases C et E.
 */
@Module({
  providers: [PricingService],
  exports: [PricingService],
})
export class PricingModule {}
