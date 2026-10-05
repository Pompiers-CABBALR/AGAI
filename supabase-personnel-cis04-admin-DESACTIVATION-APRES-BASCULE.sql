-- AGAI — désactivation du compte générique CIS04 sans suppression d'historique.
-- NE PAS EXÉCUTER avant la bascule validée vers l'authentification obligatoire
-- et la fermeture des accès anon aux données et aux fonctions d'écriture.
-- La version actuelle d'AGAI peut encore accepter un mot de passe en cache.
-- Prévoir une sauvegarde récente et refaire le précontrôle juste avant l'exécution.

begin;

do $$
declare
  v_caserne text;
  v_active boolean;
begin
  select caserne_id,active into v_caserne,v_active
  from public.agai_identity_credentials
  where login='cis04.admin'
  for update;
  if not found or v_caserne<>'CIS04' or v_active is distinct from true then
    raise exception 'AGAI: état du compte cis04.admin inattendu, aucune modification';
  end if;
  if exists(select 1 from public.agai_auth_links where login='cis04.admin') then
    raise exception 'AGAI: compte déjà rattaché, désactivation annulée pour contrôle manuel';
  end if;
  update public.agai_identity_credentials
    set active=false,source_updated_at=now()
    where login='cis04.admin' and caserne_id='CIS04' and active=true;
  if not found then
    raise exception 'AGAI: désactivation non confirmée, transaction annulée';
  end if;
end;
$$;

commit;

-- Contrôle attendu : la fiche demeure, mais active=false.
select login,caserne_id,active,source_updated_at
from public.agai_identity_credentials where login='cis04.admin';
