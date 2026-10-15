# Transferts et renforts entre casernes — préparation

État au 15 octobre 2026 : la connexion Auth générale est active, mais les
transferts d’interventions et les renforts entre casernes restent désactivés.
Ne pas retirer `requireSecureCrossStationWorkflow()` avant la mise en place
et la vérification d’un parcours serveur dédié. Le contrôle automatique
`tests/test-cross-station-safety.cjs` protège les neuf points d’entrée de
l’ancien circuit dans l’application monolithique et les modules publiés.
Un contrôle en lecture seule sur la base a confirmé qu’un compte ordinaire
CIS05 peut écrire un renfort CIS05 mais pas un renfort CIS03.

## Pourquoi l’ancien circuit ne peut pas être réactivé

Le navigateur de la caserne source créait ou modifiait directement des fiches
dans une autre caserne. Pour un transfert, il annulait l’original et créait
ensuite une copie : une seule écriture en échec pouvait laisser une fiche
annulée sans fiche reçue. Pour un renfort, demande, réponse et intervention
source étaient aussi enregistrées séparément. Les nouvelles règles d’accès
refusent à juste titre ces écritures inter-casernes.

## Contrat du nouveau parcours serveur

1. Identifier l’agent avec sa session Auth et son statut administratif à jour.
   Déduire sa caserne et son rôle côté serveur, sans accepter ceux fournis par
   le navigateur.
2. Vérifier que la fiche source existe, appartient à sa caserne et que son
   état autorise l’action. Vérifier que la caserne destinataire existe, est
   différente et peut recevoir la demande.
3. Déduire le contenu transmis de la fiche source enregistrée ; limiter les
   paramètres libres au motif et aux choix nécessaires. Ne jamais accepter
   une fiche complète arbitraire fournie par le navigateur.
4. Pour un transfert, attribuer un **nouveau numéro APL** côté serveur et
   enregistrer la copie destinataire et le changement de statut de la source
   dans une seule transaction. C’est le fonctionnement confirmé par
   l’administrateur. En cas d’échec, aucune des deux fiches ne change.
5. Pour un renfort, enregistrer une demande idempotente et sa référence dans
   l’intervention source dans une seule transaction. Réponse, départ,
   composition d’équipage et clôture doivent être contrôlés par des opérations
   serveur distinctes, chacune atomique pour toutes les fiches concernées.
6. Refuser une révision périmée, un identifiant de demande déjà utilisé pour
   un autre contenu et toute écriture directe vers une caserne étrangère.
   Conserver le journal d’auteur, d’heure et de transitions.
7. Ne libérer les boutons qu’après un essai en transaction annulée, un essai
   de refus entre casernes, puis un parcours réel autorisé et sauvegardé.

## Vérifications avant activation

- Les deux casernes voient uniquement les fiches qui leur reviennent ; un
  autre agent ne peut ni lire ni modifier la demande.
- Une panne entre les deux écritures ne laisse ni transfert partiel ni renfort
  orphelin ; répéter la même requête ne crée pas de doublon.
- Un appel simultané ne peut attribuer le même numéro APL.
- Les interventions terminées et leurs historiques ne sont jamais rouvertes
  ou renumérotées indirectement.
- Une session révoquée ou un agent suspendu ne peut plus répondre à un renfort.
- `Sync OK` est affiché seulement après confirmation des changements côté
  serveur ; les anciennes actions locales ne sont pas réexpédiées en douce.
- Les anciennes demandes de renfort déjà enregistrées sont examinées avant
  activation ; elles ne sont pas reprises automatiquement par le nouveau
  circuit. Le contrôle en lecture seule du 15 octobre a relevé neuf lignes
  non supprimées, dont trois au statut « accepté ». L’administrateur a confirmé
  que ces trois demandes restent historiques uniquement.

Mise à jour du 15 octobre : le schéma additif des renforts et ses fonctions
sont installés en production, sans reprendre les demandes historiques. Les
essais de demande, réponse, départ, clôture, idempotence et refus d'accès ont
été menés dans des transactions annulées. Le contrôle de concurrence a ensuite
refusé deux variantes de correction de l'ordre des verrous. Par précaution,
**tous les droits d'exécution des nouveaux appels ont été retirés** ; la table
ne contient aucune nouvelle demande. L'interface locale est préparée derrière
`secureRenfortsEnabled: false` et n'est ni publiée ni active. L'ancien circuit
reste bloqué. Ne pas accorder les droits ni activer le drapeau avant les tests
concurrents et la vérification du parcours complet sur appareil.

Revue complémentaire du 15 octobre : le correctif
`supabase/renfort-consistent-lock-order-APPLIED.sql` a été appliqué en
production sous le nom `renfort_consistent_lock_order_reviewed`. Le départ
verrouille désormais d'abord la fiche source, puis la demande, et relit les
deux après verrouillage. La compilation et un départ complet ont été vérifiés
avant et après l'installation dans des transactions annulées. Un autre essai
annulé confirme que clôturer la fiche source annule la demande avant tout
départ. Les fiches et demandes techniques ont été vérifiées absentes après
les annulations. Les tests locaux passent. Ces essais séquentiels ne prouvent
pas encore l'absence d'interblocage lors de deux opérations réellement
simultanées ; les cinq RPC restent donc interdites aux utilisateurs et les
renforts restent désactivés.

Le même jour, `supabase/renfort-server-numbering-APPLIED.sql` a été appliqué
en production sous le nom `renfort_server_numbering_reviewed` : le départ
attribue désormais un numéro de renfort propre à la caserne et à l'année,
sans consommer ce numéro si le départ échoue. Des transactions annulées ont
vérifié le numéro 1 dans une caserne sans renfort précédent et le numéro 2 à
Lapugnoy après son renfort historique numéroté 1. Aucun compteur ni dossier
technique d'essai n'a été conservé. L'interface locale exige maintenant une
actualisation confirmée avant de déclarer une action entièrement synchronisée ;
elle reste désactivée et non publiée.

Un essai supplémentaire en transaction annulée a parcouru départ puis clôture
avec la nouvelle numérotation : la demande et la fiche locale se terminent,
le numéro Renfort 2 reste sur la fiche locale et l'intervention source reste
En cours. Aucune fiche, demande ou compteur technique n'a été conservé. Un
test local vérifie également qu'une actualisation réseau échouée conserve la
clé de reprise de la demande et affiche un avertissement, sans annoncer à tort
une synchronisation complète. L'ancien panneau de renfort est neutralisé quand
le nouveau circuit sera activé, pour ne pas mélanger les demandes historiques
avec le nouveau format ; le badge reste alimenté par les nouvelles demandes.

## Ordre de réalisation validé

Mise à jour du 15 octobre : les deux ordres de concurrence entre départ de
renfort et clôture de la fiche source ont réussi sur une fiche technique
temporaire, avec annulation des deux transactions. La fiche et la demande
techniques ont ensuite été supprimées ; le contrôle final confirme zéro
nouvelle demande. Le garde serveur de disponibilité des équipages et engins
(`supabase/renfort-server-availability-review.sql`) a été installé et vérifié
en transaction annulée, sans accorder les droits d'exécution. Le module client
est intégré dans la copie de travail actuelle, avec le drapeau toujours à
`false`. Il reste à tester un parcours complet depuis deux appareils avant
d'ouvrir le circuit aux utilisateurs.

Le garde complémentaire `supabase/renfort-server-vehicle-catalog-review.sql`
est installé : un départ complet refuse un engin absent du catalogue de la
caserne destinataire. Les appels restent interdits aux utilisateurs. La
version pilote rend le nouveau panneau visible uniquement avec
`secureRenfortPilot=1` ; le réglage général reste à `false` et l'ancien
circuit est toujours bloqué. L'essai guidé doit porter sur une fiche
technique identifiable, supprimée ensuite après vérification de l'absence de
demande et de renfort orphelins. Ne pas annoncer l'activation générale tant
que l'envoi, la réponse, le départ et la clôture depuis les deux casernes
n'ont pas été observés.

1. Rouvrir les **renforts** en premier, avec une demande et des transitions
   contrôlées par le serveur. Les trois anciens « acceptés » restent de
   l’historique et ne sont pas réinjectés dans ce nouveau circuit.
2. Fiabiliser l’attribution des nouveaux numéros APL, puis seulement rouvrir
   les **transferts d’interventions**. Un transfert garde sa fiche source
   historique et crée une nouvelle fiche liée dans la caserne destinataire.

Pour les renforts, la base devra être la source de vérité de la demande et de
son statut ; le navigateur de la caserne destinataire ne devra jamais envoyer
une modification directe de l’intervention source. Une réponse ou un départ
rejoué après une coupure doit retrouver la même demande, pas créer un second
renfort. Le départ reste soumis aux contrôles de disponibilité de l’équipage
et du véhicule, puis la clôture ne doit fermer que le renfort correspondant.

## Dépendance de numérotation à résoudre

Le compteur APL dans la configuration globale n’est pas l’unique vérité : le
contrôle en lecture seule du 15 octobre a trouvé `463` pour 2026 dans cette
configuration et `577` comme plus grand numéro déjà présent dans les fiches.
Le nouveau transfert ne peut donc pas simplement incrémenter ce compteur.
Il faut une attribution serveur compatible avec les créations ordinaires
simultanées, assortie d’un contrôle d’unicité, avant de réactiver le transfert.
Une vérification complémentaire trouve neuf paires intervention/PILP portant
le même APL, plus trois groupes contenant deux fiches d’intervention : deux
groupes historiques à examiner (`441`, `442`) et une copie de renfort (`446`).
Ces fiches ne doivent pas être renumérotées par cette préparation.
