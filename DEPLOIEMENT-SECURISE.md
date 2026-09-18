# AGAI — déploiement sécurisé

## Décision actuelle

Les identifiants AGAI existants sont conservés. Les comptes ne sont pas créés dans
Supabase Auth et aucun changement obligatoire de mot de passe n’est activé.

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

**Mode de secours v239.3 :** la liaison des comptes est temporairement désactivée
dans `runtime-config.js`. La reprise commence obligatoirement par une réception et
un rapprochement avec Supabase. Les actions restant réellement à envoyer sont
traitées par lots de 25 au maximum afin que plusieurs casernes puissent continuer
à utiliser l’application pendant la résorption d’une ancienne file volumineuse.
Ne pas réactiver `accountLinkEnabled` avant une validation séparée de la future
version.

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
6. dans `runtime-config.js`, passer `accountLinkEnabled` à `true` et laisser
   `accountLinkEndpoint` vide pour utiliser automatiquement le projet configuré ;
7. publier l’application, puis contrôler **Liaison des comptes v239** dans la maintenance.

Le compteur augmente au fil des connexions ordinaires. Les agents n’ont aucune
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
