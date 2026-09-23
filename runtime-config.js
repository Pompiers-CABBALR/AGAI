/* AGAI — configuration publique du navigateur.
 * Ne jamais placer ici de clé Brevo, de clé maître JSONBin ou de secret serveur.
 */
window.AGAI_CONFIG = Object.freeze({
  supabaseUrl: 'https://lpzblzqxmoiwghvkhqnt.supabase.co',
  supabasePublishableKey: 'sb_publishable_dkzyaOmA-FeBhL4c1z_KZw_nOdOTWuL',
  // Vérification manuelle d'un compte déjà lié : aucun appel Auth à la connexion AGAI.
  // Remettre 'off' ici suffit à interrompre le pilote sans toucher aux données.
  accountLinkMode: 'canary',
  accountLinkCanaryLogins: ['dacheville.thibaut'],
  accountLinkEndpoint: '',
  mailEndpoint: ''
});
