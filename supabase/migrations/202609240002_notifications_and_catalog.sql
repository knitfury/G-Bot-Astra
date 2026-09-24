-- Metadata-only transactional outbox. No chat or MCP data enters this table.
create table public.notification_outbox (
 id uuid primary key default gen_random_uuid(), account_id uuid, recipient text,
 kind text not null check(kind in ('welcome','device_added','device_revoked','payment_grace','account_deleted')),
 created_at timestamptz not null default now(), claimed_at timestamptz, sent_at timestamptz,
 attempts integer not null default 0, lease uuid
);
alter table public.notification_outbox enable row level security;
revoke all on public.notification_outbox from anon,authenticated;
grant all on public.notification_outbox to service_role;
create function public.queue_account_notice() returns trigger language plpgsql security definer set search_path='' as $$ begin
 if tg_op='DELETE' then
  delete from public.notification_outbox where account_id=old.id;
  if old.email is not null then insert into public.notification_outbox(account_id,recipient,kind) values(null,old.email,'account_deleted'); end if; return old;
 end if;
 if new.email_confirmed_at is not null and (tg_op='INSERT' or old.email_confirmed_at is null) then
  insert into public.notification_outbox(account_id,kind) values(new.id,'welcome');
 end if; return new;
end $$;
create trigger account_notice after insert or update of email_confirmed_at or delete on auth.users for each row execute function public.queue_account_notice();
create function public.queue_device_notice() returns trigger language plpgsql security definer set search_path='' as $$ begin
 if tg_op='INSERT' then insert into public.notification_outbox(account_id,kind) values(new.account_id,'device_added');
 elsif old.revoked_at is null and new.revoked_at is not null then insert into public.notification_outbox(account_id,kind) values(new.account_id,'device_revoked'); end if; return new;
end $$;
create trigger device_notice after insert or update of revoked_at on public.devices for each row execute function public.queue_device_notice();
create function public.queue_payment_notice() returns trigger language plpgsql security definer set search_path='' as $$ begin
 if new.status='past_due' and old.status<>'past_due' then insert into public.notification_outbox(account_id,kind) values(new.account_id,'payment_grace'); end if; return new;
end $$;
create trigger payment_notice after update of status on public.billing for each row execute function public.queue_payment_notice();
create function public.claim_notifications() returns setof public.notification_outbox language plpgsql security definer set search_path='' as $$ begin
 delete from public.notification_outbox where created_at<now()-interval '30 days';
 return query update public.notification_outbox as q set claimed_at=now(),attempts=q.attempts+1,lease=gen_random_uuid()
 where q.id in (select n.id from public.notification_outbox n where n.sent_at is null and n.attempts<3 and (n.claimed_at is null or n.claimed_at<now()-interval '30 minutes') order by n.created_at for update skip locked limit 20) returning q.*;
end $$;
create or replace function public.publish_catalog(actor_id uuid,document jsonb) returns void language plpgsql security definer set search_path='' as $$
 declare prior bigint; next_sequence bigint; begin
 perform pg_advisory_xact_lock(hashtextextended('gbot_catalog',0));
 next_sequence:=((document->>'payload')::jsonb->>'sequence')::bigint;
 select ((signed_document->>'payload')::jsonb->>'sequence')::bigint into prior from public.catalog where id=true;
 if next_sequence is null or next_sequence<=coalesce(prior,0) then raise exception 'catalog_sequence'; end if;
 insert into public.catalog(id,signed_document) values(true,document) on conflict(id) do update set signed_document=document,updated_at=now();
 insert into public.audit_events(actor,action,reason) values(actor_id,'catalog_changed','admin_review');
end $$;
revoke all on function public.queue_account_notice(),public.queue_device_notice(),public.queue_payment_notice(),public.claim_notifications() from public,anon,authenticated;
grant execute on function public.claim_notifications() to service_role;
