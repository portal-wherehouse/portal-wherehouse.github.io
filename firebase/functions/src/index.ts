import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore, type Transaction } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { Engine, emptyDb, type Db } from '../../../src/demo/engine';
import { validateEnvelope } from '../../../src/domain/commands';
import type { CommandEnvelope, User } from '../../../src/domain/types';

initializeApp();
const firestore = getFirestore();
const options = { region: 'us-central1', maxInstances: 5, timeoutSeconds: 60, memory: '512MiB' as const };
const tables = ['warehouses','locations','jobs','pallets','events','labels','attachments','members','audit','lineage','imports','private'] as const;
const clean = (x: unknown) => JSON.parse(JSON.stringify(x));
const validId = (x: unknown): x is string => typeof x === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(x);
function actor(request: any): User {
  if (!request.auth) throw new HttpsError('unauthenticated','Sign in first.');
  if (!request.auth.token.email_verified) throw new HttpsError('failed-precondition','Verify your email before opening a warehouse.');
  return { id:request.auth.uid, email:request.auth.token.email || '', name:request.auth.token.name || request.auth.token.email || 'Teammate' };
}
function rows(db: Db, ws: string): Map<string, any> {
  const result = new Map<string, any>();
  for (const table of ['warehouses','locations','jobs','pallets','labels','attachments','imports'] as const)
    for (const [id,value] of Object.entries(db[table])) result.set(`${table}/${id}`,value);
  for (const list of Object.values(db.events)) for (const event of list) result.set(`events/${event.pallet_id}_${event.revision}`,event);
  for (const m of db.memberships) result.set(`members/${m.user_id}`,{...m,user:db.users[m.user_id]});
  for (const a of db.audit) result.set(`audit/${a.id}`,a);
  for (const a of db.lineage) result.set(`lineage/${a.child_id}`,a);
  result.set('private/counter',{value:db.counters[ws] || 0});
  return result;
}
async function load(tx: Transaction, ws: string): Promise<Db> {
  const db = emptyDb();
  const root = firestore.doc(`workspaces/${ws}`);
  const head = await tx.get(root);
  if (!head.exists) throw new HttpsError('not-found','Warehouse not found.');
  db.workspaces[ws] = {id:ws,name:head.get('name'),created_at:head.get('created_at')};
  const snapshots = await Promise.all(tables.map(t=>tx.get(root.collection(t))));
  snapshots.forEach((snap,i)=>snap.docs.forEach(doc=>{
    const table = tables[i], d:any = doc.data();
    if (table === 'members') { db.memberships.push({workspace_id:ws,user_id:d.user_id,role:d.role,active:d.active}); db.users[d.user_id]=d.user; }
    else if (table === 'events') (db.events[d.pallet_id] ??= []).push(d);
    else if (table === 'private') { if(doc.id==='counter') db.counters[ws]=d.value; }
    else if (table === 'audit' || table === 'lineage') db[table].push(d);
    else (db[table] as Record<string,any>)[doc.id]=d;
  }));
  for (const list of Object.values(db.events)) list.sort((a,b)=>a.revision-b.revision);
  return db;
}
function persist(tx: Transaction, ws:string, before:Map<string,any>, db:Db) {
  const changes = [...rows(db,ws)].filter(([k,v])=>JSON.stringify(v)!==JSON.stringify(before.get(k)));
  if(changes.length>440) throw new HttpsError('resource-exhausted','This batch is too large. Import fewer rows at a time.');
  for(const [path,value] of changes) tx.set(firestore.doc(`workspaces/${ws}/${path}`),clean(value));
  tx.set(firestore.doc(`workspaces/${ws}`),{...db.workspaces[ws],revision:FieldValue.increment(1)},{merge:true});
}

export const createWarehouse = onCall(options, async request=>{
  const user = actor(request);
  const name = String(request.data?.name || '').trim();
  const warehouseName = String(request.data?.warehouseName || name).trim();
  const timezone = String(request.data?.timezone || 'UTC');
  if(name.length<2 || name.length>100 || warehouseName.length>100) throw new HttpsError('invalid-argument','Enter a warehouse name (2–100 characters).');
  try { new Intl.DateTimeFormat('en',{timeZone:timezone}); } catch { throw new HttpsError('invalid-argument','Choose a valid time zone.'); }
  const profile = firestore.doc(`users/${user.id}`);
  return firestore.runTransaction(async tx=>{
    const existing = await tx.get(profile);
    if(existing.get('owned_workspace')) return {workspaceId:existing.get('owned_workspace')};
    const db = emptyDb(); const engine = new Engine(db);
    const {workspace} = engine.createWorkspace(user,name,{code:'WH',name:warehouseName,timezone});
    persist(tx,workspace.id,new Map(),db);
    tx.set(profile,{...user,owned_workspace:workspace.id,workspaces:FieldValue.arrayUnion(workspace.id)},{merge:true});
    return {workspaceId:workspace.id};
  });
});

export const command = onCall(options, async request=>{
  const user = actor(request);
  const parsed = validateEnvelope(request.data);
  if(!parsed.ok) throw new HttpsError('invalid-argument','The request is not valid.');
  const cmd = parsed.cmd as CommandEnvelope;
  if(!validId(cmd.workspace_id) || !validId(cmd.command_id)) throw new HttpsError('invalid-argument','Invalid warehouse or request ID.');
  if(cmd.kind==='import_batch' && Array.isArray(cmd.payload.rows) && cmd.payload.rows.length>80) throw new HttpsError('invalid-argument','Import up to 80 rows at a time.');
  const memberRef = firestore.doc(`workspaces/${cmd.workspace_id}/members/${user.id}`);
  const member = await memberRef.get();
  if(!member.exists || !member.get('active')) throw new HttpsError('permission-denied','You do not have access to this warehouse.');
  let teammate:User|undefined;
  if(cmd.kind==='invite_member') {
    if(!['OWNER','SUPERVISOR'].includes(member.get('role'))) throw new HttpsError('permission-denied','Only managers can add teammates.');
    try {
      const found = await getAuth().getUserByEmail(String(cmd.payload.email).trim().toLowerCase());
      if(!found.emailVerified || found.disabled) throw new Error('unverified');
      teammate={id:found.uid,email:found.email!,name:found.displayName || String(cmd.payload.name)};
    } catch { throw new HttpsError('failed-precondition','Ask this person to create an account and verify their email first, then add them here.'); }
  }
  if(cmd.kind==='add_photo') {
    const path=String(cmd.payload.data_url || '');
    const prefix=`storage://workspaces/${cmd.workspace_id}/photos/${user.id}/`;
    if(!path.startsWith(prefix) || !/^[-\w]+\.(jpeg|png|webp)$/.test(path.slice(prefix.length))) throw new HttpsError('invalid-argument','Upload the photo first.');
    const [meta]=await getStorage().bucket().file(path.slice(10)).getMetadata();
    if(Number(meta.size)>5*1024*1024 || Number(meta.size)!==cmd.payload.bytes || meta.contentType!==cmd.payload.media_type || meta.metadata?.uploadedBy!==user.id) throw new HttpsError('invalid-argument','Photo metadata did not match.');
    if(cmd.payload.thumb_url!==path) throw new HttpsError('invalid-argument','Invalid photo preview.');
  }
  const ws=cmd.workspace_id;
  const result = await firestore.runTransaction(async tx=>{
    // Recheck authorization inside the transaction: removal racing with a command must win.
    const currentMember=await tx.get(memberRef);
    if(!currentMember.get('active')) throw new HttpsError('permission-denied','Your access was removed.');
    const receiptRef=firestore.doc(`workspaces/${ws}/receipts/${cmd.command_id}`);
    const receipt=await tx.get(receiptRef);
    const db=await load(tx,ws);
    if(receipt.exists) db.receipts[`${ws}:${cmd.command_id}`]=receipt.data() as any;
    const before=rows(db,ws);
    if(teammate && !db.memberships.some(m=>m.user_id===teammate!.id&&m.active) && db.memberships.filter(m=>m.active).length>=10) throw new HttpsError('resource-exhausted','This plan includes ten active people. Remove unused access or contact support.');
    if(teammate) db.users[teammate.id]=teammate;
    const engine=new Engine(db,{photoPrefix:`storage://workspaces/${ws}/photos/${user.id}/`});
    const result=engine.execute(user.id,cmd);
    // Rejected requests also get an immutable receipt; a retry returns the same answer.
    if(!receipt.exists && db.receipts[`${ws}:${cmd.command_id}`]) {
      persist(tx,ws,before,db);
      tx.create(receiptRef,clean(db.receipts[`${ws}:${cmd.command_id}`]));
      if(result.ok && teammate) tx.set(firestore.doc(`users/${teammate.id}`),{...teammate,workspaces:FieldValue.arrayUnion(ws)},{merge:true});
      if(result.ok && cmd.kind==='remove_member') tx.set(firestore.doc(`users/${String(cmd.payload.user_id)}`),{workspaces:FieldValue.arrayRemove(ws)},{merge:true});
    }
    return clean(result);
  });
  return result;
});
