import { buildSireneAddress, departmentFromInseeCode, isSiretQuery, mapRechercheResult, mapSireneEtablissement } from './registry.utils';

describe('registry.utils — routing (SPEC-13 D1)', () => {
  it('routes a 14-digit query (spaces tolerated) to the SIRET source, anything else to the name search', () => {
    expect(isSiretQuery('21890206500013')).toBe(true);
    expect(isSiretQuery('218 902 065 00013')).toBe(true);
    expect(isSiretQuery('mairie de joigny')).toBe(false);
    expect(isSiretQuery('218902065')).toBe(false);
    expect(isSiretQuery('2189020650001X')).toBe(false);
  });

  it('derives the department from the INSEE commune code (overseas and Corsica included)', () => {
    expect(departmentFromInseeCode('89206')).toBe('89');
    expect(departmentFromInseeCode('2A004')).toBe('2A');
    expect(departmentFromInseeCode('97209')).toBe('972');
    expect(departmentFromInseeCode(null)).toBeNull();
    expect(departmentFromInseeCode('X1')).toBeNull();
  });
});

describe('registry.utils — Sirene mapping (soft-m ADAPT)', () => {
  const payload = {
    etablissement: {
      siret: '21890206500013',
      siren: '218902065',
      uniteLegale: { denominationUniteLegale: 'COMMUNE DE JOIGNY', etatAdministratifUniteLegale: 'A' },
      adresseEtablissement: {
        numeroVoieEtablissement: '3',
        typeVoieEtablissement: 'QUAI',
        libelleVoieEtablissement: 'DU 1ER DRAGONS',
        codePostalEtablissement: '89300',
        libelleCommuneEtablissement: 'JOIGNY',
        codeCommuneEtablissement: '89206',
      },
    },
  };

  it('maps an établissement to the registry row shape', () => {
    expect(mapSireneEtablissement(payload)).toEqual({
      name: 'COMMUNE DE JOIGNY',
      siret: '21890206500013',
      siren: '218902065',
      address: '3 QUAI DU 1ER DRAGONS',
      postalCode: '89300',
      city: 'JOIGNY',
      inseeCode: '89206',
      department: '89',
      isActive: true,
    });
  });

  it('builds the address like soft-m (complement first, voie assembled in order)', () => {
    expect(
      buildSireneAddress({
        complementAdresseEtablissement: 'BP 12',
        numeroVoieEtablissement: '3',
        indiceRepetitionEtablissement: 'B',
        typeVoieEtablissement: 'QUAI',
        libelleVoieEtablissement: 'DU 1ER DRAGONS',
      }),
    ).toBe('BP 12, 3 B QUAI DU 1ER DRAGONS');
    expect(buildSireneAddress({})).toBe('');
  });

  it('tolerates a payload without établissement (null) and a closed unit (isActive false)', () => {
    expect(mapSireneEtablissement({})).toBeNull();
    const closed = JSON.parse(JSON.stringify(payload));
    closed.etablissement.uniteLegale.etatAdministratifUniteLegale = 'C';
    expect(mapSireneEtablissement(closed)!.isActive).toBe(false);
  });
});

describe('registry.utils — recherche-entreprises mapping', () => {
  it('maps a search result from its head office block', () => {
    expect(
      mapRechercheResult({
        nom_complet: 'COMMUNE DE JOIGNY',
        siren: '218902065',
        etat_administratif: 'A',
        siege: { siret: '21890206500013', adresse: '3 QUAI DU 1ER DRAGONS 89300 JOIGNY', code_postal: '89300', libelle_commune: 'JOIGNY', commune: '89206' },
      }),
    ).toEqual({
      name: 'COMMUNE DE JOIGNY',
      siret: '21890206500013',
      siren: '218902065',
      address: '3 QUAI DU 1ER DRAGONS 89300 JOIGNY',
      postalCode: '89300',
      city: 'JOIGNY',
      inseeCode: '89206',
      department: '89',
      isActive: true,
    });
  });

  it('defaults to active and nulls when the payload is sparse', () => {
    expect(mapRechercheResult({ nom_complet: 'X' })).toMatchObject({ name: 'X', siret: null, department: null, isActive: true });
  });
});
