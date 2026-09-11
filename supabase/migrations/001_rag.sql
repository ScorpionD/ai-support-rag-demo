begin;
create extension if not exists vector with schema extensions;
create table public.knowledge_documents (
 id text primary key, title text not null, url text not null, category text not null default 'Knowledge',
 question text not null default '', content text not null, revision text not null, updated_at timestamptz not null default now()
);
create table public.knowledge_chunks (
 id uuid primary key default gen_random_uuid(), document_id text not null references public.knowledge_documents on delete cascade,
 ordinal integer not null, content text not null, embedding extensions.vector(384) not null,
 unique(document_id, ordinal)
);
create table public.chat_sessions (
 id uuid primary key default gen_random_uuid(), token_hash text unique not null,
 created_at timestamptz not null default now(), expires_at timestamptz not null default now()+interval '7 days'
);
create table public.chat_turns (
 id uuid primary key default gen_random_uuid(), session_id uuid not null references public.chat_sessions on delete cascade,
 question_key text not null, question text not null, state text not null default 'processing',
 lease uuid not null default gen_random_uuid(), lease_until timestamptz not null default now()+interval '45 seconds',
 answer jsonb, created_at timestamptz not null default now(), unique(session_id,question_key)
);
create table public.chat_messages (
 id uuid primary key default gen_random_uuid(), session_id uuid not null references public.chat_sessions on delete cascade,
 turn_id uuid not null references public.chat_turns on delete cascade, role text not null check(role in ('user','assistant')),
 text text not null, answer jsonb, created_at timestamptz not null default now(), unique(turn_id,role)
);
create index chat_messages_history on public.chat_messages(session_id,created_at);
create table public.support_handoffs (
 id uuid primary key default gen_random_uuid(), session_id uuid not null references public.chat_sessions on delete cascade,
 request_key text not null, name text not null, email text not null, company text not null, message text not null,
 created_at timestamptz not null default now(), unique(session_id,request_key)
);
create table public.leads (like public.support_handoffs including all);
alter table public.leads add foreign key (session_id) references public.chat_sessions on delete cascade;
create table public.notification_outbox (
 id uuid primary key, kind text not null check(kind in ('handoff','lead')), payload jsonb not null,
 status text not null default 'pending' check(status in ('pending','sending','sent','review')),
 claim uuid, attempts integer not null default 0, telegram_message_id text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.usage_buckets (key text primary key, count integer not null, expires_at timestamptz not null);

create function public.consume_budget(p_key text,p_limit integer,p_seconds integer) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
declare n integer;
begin
 insert into usage_buckets values(p_key,1,now()+make_interval(secs=>p_seconds))
 on conflict(key) do update set count=case when usage_buckets.expires_at<now() then 1 else usage_buckets.count+1 end,
 expires_at=case when usage_buckets.expires_at<now() then excluded.expires_at else usage_buckets.expires_at end returning count into n;
 return n<=p_limit;
end $$;

create function public.ingest_document(p_doc jsonb,p_chunks jsonb) returns text
language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare d text:=p_doc->>'id';
begin
 perform pg_advisory_xact_lock(hashtext('ingest:'||d));
 insert into knowledge_documents(id,title,url,category,question,content,revision)
 values(d,p_doc->>'title',p_doc->>'url',p_doc->>'category',p_doc->>'question',p_doc->>'content',p_doc->>'revision')
 on conflict(id) do update set title=excluded.title,url=excluded.url,category=excluded.category,question=excluded.question,
 content=excluded.content,revision=excluded.revision,updated_at=now();
 delete from knowledge_chunks where document_id=d;
 insert into knowledge_chunks(document_id,ordinal,content,embedding)
 select d,(c->>'ordinal')::int,c->>'content',(c->>'embedding')::vector from jsonb_array_elements(p_chunks) c;
 return d;
end $$;

create function public.match_chunks(p_embedding extensions.vector(384),p_min double precision default 0.4)
returns table(id uuid,document_id text,content text,similarity double precision,title text,url text,category text,question text,updated_at timestamptz)
language sql stable security definer set search_path=public,extensions,pg_temp as $$
 select c.id,c.document_id,c.content,1-(c.embedding<=>p_embedding),d.title,d.url,d.category,d.question,d.updated_at
 from knowledge_chunks c join knowledge_documents d on d.id=c.document_id
 where 1-(c.embedding<=>p_embedding)>=p_min order by c.embedding<=>p_embedding limit 4;
$$;

create function public.claim_turn(p_session uuid,p_key text,p_question text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare t chat_turns; mine boolean:=false;
begin
 perform pg_advisory_xact_lock(hashtext(p_session::text));
 select * into t from chat_turns where session_id=p_session and question_key=p_key for update;
 if not found then
  if (select count(*) from chat_turns where session_id=p_session)>=20 then return jsonb_build_object('state','full'); end if;
  insert into chat_turns(session_id,question_key,question) values(p_session,p_key,p_question) returning * into t; mine:=true;
 elsif t.state='processing' and t.lease_until<now() then
  update chat_turns set lease=gen_random_uuid(),lease_until=now()+interval '45 seconds' where id=t.id returning * into t; mine:=true;
 end if;
 return to_jsonb(t)||jsonb_build_object('mine',mine);
end $$;
create function public.complete_turn(p_id uuid,p_lease uuid,p_answer jsonb) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
declare t chat_turns;
begin
 update chat_turns set state='complete',answer=p_answer where id=p_id and lease=p_lease and state='processing' returning * into t;
 if not found then return false; end if;
 insert into chat_messages(session_id,turn_id,role,text,created_at) values(t.session_id,t.id,'user',t.question,now());
 insert into chat_messages(session_id,turn_id,role,text,answer,created_at) values(t.session_id,t.id,'assistant',p_answer->>'text',p_answer,now()+interval '1 microsecond');
 return true;
end $$;

create function public.save_request(p_session uuid,p_key text,p_kind text,p_data jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare r uuid; s text;
begin
 perform pg_advisory_xact_lock(hashtext(p_session::text||p_kind));
 if p_kind='lead' then
  insert into leads(session_id,request_key,name,email,company,message) values(p_session,p_key,p_data->>'name',p_data->>'email',p_data->>'company',p_data->>'message')
  on conflict(session_id,request_key) do update set request_key=excluded.request_key returning id into r;
 elsif p_kind='handoff' then
  insert into support_handoffs(session_id,request_key,name,email,company,message) values(p_session,p_key,p_data->>'name',p_data->>'email',p_data->>'company',p_data->>'message')
  on conflict(session_id,request_key) do update set request_key=excluded.request_key returning id into r;
 else raise exception 'Invalid request kind'; end if;
 insert into notification_outbox(id,kind,payload) values(r,p_kind,p_data||jsonb_build_object('id',r,'kind',p_kind)) on conflict(id) do nothing;
 select status into s from notification_outbox where id=r;
 return jsonb_build_object('id',r,'status',s);
end $$;
create function public.claim_notification(p_id uuid) returns setof public.notification_outbox
language sql security definer set search_path=public,pg_temp as $$
 update notification_outbox set status='sending',claim=gen_random_uuid(),attempts=attempts+1,updated_at=now()
 where id=p_id and status='pending' and attempts<3 returning *;
$$;
create function public.finish_notification(p_id uuid,p_claim uuid,p_message text,p_success boolean) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 update notification_outbox set status=case when p_success then 'sent' else 'review' end,
 telegram_message_id=p_message,updated_at=now() where id=p_id and claim=p_claim and status='sending';
 return found;
end $$;
create function public.cleanup_rag() returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
 delete from chat_sessions where expires_at<now();
 delete from notification_outbox where created_at<now()-interval '7 days';
 delete from usage_buckets where expires_at<now();
 update notification_outbox set status='review',updated_at=now() where status='sending' and updated_at<now()-interval '10 minutes';
end $$;

-- Data is private: browser clients have neither table access nor RPC access.
do $$ declare n text; begin
 foreach n in array array['knowledge_documents','knowledge_chunks','chat_sessions','chat_turns','chat_messages','support_handoffs','leads','notification_outbox','usage_buckets'] loop
  execute format('alter table public.%I enable row level security',n);
  execute format('revoke all on public.%I from anon, authenticated',n);
  execute format('grant all on public.%I to service_role',n);
 end loop;
end $$;
revoke all on all functions in schema public from public,anon,authenticated;
grant execute on all functions in schema public to service_role;
notify pgrst,'reload schema';
commit;
