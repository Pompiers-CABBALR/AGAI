# AGAI — version modulaire

Cette variante conserve les fonctionnalités de `AGAI-securise.html`, mais sépare
le code afin de faciliter les prochaines corrections.

La V202609_0025 corrige le cas où l'intervention d'origine, liée à une PILP,
restait sans numéro définitif après sa clôture. Le correctif serveur V25 doit
être validé sur une copie avant publication de l'application ; la
régularisation historique reste séparée et n'est pas appliquée automatiquement.

La V202609_0024 permet de reprendre un avis de passage dans une prise
d'appel préremplie, et de clôturer une intervention dont l'adresse est
introuvable tout en créant une nouvelle fiche en attente liée à l'ancienne.

La V202609_0023 ajoute plusieurs contacts PILP, une destination GPS facultative,
la séparation de l'adresse et de son complément pour Maps, et l'effacement
explicite des disponibilités du requérant. Une PILP liée ne recopie plus les
dates de disponibilité de sa fiche d'origine.

La V202609_0022 corrige le rappel d'un avis de passage lorsque l'espace entre
le numéro d'habitation et le nom de rue diffère d'une saisie à l'autre.
Les avis déjà restés ouverts avant cette correction nécessitent une
régularisation ciblée après vérification des deux fiches concernées.

## Fichiers principaux

- `index.html` : structure de l’application ;
- `style.css` : apparence et adaptation mobile ;
- `runtime-config.js` : configuration publique ;
- `version.json` : numéro de la version publiée, utilisé par le bandeau de mise à jour ;
- `modules/` : logique applicative répartie en 22 fichiers ;
- `app.js` : copie complète du JavaScript, conservée comme référence de contrôle
  mais non chargée par `index.html` ;
- `supabase-atomic-operations-v238.sql` : mise à niveau Supabase qui protège les
  engagements simultanés et attribue les numéros provisoires côté serveur ;
- `supabase-numbering-finalization-v202609-0014.sql` : attribution définitive
  des numéros à la clôture, à tester sur une copie avant toute production ;
- `supabase-account-link-v239.sql` et `supabase/functions/agai-account-link/` :
  liaison invisible et progressive des comptes AGAI à Supabase Auth ;
- `DIAGNOSTIC-LIAISON-V202609-0019.sql` : vérification en lecture seule avant
  tout essai du pilote manuel ;
- `DIAGNOSTIC-PILOTE-BRIAN-V202609-0021.sql` : contrôle en lecture seule avant
  le rattachement limité à Brian ;
- `DEPLOIEMENT-SECURISE.md` : procédure d’installation et de vérification.

## Utilisation

Tous les fichiers et le dossier `modules` doivent rester ensemble. Pour publier
l’application, copier le contenu complet du dossier sur l’hébergement.

À chaque publication, remplacer également `version.json`. L’application le contrôle
dès son ouverture, toutes les deux minutes, au retour sur l’onglet et lorsque la
connexion Internet revient. Si une version différente est détectée, un bandeau
« Nouvelle version disponible » propose « Actualiser maintenant ». Ce rechargement
ne supprime ni l’historique, ni les comptes, ni les données enregistrées localement.

Ne jamais placer de secret dans `runtime-config.js`. La clé Supabase publishable
peut y figurer, mais pas une clé Brevo, une clé maître JSONBin ou une clé de service.

L’envoi d’e-mails reste désactivé tant que `mailEndpoint` ne pointe pas vers une
passerelle serveur sécurisée.

## Authentification actuelle

Les identifiants AGAI existants sont conservés. Le mot de passe demandé pour la
vérification est celui d'AGAI, jamais celui du tableau de bord Supabase. Dans la V202609_0021, la liaison
technique Supabase Auth permet la vérification manuelle du compte déjà lié
`dacheville.thibaut` et un seul rattachement manuel nouveau pour `lericque.brian`.
Aucune requête Auth n'est lancée à la connexion. Cette livraison
prépare la numérotation provisoire au départ et définitive à la clôture, ainsi
qu'une confirmation à deux gestes pour éviter une clôture accidentelle. Elle
signale aussi les chevauchements entre interventions et activités, en laissant
partir une intervention réelle et en demandant la régularisation de la présence.
Les doublons UT historiques 276 et 278 ont un indice d'affichage sur la seconde
fiche de chaque paire, sans modifier les valeurs stockées. Elle n'est pas encore
déployée en production par cette préparation ; la numérotation définitive doit
rester active sur la base cible. Chaque
compte possède un `caserneId` et un `appRole` maintenus par l’application.

Cette association organise les droits dans AGAI, mais ne permet pas à Supabase
d’identifier de manière forte tous les utilisateurs connectés. Les règles RLS
prévues pour une migration complète Supabase Auth ne doivent donc pas être activées
dans cette configuration. Lire `DEPLOIEMENT-SECURISE.md` avant toute publication.

## Écrans mobiles

La mise en page prend en charge :

- les zones sûres des iPhone avec encoche ou Dynamic Island ;
- la barre d’accueil située en bas des iPhone ;
- la hauteur variable de Safari et l’ouverture du clavier virtuel ;
- le mode portrait et le mode paysage ;
- les écrans étroits à partir de 320 px ;
- les smartphones Android, tablettes et grands écrans ;
- des champs de 16 px pour empêcher le zoom automatique de Safari ;
- des boutons tactiles d’au moins 44 px sur les appareils tactiles.

Il est recommandé de tester au minimum un iPhone Safari, un smartphone Android
Chrome, une tablette et un ordinateur avant chaque mise en production.

En orientation paysage, les menus utilisent une colonne par rubrique et peuvent
afficher leur libellé sur deux lignes. La grille des disponibilités répartit les
24 créneaux horaires sur la largeur réellement disponible ; le dernier créneau
07 h–08 h ne doit plus être coupé par Safari.

La règle du menu paysage s’applique désormais indépendamment de la détection
tactile du navigateur, jusqu’à 1 400 px de largeur. Les formulaires Activités,
FMPA et Formations intègrent leur bouton « Fermer » dans leur titre ; le bouton
extérieur est masqué pendant la saisie afin d’éviter une bande vide en haut.

Sur ordinateur, le document conserve explicitement un défilement vertical standard
à la molette et au pavé tactile. La suppression du rebond vertical est appliquée
uniquement aux appareils tactiles.

## Vérification

La variante a été contrôlée sur les points suivants :

- validité syntaxique de chacun des 22 modules ;
- reconstruction exacte du bundle JavaScript ;
- ordre et présence de tous les modules dans `index.html` ;
- absence des anciennes clés privées et mots de passe initiaux ;
- présence des protections de mot de passe, sauvegarde, rôles et numérotation.
