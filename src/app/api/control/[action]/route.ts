import { z } from "zod";
import { randomUUID } from "node:crypto";
import { body, customer, failure, HttpError, identity, issue, json, origin, prices, reconcile, required, stripeClient } from "@/production/server/control";
export const runtime="nodejs";
export async function POST(req:Request,{params}:{params:Promise<{action:string}>}){
 try{
  const {action}=await params;
  if(action==="license")return await issue(req);
  const {db,user,claims}=await identity(req,action.startsWith("admin-"));
  if(action==="account"){
   const [profile,billing,devices]=await Promise.all([db.from("profiles").select("display_name").eq("id",user.id).single(),db.from("billing").select("plan,status,period_end,grace_started_at").eq("account_id",user.id).single(),db.from("devices").select("id,name,platform,version,registered_at,validated_at,revoked_at").eq("account_id",user.id).order("registered_at")]);
   if(profile.error||billing.error||devices.error)throw Error();
   const plan=await db.rpc("current_plan",{a:user.id});if(plan.error)throw plan.error;
   return json({email:user.email,name:profile.data.display_name,billing:billing.data,plan:plan.data,devices:devices.data});
  }
  if(action==="profile"){const v=z.object({name:z.string().trim().min(1).max(100)}).strict().parse(await body(req));const r=await db.from("profiles").update({display_name:v.name}).eq("id",user.id);if(r.error)throw r.error;return json({ok:true});}
  if(action==="checkout"){
   const v=z.object({price:z.enum(["starter_monthly","starter_annual","business_monthly","business_annual"])}).strict().parse(await body(req));
   const c=await customer(user.id,user.email??""),s=stripeClient();
   // One active subscription per account; existing subscribers use the configured portal.
   const existing=await s.subscriptions.list({customer:c.customer_id,status:"all",limit:100});if(existing.data.some(x=>!["canceled","incomplete_expired"].includes(x.status)))throw new HttpError(409,"Manage your existing subscription using Manage billing.");
   const session=await s.checkout.sessions.create({mode:"subscription",customer:c.customer_id,line_items:[{price:prices()[v.price],quantity:1}],client_reference_id:user.id,automatic_tax:{enabled:true},customer_update:{address:"auto"},billing_address_collection:"required",success_url:`${origin()}/portal?billing=pending`,cancel_url:`${origin()}/portal`,subscription_data:{metadata:{gbot_account:user.id}}},{idempotencyKey:`checkout-${user.id}-${v.price}-${Math.floor(Date.now()/300000)}`});return json({url:session.url});
  }
  if(action==="billing"){
   const c=await customer(user.id,user.email??"");const session=await stripeClient().billingPortal.sessions.create({customer:c.customer_id,return_url:`${origin()}/portal`,configuration:required("STRIPE_PORTAL_CONFIGURATION")});return json({url:session.url});
  }
  if(action==="refresh"){
   const c=await db.from("billing").select("customer_id").eq("account_id",user.id).single();if(c.error)throw c.error;
   if(c.data.customer_id)await reconcile(c.data.customer_id,`refresh-${randomUUID()}`,"manual.reconcile");return json({ok:true});
  }
  if(action==="revoke-device"){
   const v=z.object({id:z.string().uuid(),confirm:z.literal(true)}).strict().parse(await body(req));const r=await db.rpc("revoke_device",{a:user.id,d:v.id,actor_id:user.id,why:"user_request"});if(r.error)throw r.error;return json({ok:true});
  }
  if(action==="delete-account"){
   z.object({confirm:z.literal("DELETE MY ACCOUNT")}).strict().parse(await body(req));
   // Require a fresh password/OAuth/MFA authentication, not token refresh.
   const methods=z.array(z.object({method:z.string(),timestamp:z.number()})).safeParse(claims.amr);
   if(!methods.success||!methods.data.some(x=>["password","oauth","totp"].includes(x.method)&&Date.now()/1000-x.timestamp<300))throw new HttpError(403,"Sign in again immediately before deleting your account.");
   const b=await db.from("billing").select("customer_id").eq("account_id",user.id).single();if(b.error)throw b.error;
   if(b.data.customer_id){const s=stripeClient(),subs=await s.subscriptions.list({customer:b.data.customer_id,status:"all",limit:100});for(const sub of subs.data.filter(x=>!["canceled","incomplete_expired"].includes(x.status)))await s.subscriptions.cancel(sub.id,{prorate:false,invoice_now:false});}
   const audit=await db.from("audit_events").insert({actor:user.id,account_id:user.id,action:"account_deleted",reason:"user_request"});if(audit.error)throw audit.error;
   const result=await db.auth.admin.deleteUser(user.id);if(result.error)throw result.error;return json({ok:true,localData:"Retained on your devices. Erase separately if desired.",financialRecords:"Stripe financial records retained according to legal obligations."});
  }
  if(action==="admin-accounts"){
   const v=z.object({account:z.string().uuid()}).strict().parse(await body(req));
   const [b,d,l,e]=await Promise.all([db.from("billing").select("account_id,plan,status,period_end,grace_started_at,reconciled_at").eq("account_id",v.account),db.from("devices").select("id,name,platform,version,validated_at,revoked_at").eq("account_id",v.account),db.from("audit_events").select("action,reason,created_at,device_id").eq("account_id",v.account).order("created_at",{ascending:false}).limit(50),db.from("billing_events").select("id,type,created_at,processed_at").eq("account_id",v.account).order("created_at",{ascending:false}).limit(30)]);
   if(b.error||d.error||l.error||e.error)throw Error();return json({billing:b.data,devices:d.data,audit:l.data,events:e.data});
  }
  if(action==="admin-revoke"){
   const v=z.object({account:z.string().uuid(),device:z.string().uuid(),confirm:z.literal(true)}).strict().parse(await body(req));const r=await db.rpc("revoke_device",{a:v.account,d:v.device,actor_id:user.id,why:"admin_review"});if(r.error)throw r.error;return json({ok:true});
  }
  if(action==="admin-refresh"){
   const v=z.object({account:z.string().uuid()}).strict().parse(await body(req));const b=await db.from("billing").select("customer_id").eq("account_id",v.account).single();if(b.error)throw b.error;if(b.data.customer_id)await reconcile(b.data.customer_id,`admin-${randomUUID()}`,"admin.reconcile");const r=await db.from("audit_events").insert({actor:user.id,account_id:v.account,action:"entitlement_refresh",reason:"admin_review"});if(r.error)throw r.error;return json({ok:true});
  }
  throw new HttpError(404,"Unknown operation.");
 }catch(e){return failure(e);}
}
