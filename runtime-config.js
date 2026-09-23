/* AGAI — configuration publique du navigateur.
 * Ne jamais placer ici de clé Brevo, de clé maître JSONBin ou de secret serveur.
 */
window.AGAI_CONFIG = Object.freeze({
  supabaseUrl: 'https://lpzblzqxmoiwghvkhqnt.supabase.co',
  supabasePublishableKey: 'sb_publishable_dkzyaOmA-FeBhL4c1z_KZw_nOdOTWuL',
  // Pilote manuel : vérification du compte déjà lié et création unique pour Brian.
  // Aucun appel Auth à la connexion AGAI, aucune incidence sur la synchronisation.
  // Remettre 'off' ici suffit à interrompre le pilote sans toucher aux données.
  accountLinkMode: 'canary',
  accountLinkCanaryLogins: ['dacheville.thibaut', 'lericque.brian'],
  accountLinkNewCanaryLogin: 'lericque.brian',
  accountLinkEndpoint: '',
  mailEndpoint: ''
});
