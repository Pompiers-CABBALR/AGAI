-- Lecture seule : ne retourne aucun mot de passe ni empreinte.
-- Les quatre indicateurs doivent être : actif=true, deja_lie=false,
-- identite_auth_deja_presente=false, mot_de_passe_agai_aligne=true.
select
  c.login,
  c.caserne_id,
  c.active as actif,
  exists (
    select 1 from public.agai_auth_links l where l.login=c.login
  ) as deja_lie,
  exists (
    select 1 from auth.users u
    where lower(u.email)=c.login||'.'||lower(c.caserne_id)||'@auth.agai-app.fr'
  ) as identite_auth_deja_presente,
  exists (
    select 1 from public.records r
    where r.caserne=c.caserne_id
      and r.type='user'
      and coalesce(r.deleted,false)=false
      and lower(trim(r.data->>'l'))=c.login
      and r.data->>'p'=c.password_hash
  ) as mot_de_passe_agai_aligne
from public.agai_identity_credentials c
where c.login='lericque.brian';
