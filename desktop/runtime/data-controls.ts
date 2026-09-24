import type { Database } from "../../src/types/domain";
export function retain(db:Database,days:0|30|90|180,now=Date.now()):Database {
 if(!days)return structuredClone(db);
 const next=structuredClone(db),cutoff=now-days*86_400_000;
 next.conversations=next.conversations.filter(c=>Date.parse(c.updatedAt)>=cutoff);
 const ids=new Set(next.conversations.map(c=>c.id));next.approvals=next.approvals.filter(a=>ids.has(a.conversationId));
 // Activity has its own explicit clear operation and retention policy.
 return next;
}
export function exportHistory(db:Database,format:"json"|"markdown"){
 const conversations=db.conversations.map(c=>({id:c.id,title:c.title,createdAt:c.createdAt,updatedAt:c.updatedAt,messages:c.messages.map(m=>({role:m.role,content:m.content,createdAt:m.createdAt,model:m.model}))}));
 return format==="json"?JSON.stringify({format:"g-bot-history",version:1,conversations},null,2):conversations.map(c=>`# ${c.title}\n\n${c.messages.map(m=>`## ${m.role}\n\n${m.content}`).join("\n\n")}`).join("\n\n---\n\n");
}
export function portableData(db:Database):Database{
 const copy=structuredClone(db);copy.user=null;copy.entitlement={...copy.entitlement,plan:"free",maxActiveConnections:1,status:"expired"};
 copy.providers=copy.providers.map(p=>({...p,headers:"{}",maskedCredential:"Reconnect after restore",status:"disconnected"}));
 copy.connections=copy.connections.map(c=>({...c,enabled:false,status:"disconnected",maskedCredential:"Reconnect after restore"}));
 copy.approvals=copy.approvals.map(a=>({...a,status:a.status==="pending"?"cancelled":a.status}));return copy;
}
