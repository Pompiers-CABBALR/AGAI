/* AGAI — configuration publique du navigateur.
 * Ne jamais placer ici de clé Brevo, de clé maître JSONBin ou de secret serveur.
 */
window.AGAI_CONFIG = Object.freeze({
  supabaseUrl: 'https://lpzblzqxmoiwghvkhqnt.supabase.co',
  supabasePublishableKey: 'sb_publishable_dkzyaOmA-FeBhL4c1z_KZw_nOdOTWuL',
  // Correctif opérationnel V202609_0013 : liaison des comptes en pause.
  // Ne pas activer le pilote Auth tant que la synchronisation n'est pas stable.
  accountLinkMode: 'off',
  accountLinkCanaryLogins: ['dacheville.thibaut'],
  accountLinkEndpoint: '',
  mailEndpoint: ''
});
