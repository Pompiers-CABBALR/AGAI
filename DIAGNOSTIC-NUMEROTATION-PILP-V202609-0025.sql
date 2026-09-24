-- Lecture seule. Ne modifie aucune fiche ni aucun compteur.
-- Vérifier ces résultats avant d'envisager la régularisation de l'APL_2026_000441.

select r.id,r.type,r.updated_at,r.data->>'id' as id_interne,
       r.data->>'s' as statut,r.data->>'_numApl' as appel,
       r.data->>'_lienPilp' as liee_a_pilp,
       r.data->>'_lienPilpSourceId' as copie_technique_de,
       r.data->>'_pilpId' as pilp_liee,
       r.data->>'ivRef' as intervention_source,
       r.data->>'_createdAfterClosure' as pilp_creee_apres_cloture,
       r.data->>'_numberingScheme' as mode_numerotation,
       r.data->>'_numberFinalized' as numero_confirme,
       r.data->>'_numCaserne' as numero_ut,
       r.data->>'_numMois' as numero_mois,
       r.data->>'_numGlobal' as numero_global,
       r.data->>'_statusRevision' as revision_statut,
       r.data->>'_serverRevision' as revision_fiche
from public.records r
where r.id in (
  'CIS05__iv__APL_2026_000441-Rmuaz6bpd-b445f74101',
  'CIS05__pilp__APL_2026_000441-Rmufstipm-9efc7781e3'
)
order by r.type,r.id;

-- Les numéros 394 / 176 sont provisoires : vérifier s'ils sont déjà utilisés.
select r.id,r.type,r.data->>'s' as statut,
       r.data->>'_numberFinalized' as numero_confirme,
       r.data->>'_lienPilpSourceId' as copie_technique_de,
       r.data->>'_numCaserne' as numero_ut,
       r.data->>'_numMois' as numero_mois
from public.records r
where not r.deleted and r.caserne='CIS05' and r.type in ('iv','pilp')
  and (r.data->>'_numCaserne'='394' or r.data->>'_numMois'='176')
order by r.type,r.id;

-- Recherche d'autres fiches terminées touchées par la même règle.
select r.caserne,r.id,r.updated_at,r.data->>'_numApl' as appel,
       r.data->>'_numCaserne' as numero_ut_provisoire,
       r.data->>'_numMois' as numero_mois_provisoire
from public.records r
where not r.deleted and r.type in ('iv','pilp')
  and r.data->>'s'='terminee'
  and r.data->>'_numberingScheme'='dual-v1'
  and coalesce(r.data->>'_numberFinalized','false')<>'true'
  and r.data->>'_lienPilp'='true'
  and coalesce(r.data->>'_lienPilpSourceId','')=''
order by r.updated_at desc
limit 100;

select position('AGAI_PILP_LINKED_NUMBERING_V2' in pg_get_functiondef(
  to_regprocedure('public.agai_atomic_upsert_record(text,text,text,jsonb,boolean,text,bigint,bigint,text,text,text)')))>0
  as correctif_serveur_installe;
