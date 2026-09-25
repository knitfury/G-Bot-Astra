\set ON_ERROR_STOP on
begin;
insert into auth.users(id) values('11111111-1111-4111-8111-111111111111'),('22222222-2222-4222-8222-222222222222');
insert into auth.sessions values('33333333-3333-4333-8333-333333333333','11111111-1111-4111-8111-111111111111');
set local role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
do $$ begin
 if (select count(*) from public.profiles)<>1 then raise exception 'RLS profile leak'; end if;
 if (select count(*) from public.billing)<>1 then raise exception 'RLS billing leak'; end if;
 begin update public.billing set plan='business';raise exception 'Client billing write succeeded';exception when insufficient_privilege then null;end;
 begin insert into public.admin_roles(account_id) values('11111111-1111-4111-8111-111111111111');raise exception 'Admin escalation succeeded';exception when insufficient_privilege then null;end;
 begin perform public.current_plan('22222222-2222-4222-8222-222222222222');raise exception 'Privileged RPC exposed';exception when insufficient_privilege then null;end;
end $$;
reset role;
select public.issue_license('11111111-1111-4111-8111-111111111111','44444444-4444-4444-8444-444444444444','Test Windows','win32','1.0.0','33333333-3333-4333-8333-333333333333','test-1');
do $$ begin
 begin perform public.issue_license('11111111-1111-4111-8111-111111111111','55555555-5555-4555-8555-555555555555','Other','darwin','1.0.0','33333333-3333-4333-8333-333333333333','test-1');raise exception 'Device limit bypass';exception when raise_exception then if sqlerrm<>'device_limit' then raise;end if;end;
 if not public.reconcile_billing('11111111-1111-4111-8111-111111111111','sub_test','starter','active',now()+interval '1 month',now()+interval '1 second','evt_one','subscription.updated') then raise exception 'First event not processed';end if;
 if public.reconcile_billing('11111111-1111-4111-8111-111111111111','sub_test','free','free',now(),now()+interval '2 seconds','evt_one','subscription.updated') then raise exception 'Duplicate event replayed';end if;
 if public.current_plan('11111111-1111-4111-8111-111111111111')<>'starter' then raise exception 'Plan reconciliation failed';end if;
end $$;
update public.billing set status='past_due',grace_started_at=now()-interval '7 days' where account_id='11111111-1111-4111-8111-111111111111';
do $$ begin if public.current_plan('11111111-1111-4111-8111-111111111111')<>'free' then raise exception 'Expired grace bypass';end if;end $$;
select public.revoke_device('11111111-1111-4111-8111-111111111111','44444444-4444-4444-8444-444444444444','11111111-1111-4111-8111-111111111111','user_request');
do $$ begin if public.session_live('11111111-1111-4111-8111-111111111111','33333333-3333-4333-8333-333333333333') then raise exception 'Revoked session survived';end if;end $$;
insert into public.operational_events(component,category,created_at) values('license','success',now()-interval '31 days'),('license','success',now());
insert into public.audit_events(action,reason,created_at) values('license_issued','registration',now()-interval '13 months');
select public.prune_metadata();
do $$ begin if (select count(*) from public.operational_events)<>1 then raise exception 'Operational retention failed';end if;if exists(select 1 from public.audit_events where created_at<now()-interval '12 months') then raise exception 'Audit retention failed';end if;end $$;
-- Outbox is privileged, leases prevent concurrent duplicate claims, and notices contain no business payload.
set local role authenticated;
do $$ begin begin perform count(*) from public.notification_outbox;raise exception 'Outbox exposed';exception when insufficient_privilege then null;end;end $$;
reset role;
update auth.users set email='fixture@example.invalid',email_confirmed_at=now() where id='11111111-1111-4111-8111-111111111111';
do $$ declare claimed integer; begin
 if (select count(*) from public.notification_outbox where kind='welcome')<>1 then raise exception 'Welcome event missing';end if;
 select count(*) into claimed from public.claim_notifications();if claimed<3 then raise exception 'Lifecycle notices missing';end if;
 if (select count(*) from public.claim_notifications())<>0 then raise exception 'Outbox double claim';end if;
end $$;
select public.publish_catalog('11111111-1111-4111-8111-111111111111','{"payload":"{\"sequence\":2}"}'::jsonb);
do $$ begin
 begin perform public.publish_catalog('11111111-1111-4111-8111-111111111111','{"payload":"{\"sequence\":1}"}'::jsonb);raise exception 'Catalog rollback accepted';exception when raise_exception then if sqlerrm<>'catalog_sequence' then raise;end if;end;
end $$;
delete from auth.users where id='11111111-1111-4111-8111-111111111111';
do $$ begin
 if not exists(select 1 from public.notification_outbox where kind='account_deleted' and recipient='fixture@example.invalid' and account_id is null) then raise exception 'Deletion receipt missing';end if;
end $$;
rollback;
