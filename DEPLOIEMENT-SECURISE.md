# AGAI — déploiement sécurisé

## Préparation V202609_0023 — contacts PILP, GPS, adresse et disponibilités

**Préparée localement, non déployée par Codex.** Une PILP liée reprend
le requérant et les téléphones de l'intervention d'origine, mais pas ses
anciennes dates de disponibilité. Son formulaire permet d'ajouter d'autres
requérants, plusieurs téléphones et un point GPS. Ces éléments restent
modifiables dans « Compléter » sur la fiche. Les disponibilités et
indisponibilités peuvent y être effacées explicitement.

La prise d'appel sépare automatiquement le numéro d'habitation de la rue.
Les liens Maps utilisent l'adresse de base, sans complément ; un point GPS
manuel, lorsqu'il est renseigné, devient la destination prioritaire.
Publier tous les fichiers V202609_0023 ensemble, notamment
`runtime-config.js` et `version.json`. Aucun SQL ou déploiement Edge n'est
nécessaire. Tester d'abord sur un appareil de test, puis vérifier la file de
synchronisation avant d'élargir la publication. Les disponibilités déjà
copiées dans des PILP anciennes ne sont pas effacées automatiquement : les
retirer fiche par fiche après vérification.

## Préparation V202609_0022 — rappel après avis de passage

**Préparée localement, non déployée par Codex.** Cette version corrige le
rapprochement d'une adresse saisie sans espace entre le numéro et la rue
(par exemple `12Rue` et `12 Rue`). Il reste strict sur le numéro, la rue,
la commune et la nature de l'intervention. À la création d'un nouvel appel,
l'avis correspondant est retiré des avis en attente et relié à cet appel.

Publier tous les fichiers de l'application V202609_0022 ensemble, y compris
`runtime-config.js` et `version.json`. Aucun changement SQL ou Edge Function
n'est requis ; la liaison technique pilote des comptes reste inchangée.
Vérifier avec un appel d'essai non opérationnel seulement si un environnement
de test est disponible, puis contrôler que la file de synchronisation reste
vide et que l'envoi et la réception restent récents.

Un avis déjà resté affiché avant cette version n'est pas corrigé
automatiquement : il faut identifier précisément l'ancien avis et le nouvel
appel avant toute régularisation. Ne pas supprimer ou modifier des fiches en
production sur la seule base d'une ressemblance d'adresse.

## Préparation V202609_0021 — pilote Brian, création unique

**Préparée localement, non déployée par Codex.** La V20 reste la version en place
tant que les contrôles ci-dessous ne sont pas terminés. `lericque.brian` est le
seul nouveau compte admis au pilote ; `dacheville.thibaut` conserve uniquement
son bouton de vérification. La connexion AGAI n'effectue aucun appel Auth.

1. Exécuter `DIAGNOSTIC-PILOTE-BRIAN-V202609-0021.sql` dans l'éditeur SQL
   Supabase. Il ne retourne ni mot de passe ni empreinte. Attendre une seule
   ligne avec `actif=true`, `deja_lie=false`,
   `identite_auth_deja_presente=false` et `mot_de_passe_agai_aligne=true`.
   Si un résultat diffère, arrêter : ne pas relancer le SQL v239 et ne pas
   créer de compte à la main.
2. Déployer **uniquement** la fonction Edge `supabase/functions/agai-account-link`
   fournie avec ce paquet. Son GET doit répondre `version: v239.1` et
   `pilotCreateOnlyLogin: lericque.brian` avant la publication de l'application.
   L'ancien mode `login` reste intact ; le nouveau mode `pilot_link` n'accepte
   que Brian et refuse (`409`) toute identité déjà liée sans la modifier.
3. Publier ensuite **tous** les fichiers de la V202609_0021 sur l'hébergement,
   y compris `runtime-config.js` et `version.json`. Sur un seul appareil, Brian
   se connecte lui-même à AGAI et attend une file vide, une réception récente
   et la santé du service pilote « prêt ». Il ouvre ⚙️ → « Mon profil », puis
   déclenche une seule fois « Rattacher mon compte » avec son mot de passe AGAI.
   Ne jamais saisir le mot de passe du tableau de bord Supabase.
4. Vérifier que la liaison passe de 11/24 à 12/24, que la file reste vide et
   que les derniers envoi/réception restent récents. En cas de résultat incertain,
   ne pas répéter l'essai : relancer uniquement le diagnostic en lecture seule.

Le compte technique créé n'est **pas utilisé pour la synchronisation**. Sa
session de test est révoquée localement et aucun jeton n'est conservé. Ne pas
passer `accountLinkMode` à `on` et ne pas activer les RLS restrictives. Pour
arrêter le pilote, mettre `accountLinkMode: 'off'` dans `runtime-config.js` et
republier ce fichier ; cela ne supprime ni file locale ni compte déjà créé.
Ne pas redémarrer Supabase pour ce pilote.

## Préparation V202609_0020 — vérification du compte Supabase déjà lié

**Non déployée en production par cette préparation.** Le diagnostic de production
montre que `dacheville.thibaut` figure déjà parmi les 11 comptes liés sur 24,
sans verrouillage. Il ne faut donc pas relancer la création ou la mise à jour de
son identité. Le mot de passe du tableau de bord Supabase n'est **jamais**
demandé ni utilisé : l'identité technique Auth d'AGAI est distincte du compte
qui administre le projet Supabase. Le pilote V202609_0019 est remplacé : son bouton est désormais
« Vérifier mon compte existant ». Après confirmation locale du mot de passe,
il teste uniquement une connexion Supabase Auth pour l'identité technique déjà
connue, vérifie le login et la caserne renvoyés, puis révoque **uniquement cette
session de test** (`scope=local`). Aucun jeton n'est conservé et aucun appel
n'est envoyé à la fonction Edge de création/mise à jour des comptes.

La vérification reste manuelle, limitée à ce compte et à un appareil dont la
synchronisation est saine. Une panne ou un mot de passe Auth devenu différent du
mot de passe AGAI donne un échec non bloquant ; ne pas corriger les identités ou
rejouer le SQL à l'aveugle. Le lien existant et les 13 comptes non liés restent
inchangés. Les anciennes sessions sur d'autres appareils ne sont pas révoquées.
Après la vérification, contrôler la file, les derniers envoi/réception et les
logs Auth. Le retour arrière demeure `accountLinkMode: 'off'` dans
`runtime-config.js` ; ne pas activer le mode `on` ni les RLS restrictives.

## Archive V202609_0019 — remplacée, ne pas déployer

**Historique uniquement : utiliser la V202609_0020 ci-dessus.** Le dossier modulaire était
configuré en mode `canary`, limité au compte pilote `dacheville.thibaut`.
Contrairement à l'ancien essai, aucune requête Auth n'est envoyée à la connexion
AGAI. Le pilote démarre uniquement par le bouton « Tester ma liaison sur cet
appareil » de la Maintenance, après saisie et vérification locale du mot de
passe AGAI. Le bouton reste désactivé si le serveur de liaison ne répond pas,
si la dernière réception date de plus de 15 minutes, si la file n'est pas vide,
si la synchronisation n'est pas « OK » ou si la protection anti-saturation est
active. Une seule tentative peut être en cours ; un échec suspend les suivantes
pendant 5 minutes. Le résultat n'empêche ni la connexion ni le travail courant.

Le pilote ne garde pas de jeton Auth et n'envoie **aucune** donnée opérationnelle
avec ce jeton. Les interventions continuent d'utiliser l'accès Supabase actuel.
Les changements de mot de passe et la gestion des comptes AGAI ne dépendent pas
du pilote : une liaison existante pourra devoir être réessayée après un
changement de mot de passe. **Ne pas activer les politiques RLS restrictives**
ni passer en mode `on` dans cette phase.

Avant un essai réel, utiliser `DIAGNOSTIC-LIAISON-V202609-0019.sql` pour
vérifier en lecture seule les tables privées, leurs droits et la fonction de
santé ; contrôler aussi la fonction Edge `agai-account-link`. Contrôler la
production **sans rejouer le SQL de migration** : sauvegarde disponible, état
Sync OK, file vide, réception récente,
absence d'erreurs Postgres répétées et charge normale. Publier tous les fichiers
de la même V202609_0019, ouvrir Maintenance sur **un seul appareil**, rafraîchir
la santé puis déclencher l'essai. Vérifier ensuite la connexion AGAI, la file,
les dates d'envoi/réception, les logs Auth/Edge et la charge Supabase. Ne pas
élargir au personnel avant une période d'observation stable.

**Arrêt immédiat du pilote :** remettre `accountLinkMode: 'off'` dans
`runtime-config.js`, republier ce fichier et actualiser l'appareil pilote.
Ne supprimer ni cache, ni file locale, ni comptes ; ne pas redémarrer Supabase.
Le compte Auth déjà créé peut rester lié côté serveur sans être utilisé.

## Correction V202609_0018 — indices UT visibles dans l'historique

La V202609_0017 a été affichée sur un appareil mais les indices « -1 » ne
s'affichaient pas dans l'historique : le code comparait l'identifiant complet
de la ligne Supabase (`CIS05__iv__...`) à l'identifiant de l'intervention
présent dans la fiche (`APL_...`). La V202609_0018 utilise ce dernier, qui est
celui reçu par l'interface. Un test rend réellement les quatre lignes de
l'historique et vérifie les affichages 276, 276-1, 278 et 278-1.

Cette correction ne modifie aucune donnée, aucun numéro technique ni aucune
file locale. Elle ne nécessite pas de SQL ou de redémarrage Supabase. Après
publication complète du dossier modulaire, actualiser les appareils et vérifier
ces quatre lignes dans l'historique. Les deux anomalies historiques signalées
par Supabase resteront visibles, puisque les numéros enregistrés sont inchangés.

## Préparation V202609_0017 — indices d'affichage des doublons UT historiques

**Non déployée en production.** Les quatre interventions terminées du 9 septembre
2026 concernées par les deux doublons UT de CIS05 restent enregistrées sans
modification. La fiche M59 conserve l'affichage **UT 276** et la fiche M62
(départ à 14 h 41) affiche **UT 276-1**. La fiche M60 conserve **UT 278** et
la fiche M64 (départ à 15 h 45 selon l'horodatage de départ) affiche
**UT 278-1**. L'indice est attaché à l'identifiant exact de la fiche, et
seulement si son numéro technique est encore 276 ou 278.

Il s'agit uniquement d'un affichage dans la liste, le détail, l'historique,
les recherches, l'export et les nouveaux PDF. Les champs numériques stockés
dans Supabase, les compteurs, la synchronisation et les anciens PDF restent
inchangés. Le contrôle serveur continuera donc de signaler **2 groupes de
doublons historiques** : ne pas interpréter cette alerte comme un échec de
la V202609_0017. Aucun nouveau SQL ni redémarrage Supabase n'est requis.
Tous les appareils doivent recevoir la même version pour voir les indices.
Vérifier les quatre fiches, l'export et un nouveau PDF sur une copie avant
toute publication. Ne pas modifier les anciennes fiches pour supprimer l'alerte.

## Préparation V202609_0016 — conflits entre interventions et activités

**Non déployée en production.** Lors d'un départ réel (intervention ou renfort),
un chevauchement avec une FMPA, une formation ou une activité de service ne bloque
pas le départ. L'application indique le nom de l'agent, l'activité et ses heures,
ajoute une trace à l'intervention et affiche « Présence à régulariser » dans la
fiche et dans la santé opérationnelle tant que l'intervention est en cours.

La création ou la modification d'une FMPA ou d'une activité de service est en
revanche refusée si un participant ou formateur est déjà engagé sur une
intervention connue aux mêmes heures. La création des formations est soumise au
même contrôle ; les heures du matin ou de l'après-midi sont désormais obligatoires
et complètes. Les anciennes formations sans heures précises sont traitées comme
une présence sur toute la journée, avec mention « horaires à préciser ».

Le contrôle utilise les données déjà présentes et synchronisées sur l'appareil :
il ne lance aucune requête Supabase supplémentaire et ne nécessite ni SQL ni
redémarrage. Il ne peut toutefois pas garantir l'absence de chevauchement si un
autre appareil est hors ligne ou possède des données plus récentes. Vérifier la
liste des alertes et régulariser la présence après synchronisation. La liaison
technique des comptes demeure désactivée. Les prérequis de numérotation V202609_0014
ci-dessous restent obligatoires avant toute publication de cette version.

## Préparation V202609_0015 — clôture protégée contre les fausses manipulations

**Non déployée en production.** Cette version reprend la numérotation préparée
en V202609_0014 et ajoute une étape distincte de vérification avant toute
clôture courante : intervention standard, PILP, renfort UT, saisie directe
superadmin ou clôture demandée après sauvegarde du compte rendu. Le premier
appui ouvre un récapitulatif sans changer le statut ni enregistrer de retour.
Le chef d'agrès doit cocher une case initialement vide, puis appuyer sur
« Clôturer définitivement ». Annuler, fermer la fenêtre ou appuyer deux fois
sur le bouton de la fiche ne clôture pas. Une fiche modifiée entre-temps doit
être rouverte.

La saisie directe superadmin conserve ses validations d'horaires, de véhicule
et d'équipage avant la confirmation ; la clôture ne commence qu'après celle-ci.
Les classements d'avis de passage conservent leur confirmation dédiée.

**Ne pas publier isolément ce fichier HTML.** Le script de numérotation
`supabase-numbering-finalization-v202609-0014.sql` et les scénarios de test
ci-dessous restent préalables sur une copie de la base. La protection
anti-erreur doit aussi être essayée sur mobile : défilement vertical sur le
bouton, annulation, double appui, PILP et renfort. La production et Supabase
n'ont pas été modifiés par cette préparation.

## Préparation V202609_0014 — numérotation provisoire et définitive

**Non déployée en production.** La V202609_0014 prépare un numéro provisoire
pendant « en cours », supprimé au retour « en attente », puis un nouveau numéro
définitif attribué par Supabase lors de la clôture. Un numéro provisoire peut
changer à la clôture ; l'identifiant APL reste stable. Les numéros des fiches
déjà terminées ne sont ni repris ni décalés : les trous historiques, dont M164,
restent visibles. Les nouveaux retours en attente ne consomment plus de numéro
définitif. Une suppression ultérieure de fiche terminée peut encore créer un
trou ; elle doit rester tracée, et non conduire à une renumérotation silencieuse.

Cette version nécessite **d'abord** le script
`supabase-numbering-finalization-v202609-0014.sql`, sur une copie de la base.
Il vérifie la définition actuelle des fonctions et s'arrête sans changement si
elle diffère. La version ne doit être publiée qu'après un essai complet sur
une base de test : deux départs simultanés, retour en attente de l'un, clôture
de l'autre, reprise du premier, clôture des deux, puis vérification de la
numérotation depuis deux appareils. Contrôler également une panne réseau :
la clôture reste dans la file locale et le rapport PDF attend le numéro final.

Avant une éventuelle mise en production, obtenir une sauvegarde vérifiée, une
file « Sync OK » sur les appareils concernés et un créneau sans intervention en
cours. Appliquer le SQL, confirmer que sa dernière requête renvoie `true`, puis
publier l'application. Ne pas redémarrer Supabase ni effacer les caches ou files
locales. La liaison technique des comptes reste désactivée.

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

### Historique du pilote v239 — remplacé par le protocole V202609_0019 ci-dessus

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
