/* AGAI — configuration publique du navigateur.
 * Ne jamais placer ici de clé Brevo, de clé maître JSONBin ou de secret serveur.
 */
window.AGAI_CONFIG = Object.freeze({
  supabaseUrl: 'https://lpzblzqxmoiwghvkhqnt.supabase.co',
  supabasePublishableKey: 'sb_publishable_dkzyaOmA-FeBhL4c1z_KZw_nOdOTWuL',
  // Bascule Auth : chaque ouverture et chaque synchronisation exigent une
  // identité Supabase valide et le statut de personnel autorisé par le serveur.
  accountLinkMode: 'on',
  personnelOnlineGateEnabled: true,
  accountLinkCanaryLogins: ['dacheville.thibaut', 'lericque.brian', 'accoley.leo', 'degryse.herve', 'douvrin.pascal', 'dumoulin.sebastien', 'francois.laurent', 'maerten.mathis', 'marien.matthis', 'smagliante.enzo', 'millecamps.alicia', 'canneson.eric', 'leriche.valery'],
  accountLinkNewCanaryLogins: ['millecamps.alicia', 'canneson.eric', 'leriche.valery'],
  accountLinkEndpoint: '',
  mailEndpoint: ''
});
