import { Prisma, PrismaClient } from '@prisma/client';

/**
 * Le client Prisma **ou** une transaction, pour toute fonction qui doit fonctionner des deux
 * côtés — un service qui lit hors transaction, et le même code appelé dans un `$transaction`.
 *
 * Le type vivait dans neuf fichiers sous cinq formes différentes (`PrismaService | …`,
 * `Pick<PrismaClient, 'contact'> | …`), et chaque module en redécidait. Une seule définition
 * évite qu'un helper devienne inappelable depuis une transaction parce que sa forme a divergé.
 *
 * `PrismaService` étend `PrismaClient` : il entre dans ce type sans le nommer.
 */
export type Db = PrismaClient | Prisma.TransactionClient;
