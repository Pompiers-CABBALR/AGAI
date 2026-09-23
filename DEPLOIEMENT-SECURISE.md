# AGAI — déploiement sécurisé

## Décision actuelle — V202609_0013

La V202609_0013 corrige uniquement le faux conflit de révision des interventions
historiques : la comparaison avec Supabase utilise désormais la révision réellement
stockée avant toute normalisation locale. Le cas observé en production était
`_statusRevision = NULL` et `_serverRevision = 1`. Un ajout d'information ou une
sélection pouvait être refusé avec le message trompeur « modifiée sur un autre
appareil ». Les véritables conflits simultanés restent refusés par le serveur.

La liaison technique des comptes reste **désactivée** dans `runtime-config.js`.
Ne pas publier l'ancien paquet `AGAI-V202609_0012-PILOTE.zip` pendant la correction
opérationnelle. Ce correctif ne demande aucun SQL, aucune suppression de cache et
aucun redémarrage Supabase. Avant publication, conserver une sauvegarde et vérifier
que la file d'attente de l'appareil est connue ; après publication, contrôler une
fiche ancienne par ajout non critique puis une sélection, avec confirmation du
statut depuis un second appareil. Si un conflit réel survient, le message précise
désormais que la modification refusée n'a pas été enregistrée.

## Contexte de sécurité

Les identifiants AGAI existants sont conservés. Le pilote de liaison technique du
compte `dacheville.thibaut` à Supabase Auth reste préparé mais suspendu ; aucun
changement obligatoire de mot de passe n’est activé.

Chaque compte possède désormais un `caserneId` et un `appRole` maintenus
automatiquement par l’application. Cette association structure correctement les
droits applicatifs, mais elle ne constitue pas une barrière de sécurité côté base :
avec une connexion Supabase anonyme, les règles RLS ne peuvent pas identifier
fiablement l’agent connecté.

Le fichier `supabase-security.sql` reste donc une cible future et ne doit pas être
appliqué dans le mode d’authentification actuel.

## Actions urgentes

1. Révoquer la clé Brevo qui figurait dans l’ancienne version.
2. Révoquer la clé maître JSONBin et désactiver le bin s’il n’est plus utilisé.
3. Changer tous les mots de passe initialement livrés dans le fichier.
4. Ne plus publier ni remettre en service l’ancien `index.html`.

La clé Supabase « publishable » peut être publique. Elle n’accorde cependant aucune
protection par elle-même : la sécurité dépend des règles RLS.

## Migration Supabase

### Liaison invisible des comptes v239 — déploiement progressif

**Mode pilote V202609_0012 :** `accountLinkMode: 'canary'` n'essaie la liaison que
pour `dacheville.thibaut`. Les autres agents ne lancent aucune requête Auth à la
connexion. La liaison du pilote se déroule après l'ouverture de l'application,
avec un délai maximal de 6 secondes et une pause de 5 minutes en cas d'échec. Son
renouvellement recule progressivement jusqu'à 15 minutes. Ces requêtes sont
séparées du coupe-circuit de la synchronisation des interventions, qui garde la
clé publique historique. Ne pas passer en mode `on` lors de ce pilote.

Avant toute publication :

1. constater **Sync OK**, aucune action en attente et Supabase sain pendant une
   période d'utilisation normale ;
2. conserver une sauvegarde vérifiée des données et de la version actuellement en
   ligne ; ne pas effacer les données locales des appareils ;
3. vérifier que `supabase-account-link-v239.sql` et la fonction Edge
   `agai-account-link` sont déjà installés et répondent correctement ; ne pas
   rejouer à l'aveugle un script SQL en production ;
4. publier V202609_0012 avec le mode `canary` ; seul le compte pilote effectue
   la liaison technique, même si tous les agents reçoivent la nouvelle version.
   Contrôler sa connexion, la création de sa liaison, puis l'envoi et la réception
   d'une modification non critique ; les autres agents continuent leur usage normal ;
5. surveiller pendant au moins une journée les actions en attente, les dates du
   dernier envoi et de la dernière réception, les erreurs 5xx/409 et la charge
   Supabase. Arrêter le pilote dès qu'un de ces indicateurs se dégrade.

**Retour arrière immédiat :** remettre `accountLinkMode: 'off'` dans
`runtime-config.js`, republier ce seul fichier et faire actualiser l'application
au pilote. Ne pas supprimer les données du navigateur, les interventions, les
comptes ou les files d'attente. Le retour arrière ne nécessite pas de redémarrer
Supabase. Il désactive les nouvelles liaisons, sans annuler les identités déjà
créées côté serveur.

**Mode API dégradée v239.4 :** la réception est découpée en pages de 100 lignes au
lieu de 500 et le délai réseau est porté à 45 secondes. Cette adaptation évite qu’un
ralentissement temporaire de l’API Gateway Supabase bloque la récupération complète.

**Reprise ciblée v239.5 :** lorsqu’une file locale existe déjà, l’application ne
charge plus toute la base avant de la traiter. Elle demande uniquement au serveur
les identifiants encore en attente, par groupes de 20, rapproche les réponses puis
envoie au maximum 25 changements. Le chargement global reprend seulement après la
résorption de la file.

**File prioritaire v239.6 :** les événements temps réel et le contrôle périodique
ne peuvent plus lancer une réception globale tant qu’une action locale reste en
attente. La progression et les éventuelles erreurs de la file ne sont donc plus
masquées par un chargement général de toutes les casernes.

**Récupération isolée v239.7 :** l’application utilise une nouvelle clé publique
Supabase. Après validation de cette version sur l’appareil de récupération,
l’ancienne clé publique doit être révoquée afin d’arrêter immédiatement les requêtes
des versions antérieures. Ne jamais placer une clé `sb_secret_` dans le navigateur.

**Correctif v239.2 :** cette version répare la reprise de synchronisation après une
mise à jour. Elle rapproche automatiquement la file locale avec les données déjà
confirmées par Supabase, au lieu de recompter toute la base comme de nouvelles
actions. Les véritables modifications hors ligne restent conservées et sont
envoyées normalement. Les appels de synchronisation possèdent désormais une limite
d’attente : l’application ne peut plus rester indéfiniment sur « Chargement » et
affiche un diagnostic exploitable en cas d’indisponibilité du serveur. Ce correctif
ne demande ni nouveau script SQL ni nouveau déploiement de fonction serveur. Il ne
faut pas effacer l’historique ou les données du navigateur avant sa publication.
Les appareils déjà utilisés sur le terrain ne sont jamais rechargés automatiquement :
un bandeau informe de la nouvelle version et l’utilisateur choisit lui-même le moment
sûr pour l’actualiser.

**Correctif v239.1 :** pendant cette phase progressive, le jeton Supabase rattaché
sert uniquement à la gestion sécurisée du compte. La synchronisation des données
reste sur l’accès historique jusqu’à la v240. Cela évite qu’une politique RLS
intermédiaire transforme toutes les écritures en actions « Sync KO ».

La v239 conserve exactement l’écran de connexion AGAI. Chaque agent continue à
utiliser son identifiant et son mot de passe habituels ; une identité Supabase est
créée silencieusement lors de sa première connexion après activation.

Ordre obligatoire :

1. vérifier que la **Protection serveur v238** est active ;
2. créer un point de restauration dans **Superadmin → Maintenance** ;
3. exécuter `supabase-account-link-v239.sql` dans l’éditeur SQL Supabase ;
4. déployer la fonction Edge située dans `supabase/functions/agai-account-link` en
   conservant le fichier `supabase/config.toml` fourni : la fonction vérifie elle-même
   les identifiants AGAI et applique son propre blocage des tentatives ;
5. vérifier l’adresse `https://<projet>.supabase.co/functions/v1/agai-account-link`, qui doit répondre avec la version `v239` ;
6. pour le pilote seulement, conserver `accountLinkMode: 'canary'` avec le seul
   identifiant prévu ; laisser `accountLinkEndpoint` vide pour utiliser le projet
   configuré ;
7. publier l’application selon la procédure pilote ci-dessus, puis contrôler
   **Liaison des comptes v239** dans la maintenance.

Après une éventuelle extension validée, le compteur augmente au fil des connexions ordinaires. Les agents n’ont aucune
inscription à effectuer et ne voient jamais l’interface Supabase. Les mots de passe
importés sont placés dans une table privée inaccessible aux navigateurs. Les
créations et changements de mot de passe réalisés ensuite depuis AGAI passent par
la fonction serveur.

Ne pas encore appliquer `supabase-security.sql`. Il faut attendre que le compteur
indique que tous les comptes actifs sont rattachés. La fermeture de l’accès anonyme
fera l’objet de la phase suivante, après vérification sur ordinateur, Android et
iPhone Safari.

### Protection atomique et numérotation serveur v238 — compatible avec la connexion actuelle

Le fichier `supabase-atomic-operations-v238.sql` peut être appliqué dès maintenant
dans l’éditeur SQL Supabase. Il ne nécessite pas encore Supabase Auth et ne modifie
aucune intervention existante.

Procédure :

1. créer un point de restauration depuis **Superadmin → Maintenance** ;
2. ouvrir **Supabase → SQL Editor → New query** ;
3. coller tout le contenu de `supabase-atomic-operations-v238.sql` ;
4. exécuter le script une seule fois ; il peut toutefois être réexécuté sans supprimer les données ;
5. ouvrir **Superadmin → Maintenance** et cliquer sur **Actualiser** ;
6. vérifier que « Protection serveur v238 » affiche **Active**.

Une fois actif, le serveur refuse atomiquement :

- une ancienne révision d’intervention ;
- deux modifications concurrentes de la même fiche ;
- l’engagement simultané d’un véhicule dans la même caserne ;
- l’engagement simultané d’un agent, y compris entre deux casernes ;
- les doublons de numéro UT, mensuel ou intercommunal : si deux appareils proposent le même numéro, Supabase leur attribue automatiquement deux numéros successifs.

Chaque écriture protégée est inscrite dans `agai_operation_log`. Cette table n’est
pas lisible depuis le navigateur. Tant que le script n’est pas installé, la v238
continue d’utiliser automatiquement le mécanisme de synchronisation précédent.

Le fichier `supabase-security.sql` décrit la cible recommandée :

- accès anonyme interdit ;
- accès limité à la caserne présente dans le jeton ;
- accès global réservé au superadministrateur et au chef de corps ;
- compteur atomique pour supprimer les doublons entre plusieurs postes.

Ces règles nécessitent Supabase Auth. Il ne faut pas les activer avant d’avoir migré
la connexion AGAI, sinon le client historique ne pourra plus synchroniser.

Les rôles et casernes doivent être placés dans `app_metadata` par une fonction serveur
administrative, jamais modifiés directement par le navigateur :

```json
{
  "app_role": "agent",
  "caserne_id": "CIS05"
}
```

## Passerelle d’e-mail

La copie sécurisée ne contient plus de clé Brevo. Elle attend une URL serveur dans :

```html
<script>
window.AGAI_CONFIG = {
  mailEndpoint: "https://votre-fonction.example/send-mail"
};
</script>
```

Cette configuration doit être placée avant le script principal. La fonction serveur
doit authentifier l’utilisateur, contrôler son rôle, valider le destinataire et la
taille de la pièce jointe, puis appeler Brevo avec la clé conservée côté serveur.

## Vérifications avant mise en production

- tester un agent de chaque caserne ;
- vérifier qu’un agent ne peut lire aucune autre caserne ;
- vérifier qu’un utilisateur normal ne peut modifier les comptes ni les droits ;
- lancer deux clôtures simultanées et contrôler l’unicité des numéros ;
- restaurer une sauvegarde dans un environnement de test ;
- vérifier les parcours hors connexion et après expiration de session.

## Correctif v239.8 — déblocage d'une fiche isolée

Lorsqu'une écriture protégée dépasse le délai serveur, l'application retente
uniquement cette fiche par l'enregistrement standard. L'identifiant stable rend
cette reprise idempotente : elle confirme la même fiche sans en créer une seconde.
Les autres actions de la file peuvent ainsi continuer à être synchronisées.

## Correctif v239.9 — reprise non bloquante

Si la fonction protégée et son écriture de secours dépassent toutes les deux le
délai serveur, la fiche est conservée dans la file durable et isolée pendant cinq
minutes. Les autres actions continuent, la réception des interventions reprend,
puis la fiche isolée est retentée automatiquement. Aucune donnée locale n'est
supprimée pour obtenir un état « Sync OK ».

## Publication GitHub Pages

Le dossier `.github/workflows` fait partie de l'application. Son fichier
`static.yml` déclenche la publication après chaque envoi sur la branche `main`.
Il ne doit pas être supprimé lors d'une mise à jour ; sans lui, les fichiers
peuvent être présents dans le dépôt tandis que le site public affiche 404.

## Correctif v240 — contournement des erreurs Supabase 503

Le rapprochement initial interroge au maximum cinq identifiants à la fois. Si
Supabase répond temporairement 502, 503 ou 504, cette lecture de contrôle ne
fige plus la file : les écritures locales idempotentes reprennent directement,
puis le rapprochement est retenté lors d'une réception ultérieure.

## Correctif v241 — mode dégradé Supabase

Les contrôles préalables de statut, de disponibilités et d'historique de grade
ne figent plus l'ensemble de la file lorsque l'API répond 502, 503 ou 504. Les
interventions continuent vers la protection atomique ; les autres fiches sont
conservées et espacées de cinq minutes. Un lot refusé par Supabase n'est plus
découpé en dizaines de nouvelles requêtes, afin de ne pas aggraver une panne
`PGRST002` du cache de schéma.

## Correctif v242 — date de clôture directe

La clôture directe par le superadministrateur demande désormais la date réelle de
l’intervention. Cette date est utilisée pour les contrôles de disponibilité, les
événements de départ et de retour, l’historique et les statistiques. La date de
création de l’appel reste conservée séparément et ne déplace plus une intervention
réalisée ultérieurement dans le mauvais jour.

## Correctif v243 — date de retour explicite

La clôture directe distingue désormais la date de départ de la date de retour.
Un retour antérieur ou égal au départ est refusé tant que les dates et heures ne
sont pas cohérentes. L’application ne transforme donc plus silencieusement une
erreur de saisie horaire en retour le lendemain, ce qui garantit l’affichage dans
« Terminées » le bon jour.

## Correctif v244 — véhicules disponibles en mode superadmin

La clôture directe ne dépend plus d’une seule copie de la configuration des
engins. La liste est reconstruite à partir de la configuration active, de la
configuration de la caserne, des piquets et des véhicules déjà connus dans ses
interventions. Un chargement tardif de la configuration ne laisse donc plus le
sélecteur vide sur mobile.

## Stabilisation v245 — affichages sans écriture

L’ouverture des écrans Interventions, PILP, Historique et Superadministration est
désormais strictement en lecture seule. Les anciennes réparations automatiques
restent présentes pour une maintenance volontaire, mais ne sont plus lancées
pendant un affichage. Cela évite les renumérotations inattendues et les rafales
d’écritures concurrentes vers Supabase lorsque plusieurs appareils sont connectés.

## Stabilisation v246 — mise à jour avant connexion

Avant toute connexion, l’application compare sa version avec `version.json` et
la page publiée sans utiliser le cache. Si une version plus récente est confirmée,
le bouton de connexion reste bloqué jusqu’au rechargement. Une indisponibilité du
réseau n’interdit toutefois pas l’accès local : la continuité opérationnelle reste
prioritaire et le contrôle sera repris dès le retour de la connexion.

## Stabilisation v247 — diagnostic et reprise ciblée

Le panneau de santé distingue désormais le dernier envoi du dernier chargement,
l’ancienneté de la file, les actions temporairement isolées et les versions encore
actives. Une erreur de synchronisation empêche l’affichage trompeur « Aucune
anomalie détectée ». Le superadministrateur peut relancer une seule fiche sans
vider ni réexpédier toute la file locale.

## Version V202609_0001 — affichage et numérotation mensuelle

La version est maintenant visible sous le bouton de connexion et dans le bandeau
supérieur, après la caserne. La numérotation suit le format `VAAAAMM_NNNN` : le
compteur comporte quatre chiffres et repart à `0001` au début de chaque mois.
Pendant la transition, l’application continue de reconnaître les anciennes
versions afin d’imposer correctement l’actualisation avant connexion.

Dans le menu Superadministration > Connexions, les casernes et les comptes qui
ont été ouverts ou refermés conservent leur état pendant les actualisations
automatiques. La liste ne se replie donc plus toutes les trente secondes.

## Correctif V202609_0002 — véhicules au départ

La liste des véhicules du passage « En cours » ne dépend plus uniquement de la
copie momentanée de la configuration chargée en mémoire. Elle est reconstruite
depuis la configuration de la caserne, les piquets et les véhicules déjà connus
dans les interventions. Le même secours est appliqué aux renforts complets.

## Protection V202609_0003 — contrôle permanent des véhicules

Avant d’ouvrir la composition de l’équipage, l’application vérifie qu’au moins un
véhicule peut être reconstruit pour la caserne. Si toutes les sources sont vides,
le départ est bloqué avec un message explicite au lieu d’afficher une liste vide.
Le panneau « Santé opérationnelle » contrôle également chaque caserne et signale
immédiatement l’absence totale de véhicules. Ce contrôle fait partie des tests
obligatoires exécutés avant chaque livraison.

## Stabilisation V202609_0004 — actions isolées visibles et relançables

Une action différée après une réponse Supabase 502, 503 ou 504 n’est plus
présentée comme une synchronisation complète : le bandeau reste sur « Sync en
attente » jusqu’à la transmission réelle. Un clic sur le bandeau ou sur
« Réessayer toutes les actions » annule immédiatement le délai de reprise et
relance la file. Les suppressions différées restent conservées durablement sans
bloquer la réception des nouvelles interventions ni afficher un faux échec
général de l’application.

## Stabilisation V202609_0005 — coupe-circuit Supabase

Après deux réponses réseau 502, 503 ou 504, l’application suspend désormais ses
requêtes Supabase pendant cinq minutes. Une seule sonde est ensuite autorisée,
ce qui empêche plusieurs onglets de maintenir la base à 100 % de CPU. Les
reconnexions Realtime et le polling de secours sont également espacés.

La présence partagée n’est plus écrite chaque minute, les diagnostics serveur
ne sont exécutés qu’à la demande et un superadministrateur revenu dans une
caserne ne recharge plus automatiquement toutes les autres casernes. Enfin, une
file locale en attente ne bloque plus la réception : les équipes, véhicules et
nouvelles interventions restent chargés pendant la reprise des écritures.

## Protection V202609_0006 — équipes et véhicules critiques

Une liste de personnel reçue partiellement ne peut plus faire considérer une
équipe locale comme étrangère, la masquer puis préparer sa suppression. Seul
le rattachement explicite d'une équipe à une autre caserne permet désormais son
nettoyage.

Si le champ des véhicules d'une caserne est absent ou nul, l'application
reconstitue le catalogue depuis les interventions et les piquets enregistrés.
Toute écriture ultérieure réutilise cette liste reconstruite au lieu d'envoyer
une configuration vide à Supabase.

## Correctif V202609_0007 — ancien cache avec véhicules nuls

L'écran des équipes protège maintenant directement son rendu contre une
ancienne configuration contenant `engins=null`. Les types et les équipes restent
visibles pendant la reconstruction du catalogue, y compris avant la première
réception complète depuis Supabase.

## Correctif V202609_0008 — chef d'agrès du rapport

Avec ses pouvoirs activés, le superadministrateur peut désormais remplacer le
chef d'agrès depuis la correction du véhicule et de l'équipage, même lorsque le
chef initial était le superadministrateur lui-même. La modification met à jour
le responsable opérationnel et reste tracée dans l'historique du rapport.

## Correctif V202609_0009 — disponibilité superadmin inter-caserne

Une disponibilité d'un compte superadmin ne peut plus être enregistrée dans
une caserne différente de sa caserne de rattachement. Les anciennes actions
locales de ce type sont abandonnées automatiquement avant tout envoi, et les
lignes distantes parasites ne sont plus chargées dans l'écran des astreintes.

## Correctif V202609_0010 — faux « Sync en attente » sur iPhone

Le rapprochement entre la file locale Safari et Supabase compare maintenant le
contenu JSON sans dépendre de l'ordre technique des champs. Une disponibilité
déjà présente à l'identique sur le serveur est automatiquement acquittée,
sans suppression de disponibilité ni nettoyage de l'historique Safari.

## Stabilisation V202609_0011 — synchronisation isolée par caserne

- Un appareil dans une caserne écoute uniquement les changements de cette caserne et des paramètres communs. L'espace global superadmin conserve sa vue de toutes les casernes.
- Les changements d'une autre caserne ne modifient plus le cache local et ne déclenchent plus un chargement complet.
- Les actions conservées sur l'appareil pour une autre caserne attendent son propre contexte ; elles ne sont plus envoyées ni superposées aux données de la caserne affichée.
- Les paramètres communs reçus en temps réel sont appliqués directement, sans relire toutes les interventions.
- La lecture par pages reprend à l'identifiant suivant : une insertion concurrente ne peut plus décaler la pagination et faire manquer une fiche.
- Une relecture de sécurité reste prévue toutes les 15 minutes et à la reprise de l'application, pour récupérer les événements manqués après une coupure.
- Les reconnexions en temps réel ralentissent progressivement si Supabase ne répond pas.

Le graphique « Postgres errors » ne permet pas d'identifier seul l'origine des erreurs. Pour la diagnostiquer sans redémarrer Supabase, ouvrir **Logs & Analytics → Logs**, sélectionner **Postgres** et les 15 dernières minutes, puis consulter les messages d'erreur les plus fréquents. Dans l'éditeur SQL des journaux, la source doit être **Logs** et non **Database**.

## Correctif serveur urgent — conflits de révision en boucle

Les journaux du 22/09/2026 montrent environ 100 erreurs `AGAI_REVISION_CONFLICT` par seconde. La fonction atomique utilisait `40001`, que PostgREST interprète comme une erreur transitoire à réessayer automatiquement. Exécuter `supabase-hotfix-revision-conflict.sql` dans le **SQL Editor** de la base Supabase, puis vérifier que les deux colonnes de résultat valent `true`. Cette intervention ne supprime ni fiche ni action en attente et ne nécessite pas de nouvelle version de l'application. Les conflits restent bloqués, avec une réponse HTTP 409.

Après la correction, surveiller les journaux Postgres et l'état de synchronisation. Si les anciennes boucles continuent, identifier leurs `process_id` dans les détails des logs avant de terminer uniquement les sessions correspondantes ; ne redémarrer le projet qu'en dernier recours, à un moment compatible avec les interventions en cours. Ne pas supprimer le cache, la file locale ou l'historique du navigateur.
