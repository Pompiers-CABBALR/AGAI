-- Prototype local seulement. p_strong_lead est dérivé de la rotation et de
-- l'équipe forte par la future transaction serveur, jamais fourni par le client.
create or replace function agai_private.next_replacement_request(
  p_current jsonb, p_actor text, p_strong_lead text, p_decision text
) returns jsonb
language plpgsql volatile set search_path = ''
as $$
declare
  status text := p_current->>'statut';
  next_status text;
  event_type text;
  event jsonb;
  now_at timestamptz := pg_catalog.clock_timestamp();
  history jsonb := coalesce(p_current->'historique','[]'::jsonb);
begin
  if p_current->>'kind' <> 'remplacement'
    or p_actor is null or p_actor=''
    or p_strong_lead is null or p_strong_lead=''
    or p_decision not in ('accepte','refuse')
    or pg_catalog.jsonb_typeof(history)<>'array'
  then raise exception 'AGAI_REPLACEMENT_INVALID_TRANSITION'; end if;
  if status='en-attente' then
    if p_actor is distinct from p_current->>'replacementLogin'
    then raise exception 'AGAI_REPLACEMENT_CANDIDATE_REQUIRED'; end if;
    next_status:=case when p_decision='accepte' then 'en-attente-responsable' else 'refuse' end;
    event_type:=case when p_decision='accepte' then 'accord-remplacant' else 'refus-remplacant' end;
  elsif status='en-attente-responsable' then
    if p_actor is distinct from p_strong_lead
      or p_current->>'confirmePar' is distinct from p_current->>'replacementLogin'
    then raise exception 'AGAI_REPLACEMENT_STRONG_LEAD_REQUIRED'; end if;
    next_status:=case when p_decision='accepte' then 'accepte' else 'refuse' end;
    event_type:=case when p_decision='accepte' then 'validation-astreinte-forte' else 'refus-astreinte-forte' end;
  else
    raise exception 'AGAI_REPLACEMENT_ALREADY_RESOLVED';
  end if;
  event:=pg_catalog.jsonb_build_object('action',event_type,'acteur',p_actor,'at',now_at);
  return p_current||pg_catalog.jsonb_build_object(
    'statut',next_status,
    'historique',history||pg_catalog.jsonb_build_array(event),
    'confirmePar',case when status='en-attente' and p_decision='accepte' then p_actor
      else p_current->>'confirmePar' end,
    'confirmeAt',case when status='en-attente' and p_decision='accepte' then now_at::text
      else p_current->>'confirmeAt' end,
    'reponduPar',case when next_status in ('accepte','refuse') then p_actor
      else p_current->>'reponduPar' end,
    'reponduAt',case when next_status in ('accepte','refuse') then now_at::text
      else p_current->>'reponduAt' end,
    'dateReponse',case when next_status in ('accepte','refuse')
      then pg_catalog.to_char(now_at at time zone 'Europe/Paris','DD/MM/YYYY')
      else p_current->>'dateReponse' end,
    'hReponse',case when next_status in ('accepte','refuse')
      then pg_catalog.to_char(now_at at time zone 'Europe/Paris','HH24:MI')
      else p_current->>'hReponse' end
  );
end;
$$;
