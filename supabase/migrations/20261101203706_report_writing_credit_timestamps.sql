-- Horodatages locaux du départ et du compte rendu : conservés pour l'audit,
-- sans modifier les heures opérationnelles ni les validations existantes.
create or replace function agai_private.guard_report_credit_timestamps()
returns trigger language plpgsql set search_path = ''
as $function$
declare
  was_validated boolean := false;
  client_stamp text;
begin
  if new.type not in ('iv','pilp') or coalesce(new.deleted,false) then return new; end if;
  if tg_op='UPDATE' then
    was_validated := coalesce(old.data->>'_crValide','false')='true';
    -- Une clôture déjà enregistrée ne peut pas recevoir un horodatage local
    -- ajouté après coup, ni en changer. Une nouvelle clôture après reprise
    -- peut toutefois créer son propre horodatage.
    if old.data->>'s'='terminee' then
      if old.data ? '_closeClientAtIso' then
        new.data := jsonb_set(new.data,'{_closeClientAtIso}',old.data->'_closeClientAtIso',true);
      else
        new.data := new.data - '_closeClientAtIso';
      end if;
    end if;
    if was_validated then
      if coalesce(new.data->>'_crValide','false')='true' then
        if old.data ? '_crClientValideAt' then
          new.data := jsonb_set(new.data,'{_crClientValideAt}',old.data->'_crClientValideAt',true);
        else
          new.data := new.data - '_crClientValideAt';
        end if;
      else
        new.data := new.data - '_crClientValideAt';
      end if;
    end if;
  end if;
  -- Les données aberrantes ne bloquent jamais une intervention ni la validation
  -- du rapport ; elles ne donnent simplement aucun temps supplémentaire.
  client_stamp := new.data->>'_closeClientAtIso';
  if client_stamp is not null then
    begin
      if client_stamp !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]+)?Z$'
         or client_stamp::timestamptz > now()+interval '2 minutes' then
        new.data := new.data - '_closeClientAtIso';
      end if;
    exception when others then
      new.data := new.data - '_closeClientAtIso';
    end;
  end if;
  if coalesce(new.data->>'_crValide','false')='true' and not was_validated then
    client_stamp := new.data->>'_crClientValideAt';
    if client_stamp is not null then
      begin
        if client_stamp !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]+)?Z$'
           or client_stamp::timestamptz > now()+interval '2 minutes' then
          new.data := new.data - '_crClientValideAt';
        end if;
      exception when others then
        new.data := new.data - '_crClientValideAt';
      end;
    end if;
  end if;
  return new;
end;
$function$;

revoke execute on function agai_private.guard_report_credit_timestamps()
  from public, anon, authenticated;
drop trigger if exists z_agai_report_credit_timestamps on public.records;
create trigger z_agai_report_credit_timestamps
  before insert or update of data on public.records
  for each row execute function agai_private.guard_report_credit_timestamps();
