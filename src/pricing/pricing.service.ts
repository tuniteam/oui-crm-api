import { Injectable } from '@nestjs/common';
import { Prisma, QuoteLineNature } from '@prisma/client';
import { apiError } from '@/common/api-error';
import { toDate } from '@/common/utils/date.utils';
import {
  DEFAULT_FREE_MONTHS,
  DEFAULT_PERCENT_DISCOUNT_MONTHS,
  DISCOUNT_MAX,
  PERCENT_BASE,
  EXTRA_QUANTITY_SUFFIX,
  MONTHS_PER_YEAR,
  MULTI_YEAR_YEARS,
  SIMULATION_MONTHS,
  TRAINING_FEE_KEY,
} from './pricing.constants';
import {
  ComputedQuoteLine,
  GlobalDiscount,
  PricingGridContent,
  QuoteConfig,
  QuoteInput,
  QuoteResult,
} from './pricing.types';
import {
  ZERO,
  applyDiscount,
  clampDiscount,
  money,
  priceAt,
  resolveBracketIndex,
  safeQty,
  setupFeePrices,
  sumMoney,
} from './pricing.utils';

/**
 * Moteur tarifaire — SPEC-04. **Seule** implémentation du calcul : le configurateur du front
 * appelle `POST /quotes/simulate`, il ne rejoue jamais la formule de son côté.
 *
 * Service pur : ni Prisma, ni requête, ni configuration de projet. La grille, la population,
 * le taux de TVA et la date de démarrage lui sont passés par l'appelant, qui décide s'il
 * s'agit de la grille active (brouillon) ou de la version figée sur le devis.
 */
@Injectable()
export class PricingService {
  computeQuote(input: QuoteInput): QuoteResult {
    const { grid, config, vatRate } = input;
    const bracketIndex = resolveBracketIndex(grid.brackets, input.population);
    if (bracketIndex === -1) throw apiError.badRequest('ORGANIZATION_POPULATION_REQUIRED');

    const subscriptionPrices = grid.subscription?.[config.plan];
    if (!grid.plans?.includes(config.plan) || !subscriptionPrices) {
      throw apiError.badRequest('PRICING_PLAN_UNKNOWN', config.plan);
    }

    const subscriptionUnitPrice = priceAt(subscriptionPrices, bracketIndex);
    const subscriptionLines = this.buildSubscriptionLines(
      grid,
      config,
      bracketIndex,
      subscriptionUnitPrice,
    );
    const setupLines = this.buildSetupLines(grid, config, bracketIndex);

    const mrrList = sumMoney(subscriptionLines.map((line) => line.total));
    const oneShot = this.splitOneShot(grid, config, setupLines);

    const discount = this.normalizeGlobalDiscount(config.globalDiscount);
    const monthly = (monthIndex: number): Prisma.Decimal =>
      this.monthlyAmount(mrrList, discount, monthIndex);
    const mrrNet = discount.mode === 'FREE_MONTHS' ? mrrList : monthly(0);

    const multiYear = this.simulate(input.startDate, monthly, oneShot, vatRate);
    const firstYearSubscription = multiYear.subscription[0];
    const firstYearHt = money(firstYearSubscription.plus(oneShot.total));
    const firstYearVat = this.vatOf(firstYearHt, vatRate);

    return {
      bracketIndex,
      bracketLabel: grid.brackets[bracketIndex].label,
      subscriptionUnitPrice: money(subscriptionUnitPrice),
      subscriptionLines,
      setupLines,
      mrrList,
      mrrNet,
      arrList: money(mrrList.times(MONTHS_PER_YEAR)),
      arrNet: money(mrrNet.times(MONTHS_PER_YEAR)),
      oneShot,
      monthly,
      firstYear: {
        subscription: firstYearSubscription,
        totalHt: firstYearHt,
        vat: firstYearVat,
        totalTtc: money(firstYearHt.plus(firstYearVat)),
      },
      multiYear,
      maxDiscount: this.maxDiscount(config, discount),
    };
  }

  // -------------------------------------------------------------------------
  // Lignes
  // -------------------------------------------------------------------------

  /** Abonnement puis options facturables (SPEC-04 §3 règles 2-3). */
  private buildSubscriptionLines(
    grid: PricingGridContent,
    config: QuoteConfig,
    bracketIndex: number,
    unitPrice: Prisma.Decimal,
  ): ComputedQuoteLine[] {
    const bracketLabel = grid.brackets[bracketIndex].label;
    const subscriptionDiscount = clampDiscount(config.subscriptionDiscount);
    const lines: ComputedQuoteLine[] = [
      {
        nature: QuoteLineNature.ABONNEMENT,
        label: `Abonnement ${config.plan}`,
        sublabel: bracketLabel,
        qty: money(1),
        unitPrice: money(unitPrice),
        discount: subscriptionDiscount,
        total: money(applyDiscount(unitPrice, subscriptionDiscount)),
      },
    ];

    for (const wanted of config.options ?? []) {
      const option = grid.options?.find((o) => o.id === wanted.id);
      if (!option) continue;
      const included = safeQty(option.included);
      const billedQty = Math.max(0, safeQty(wanted.qty) - included);
      if (billedQty === 0) continue;

      const optionUnitPrice = priceAt(option.unitPrice, bracketIndex);
      const optionDiscount = clampDiscount(wanted.discount);
      lines.push({
        nature: QuoteLineNature.OPTION,
        label: included > 0 ? `${option.name} ${EXTRA_QUANTITY_SUFFIX}` : option.name,
        sublabel: bracketLabel,
        qty: money(billedQty),
        unitPrice: money(optionUnitPrice),
        discount: optionDiscount,
        total: money(applyDiscount(optionUnitPrice.times(billedQty), optionDiscount)),
      });
    }
    return lines;
  }

  /** Postes de mise en place retenus, puis extras (SPEC-04 §3 règle 5). */
  private buildSetupLines(
    grid: PricingGridContent,
    config: QuoteConfig,
    bracketIndex: number,
  ): ComputedQuoteLine[] {
    const lines: ComputedQuoteLine[] = [];

    for (const [key, fee] of Object.entries(grid.setupFees ?? {})) {
      const wanted = config.setup?.[key];
      if (!wanted?.included) continue;
      const feeUnitPrice = priceAt(setupFeePrices(fee, config.plan), bracketIndex);
      const feeDiscount = clampDiscount(wanted.discount);
      lines.push({
        nature: QuoteLineNature.SETUP,
        label: fee.label,
        sublabel: config.plan,
        qty: money(1),
        unitPrice: money(feeUnitPrice),
        discount: feeDiscount,
        total: money(applyDiscount(feeUnitPrice, feeDiscount)),
      });
    }

    for (const wanted of config.extras ?? []) {
      const extra = grid.extras?.find((e) => e.id === wanted.id);
      if (!extra) continue;
      const qty = safeQty(wanted.qty);
      if (qty === 0) continue;
      const extraUnitPrice = new Prisma.Decimal(extra.unitPrice);
      const extraDiscount = clampDiscount(wanted.discount);
      lines.push({
        nature: QuoteLineNature.EXTRA,
        label: extra.name,
        sublabel: '',
        qty: money(qty),
        unitPrice: money(extraUnitPrice),
        discount: extraDiscount,
        total: money(applyDiscount(extraUnitPrice.times(qty), extraDiscount)),
      });
    }
    return lines;
  }

  /** Ventilation des frais one-shot : formation, mise en place, matériel (SPEC-01 §4.2). */
  private splitOneShot(
    grid: PricingGridContent,
    config: QuoteConfig,
    setupLines: ComputedQuoteLine[],
  ) {
    const trainingLabel = grid.setupFees?.[TRAINING_FEE_KEY]?.label;
    const training = sumMoney(
      setupLines
        .filter((line) => line.nature === QuoteLineNature.SETUP && line.label === trainingLabel)
        .map((l) => l.total),
    );
    const setup = sumMoney(
      setupLines
        .filter((line) => line.nature === QuoteLineNature.SETUP && line.label !== trainingLabel)
        .map((l) => l.total),
    );
    const hardware = sumMoney(
      setupLines.filter((line) => line.nature === QuoteLineNature.EXTRA).map((l) => l.total),
    );
    return { setup, training, hardware, total: money(setup.plus(training).plus(hardware)) };
  }

  // -------------------------------------------------------------------------
  // Remise globale et simulation
  // -------------------------------------------------------------------------

  /** Défauts de SPEC-04 §2.1 appliqués à une configuration venue du JSON du devis. */
  private normalizeGlobalDiscount(discount: GlobalDiscount | undefined): GlobalDiscount {
    if (!discount || discount.mode === 'NONE') return { mode: 'NONE' };
    if (discount.mode === 'PERCENT') {
      return {
        mode: 'PERCENT',
        percent: clampDiscount(discount.percent),
        months: Math.max(0, Math.trunc(discount.months ?? DEFAULT_PERCENT_DISCOUNT_MONTHS)),
      };
    }
    return {
      mode: 'FREE_MONTHS',
      months: Math.max(0, Math.trunc(discount.months ?? DEFAULT_FREE_MONTHS)),
    };
  }

  /** Montant d'abonnement du mois `monthIndex` (SPEC-04 §3 règle 6). */
  private monthlyAmount(
    mrrList: Prisma.Decimal,
    discount: GlobalDiscount,
    monthIndex: number,
  ): Prisma.Decimal {
    if (discount.mode === 'NONE') return mrrList;
    const inPromoPeriod = monthIndex < discount.months;
    if (!inPromoPeriod) return mrrList;
    if (discount.mode === 'FREE_MONTHS') return ZERO;
    return money(
      mrrList.times(new Prisma.Decimal(PERCENT_BASE - discount.percent).dividedBy(PERCENT_BASE)),
    );
  }

  /**
   * Répartition mois par mois sur 48 mois, agrégée par **année civile** à partir de l'année
   * de démarrage (SPEC-04 §3 règle 7). Le mois de démarrage compte plein — pas de prorata
   * (déc. 6). Les frais one-shot tombent intégralement en année 1.
   */
  private simulate(
    startDate: string,
    monthly: (monthIndex: number) => Prisma.Decimal,
    oneShot: {
      setup: Prisma.Decimal;
      training: Prisma.Decimal;
      hardware: Prisma.Decimal;
      total: Prisma.Decimal;
    },
    vatRate: number,
  ): QuoteResult['multiYear'] {
    const start = toDate(startDate);
    const startYear = start.getUTCFullYear();

    const subscription = Array.from({ length: MULTI_YEAR_YEARS }, () => new Prisma.Decimal(0));
    const months = Array.from({ length: MULTI_YEAR_YEARS }, () => 0);

    for (let monthIndex = 0; monthIndex < SIMULATION_MONTHS; monthIndex++) {
      const billed = new Date(Date.UTC(startYear, start.getUTCMonth() + monthIndex, 1));
      const yearIndex = billed.getUTCFullYear() - startYear;
      if (yearIndex < 0 || yearIndex >= MULTI_YEAR_YEARS) continue;
      subscription[yearIndex] = subscription[yearIndex].plus(monthly(monthIndex));
      months[yearIndex] += 1;
    }

    const firstYearOnly = (amount: Prisma.Decimal) =>
      Array.from({ length: MULTI_YEAR_YEARS }, (_, y) => (y === 0 ? amount : ZERO));

    const subscriptionRounded = subscription.map((amount) => money(amount));
    const totalHt = subscriptionRounded.map((amount, y) =>
      money(y === 0 ? amount.plus(oneShot.total) : amount),
    );

    return {
      years: Array.from({ length: MULTI_YEAR_YEARS }, (_, y) => startYear + y),
      setup: firstYearOnly(oneShot.setup),
      training: firstYearOnly(oneShot.training),
      hardware: firstYearOnly(oneShot.hardware),
      subscription: subscriptionRounded,
      months,
      totalHt,
      totalTtc: totalHt.map((amount) => money(amount.plus(this.vatOf(amount, vatRate)))),
    };
  }

  private vatOf(amountHt: Prisma.Decimal, vatRate: number): Prisma.Decimal {
    return money(amountHt.times(new Prisma.Decimal(vatRate ?? 0).dividedBy(PERCENT_BASE)));
  }

  /** SPEC-04 déc. 1 : la remise déclencheuse tient compte de **toutes** les lignes. */
  private maxDiscount(config: QuoteConfig, discount: GlobalDiscount): number {
    const discounts = [
      clampDiscount(config.subscriptionDiscount),
      ...(config.options ?? []).map((o) => clampDiscount(o.discount)),
      ...Object.values(config.setup ?? {}).map((s) => clampDiscount(s.discount)),
      ...(config.extras ?? []).map((e) => clampDiscount(e.discount)),
      discount.mode === 'PERCENT' ? discount.percent : 0,
    ];
    return Math.max(...discounts, 0);
  }
}
