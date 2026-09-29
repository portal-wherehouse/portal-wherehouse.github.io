import { createHash } from 'node:crypto';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, Timestamp, getFirestore, type Transaction } from 'firebase-admin/firestore';
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
const emailHash = (email:string) => createHash('sha256').update(email.trim().toLowerCase()).digest('hex');
const keyHash = (key:string) => createHash('sha256').update(key.trim()).digest('hex');
function licensed(data:any) { return data?.active === true && data.expires_at?.toMillis() > Date.now(); }
async function requireLicense(tx:Transaction, ws:string) {
  const license=await tx.get(firestore.doc(`licenses/${ws}`));
  if(!licensed(license.data()))throw new HttpsError('permission-denied','This warehouse needs an active usage key. Contact the account owner.');
}
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
    if(existing.get('owned_workspace') && !request.data?.usageKey) {
      await requireLicense(tx,existing.get('owned_workspace'));
      return {workspaceId:existing.get('owned_workspace')};
    }
    const key=String(request.data?.usageKey || '').trim();
    if(!/^WH-[a-f0-9]{48}$/.test(key))throw new HttpsError('permission-denied','Enter the usage key issued for your account.');
    const keyRef=firestore.doc(`activationKeys/${keyHash(key)}`);
    const issued=await tx.get(keyRef);const activation=issued.data();
    if(!activation || activation.email!==user.email.toLowerCase() || activation.revoked || activation.redeemed_by || activation.redeem_before.toMillis()<=Date.now())throw new HttpsError('permission-denied','This key is invalid, expired, or belongs to another account.');
    if(existing.get('owned_workspace')) {
      const ws=existing.get('owned_workspace');
      const membership=await tx.get(firestore.doc(`workspaces/${ws}/members/${user.id}`));
      if(!membership.get('active')||membership.get('role')!=='OWNER')throw new HttpsError('permission-denied','Only the account owner can activate this warehouse.');
      const current=await tx.get(firestore.doc(`licenses/${ws}`));
      tx.set(firestore.doc(`licenses/${ws}`),{active:true,owner_uid:user.id,expires_at:Timestamp.fromMillis(Math.max(Date.now(),current.get('expires_at')?.toMillis()||0)+activation.days*86400000),activated_at:Timestamp.now()});
      tx.update(keyRef,{redeemed_by:user.id,workspace_id:ws,redeemed_at:Timestamp.now()});
      return {workspaceId:ws};
    }
    const db = emptyDb(); const engine = new Engine(db);
    const {workspace} = engine.createWorkspace(user,name,{code:'WH',name:warehouseName,timezone});
    persist(tx,workspace.id,new Map(),db);
    tx.create(firestore.doc(`licenses/${workspace.id}`),{active:true,owner_uid:user.id,expires_at:Timestamp.fromMillis(Date.now()+activation.days*86400000),activated_at:Timestamp.now()});
    tx.update(keyRef,{redeemed_by:user.id,workspace_id:workspace.id,redeemed_at:Timestamp.now()});
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
    await requireLicense(tx,ws);
    const currentMember=await tx.get(memberRef);
    if(!currentMember.get('active')) throw new HttpsError('permission-denied','Your access was removed.');
    const receiptRef=firestore.doc(`workspaces/${ws}/receipts/${cmd.command_id}`);
    const receipt=await tx.get(receiptRef);
    const db=await load(tx,ws);
    if(receipt.exists) db.receipts[`${ws}:${cmd.command_id}`]=receipt.data() as any;
    const before=rows(db,ws);
    const reserved=teammate ? await tx.get(firestore.collection(`workspaces/${ws}/invites`)) : null;
    if(teammate && reserved && !db.memberships.some(m=>m.user_id===teammate!.id&&m.active) && db.memberships.filter(m=>m.active).length+reserved.docs.filter(d=>d.get('email')!==teammate!.email).length>=10)throw new HttpsError('resource-exhausted','Your plan includes ten people, including authorized emails.');
    if(teammate && !db.memberships.some(m=>m.user_id===teammate!.id&&m.active) && db.memberships.filter(m=>m.active).length>=10) throw new HttpsError('resource-exhausted','This plan includes ten active people. Remove unused access or contact support.');
    if(teammate) db.users[teammate.id]=teammate;
    const engine=new Engine(db,{photoPrefix:`storage://workspaces/${ws}/photos/${user.id}/`});
    const result=engine.execute(user.id,cmd);
    // Rejected requests also get an immutable receipt; a retry returns the same answer.
    if(!receipt.exists && db.receipts[`${ws}:${cmd.command_id}`]) {
      persist(tx,ws,before,db);
      tx.create(receiptRef,clean(db.receipts[`${ws}:${cmd.command_id}`]));
      if(result.ok && teammate) {tx.set(firestore.doc(`users/${teammate.id}`),{...teammate,workspaces:FieldValue.arrayUnion(ws)},{merge:true});tx.delete(firestore.doc(`workspaces/${ws}/invites/${emailHash(teammate.email)}`));tx.delete(firestore.doc(`emailAccess/${emailHash(teammate.email)}/warehouses/${ws}`));}
      if(result.ok && cmd.kind==='remove_member') tx.set(firestore.doc(`users/${String(cmd.payload.user_id)}`),{workspaces:FieldValue.arrayRemove(ws)},{merge:true});
    }
    return clean(result);
  });
  return result;
});

// Managers may authorize an email before its owner has created an account.
export const authorizeEmail = onCall(options, async request=>{
  const user=actor(request);const ws=String(request.data?.workspaceId || '');
  const email=String(request.data?.email || '').trim().toLowerCase();const name=String(request.data?.name || '').trim();const role=String(request.data?.role || 'OPERATOR');
  if(!validId(ws)||! /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)||email.length>200||!name||name.length>120||!['OWNER','SUPERVISOR','OPERATOR','VIEWER'].includes(role))throw new HttpsError('invalid-argument','Enter a name, email and role.');
  let teammate:User|undefined;
  // Identity lookup is not authority; the transaction below rechecks the manager and license.
  try { const u=await getAuth().getUserByEmail(email);if(u.emailVerified&&!u.disabled)teammate={id:u.uid,email,name:u.displayName||name}; }
  catch(e){if((e as any).code!=='auth/user-not-found')throw new HttpsError('unavailable','Could not check this email. Try again.');}
  return firestore.runTransaction(async tx=>{
    await requireLicense(tx,ws);
    const manager=await tx.get(firestore.doc(`workspaces/${ws}/members/${user.id}`));
    if(!manager.get('active')||!['OWNER','SUPERVISOR'].includes(manager.get('role'))||(role==='OWNER'&&manager.get('role')!=='OWNER'))throw new HttpsError('permission-denied','Your role cannot authorize this access.');
    const db=await load(tx,ws);const before=rows(db,ws);
    const invites=await tx.get(firestore.collection(`workspaces/${ws}/invites`));
    const hash=emailHash(email);const prior=invites.docs.find(d=>d.id===hash);
    if(prior?.get('role')==='OWNER'&&manager.get('role')!=='OWNER')throw new HttpsError('permission-denied','Only an owner can change this authorization.');
    if(teammate&&db.memberships.some(m=>m.user_id===teammate!.id&&m.active))throw new HttpsError('already-exists','This person already has access. Change their role in the team list.');
    if(!prior&&db.memberships.filter(m=>m.active).length+invites.size>=10)throw new HttpsError('resource-exhausted','Your plan includes ten people, including pending authorized emails.');
    if(teammate){
      db.users[teammate.id]=teammate;
      const result=new Engine(db).execute(user.id,{schema_version:1,command_id:crypto.randomUUID(),workspace_id:ws,kind:'invite_member',payload:{name,email,role}});
      if(!result.ok)throw new HttpsError('permission-denied',result.message);
      persist(tx,ws,before,db);
      tx.set(firestore.doc(`users/${teammate.id}`),{...teammate,workspaces:FieldValue.arrayUnion(ws)},{merge:true});
      tx.delete(firestore.doc(`workspaces/${ws}/invites/${hash}`));tx.delete(firestore.doc(`emailAccess/${hash}/warehouses/${ws}`));
      return {status:'added'};
    }
    const invitation={email,name,role,workspace_id:ws,authorized_by:user.id,created_at:new Date().toISOString()};
    tx.set(firestore.doc(`workspaces/${ws}/invites/${hash}`),invitation);
    tx.set(firestore.doc(`emailAccess/${hash}/warehouses/${ws}`),invitation);
    const auditId=crypto.randomUUID();tx.create(firestore.doc(`workspaces/${ws}/audit/${auditId}`),{id:auditId,workspace_id:ws,actor_id:user.id,action:'invite_member',target_id:hash,before:null,after:{email,role,status:'authorized'},reason:null,accepted_at:invitation.created_at,command_id:crypto.randomUUID()});
    return {status:'authorized'};
  });
});

export const joinAuthorizedWarehouses = onCall(options,async request=>{
  const user=actor(request);const hash=emailHash(user.email);
  const invitations=await firestore.collection(`emailAccess/${hash}/warehouses`).limit(20).get();
  const joined:string[]=[];
  for(const invitation of invitations.docs){
    const ws=invitation.id;
    const accepted=await firestore.runTransaction(async tx=>{
      const pending=await tx.get(invitation.ref);if(!pending.exists)return false;
      const d=pending.data()!;const license=await tx.get(firestore.doc(`licenses/${ws}`));if(!licensed(license.data()))return false;
      const inviter=await tx.get(firestore.doc(`workspaces/${ws}/members/${d.authorized_by}`));
      if(!inviter.get('active')||!['OWNER','SUPERVISOR'].includes(inviter.get('role'))||(d.role==='OWNER'&&inviter.get('role')!=='OWNER'))return false;
      const memberRef=firestore.doc(`workspaces/${ws}/members/${user.id}`);const member=await tx.get(memberRef);
      tx.set(memberRef,{workspace_id:ws,user_id:user.id,role:member.get('active')?member.get('role'):d.role,active:true,user});
      tx.set(firestore.doc(`users/${user.id}`),{...user,workspaces:FieldValue.arrayUnion(ws)},{merge:true});
      tx.delete(invitation.ref);tx.delete(firestore.doc(`workspaces/${ws}/invites/${hash}`));
      const id=crypto.randomUUID();tx.create(firestore.doc(`workspaces/${ws}/audit/${id}`),{id,workspace_id:ws,actor_id:user.id,action:'invite_member',target_id:user.id,before:null,after:{email:user.email,role:d.role,status:'joined'},reason:null,accepted_at:new Date().toISOString(),command_id:crypto.randomUUID()});
      return true;
    });
    if(accepted)joined.push(ws);
  }
  return {joined};
});

export const cancelAuthorization = onCall(options,async request=>{
  const user=actor(request);const ws=String(request.data?.workspaceId||'');const email=String(request.data?.email||'').toLowerCase().trim();
  if(!validId(ws)||!email)throw new HttpsError('invalid-argument','Choose an authorized email.');
  return firestore.runTransaction(async tx=>{
    await requireLicense(tx,ws);const manager=await tx.get(firestore.doc(`workspaces/${ws}/members/${user.id}`));
    const hash=emailHash(email);const pending=await tx.get(firestore.doc(`workspaces/${ws}/invites/${hash}`));
    if(!manager.get('active')||!['OWNER','SUPERVISOR'].includes(manager.get('role'))||(pending.get('role')==='OWNER'&&manager.get('role')!=='OWNER'))throw new HttpsError('permission-denied','You cannot remove this authorization.');
    tx.delete(pending.ref);tx.delete(firestore.doc(`emailAccess/${hash}/warehouses/${ws}`));
    if(pending.exists){const id=crypto.randomUUID();tx.create(firestore.doc(`workspaces/${ws}/audit/${id}`),{id,workspace_id:ws,actor_id:user.id,action:'remove_member',target_id:hash,before:{email,role:pending.get('role')},after:{status:'authorization removed'},reason:null,accepted_at:new Date().toISOString(),command_id:crypto.randomUUID()});}
    return {ok:true};
  });
});
