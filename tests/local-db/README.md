# Relèves de disponibilités — essais locaux

Ces fichiers sont des prototypes de vérification, **pas des migrations à
appliquer en production**. Ils ne modifient aucune caserne.

Après `pnpm install --frozen-lockfile`, lancer :

```powershell
node --test test-replacement-*.cjs
```

Les tests utilisent PGlite (PostgreSQL embarqué) pour vérifier :

- la projection d'une relève partielle ou complète sans toucher aux autres
  heures ni au deuxième départ ;
- les piquets historiques et les horaires de nuit ;
- l'ordre « accord du remplaçant, puis validation du responsable de l'astreinte
  forte », avec refus des autres acteurs et historique.
- l'écriture atomique des deux disponibilités, du piquet et de la demande,
  y compris si le remplaçant n'avait pas encore de ligne de disponibilité ;
- les refus pour version périmée, qualification insuffisante, absence, sortie
  du personnel, formation aux mêmes heures et chevauchement de départs ;
- les révisions par heure nécessaires au protocole de synchronisation.
- un garde d'écriture simulé : les quatre lignes calculées dans la transaction
  peuvent être écrites, mais une mise à jour directe sans autorisation reste
  refusée ; l'autorisation temporaire est effacée après réussite.

`replacement_transaction.sql` utilise une table `records` simplifiée et des
identités simulées : son succès ne prouve **pas** que les règles RLS et le
déclencheur de la base réelle accepteront ces écritures. Avant toute activation,
il faut intégrer une autorisation serveur strictement limitée aux quatre lignes
de la relève, les traces du journal des piquets validés, puis le retour RPC dans
la file de synchronisation du navigateur. Tester ensuite un téléphone possédant
une ancienne copie locale pour vérifier qu'il ne rétablit pas les anciennes
heures. Le drapeau `ASTR_REPLACEMENT_ENABLED` reste donc à `false`.
