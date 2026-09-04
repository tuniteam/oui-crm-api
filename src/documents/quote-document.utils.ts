import { Organization, Settings } from '@prisma/client';
import { formatDateField } from '@/common/utils/date.utils';
import { QuoteConfig, QuoteResult } from '@/pricing/pricing.types';
import { vatOf } from '@/pricing/pricing.utils';
import { frenchDate, money, moneyOrDash, percentOrDash, quantity } from './documents.utils';

/** Ce que le gabarit du devis reçoit — SPEC-01 §6.2, tous les montants déjà formatés. */
export type QuoteTemplateData = Record<string, unknown>;

interface QuoteForDocument {
  number: string;
  issueDate: Date;
  validUntil: Date;
  startDate: Date;
  signedAt: Date | null;
  config: QuoteConfig;
}

interface CompanyIdentity {
  name?: string;
  address?: string;
  signatory?: string;
}

interface OwnerIdentity {
  name: string;
  role: string;
  email: string;
}

/**
 * **Le contrat de données du gabarit « Devis »** (SPEC-01 §6.2), assemblé en un seul endroit.
 *
 * Deux règles s'y tiennent : le gabarit ne calcule rien — montants, pourcentages et dates
 * arrivent formatés —, et il n'invente rien : chaque champ vient du devis figé, de la fiche ou
 * des réglages du projet.
 *
 * `conditions_txt` et `offre_items` restent vides tant que le PO n'a pas dit d'où ils viennent
 * (question ouverte du 04/09, SPEC-14 phase H) : la prose vit dans le gabarit en attendant.
 */
export function quoteTemplateData(
  quote: QuoteForDocument,
  organization: Pick<
    Organization,
    'name' | 'displayPrefix' | 'population' | 'address' | 'postalCode' | 'city' | 'siret'
  >,
  settings: Settings,
  result: QuoteResult,
  owner: OwnerIdentity | null,
  signatureImage: string,
): QuoteTemplateData {
  const company = (settings.company ?? {}) as CompanyIdentity;
  const vatRate = Number(settings.vatRate);
  const prefix = organization.displayPrefix ?? '';
  const config = quote.config;
  const discount = config.subscriptionDiscount;

  return {
    // ---------------------------------------------------------------- organisme
    mairie_prefixe: prefix,
    mairie_prefixe_min: prefix.toLowerCase(),
    mairie_nom: organization.name,
    mairie_habitants:
      organization.population !== null ? organization.population.toLocaleString('fr-FR') : '',
    strate: result.bracketLabel,
    mairie_adresse: organization.address ?? '',
    mairie_cp_ville: [organization.postalCode, organization.city].filter(Boolean).join(' '),
    mairie_siret: organization.siret ?? '',

    // ---------------------------------------------------------------- commercial et émetteur
    contact_nom: owner?.name ?? '',
    contact_fonction: owner?.role ?? '',
    contact_email: owner?.email ?? '',
    signataire_periscolia: company.signatory ?? '',
    emetteur_nom: company.name ?? '',
    emetteur_adresse: company.address ?? '',

    // ---------------------------------------------------------------- références
    ref_devis: quote.number,
    date_emission: frenchDate(quote.issueDate),
    date_validite: frenchDate(quote.validUntil),
    date_demarrage: frenchDate(quote.startDate),
    date_signature: quote.signedAt ? frenchDate(quote.signedAt) : '',

    // ---------------------------------------------------------------- conditions
    engagement_txt: `${config.commitmentMonths} mois`,
    resiliation_txt: config.cancellable
      ? `Résiliable à tout moment, préavis de ${settings.noticeMonths} mois`
      : `Sans résiliation anticipée, préavis de ${settings.noticeMonths} mois`,
    conditions_txt: '',
    clause_essai: config.trialClause,

    // ---------------------------------------------------------------- offre
    formule: config.plan,
    abo_ht_affiche: money(result.mrrNet),
    offre_items: [],

    // ---------------------------------------------------------------- lignes
    lignes_abo: result.subscriptionLines.map((line) => ({
      nom: line.label,
      sous: line.sublabel,
      qte: quantity(line.qty),
      pu: money(line.unitPrice),
      remise: percentOrDash(line.discount),
      total: money(line.total),
    })),
    lignes_frais: result.setupLines.map((line) => ({
      nom: line.label,
      qte: quantity(line.qty),
      pu: money(line.unitPrice),
      remise: percentOrDash(line.discount),
      total: money(line.total),
    })),

    // ---------------------------------------------------------------- remise globale
    has_remise: discount > 0,
    remise_titre: discount > 0 ? 'Remise commerciale' : '',
    remise_sous: discount > 0 ? `Sur l'abonnement mensuel, formule ${config.plan}` : '',
    remise_badge: discount > 0 ? `-${discount} %` : '',
    remise_valeur: discount > 0 ? money(result.mrrList.minus(result.mrrNet)) : '',
    mention_abo: discount > 0 ? `Montant après remise de ${discount} %` : '',

    // ---------------------------------------------------------------- totaux
    total_ht_abo: money(result.mrrNet),
    total_tva_abo: money(vatOf(result.mrrNet, vatRate)),
    total_ttc_abo: money(result.mrrNet.plus(vatOf(result.mrrNet, vatRate))),
    total_ht_frais: money(result.oneShot.total),
    total_tva_frais: money(vatOf(result.oneShot.total, vatRate)),
    total_ttc_frais: money(result.oneShot.total.plus(vatOf(result.oneShot.total, vatRate))),

    // ---------------------------------------------------------------- pluriannuel
    ...multiYearFields(result),

    // ---------------------------------------------------------------- cachet
    signature_image: signatureImage,
  };
}

/**
 * Le tableau budgétaire des quatre années civiles (SPEC-04 §3 règle 8) : une colonne par année,
 * un zéro rayé plutôt qu'un « 0,00 » qui laisserait croire à une ligne facturée.
 */
function multiYearFields(result: QuoteResult): QuoteTemplateData {
  const { years, setup, training, hardware, subscription, months, totalHt, totalTtc } =
    result.multiYear;
  const fields: QuoteTemplateData = {
    // La première année n'est presque jamais pleine : le détail dit pourquoi le montant surprend.
    py_abo_1_detail: months[0] > 0 ? ` (${months[0]} mois)` : '',
    py_abo_note: '',
  };
  years.forEach((year, index) => {
    const rank = index + 1;
    fields[`py_annee${rank}`] = String(year);
    fields[`py_frais_${rank}`] = moneyOrDash(setup[index]);
    fields[`py_formation_${rank}`] = moneyOrDash(training[index]);
    fields[`py_materiel_${rank}`] = moneyOrDash(hardware[index]);
    fields[`py_abo_${rank}`] = moneyOrDash(subscription[index]);
    fields[`py_total_ht_${rank}`] = moneyOrDash(totalHt[index]);
    fields[`py_total_ttc_${rank}`] = moneyOrDash(totalTtc[index]);
  });
  return fields;
}

/** Jour ISO d'un devis, pour les métadonnées d'archive (jamais imprimé). */
export function isoDay(day: Date): string {
  return formatDateField(day);
}
