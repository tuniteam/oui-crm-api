import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { apiError } from '@/common/api-error';
import { RegistrySearchResponseDto } from './dto/registry-search.dto';
import { REGISTRY, REGISTRY_ENV } from './registry.constants';
import { isSiretQuery, mapRechercheResult, mapSireneEtablissement } from './registry.utils';

/**
 * US-01-02 — pre-fill from the official registry. The routing between the two sources is
 * internal (shape of `q`); each one degrades independently: 503 REGISTRY_UNAVAILABLE /
 * 504 REGISTRY_TIMEOUT tell the front to fall back to manual input — a nominal path.
 */
@Injectable()
export class RegistryService {
  private readonly logger = new Logger(RegistryService.name);

  constructor(private readonly config: ConfigService) {}

  async search(q: string): Promise<RegistrySearchResponseDto> {
    const query = q.trim();
    return { data: isSiretQuery(query) ? await this.bySiret(query.replace(/\s/g, '')) : await this.byName(query) };
  }

  /** Sirene INSEE v3.11 — establishment lookup; an unknown SIRET is an empty result, not an error. */
  private async bySiret(siret: string) {
    const base = this.config.get<string>(REGISTRY_ENV.INSEE_API_URL);
    const key = this.config.get<string>(REGISTRY_ENV.INSEE_API_KEY);
    if (!base || !key) {
      // Unconfigured source = degraded mode, like an outage: the front falls back to manual input
      this.logger.warn('Sirene source not configured (INSEE_API_URL / INSEE_API_KEY)');
      throw apiError.serviceUnavailable('REGISTRY_UNAVAILABLE');
    }
    const response = await this.fetchOrDegrade(`${base}/siret/${siret}`, { [REGISTRY.SIRENE_KEY_HEADER]: key });
    if (response.status === 404) return [];
    if (!response.ok) throw apiError.serviceUnavailable('REGISTRY_UNAVAILABLE');
    const row = mapSireneEtablissement(await response.json());
    return row ? [row] : [];
  }

  /** recherche-entreprises.api.gouv.fr — full-text on the name (open data, no key). */
  private async byName(q: string) {
    const url = `${REGISTRY.RECHERCHE_ENTREPRISES_URL}?q=${encodeURIComponent(q)}&page=1&per_page=${REGISTRY.MAX_RESULTS}`;
    const response = await this.fetchOrDegrade(url);
    if (!response.ok) throw apiError.serviceUnavailable('REGISTRY_UNAVAILABLE');
    const body = (await response.json()) as { results?: unknown[] };
    return (body.results ?? []).slice(0, REGISTRY.MAX_RESULTS).map(mapRechercheResult);
  }

  private async fetchOrDegrade(url: string, headers: Record<string, string> = {}): Promise<Response> {
    try {
      return await fetch(url, { headers, signal: AbortSignal.timeout(REGISTRY.TIMEOUT_MS) });
    } catch (err) {
      const timedOut = err instanceof Error && err.name === 'TimeoutError';
      this.logger.warn(`Registry call failed (${timedOut ? 'timeout' : 'unreachable'}): ${url}`);
      throw timedOut ? apiError.gatewayTimeout('REGISTRY_TIMEOUT') : apiError.serviceUnavailable('REGISTRY_UNAVAILABLE');
    }
  }
}
