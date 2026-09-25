import {adminClient,failure,HttpError,json} from '@/production/server/control';
export const runtime='nodejs';
export async function GET(){try{const r=await adminClient().from('catalog').select('signed_document').eq('id',true).maybeSingle();if(r.error||!r.data)throw new HttpError(503,'Catalog unavailable. Custom connections remain available.');return json(r.data.signed_document);}catch(e){return failure(e);}}
