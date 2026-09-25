-- Lecture seule : état du compte AGAI de Léo avant le pilote.
-- Ne renvoie ni mot de passe ni empreinte de mot de passe.
select
  c.login,
  c.caserne_id,
  c.active as compte_agai_actif,
  l.auth_user_id is not null as deja_rattache,
  exists (
    select 1
    from auth.users u
    where lower(u.email) = lower(c.login || '.' || c.caserne_id || '@auth.agai-app.fr')
  ) as identite_auth_deja_presente,
  exists (
    select 1
    from public.records r
    where r.type = 'user'
      and r.caserne = c.caserne_id
      and coalesce(r.deleted, false) = false
      and lower(r.data->>'l') = c.login
      and r.data->>'p' = c.password_hash
  ) as mot_de_passe_agai_aligne,
  coalesce(a.failed_count, 0) as echecs,
  a.locked_until as verrouille_jusqua
from public.agai_identity_credentials c
left join public.agai_auth_links l on l.login = c.login
left join public.agai_auth_attempts a on a.login = c.login
where c.login = 'accoley.leo';
