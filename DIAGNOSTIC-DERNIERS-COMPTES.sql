-- Lecture seule : état des quatre comptes AGAI encore non rattachés.
-- Ne renvoie ni mot de passe ni empreinte.
with cibles(login) as (
  values
    ('millecamps.alicia'),
    ('cis04.admin'),
    ('canneson.eric'),
    ('leriche.valery')
)
select
  t.login,
  c.caserne_id,
  c.first_name as prenom,
  c.last_name as nom,
  c.active as compte_agai_actif,
  l.auth_user_id is not null as deja_rattache,
  exists (
    select 1 from auth.users u
    where lower(u.email) = lower(c.login || '.' || c.caserne_id || '@auth.agai-app.fr')
  ) as identite_auth_deja_presente,
  exists (
    select 1 from public.records r
    where r.type = 'user'
      and r.caserne = c.caserne_id
      and coalesce(r.deleted, false) = false
      and lower(trim(r.data->>'l')) = c.login
      and r.data->>'p' = c.password_hash
  ) as mot_de_passe_agai_aligne,
  coalesce(a.failed_count, 0) as echecs,
  a.locked_until as verrouille_jusqua
from cibles t
left join public.agai_identity_credentials c on c.login = t.login
left join public.agai_auth_links l on l.login = t.login
left join public.agai_auth_attempts a on a.login = t.login
order by t.login;
