# AGAI — mise en service du suivi du personnel sur la production

État au 5 octobre 2026 : **phases serveur 1 et 2 installées en production,
fonction Edge préparatoire v10 publiée, aucun statut actif ni changement de
droits de l'application**.
Le projet de test Supabase n'est pas un préalable imposé par cette procédure.
En revanche, l'absence d'environnement isolé impose des contrôles plus stricts
et une fenêtre de mise en service coordonnée. Ce document n'est pas un ordre
d'exécuter les scripts de préparation tels quels.

## Reprise du chantier — contrôle du 5 octobre 2026

Le contrôle initial confirmait 24 comptes actifs dont 23 rattachés à Supabase
Auth ; `anon` peut encore lire et écrire `public.records` et exécuter la
fonction atomique ; 23 fiches de personnel contiennent encore une empreinte de
mot de passe. Les cinq tests locaux du suivi du personnel, de la porte d'accès
en ligne et du transport Auth passent. **La décision reste NO-GO pour
l'activation.** Aucun statut ni compte n'a été modifié.

Les deux migrations additives `agai_personnel_phase_1_structures` et
`agai_personnel_phase_2_service_functions` ont été appliquées sur le projet
AGAI le 5 octobre. Elles créent deux tables privées et trois fonctions
`SECURITY INVOKER` réservées à `service_role` ; elles ne changent ni les
politiques de `records`, ni l'application, ni les comptes. Contrôles après
application : RLS actif sur les deux tables, aucun accès `anon` ou
`authenticated`, aucune ligne de statut ou d'historique, 24/24 comptes actifs
autorisés par les fonctions, aucune nouvelle alerte de sécurité de niveau
WARN. L'avis « RLS Enabled No Policy » sur ces tables est intentionnel : les
clients ne doivent pas les interroger directement.

Le prochain lot de développement est la connexion sur appareil neuf sans
lecture préalable des fiches, puis l'isolation Auth/RLS et le retrait des
empreintes des données opérationnelles. Les décisions de statut et les
mutations ne pourront être activées qu'après vérification de ce lot sur tous
les profils et contrôle d'une sauvegarde récente. Une sauvegarde physique
du 5 octobre 2026 à 05:56:41 UTC a été signalée par l'administrateur. Elle
ne couvre pas nécessairement les interventions enregistrées après cette heure ;
recontrôler la sauvegarde juste avant la mise en service.

Le parcours **serveur d'abord** est maintenant préparé localement : la fonction
Edge préparée rend un profil minimal après vérification du mot de passe ; en
mode sécurisé, le client ne lit plus de cache ni de fiches avant cet accord.
Il refuse une file locale non envoyée, charge ensuite les données avec le
jeton Auth et vérifie que la caserne et le rôle du dossier correspondent à
ceux du serveur. Lors des futurs envois en mode sécurisé, les empreintes de
mot de passe sont exclues des lignes `user` et du bloc des comptes globaux.
Les tests locaux de ce parcours passent. Ce mode reste
**désactivé** (`PERSONNEL_AUTH_CUTOVER_SUPPORTED=false` et
`personnelOnlineGateEnabled=false`). Il faut encore retirer les empreintes
des fiches déjà stockées en production et des anciens caches d'appareil,
fermer les accès anonymes par RLS et par la fonction atomique,
vérifier les anciens appareils et tester les profils réels avant activation.
La fonction Edge de production a été remplacée le 5 octobre par une version
préparatoire `v239.6-prep`, avec `personnelEnforcement=false` codé en dur :
elle ne peut pas activer les restrictions par un simple secret ou paramètre.
Le mode sécurisé du client reste lui aussi désactivé. Contrôles après
publication : réponse GET `200` avec `personnelEnforcementEnabled:false`,
demande d'administration sans session refusée `401`, zéro ligne de statut ou
d'historique, 24 comptes actifs, politique anonyme des enregistrements
inchangée. L'ancienne fonction v9 a été conservée comme source de retour
arrière dans `supabase/functions/agai-account-link/rollback-v9.ts` ; son
contenu a été comparé à la version v9 publiée avant la mise à jour.
**Ce déploiement n'active pas le suivi du
personnel.**
Le chargement sur appareil neuf et l'exclusion des empreintes sont couverts
par `test-personnel-online-gate.js` et `test-personnel-credential-stripping.js`.
La fonction Edge locale refuse aussi qu'une création reprenne un identifiant
existant, qu'une synchronisation ordinaire change de caserne (la mutation doit
avoir son parcours approuvé), et qu'un administrateur de caserne modifie un
compte administrateur ou celui d'une autre caserne. Les échecs d'écriture lors
d'une désactivation ou remise à zéro ne sont plus présentés comme des succès.
Ces contrôles locaux sont couverts par `test-personnel-edge-admin-guard.js` ;
ils ne sont **pas encore publiés** et ne constituent pas le parcours complet
de mutation.

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
La fonction Edge `agai-account-link` actuellement publiée est la version 10
préparatoire ; son contrôle des statuts est désactivé. Ne pas activer ce
contrôle ni déployer le client sécurisé seul.

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
`supabase-personnel-lifecycle-PREPARATION.sql` (ancien brouillon obsolète) ni
la désactivation de `cis04.admin` isolément.

Le 5 octobre, l'administrateur a indiqué qu'il pourra réserver un créneau,
mais n'a pas pu confirmer que tous les appareils affichent « Sync OK » : des
collègues dormaient. Ce créneau n'est donc **pas ouvert pour une bascule**.

## Sauvegarde signalée par l'administrateur

La première ligne de Supabase → Database → Backups → « Scheduled backups »
indiquait **05 Oct 2026 05:56:41 (+0000), PHYSICAL**. Aucune restauration
n'a été demandée. Cette sauvegarde sert de point de repère, mais ne couvre pas
forcément les interventions ultérieures. Vérifier de nouveau la première
ligne et la synchronisation de tous les appareils juste avant la mise en
service ; ne pas cliquer sur « Restore » dans le cadre de ce contrôle.
