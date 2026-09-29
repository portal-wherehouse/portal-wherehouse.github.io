import { collection, query, where, orderBy, limit, or, and, type Firestore } from 'firebase/firestore';
import { normalizeCode, parsePalletCode } from '../domain/codes';
export const PAGE_SIZE=50;
export type LiveFilter={q?:string;states?:string[];job_id?:string;location_id?:string;include_archived?:boolean;hold?:boolean};
// One ordered field and equality filters; cursor pagination never pays to skip earlier rows.
export function palletQuery(db:Firestore,ws:string,f:LiveFilter={},jobIds:string[]=[],locationIds:string[]=[]){
 const base=collection(db,'workspaces',ws,'pallets'),filters:any[]=[];
 const q=normalizeCode(f.q||'');
 if(q){
  const exact=parsePalletCode(q);const clauses:any[]=[];
  if(exact)clauses.push(where('code','==',exact));
  if(jobIds.length)clauses.push(where('job_id','in',jobIds.slice(0,10)));
  if(locationIds.length)clauses.push(where('current_location_id','in',locationIds.slice(0,10)));
  // Description/name/notes are indexed word prefixes. Additional words are checked on the bounded page.
  const first=q.toLowerCase().match(/[\p{L}\p{N}-]+/u)?.[0];if(first&&first.length>=2)clauses.push(where('search_terms','array-contains',first.slice(0,32)));
  if(clauses.length)filters.push(or(...clauses));else filters.push(where('code','==',q));
 }
 if(!q){if(f.location_id)filters.push(where('current_location_id','==',f.location_id));else if(f.job_id)filters.push(where('job_id','==',f.job_id));else if(f.hold)filters.push(where('has_hold','==',true));else if(f.states?.length)filters.push(where('state','in',f.states));}
 return filters.length ? query(base,and(...filters),orderBy('code'),limit(PAGE_SIZE)) : query(base,orderBy('code'),limit(PAGE_SIZE));
}
