# AGAI — mise en service du suivi du personnel sur la production

État au 4 octobre 2026 : **préparation locale, aucune modification de la production**.
Le projet de test Supabase n'est pas un préalable imposé par cette procédure.
En revanche, l'absence d'environnement isolé impose des contrôles plus stricts
et une fenêtre de mise en service coordonnée. Ce document n'est pas un ordre
d'exécuter les scripts de préparation tels quels.

## Ce qui est prêt localement

- Les règles métier et les écrans préparés distinguent arrêt de travail,
  disponibilité temporaire, retraite, démission, licenciement et mutation.
- Les contrôles locaux vérifient les périodes d'absence et le refus de nouvelles
  affectations pendant un arrêt. L'accès Internet obligatoire est préparé,
  mais désactivé dans la version actuelle.
- Le transport des données est préparé pour présenter un jeton Auth au lieu
  du seul accès anonyme lorsque la future bascule sera activée. Cette
  modification ne suffit pas à rendre la bascule opérationnelle.
- `supabase-personnel-production-AUDIT-LECTURE-SEULE.sql` rassemble des
  contrôles **sans écriture**. Il ne renvoie aucun mot de passe ou contenu de
  fiche. Le consulter avant toute migration ; ne pas l'utiliser comme
  migration.

## Décision actuelle : NO-GO pour l'activation

Contrôle direct **en lecture seule** du projet Supabase `AGAI` le 4 octobre
2026 :

1. Il y a 24 comptes actifs, dont 23 liés à Supabase Auth. Le compte
   générique `cis04.admin` est le seul actif non lié. Sa désactivation est
   préparée mais non effectuée.
2. Les tables `records`, `caserne_data` et `renforts` ont une politique
   `anon` pour toutes les opérations, avec condition `true`. `anon` dispose
   notamment de la lecture et de l'écriture sur `records`. La fonction
   `agai_atomic_upsert_record` est `SECURITY DEFINER`, exécutable par `anon`
   et sans contrôle Auth dans sa définition actuelle. Un blocage dans le
   navigateur ne serait donc pas une interdiction fiable d'accès aux données.
3. L'application charge encore les fiches et les comptes **avant** la
   connexion. Sur un nouvel appareil, elle dépend de cette lecture anonyme
   pour retrouver le compte. Fermer cet accès maintenant risquerait de
   bloquer les connexions. Des empreintes de mots de passe se trouvent encore
   dans des enregistrements clients : elles doivent être séparées des
   données opérationnelles accessibles au navigateur.
4. L'audit a été exécuté et consigné dans cette procédure. L'état d'une
   sauvegarde postérieure aux dernières interventions **n'a pas été vérifié**
   par le connecteur Supabase, qui ne fournit pas ici de lecture des backups.
   La page des sauvegardes demande une connexion au tableau de bord dans le
   navigateur utilisé pour ce contrôle ; aucune connexion n'a été tentée.
5. Le transfert de dossier entre casernes avec approbation du
   superadministrateur et écriture atomique reste à terminer. Ne pas
   présenter la mutation comme utilisable avant ce contrôle.

L'analyse de sécurité Supabase signale aussi que des fonctions
`SECURITY DEFINER` sont accessibles sans connexion :
[avis Supabase sur ces fonctions](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable).
La fonction Edge `agai-account-link` actuellement publiée est la version 9 ;
elle ne contient pas encore le contrôle des statuts du personnel préparé
localement. Ne pas remplacer cette fonction seule.

## Ordre des travaux restants

1. **Photographier l'état réel, sans rien modifier.** Exécuter l'audit en
   lecture seule et examiner les résultats. Vérifier la sauvegarde la plus
   récente dans Supabase après les dernières interventions. Contrôler aussi
   les files d'actions locales : « Sync OK » sur un appareil ne prouve pas
   que tous les autres appareils ont vidé leur file.
2. **Terminer la connexion sur appareil neuf.** Le serveur doit identifier
   le compte et accorder/refuser l'accès avant le chargement des données.
   La connexion ne doit plus chercher un mot de passe dans les fiches
   téléchargées. Ensuite seulement, lire/écrire les données avec la session
   Auth, renouveler le jeton et reconnecter le temps réel avec ce jeton.
3. **Terminer les règles serveur.** RLS et droits SQL doivent limiter les
   lectures/écritures aux casernes et rôles autorisés. La fonction atomique
   doit vérifier l'identité, le statut du personnel et le périmètre de
   chaque écriture. Les données d'identification et leurs empreintes ne
   doivent plus être exposées avec les fiches courantes. Vérifier également
   les fonctions Edge, les exports et les canaux temps réel.
4. **Terminer les parcours métier.** Arrêt : connexion permise, mais aucun
   départ, formation, activité, disponibilité ou planning pendant la
   période. Disponibilité : accès refusé durant les dates et rétabli
   automatiquement ensuite. Départ définitif : accès refusé, dossier retiré
   de la liste active, historique conservé. Mutation : demande, approbation
   superadministrateur, transfert atomique, historique de la caserne source.
   Seule une fiche créée par erreur et jamais utilisée peut suivre la
   procédure de suppression exceptionnelle du superadministrateur.
5. **Vérifier localement et préparer un retour arrière.** Exécuter les
   tests automatiques et les scénarios manuels avec différents rôles et
   périodes, y compris appareil neuf, hors connexion, session déjà ouverte
   puis suspendue, ancien client et retour de disponibilité. Préparer des
   migrations réversibles de règles/droits et une version cliente de
   secours. Une restauration physique de sauvegarde peut effacer les
   interventions saisies après cette sauvegarde : ce n'est pas le premier
   geste de retour arrière.
6. **Planifier la mise en service sur la production.** Choisir une fenêtre
   où les utilisateurs sont prévenus, les appareils synchronisés et les
   écritures mises en pause. Recontrôler sauvegarde et files, déployer
   serveur et client dans un ordre qui ne coupe aucun ancien client trop
   tôt, puis vérifier connexion, lecture, écriture et refus d'accès sur des
   comptes autorisés et interdits. N'activer les deux verrous
   `PERSONNEL_AUTH_CUTOVER_SUPPORTED` et `personnelOnlineGateEnabled`
   qu'une fois tous les contrôles concluants.

## Règle d'arrêt

Si l'audit révèle un compte actif non prévu, une file locale non envoyée,
une sauvegarde incertaine, une lecture/écriture anonyme encore possible ou
un échec sur appareil neuf, **ne pas activer les restrictions**. Conserver
l'application actuelle, corriger et refaire les contrôles. Ne pas lancer
`supabase-personnel-lifecycle-PREPARATION.sql` ni la désactivation de
`cis04.admin` isolément.

## Prochaine action simple pour l'administrateur

Quand il est disponible : ouvrir Supabase → Database → Backups →
« Scheduled backups » et relever uniquement **la date et l'heure de la
première ligne**. Ne pas cliquer sur « Restore ». Ce renseignement permet
de situer la sauvegarde, sans changer la base. Le contrôle de la sauvegarde
sera à refaire juste avant la mise en service.
