import { Module } from '@nestjs/common';
import { registerLabelResolver } from '@/audit-log/audit-log-labels';
import { AUDIT_OBJECTS } from '@/audit-log/audit-log.constants';
import { AuthModule } from '@/auth/auth.module';
import { PricingGridsController } from './pricing-grids.controller';
import { PricingGridsService } from './pricing-grids.service';
import { PricingService } from './pricing.service';

// The journal shows a grid by its version number (US-00-10 label registry).
registerLabelResolver(AUDIT_OBJECTS.PRICING_GRID, async (db, projectId, ids) => {
  const rows = await db.pricingGrid.findMany({ where: { id: { in: ids }, projectId }, select: { id: true, version: true } });
  return new Map(rows.map((g) => [g.id, `Grille v${g.version}`]));
});

/**
 * Moteur tarifaire (SPEC-04) et versions de grille (US-02-01). `PricingService` est exporté :
 * la simulation et les devis (phase E) s'appuient dessus.
 */
@Module({
  imports: [AuthModule],
  controllers: [PricingGridsController],
  providers: [PricingService, PricingGridsService],
  exports: [PricingService],
})
export class PricingModule {}
