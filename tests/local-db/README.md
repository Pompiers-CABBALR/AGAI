# Relèves de disponibilités — essais locaux

Ces fichiers sont des prototypes de vérification, **pas des migrations à
appliquer en production**. Ils ne modifient aucune caserne.

Après `pnpm install --frozen-lockfile`, lancer :

```powershell
node --test test-replacement-projection.cjs test-replacement-workflow.cjs
```

Les tests utilisent PGlite (PostgreSQL embarqué) pour vérifier :

- la projection d'une relève partielle ou complète sans toucher aux autres
  heures ni au deuxième départ ;
- les piquets historiques et les horaires de nuit ;
- l'ordre « accord du remplaçant, puis validation du responsable de l'astreinte
  forte », avec refus des autres acteurs et historique.

Avant toute activation, il reste à intégrer une transaction serveur unique
sur la demande, les deux lignes de disponibilités et la configuration des
piquets ; elle devra revérifier les qualifications, absences/formations,
chevauchements, droits et révisions sous verrou. Le navigateur ne peut pas
faire autorité sur ces contrôles. Le drapeau `ASTR_REPLACEMENT_ENABLED`
reste donc à `false`.
