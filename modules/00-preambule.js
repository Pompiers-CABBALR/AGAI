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

// Hauteur réellement visible : corrige les variations de Safari iOS lorsque
// la barre d'adresse ou le clavier virtuel apparaît.
let _viewportFrame=0;
function syncViewportMetrics(){
  if(_viewportFrame)cancelAnimationFrame(_viewportFrame);
  _viewportFrame=requestAnimationFrame(function(){
    _viewportFrame=0;
    const viewport=window.visualViewport;
    const height=Math.round(viewport&&viewport.height?viewport.height:window.innerHeight);
    if(height>0)document.documentElement.style.setProperty('--app-height',height+'px');
    const offsetTop=Math.max(0,Math.round(viewport&&viewport.offsetTop?viewport.offsetTop:0));
    document.documentElement.style.setProperty('--visual-offset-top',offsetTop+'px');
    if(typeof syncAppelNatureViewport==='function')requestAnimationFrame(syncAppelNatureViewport);
    if(typeof keepCompteRenduFieldVisible==='function'&&document.activeElement&&document.activeElement.id==='cr-texte')requestAnimationFrame(keepCompteRenduFieldVisible);
    if(typeof keepMobileModalFieldVisible==='function'&&window._activeMobileModalFieldId)requestAnimationFrame(keepMobileModalFieldVisible);
  });
}
syncViewportMetrics();
window.addEventListener('resize',syncViewportMetrics,{passive:true});
window.addEventListener('orientationchange',syncViewportMetrics,{passive:true});
window.addEventListener('pageshow',syncViewportMetrics,{passive:true});
if(window.visualViewport)window.visualViewport.addEventListener('resize',syncViewportMetrics,{passive:true});

