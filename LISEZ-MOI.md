# AGAI — version modulaire

Cette variante conserve les fonctionnalités de `AGAI-securise.html`, mais sépare
le code afin de faciliter les prochaines corrections.

## Fichiers principaux

- `index.html` : structure de l’application ;
- `style.css` : apparence et adaptation mobile ;
- `runtime-config.js` : configuration publique ;
- `modules/` : logique applicative répartie en 22 fichiers ;
- `app.js` : copie complète du JavaScript, conservée comme référence de contrôle
  mais non chargée par `index.html`.

## Utilisation

Tous les fichiers et le dossier `modules` doivent rester ensemble. Pour publier
l’application, copier le contenu complet du dossier sur l’hébergement.

Ne jamais placer de secret dans `runtime-config.js`. La clé Supabase publishable
peut y figurer, mais pas une clé Brevo, une clé maître JSONBin ou une clé de service.

L’envoi d’e-mails reste désactivé tant que `mailEndpoint` ne pointe pas vers une
passerelle serveur sécurisée.

## Authentification actuelle

Les identifiants AGAI existants sont conservés. Les utilisateurs ne sont pas créés
dans Supabase Auth. Chaque compte possède toutefois un `caserneId` et un `appRole`
maintenus automatiquement par l’application.

Cette association organise les droits dans AGAI, mais ne permet pas à Supabase
d’identifier de manière forte l’utilisateur connecté. Les règles RLS prévues pour
Supabase Auth ne doivent donc pas être activées dans cette configuration.

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

## Vérification

La variante a été contrôlée sur les points suivants :

- validité syntaxique de chacun des 22 modules ;
- reconstruction exacte du bundle JavaScript ;
- ordre et présence de tous les modules dans `index.html` ;
- absence des anciennes clés privées et mots de passe initiaux ;
- présence des protections de mot de passe, sauvegarde, rôles et numérotation.
