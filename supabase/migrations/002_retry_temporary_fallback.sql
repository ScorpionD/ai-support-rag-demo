begin;
-- A temporary provider failure must not pin a session to an old fallback forever.
create or replace function public.claim_turn(p_session uuid,p_key text,p_question text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare t chat_turns; mine boolean:=false;
begin
 perform pg_advisory_xact_lock(hashtext(p_session::text));
 select * into t from chat_turns where session_id=p_session and question_key=p_key for update;
 if not found then
  if (select count(*) from chat_turns where session_id=p_session)>=20 then return jsonb_build_object('state','full'); end if;
  insert into chat_turns(session_id,question_key,question) values(p_session,p_key,p_question) returning * into t; mine:=true;
 elsif t.lease_until<now() and (t.state='processing' or (t.state='complete' and t.answer->>'reason' in ('llm-unavailable-or-unverified','search-unavailable','llm-limit','embedding-limit'))) then
  update chat_turns set state='processing',lease=gen_random_uuid(),lease_until=now()+interval '45 seconds' where id=t.id returning * into t; mine:=true;
 end if;
 return to_jsonb(t)||jsonb_build_object('mine',mine);
end $$;
create or replace function public.complete_turn(p_id uuid,p_lease uuid,p_answer jsonb) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
declare t chat_turns;
begin
 update chat_turns set state='complete',answer=p_answer,lease_until=now()+interval '2 minutes'
 where id=p_id and lease=p_lease and state='processing' returning * into t;
 if not found then return false; end if;
 insert into chat_messages(session_id,turn_id,role,text,created_at) values(t.session_id,t.id,'user',t.question,now()) on conflict(turn_id,role) do nothing;
 insert into chat_messages(session_id,turn_id,role,text,answer,created_at) values(t.session_id,t.id,'assistant',p_answer->>'text',p_answer,now()+interval '1 microsecond')
 on conflict(turn_id,role) do update set text=excluded.text,answer=excluded.answer;
 return true;
end $$;
revoke all on function public.claim_turn(uuid,text,text),public.complete_turn(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.claim_turn(uuid,text,text),public.complete_turn(uuid,uuid,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
