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
