import { failure,HttpError,json,reconcile,required,stripeClient } from "@/production/server/control";
export const runtime="nodejs";
export async function POST(req:Request){try{
 const raw=await req.text();if(raw.length>1_000_000)throw new HttpError(413,"Request too large.");
 const s=stripeClient();let event;
 try{event=s.webhooks.constructEvent(raw,req.headers.get("stripe-signature")??"",required("STRIPE_WEBHOOK_SECRET"),300);}catch{throw new HttpError(400,"Invalid webhook signature.");}
 const prod=process.env.NEXT_PUBLIC_GBOT_ENVIRONMENT==="production";if(event.livemode!==prod)throw new HttpError(400,"Billing environment mismatch.");
 if(["customer.subscription.created","customer.subscription.updated","customer.subscription.deleted","invoice.paid","invoice.payment_failed","checkout.session.completed","charge.refunded"].includes(event.type)){
 const object=event.data.object as unknown as {customer?:string|{id:string}};const customer=typeof object.customer==="string"?object.customer:object.customer?.id;
 if(customer)await reconcile(customer,event.id,event.type);
 }
 return json({received:true});
}catch(e){return failure(e);}}
