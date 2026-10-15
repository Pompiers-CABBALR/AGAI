-- Pause defensive : le schema additif reste present mais aucune transition
-- inter-casernes n'est ouverte tant que l'ordre des verrous et l'interface
-- complete n'ont pas passe les controles de production.
begin;
revoke execute on function public.agai_renfort_send(text,text[],text,text,uuid)
  from authenticated;
revoke execute on function public.agai_renfort_answer(uuid,text)
  from authenticated;
revoke execute on function public.agai_renfort_cancel(uuid)
  from authenticated;
revoke execute on function public.agai_renfort_start(uuid,text[],text,uuid)
  from authenticated;
revoke execute on function public.agai_renfort_finish(uuid,uuid,bigint)
  from authenticated;
revoke execute on function agai_private.send_renfort(text,text[],text,text,uuid)
  from authenticated;
revoke execute on function agai_private.answer_renfort(uuid,text)
  from authenticated;
revoke execute on function agai_private.cancel_renfort(uuid)
  from authenticated;
revoke execute on function agai_private.start_renfort(uuid,text[],text,uuid)
  from authenticated;
revoke execute on function agai_private.finish_renfort(uuid,uuid,bigint)
  from authenticated;
commit;
