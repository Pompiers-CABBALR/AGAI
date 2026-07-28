// === MODULE: config.js ===

// ── P10 : Constantes nommées (plus de magic numbers) ──
/** Quota annuel astreinte téléphonique : 18 semaines × 7 jours × 24h */
const QUOTA_ASTREINTE_TEL_H = 3024;
/** Nombre d'itérations PBKDF2 pour le hachage des mots de passe */
const PBKDF2_ITERATIONS = 100_000;
/** Durée de session avant déconnexion automatique (8 heures) */
const SESSION_DURATION_MS = 8 * 60 * 60 * 1000;
/** Format numéro d'appel : 6 chiffres (APL_2026_000001) */
const APL_NUM_DIGITS = 6;
/** Format numéro PILP temporaire : 3 chiffres (PILP-2026-001) */
const PILP_NUM_DIGITS = 3;

const GRADES_ABBR={'Sapeur':'2cl','Sapeur 1e classe':'1cl','Caporal':'Cpl','Caporal-chef':'Cch','Sergent':'Sgt','Sergent-chef':'Sch','Adjudant':'Adj','Adjudant-chef':'Adc','Lieutenant':'Ltn','Capitaine':'Cne','Commandant':'Cdt','Lieutenant-colonel':'Lcl','Colonel':'Col'};
function gradeAbbr(grade){return GRADES_ABBR[grade]||'—';}
const GRADES=['Sapeur','Sapeur 1e classe','Caporal','Caporal-chef','Sergent','Sergent-chef','Adjudant','Adjudant-chef','Lieutenant','Capitaine','Commandant','Lieutenant-colonel','Colonel'];
const FONCTIONS=['Chef de centre','Adjoint au chef de centre','Chef d\'agrès tout engin','Chef d\'agrès 1 équipe','Chef d\'équipe','Équipier','Stagiaire'];
const ALL_RIGHTS=['Prise d\'appel','Interventions','Historique complet','Chef d\'agrès','Tireur PILP','Administration','Formation'];
const RIGHT_COLORS={'Prise d\'appel':'var(--bl)','Interventions':'var(--gl)','Historique complet':'var(--al)','Chef d\'agrès':'var(--pl)','Tireur PILP':'var(--pilpl)','Administration':'var(--rl)','Formation':'#E8F5E9'};
const FONCTIONS_FORMATEUR_SPORT=['EAP 1','EAP 2','EAP 3'];
const FONCTIONS_FORMATEUR_FORM=['ACCPRO','FOR ACC'];
const FONCTIONS_FORMATEUR_SAP=['FPS','FFPS'];
const ALL_FONCTIONS_FORMATEUR=[...FONCTIONS_FORMATEUR_SPORT,...FONCTIONS_FORMATEUR_FORM,...FONCTIONS_FORMATEUR_SAP];
const FONCTIONS_COLORS={'Chef de centre':'var(--rl)','Adjoint au chef de centre':'var(--bl)','Chef d\'agrès':'var(--pl)','Chef d\'équipe':'var(--al)','Équipier':'var(--bg)','Stagiaire':'var(--bg)'};
let NAT=[
  {l:"Nid de guêpes et frelons",i:"&#x1F41D;",g:"⭐ Prioritaires"},{l:"Nid de frelons asiatiques",i:"&#x1F41D;",g:"⭐ Prioritaires"},{l:"Essaim d'abeilles",i:"&#x1F41D;",g:"⭐ Prioritaires"},{l:"Sauvetage et capture d'animaux",i:"&#x1F43E;",g:"⭐ Prioritaires"},{l:"Épuisement et assèchement",i:"&#x1F4A7;",g:"⭐ Prioritaires"},
  {l:"Accident de la circulation",i:"&#x1F697;",g:"Secours"},{l:"Secours à la personne",i:"&#x1F3E5;",g:"Secours"},{l:"Recherche de personnes sur demande",i:"&#x1F50D;",g:"Secours"},
  {l:"Feu de bâtiment",i:"&#x1F525;",g:"Feux"},{l:"Feu de benne à ordures",i:"&#x1F525;",g:"Feux"},{l:"Feu de caravane ou voiture",i:"&#x1F525;",g:"Feux"},{l:"Feu de cheminée",i:"&#x1F525;",g:"Feux"},{l:"Feu de détritus",i:"&#x1F525;",g:"Feux"},{l:"Feu de végétaux",i:"&#x1F33F;",g:"Feux"},{l:"Fumée et odeur suspecte",i:"&#x1F4A8;",g:"Feux"},
  {l:"Fuite de gaz",i:"⚠️",g:"Risques"},{l:"Fuite d'eau",i:"&#x1F4A7;",g:"Risques"},{l:"Menace de chute d'objet",i:"⚠️",g:"Risques"},{l:"Balisage d'engin de guerre",i:"&#x1F6A7;",g:"Risques"},
  {l:"Chute d'arbre",i:"&#x1F332;",g:"Opérations diverses"},{l:"Congère de neige",i:"❄️",g:"Opérations diverses"},{l:"Bâchage",i:"&#x1F3E0;",g:"Opérations diverses"},{l:"Nettoyage de la chaussée",i:"&#x1F6E3;️",g:"Opérations diverses"},{l:"Recherche d'objets",i:"&#x1F50D;",g:"Opérations diverses"},{l:"Reconnaissance diverse",i:"&#x1F4CB;",g:"Opérations diverses"},{l:"Autre",i:"&#x1F4CB;",g:"Opérations diverses"},
];
let ACT_TYPES=[
  {l:'Activit\u00e9 de service',i:'\uD83D\uDCCB'},
  {l:'R\u00e9union',i:'\uD83D\uDC65'},
  {l:'C\u00e9r\u00e9monie',i:'\uD83C\uDF96\uFE0F'},
  {l:'Contr\u00f4le des poteaux d\u2019incendie',i:'\uD83D\uDEA7'},
  {l:'D\u00e9placement divers',i:'\uD83D\uDE90'},
  {l:'D\u00e9placement vers le garage',i:'\uD83C\uDFDB\uFE0F'},
  {l:'Entretien casernement, v\u00e9hicules',i:'\uD83D\uDD27'},
  {l:'Plein des v\u00e9hicules',i:'\u26FD'},
  {l:'Frais administratifs \u2014 Chef de centre',i:'\uD83D\uDDC2\uFE0F'},
  {l:'Frais administratifs \u2014 Adjoint au chef de centre',i:'\uD83D\uDDC2\uFE0F'},
  {l:'Frais administratifs \u2014 Chef de corps',i:'\uD83D\uDDC2\uFE0F'},
  {l:'Frais administratifs \u2014 Responsable des formations',i:'\uD83C\uDF93'},
];
const ACT_ICON_LIBRARY=[
  {i:'\uD83D\uDCCB',l:'Activit\u00e9 de service'},
  {i:'\uD83D\uDC65',l:'R\u00e9union'},
  {i:'\uD83D\uDDC2\uFE0F',l:'Frais administratifs'},
  {i:'\uD83D\uDC68\u200D\uD83D\uDE92',l:'Encadrement'},
  {i:'\uD83C\uDF96\uFE0F',l:'C\u00e9r\u00e9monie'},
  {i:'\uD83D\uDEA7',l:'Contr\u00f4le ou s\u00e9curit\u00e9'},
  {i:'\uD83D\uDE90',l:'D\u00e9placement'},
  {i:'\uD83D\uDD27',l:'Entretien'},
  {i:'\u26FD',l:'Plein de carburant'},
  {i:'\uD83D\uDCDE',l:'T\u00e9l\u00e9phone'},
  {i:'\uD83D\uDCDD',l:'Compte rendu'},
  {i:'\uD83C\uDF93',l:'Formation'}
];
let COM=[{"nom": "Allouagne", "secteur": "UT Lapugnoy"}, {"nom": "Ames", "secteur": "UT Divion"}, {"nom": "Amettes", "secteur": "UT Divion"}, {"nom": "Annequin", "secteur": "UT Noyelles-lès-Vermelles"}, {"nom": "Annezin", "secteur": "UT Sailly-Labourse"}, {"nom": "Auchel", "secteur": "UT Lapugnoy"}, {"nom": "Auchy-au-bois", "secteur": "UT Divion"}, {"nom": "Auchy-les-Mines", "secteur": "UT Noyelles-lès-Vermelles"}, {"nom": "Bajus", "secteur": "UT Hersin-Coupigny"}, {"nom": "Barlin", "secteur": "UT Hersin-Coupigny"}, {"nom": "Beugin", "secteur": "UT Hersin-Coupigny"}, {"nom": "Beuvry", "secteur": "UT Sailly-Labourse"}, {"nom": "Billy-Berclau", "secteur": "UT Noyelles-lès-Vermelles"}, {"nom": "Blessy", "secteur": "UT Isbergues"}, {"nom": "Bourecq", "secteur": "UT Isbergues"}, {"nom": "Bruay-la-Buissière", "secteur": "UT Divion"}, {"nom": "Burbure", "secteur": "UT Lapugnoy"}, {"nom": "Busnes", "secteur": "UT Lapugnoy"}, {"nom": "Béthune", "secteur": "UT Sailly-Labourse"}, {"nom": "Calonne-Ricouart", "secteur": "UT Divion"}, {"nom": "Calonne-sur-la-Lys", "secteur": "UT Isbergues"}, {"nom": "Camblain-Châtelain", "secteur": "UT Hersin-Coupigny"}, {"nom": "Cambrin", "secteur": "UT Noyelles-lès-Vermelles"}, {"nom": "Cauchy-à-la-Tour", "secteur": "UT Divion"}, {"nom": "Caucourt", "secteur": "UT Hersin-Coupigny"}, {"nom": "Chocques", "secteur": "UT Lapugnoy"}, {"nom": "Cuinchy", "secteur": "UT Cuinchy"}, {"nom": "Divion", "secteur": "UT Divion"}, {"nom": "Diéval", "secteur": "UT Hersin-Coupigny"}, {"nom": "Douvrin", "secteur": "UT Noyelles-lès-Vermelles"}, {"nom": "Drouvin-le-Marais", "secteur": "UT Sailly-Labourse"}, {"nom": "Ecquedecques", "secteur": "UT Divion"}, {"nom": "Essars", "secteur": "UT Cuinchy"}, {"nom": "Estrée-Blanche", "secteur": "UT Isbergues"}, {"nom": "Estrée-Cauchy", "secteur": "UT Hersin-Coupigny"}, {"nom": "Ferfay", "secteur": "UT Divion"}, {"nom": "Festubert", "secteur": "UT Cuinchy"}, {"nom": "Fouquereuil", "secteur": "UT Sailly-Labourse"}, {"nom": "Fouquières-lès-Béthune", "secteur": "UT Sailly-Labourse"}, {"nom": "Fresnicourt-le-Dolmen", "secteur": "UT Hersin-Coupigny"}, {"nom": "Gauchin-Légal", "secteur": "UT Hersin-Coupigny"}, {"nom": "Givenchy-lès-la-Bassée", "secteur": "UT Cuinchy"}, {"nom": "Gonnehem", "secteur": "UT Lapugnoy"}, {"nom": "Gosnay", "secteur": "UT Sailly-Labourse"}, {"nom": "Guarbecque", "secteur": "UT Isbergues"}, {"nom": "Haillicourt", "secteur": "UT Hersin-Coupigny"}, {"nom": "Haisnes", "secteur": "UT Noyelles-lès-Vermelles"}, {"nom": "Ham-en-Artois", "secteur": "UT Isbergues"}, {"nom": "Hermin", "secteur": "UT Hersin-Coupigny"}, {"nom": "Hersin-Coupigny", "secteur": "UT Hersin-Coupigny"}, {"nom": "Hesdigneul-lès-Béthune", "secteur": "UT Sailly-Labourse"}, {"nom": "Hinges", "secteur": "UT Cuinchy"}, {"nom": "Houchin", "secteur": "UT Hersin-Coupigny"}, {"nom": "Houdain", "secteur": "UT Hersin-Coupigny"}, {"nom": "Isbergues", "secteur": "UT Isbergues"}, {"nom": "La Comté", "secteur": "UT Hersin-Coupigny"}, {"nom": "La Couture", "secteur": "UT Cuinchy"}, {"nom": "Labeuvrière", "secteur": "UT Lapugnoy"}, {"nom": "Labourse", "secteur": "UT Sailly-Labourse"}, {"nom": "Lambres", "secteur": "UT Isbergues"}, {"nom": "Lapugnoy", "secteur": "UT Lapugnoy"}, {"nom": "Lespesses", "secteur": "UT Divion"}, {"nom": "Liettres", "secteur": "UT Isbergues"}, {"nom": "Ligny-lès-Aire", "secteur": "UT Isbergues"}, {"nom": "Lillers", "secteur": "UT Lapugnoy"}, {"nom": "Linghem", "secteur": "UT Isbergues"}, {"nom": "Lières", "secteur": "UT Divion"}, {"nom": "Locon", "secteur": "UT Cuinchy"}, {"nom": "Lorgies", "secteur": "UT Cuinchy"}, {"nom": "Lozinghem", "secteur": "UT Lapugnoy"}, {"nom": "Maisnil-lès-Ruitz", "secteur": "UT Hersin-Coupigny"}, {"nom": "Marles-les-Mines", "secteur": "UT Lapugnoy"}, {"nom": "Mazinghem", "secteur": "UT Isbergues"}, {"nom": "Mont-Bernanchon", "secteur": "UT Cuinchy"}, {"nom": "Neuve-Chapelle", "secteur": "UT Cuinchy"}, {"nom": "Noeux-les-Mines", "secteur": "UT Sailly-Labourse"}, {"nom": "Norrent-Fontes", "secteur": "UT Isbergues"}, {"nom": "Noyelles-lès-Vermelles", "secteur": "UT Noyelles-lès-Vermelles"}, {"nom": "Oblinghem", "secteur": "UT Cuinchy"}, {"nom": "Ourton", "secteur": "UT Hersin-Coupigny"}, {"nom": "Quernes", "secteur": "UT Isbergues"}, {"nom": "Rebreuve-Ranchicourt", "secteur": "UT Hersin-Coupigny"}, {"nom": "Rely", "secteur": "UT Isbergues"}, {"nom": "Richebourg", "secteur": "UT Cuinchy"}, {"nom": "Robecq", "secteur": "UT Lapugnoy"}, {"nom": "Rombly", "secteur": "UT Isbergues"}, {"nom": "Ruitz", "secteur": "UT Hersin-Coupigny"}, {"nom": "Sailly-Labourse", "secteur": "UT Sailly-Labourse"}, {"nom": "Saint-Floris", "secteur": "UT Isbergues"}, {"nom": "Saint-Hilaire-Cottes", "secteur": "UT Isbergues"}, {"nom": "Saint-Venant", "secteur": "UT Isbergues"}, {"nom": "Vaudricourt", "secteur": "UT Sailly-Labourse"}, {"nom": "Vendin-lès-Béthune", "secteur": "UT Cuinchy"}, {"nom": "Vermelles", "secteur": "UT Noyelles-lès-Vermelles"}, {"nom": "Verquigneul", "secteur": "UT Sailly-Labourse"}, {"nom": "Verquin", "secteur": "UT Sailly-Labourse"}, {"nom": "Vieille-Chapelle", "secteur": "UT Cuinchy"}, {"nom": "Violaines", "secteur": "UT Cuinchy"}, {"nom": "Westrehem", "secteur": "UT Divion"}, {"nom": "Witternesse", "secteur": "UT Isbergues"}];
const GC={'Lapugnoy':[50.508,2.548],'Auchy-les-Mines':[50.513,2.775],'Béthune':[50.530,2.637],'Barlin':[50.455,2.617],'Lillers':[50.560,2.484],'Divion':[50.462,2.596],'Noeux-les-Mines':[50.476,2.666],'Bruay-la-Buissière':[50.481,2.545]};
function gc(c){return GC[c]||[50.51,2.60];}
function dst(a,b){const x=a[0]-b[0],y=a[1]-b[1];return Math.sqrt(x*x+y*y);}

