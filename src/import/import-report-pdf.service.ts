import { Injectable } from '@nestjs/common';
import { Document, Page, StyleSheet, Text, View, renderToBuffer } from '@react-pdf/renderer';
import { createElement as h } from 'react';
import { MIME } from '@/common/constants/mime.constants';
import { formatDateField } from '@/common/utils/date.utils';
import { ImportReportDto, ImportRowMessageDto } from './dto/import-file.dto';

// OUI-CRM charte (EMAIL_THEME): azure + neutral greys, print-friendly
const styles = StyleSheet.create({
  page: { padding: 36, fontSize: 10, color: '#14232E' },
  title: { fontSize: 16, marginBottom: 4, color: '#0369A1' },
  subtitle: { fontSize: 9, color: '#5A7184', marginBottom: 14 },
  totals: { flexDirection: 'row', gap: 14, marginBottom: 14 },
  totalItem: { fontSize: 10 },
  section: { fontSize: 12, marginTop: 10, marginBottom: 4, color: '#0369A1' },
  row: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: '#D9E4EC', paddingVertical: 3 },
  colRow: { width: 92 },
  colField: { width: 76 },
  colCode: { width: 150 },
  colMessage: { flex: 1 },
  head: { color: '#5A7184', fontSize: 8 },
  empty: { color: '#5A7184', marginTop: 4 },
});

/**
 * US-01-06 — the report as a PDF for the sales team's review: totals, then every rejected
 * row and every caveat, grouped by sheet, keyed by the Excel row number.
 */
@Injectable()
export class ImportReportPdfService {
  async render(report: ImportReportDto): Promise<{ buffer: Buffer; filename: string; contentType: string }> {
    const day = formatDateField(new Date());
    const doc = h(
      Document,
      null,
      h(
        Page,
        { size: 'A4', style: styles.page },
        h(Text, { style: styles.title }, 'OUI-CRM — Rapport d’import'),
        h(
          Text,
          { style: styles.subtitle },
          `${day} · ${report.dryRun ? 'Simulation (dryRun)' : `Import appliqué${report.batchId ? ` — lot ${report.batchId}` : ''}`}`,
        ),
        h(
          View,
          { style: styles.totals },
          h(Text, { style: styles.totalItem }, `Créés : ${report.totals.created}`),
          h(Text, { style: styles.totalItem }, `Mis à jour : ${report.totals.updated}`),
          h(Text, { style: styles.totalItem }, `Ignorés : ${report.totals.skipped}`),
          h(Text, { style: styles.totalItem }, `Erreurs : ${report.totals.errors}`),
          h(Text, { style: styles.totalItem }, `Avertissements : ${report.totals.warnings}`),
        ),
        this.block('Lignes rejetées', report.errors),
        this.block('Avertissements', report.warnings),
      ),
    );
    const buffer = await renderToBuffer(doc);
    return { buffer: Buffer.from(buffer), filename: `import-rapport-${day}.pdf`, contentType: MIME.PDF };
  }

  private block(title: string, rows: ImportRowMessageDto[]): ReturnType<typeof h> {
    if (!rows.length) {
      return h(View, null, h(Text, { style: styles.section }, title), h(Text, { style: styles.empty }, 'Aucune.'));
    }
    return h(
      View,
      null,
      h(Text, { style: styles.section }, title),
      h(
        View,
        { style: styles.row },
        h(Text, { style: [styles.colRow, styles.head] }, 'Ligne'),
        h(Text, { style: [styles.colField, styles.head] }, 'Champ'),
        h(Text, { style: [styles.colCode, styles.head] }, 'Code'),
        h(Text, { style: [styles.colMessage, styles.head] }, 'Message'),
      ),
      ...rows.map((r, i) =>
        h(
          View,
          { style: styles.row, key: String(i), wrap: false },
          h(Text, { style: styles.colRow }, `${r.sheet}!${r.row}`),
          h(Text, { style: styles.colField }, r.field ?? ''),
          h(Text, { style: styles.colCode }, r.code),
          h(Text, { style: styles.colMessage }, r.message),
        ),
      ),
    );
  }
}
