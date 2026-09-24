-- EU project. Apply independently to development, staging and production.
create table public.profiles (id uuid primary key references auth.users on delete cascade, display_name text not null default '' check(length(display_name)<=100), created_at timestamptz not null default now());
create table public.billing (account_id uuid primary key references auth.users on delete cascade, customer_id text unique, subscription_id text unique, plan text not null default 'free' check(plan in ('free','starter','business')), status text not null default 'free', period_end timestamptz, grace_started_at timestamptz, reconciled_at timestamptz not null default now());
create table public.devices (id uuid primary key, account_id uuid not null references auth.users on delete cascade, name text not null check(length(name)<=80), platform text not null check(platform in ('win32','darwin')), version text not null, registered_at timestamptz not null default now(), validated_at timestamptz not null default now(), revoked_at timestamptz, sequence bigint not null default 0, session_id uuid);
create index devices_account on public.devices(account_id);
create table public.licenses (device_id uuid primary key references public.devices on delete cascade, sequence bigint not null, issued_at timestamptz not null, expires_at timestamptz not null, key_id text not null);
create table public.billing_events (id text primary key, account_id uuid references auth.users on delete set null, type text not null, created_at timestamptz not null default now(), processed_at timestamptz);
create table public.admin_roles (account_id uuid primary key references auth.users on delete cascade, created_at timestamptz not null default now());
create table public.audit_events (id bigint generated always as identity primary key, actor uuid, account_id uuid, device_id uuid, action text not null check(action in ('device_revoked','license_issued','billing_reconciled','account_deleted','refund_requested','catalog_changed','entitlement_refresh')), reason text not null check(reason in ('user_request','admin_review','scheduled','webhook','registration')), created_at timestamptz not null default now());
create table public.operational_events (id bigint generated always as identity primary key, component text not null check(component in ('auth','billing','license','catalog','admin')), category text not null check(category in ('success','unavailable','invalid','denied')), created_at timestamptz not null default now());
create table public.catalog (id boolean primary key default true check(id), signed_document jsonb not null, updated_at timestamptz not null default now());
create table public.rate_limits (key text primary key, window_start timestamptz not null, count integer not null);

alter table public.profiles enable row level security;
alter table public.billing enable row level security;
alter table public.devices enable row level security;
alter table public.licenses enable row level security;
alter table public.billing_events enable row level security;
alter table public.admin_roles enable row level security;
alter table public.audit_events enable row level security;
alter table public.operational_events enable row level security;
alter table public.catalog enable row level security;
alter table public.rate_limits enable row level security;
revoke all on all tables in schema public from anon, authenticated;
grant select on public.profiles,public.billing,public.devices to authenticated;
grant update(display_name) on public.profiles to authenticated;
create policy own_profile on public.profiles for select to authenticated using(id=(select auth.uid()));
create policy edit_own_name on public.profiles for update to authenticated using(id=(select auth.uid())) with check(id=(select auth.uid()));
create policy own_billing on public.billing for select to authenticated using(account_id=(select auth.uid()));
create policy own_devices on public.devices for select to authenticated using(account_id=(select auth.uid()));
-- No client can write subscriptions, entitlements, devices, licenses, roles or audit records.
create function public.new_account() returns trigger language plpgsql security definer set search_path='' as $$ begin
 insert into public.profiles(id) values(new.id); insert into public.billing(account_id) values(new.id); return new; end $$;
create trigger on_account_created after insert on auth.users for each row execute function public.new_account();

create function public.current_plan(a uuid) returns text language sql stable security definer set search_path='' as $$
 select coalesce((select case when status in ('active','trialing') and period_end>now() then plan when status='past_due' and grace_started_at+interval '7 days'>now() then plan else 'free' end from public.billing where account_id=a),'free'); $$;

create function public.take_rate_limit(k text, maximum integer, seconds integer) returns boolean language plpgsql security definer set search_path='' as $$
 declare n integer; begin
 insert into public.rate_limits as r values(k,now(),1) on conflict(key) do update set count=case when r.window_start+make_interval(secs=>seconds)<now() then 1 else r.count+1 end,window_start=case when r.window_start+make_interval(secs=>seconds)<now() then now() else r.window_start end returning count into n;
 return n<=maximum; end $$;

create function public.issue_license(a uuid,d uuid,n text,p text,v text,s uuid,k text) returns jsonb language plpgsql security definer set search_path='' as $$
 declare plan_name text; lim integer; seq bigint; issued timestamptz:=now(); begin
 perform pg_advisory_xact_lock(hashtextextended(a::text,0));
 if not exists(select 1 from auth.sessions where id=s and user_id=a) then raise exception 'session_revoked'; end if;
 plan_name:=public.current_plan(a); lim:=case plan_name when 'business' then 3 when 'starter' then 2 else 1 end;
 if exists(select 1 from public.devices where id=d and (account_id<>a or revoked_at is not null)) then raise exception 'device_revoked'; end if;
 if not exists(select 1 from public.devices where id=d) and (select count(*) from public.devices where account_id=a and revoked_at is null)>=lim then raise exception 'device_limit'; end if;
 -- Earliest registered devices survive a reduction. Config and local data are never erased.
 if exists(select 1 from public.devices where id=d) and not exists(select 1 from (select id from public.devices where account_id=a and revoked_at is null order by registered_at,id limit lim) allowed where id=d) then raise exception 'device_limit'; end if;
 insert into public.devices as dev(id,account_id,name,platform,version,session_id,sequence) values(d,a,n,p,v,s,1) on conflict(id) do update set name=n,version=v,session_id=s,validated_at=issued,sequence=dev.sequence+1 returning sequence into seq;
 insert into public.licenses values(d,seq,issued,issued+interval '7 days',k) on conflict(device_id) do update set sequence=seq,issued_at=issued,expires_at=issued+interval '7 days',key_id=k;
 insert into public.audit_events(actor,account_id,device_id,action,reason) values(a,a,d,'license_issued','registration');
 return jsonb_build_object('plan',plan_name,'sequence',seq,'issuedAt',floor(extract(epoch from issued)*1000),'expiresAt',floor(extract(epoch from issued+interval '7 days')*1000)); end $$;

create function public.revoke_device(a uuid,d uuid,actor_id uuid,why text) returns void language plpgsql security definer set search_path='' as $$
 declare sid uuid; begin
 update public.devices set revoked_at=now(),sequence=sequence+1 where id=d and account_id=a returning session_id into sid;
 if not found then raise exception 'not_found'; end if;
 delete from public.licenses where device_id=d;
 delete from auth.sessions where id=sid and user_id=a;
 insert into public.audit_events(actor,account_id,device_id,action,reason) values(actor_id,a,d,'device_revoked',why); end $$;

create function public.reconcile_billing(a uuid,sub text,price_plan text,new_status text,ends timestamptz,observed timestamptz,event_id text,event_type text) returns boolean language plpgsql security definer set search_path='' as $$
 begin
 perform pg_advisory_xact_lock(hashtextextended(a::text,1));
 if exists(select 1 from public.billing_events where id=event_id and processed_at is not null) then return false; end if;
 insert into public.billing_events(id,account_id,type) values(event_id,a,event_type) on conflict(id) do nothing;
 update public.billing set subscription_id=sub,plan=price_plan,status=new_status,period_end=ends,grace_started_at=case when new_status='past_due' then coalesce(grace_started_at,now()) else null end,reconciled_at=observed where account_id=a and reconciled_at<=observed;
 update public.billing_events set processed_at=now() where id=event_id;
 insert into public.audit_events(actor,account_id,action,reason) values(null,a,'billing_reconciled','webhook'); return true; end $$;

create function public.session_live(a uuid,s uuid) returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from auth.sessions where id=s and user_id=a); $$;
create function public.prune_metadata() returns void language plpgsql security definer set search_path='' as $$ begin
 delete from public.audit_events where created_at<now()-interval '12 months';
 delete from public.operational_events where created_at<now()-interval '30 days';
 delete from public.billing_events where created_at<now()-interval '12 months';
 delete from public.rate_limits where window_start<now()-interval '1 day'; end $$;
revoke all on all functions in schema public from public,anon,authenticated;
grant execute on all functions in schema public to service_role;
-- Atomic catalog publication includes the audit record.
create function public.publish_catalog(actor_id uuid,document jsonb) returns void language plpgsql security definer set search_path='' as $$ begin
 insert into public.catalog(id,signed_document) values(true,document) on conflict(id) do update set signed_document=document,updated_at=now();
 insert into public.audit_events(actor,action,reason) values(actor_id,'catalog_changed','admin_review'); end $$;
revoke all on function public.publish_catalog(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.publish_catalog(uuid,jsonb) to service_role;
