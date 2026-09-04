-- Vocabulaire (04/09) : un contrat se **clôt**, il n'expire pas — seul un devis expire.
-- Renommage de la valeur, pas de nouvelle colonne : le renommage préserve les lignes existantes
-- (et la table contracts est vide à ce stade du lot).
ALTER TYPE "ContractStatus" RENAME VALUE 'EXPIRED' TO 'CLOSED';
