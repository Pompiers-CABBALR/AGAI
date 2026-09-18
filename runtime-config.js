/* AGAI — configuration publique du navigateur.
 * Ne jamais placer ici de clé Brevo, de clé maître JSONBin ou de secret serveur.
 */
window.AGAI_CONFIG = Object.freeze({
  supabaseUrl: 'https://lpzblzqxmoiwghvkhqnt.supabase.co',
  supabasePublishableKey: 'sb_publishable_dkzyaOmA-FeBhL4c1z_KZw_nOdOTWuL',
  // Mode secours v239.8 : la liaison des comptes reste installée côté serveur,
  // mais elle est neutralisée dans le navigateur jusqu'à validation complète.
  accountLinkEnabled: false,
  accountLinkEndpoint: '',
  mailEndpoint: ''
});
