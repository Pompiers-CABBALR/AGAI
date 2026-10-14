/* AGAI — configuration publique du navigateur.
 * Ne jamais placer ici de clé Brevo, de clé maître JSONBin ou de secret serveur.
 */
window.AGAI_CONFIG = Object.freeze({
  supabaseUrl: 'https://lpzblzqxmoiwghvkhqnt.supabase.co',
  supabasePublishableKey: 'sb_publishable_dkzyaOmA-FeBhL4c1z_KZw_nOdOTWuL',
  // Connexion précédente maintenue : l'essai Auth V0024 reste non concluant.
  // Aucun ancien accès à la base n'est fermé à ce stade.
  accountLinkMode: 'canary',
  personnelOnlineGateEnabled: false,
  accountLinkCanaryLogins: ['dacheville.thibaut', 'lericque.brian', 'accoley.leo', 'degryse.herve', 'douvrin.pascal', 'dumoulin.sebastien', 'francois.laurent', 'maerten.mathis', 'marien.matthis', 'smagliante.enzo', 'millecamps.alicia', 'canneson.eric', 'leriche.valery'],
  accountLinkNewCanaryLogins: ['millecamps.alicia', 'canneson.eric', 'leriche.valery'],
  accountLinkEndpoint: '',
  mailEndpoint: ''
});
