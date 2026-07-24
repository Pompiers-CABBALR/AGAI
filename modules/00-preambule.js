/**
 * AGAI v18 — Application de Gestion des Astreintes et des Interventions
 *
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │  CARTE DES MODULES (P6 — future extraction en fichiers séparés)    │
 * ├──────────────────────────┬──────────────────────────────────────────┤
 * │  MODULE                  │  CONTENU                                 │
 * ├──────────────────────────┼──────────────────────────────────────────┤
 * │  config.js               │  GRADES, FONCTIONS, NAT, COM, constantes │
 * │  security.js             │  hashPassword, verifyPassword, session,  │
 * │                          │  chiffrement localStorage, escHtml       │
 * │  auth.js                 │  doLogin, doLogout, droits, rôles        │
 * │  storage.js              │  saveData, loadData, _buildDataObject    │
 * │  ui.js                   │  showToast, confirmModal, showT, modales │
 * │  accueil.js              │  rAccueil, rAccueilAstreinte             │
 * │  appel.js                │  gS, enr, filtN, addrAutocomplete        │
 * │  interventions.js        │  rI, oM, cS, clot, toggleChk, parcours  │
 * │  pilp.js                 │  rPilp, oPilp, showPilpForm              │
 * │  historique.js           │  rHist, renderHistGroup                  │
 * │  astreintes.js           │  planning, équipes, piquets, dispos      │
 * │  formations.js           │  FMPA, stagiaires, formateurs            │
 * │  activites.js            │  comptes rendus activités de service     │
 * │  stats.js                │  statistiques, chef de corps, superadmin │
 * │  admin.js                │  rAdm, addUser, editCaserne, référentiel │
 * │  astreinte_tel.js        │  grille téléphonier, récap annuel        │
 * │  main.js                 │  loadData(), tick(), init                │
 * └──────────────────────────┴──────────────────────────────────────────┘
 *
 * Pour découper : chaque marqueur  === MODULE: xxx ===  délimite
 * exactement le contenu à extraire dans le fichier correspondant.
 */

