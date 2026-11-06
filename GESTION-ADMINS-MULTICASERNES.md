# Gestion des administrateurs multi-casernes

État au 6 novembre 2026 : le service d'inventaire en lecture seule est déployé ;
la V202611_0012 introduit sa vue superadmin. Aucun droit multi-caserne ni
donnée de production n'a été modifié.

## Constat vérifié

- `agai_identity_credentials`, `agai_auth_links` et `auth.users.app_metadata`
  gardent une seule caserne d'appartenance par compte.
- `agai_private.current_access()` renvoie cette caserne ; les règles de lecture
  et d'écriture des fiches s'appuient dessus. Cocher une seconde caserne dans
  l'interface ne donnerait pas un accès réellement utilisable ni sûr.
- L'utilisateur doit conserver une seule identité et une seule caserne
  opérationnelle. Les casernes administrées sont des autorisations séparées.
- Les versions proviennent des sessions par appareil, pas de la fiche du
  personnel. Une version non observée n'est pas nécessairement ancienne.

## Mise en place par étapes

1. Après publication de V202611_0012, vérifier sur un compte superadmin que
   l'inventaire ne divulgue ni mot de passe ni jeton, et sur un compte admin
   que le mode serveur `admin_access_audit` répond `403`.
2. Créer une table additive de droits `(login, caserne_id)` avec clé unique,
   date, auteur et historique de révocation. Écriture uniquement par le
   superadmin authentifié ; aucune modification de la caserne d'appartenance.
3. Adapter la sélection de caserne de l'admin et la portée de chaque lecture,
   écriture, RPC, synchronisation et file hors ligne. Le serveur doit vérifier
   chaque sélection contre la table, jamais contre une simple donnée du
   navigateur. Une action en attente doit rester liée à sa caserne d'origine,
   même après un changement de caserne active.
4. Tester les changements de caserne avec deux appareils, une connexion
   fraîche, un renouvellement de session, une révocation immédiate et une
   file locale non vide. Contrôler qu'un admin sans droit ne lit ni n'écrit
   dans l'autre caserne et qu'un droit admin n'ajoute pas l'agent à son
   équipage ou à ses statistiques opérationnelles.
5. Activer la sélection multi-casernes seulement après ces contrôles. Les
   cases actuelles par caserne continuent entre-temps à gérer les comptes
   qui appartiennent à cette caserne.

Ne pas dupliquer un compte personnel dans plusieurs casernes pour contourner
la restriction : la connexion, les rapports et la synchronisation utilisent
l'identifiant du compte et son rattachement unique.
