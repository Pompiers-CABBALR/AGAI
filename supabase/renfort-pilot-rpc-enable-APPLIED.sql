-- Étape pilote du 15 octobre 2026 : les cinq façades RPC Auth et leurs
-- fonctions internes reçoivent EXECUTE (les façades sont SECURITY INVOKER).
-- Le schéma privé n'est pas exposé par l'API ; les fonctions internes
-- revérifient identité, statut et caserne à chaque opération.
-- L'interface générale reste désactivée.
begin;
grant execute on function agai_private.send_renfort(text,text[],text,text,uuid)
  to authenticated;
grant execute on function agai_private.answer_renfort(uuid,text)
  to authenticated;
grant execute on function agai_private.cancel_renfort(uuid)
  to authenticated;
grant execute on function agai_private.start_renfort(uuid,text[],text,uuid)
  to authenticated;
grant execute on function agai_private.finish_renfort(uuid,uuid,bigint)
  to authenticated;
grant execute on function public.agai_renfort_send(text,text[],text,text,uuid)
  to authenticated;
grant execute on function public.agai_renfort_answer(uuid,text)
  to authenticated;
grant execute on function public.agai_renfort_cancel(uuid)
  to authenticated;
grant execute on function public.agai_renfort_start(uuid,text[],text,uuid)
  to authenticated;
grant execute on function public.agai_renfort_finish(uuid,uuid,bigint)
  to authenticated;
commit;
