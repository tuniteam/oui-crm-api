import { Injectable } from '@nestjs/common';
import { Document, Page, StyleSheet, Text, View, renderToBuffer } from '@react-pdf/renderer';
import * as Handlebars from 'handlebars';
import { createElement as h } from 'react';
import Html from 'react-pdf-html';
import { apiError } from '@/common/api-error';
import { PAGE_PADDING, WATERMARK_LABEL, WATERMARK_STYLE } from './documents.constants';
import { splitPages } from './documents.utils';

const styles = StyleSheet.create({
  page: { padding: PAGE_PADDING },
  watermark: {
    position: 'absolute',
    top: WATERMARK_STYLE.top,
    left: WATERMARK_STYLE.left,
    fontSize: WATERMARK_STYLE.fontSize,
    color: WATERMARK_STYLE.color,
    opacity: WATERMARK_STYLE.opacity,
    transform: `rotate(${WATERMARK_STYLE.rotation}deg)`,
  },
});

/**
 * **Le milieu de la chaîne documentaire** (SPEC-02 §5.3) : gabarit Handlebars + données →
 * HTML fusionné → PDF. Le gabarit appartient au projet et se remplace sans livraison ; ce
 * service ne sait rien du métier, il fusionne et il rend.
 *
 * Une seule subtilité, vérifiée le 04/09 : `react-pdf-html` **ignore** `page-break-before`. Le
 * gabarit déclare donc `<pagebreak />` et le HTML fusionné est découpé dessus — une `<Page>` par
 * tronçon. La coupure est explicite, maîtrisée par l'auteur du gabarit, et vérifiable en recette.
 */
@Injectable()
export class DocumentRenderService {
  /**
   * Fusionne les données dans le gabarit. Une erreur de gabarit n'est pas une erreur serveur :
   * elle est rendue à l'administrateur qui l'a téléversé, avec le message de Handlebars.
   */
  merge(template: string, data: Record<string, unknown>): string {
    try {
      return Handlebars.compile(template, { noEscape: false })(data);
    } catch (error) {
      throw apiError.badRequest('TEMPLATE_INVALID', (error as Error).message.split('\n')[0]);
    }
  }

  /** HTML fusionné → PDF. `watermark` marque un document qui n'est pas encore officiel (D18). */
  async render(html: string, options: { watermark?: boolean } = {}): Promise<Buffer> {
    const pages = splitPages(html);
    const doc = h(
      Document,
      null,
      ...pages.map((page, index) =>
        h(
          Page,
          { size: 'A4', style: styles.page, key: index },
          options.watermark
            ? h(View, { fixed: true }, h(Text, { style: styles.watermark }, WATERMARK_LABEL))
            : null,
          h(Html as never, null, page),
        ),
      ),
    );
    return Buffer.from(await renderToBuffer(doc));
  }

  /** Le chemin complet, tel que toutes les routes documentaires l'empruntent. */
  async fromTemplate(
    template: string,
    data: Record<string, unknown>,
    options: { watermark?: boolean } = {},
  ): Promise<Buffer> {
    return this.render(this.merge(template, data), options);
  }
}
