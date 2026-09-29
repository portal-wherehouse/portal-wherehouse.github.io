import { initializeApp, type FirebaseOptions } from 'firebase/app';
import { getAuth, onAuthStateChanged, signOut, connectAuthEmulator, type Auth } from 'firebase/auth';
import { collection, doc, getDoc, getFirestore, onSnapshot, connectFirestoreEmulator, type Firestore, type Unsubscribe } from 'firebase/firestore';
import { getFunctions, httpsCallable, connectFunctionsEmulator, type Functions } from 'firebase/functions';
import { getStorage, ref, uploadString, getBlob, connectStorageEmulator, type FirebaseStorage } from 'firebase/storage';
import { createStore, get, set } from 'idb-keyval';
import { Backend, type Outcome, type PendingSend } from './backend';
import { Outbox } from './outbox';
import { Engine, emptyDb, type Db } from '../demo/engine';
import type { CommandEnvelope, CommandResult } from '../domain/types';

const collections = ['warehouses','locations','jobs','pallets','events','labels','attachments','members','lineage'] as const;
export function firebaseConfig(): FirebaseOptions | null {
  const raw=import.meta.env.VITE_FIREBASE_CONFIG;
  if(!raw) return null;
  try { const c=JSON.parse(raw); if(c.apiKey && c.authDomain && c.projectId && c.appId && c.storageBucket) return c; } catch { /* setup message below */ }
  return null;
}
export class FirebaseBackend extends Backend {
  override mode='firebase' as const;
  auth: Auth | null=null;
  firestore: Firestore | null=null;
  functions: Functions | null=null;
  storage: FirebaseStorage | null=null;
  workspaceIds: string[]=[];
  activeWorkspace: string | null=null;
  private unsubscribe: Unsubscribe[]=[];
  private profileStop: Unsubscribe | null=null;
  private generation=0;
  private photoUrls=new Map<string,string>();
  private liveStore=createStore('wherehouse-cloud-requests','kv');
  private scope='';
  constructor() {
    super(); this.db=emptyDb(); this.engine=new Engine(this.db);
    this.meta={fixture:'tiny',created_at:new Date().toISOString()};
    this.outbox=new Outbox({load:async()=>[],save:async()=>{throw new Error('Reconnect before making changes.');}});
  }
  static async connect() {
    const b=new FirebaseBackend(); const config=firebaseConfig();
    if(!config) return b;
    b.configured=true; b.loading=true;
    const app=initializeApp(config);
    b.auth=getAuth(app); b.firestore=getFirestore(app); b.functions=getFunctions(app,'us-central1'); b.storage=getStorage(app);
    if(import.meta.env.DEV && import.meta.env.VITE_FIREBASE_EMULATORS==='true') {
      connectAuthEmulator(b.auth,'http://127.0.0.1:9099',{disableWarnings:true});
      connectFirestoreEmulator(b.firestore,'127.0.0.1',8080);
      connectFunctionsEmulator(b.functions,'127.0.0.1',5001);
      connectStorageEmulator(b.storage,'127.0.0.1',9199);
    }
    b.scope=config.projectId!;
    onAuthStateChanged(b.auth, async user=>{
      b.profileStop?.(); b.clear(); b.authUid=user?.uid ?? null; b.workspaceIds=[]; b.pending=[];
      b.loading=!!user; b.cloudError=''; b.bump(false);
      if(!user || !user.emailVerified) { b.loading=false; b.bump(false); return; }
      const uid=user.uid;
      try { b.pending=(await get<PendingSend[]>(`${b.scope}:${uid}`,b.liveStore)) ?? []; }
      catch { b.cloudError='This browser cannot save recovery requests. Enable browser storage before making changes.'; }
      if(b.authUid!==uid) return;
      b.profileStop=onSnapshot(doc(b.firestore!,'users',uid), snapshot=>{
        if(b.authUid!==uid)return;
        b.workspaceIds=snapshot.data()?.workspaces ?? [];
        if(!b.activeWorkspace || !b.workspaceIds.includes(b.activeWorkspace)) void b.chooseWorkspace(b.workspaceIds[0] ?? '');
        else b.bump(false);
      },()=>b.fail('Could not load your account. Check your connection and try signing in again.'));
    });
    const online=()=>{b.network=navigator.onLine?'online':'offline';b.bump(false);};
    window.addEventListener('online',online);window.addEventListener('offline',online);online();
    return b;
  }
  private clear() {
    this.generation++; this.unsubscribe.forEach(f=>f());this.unsubscribe=[];
    for(const url of this.photoUrls.values()) URL.revokeObjectURL(url);
    this.photoUrls.clear(); this.db=emptyDb(); this.engine=new Engine(this.db);this.activeWorkspace=null;
  }
  private fail(message:string) { this.clear();this.cloudError=message;this.loading=false;this.bump(false); }
  override async logout() { this.profileStop?.();this.profileStop=null;this.clear();this.authUid=null;this.pending=[];this.workspaceIds=[];this.bump(false);if(this.auth) await signOut(this.auth); }
  override async chooseWorkspace(ws:string) {
    this.clear();this.cloudError='';
    if(!ws || !this.authUid || !this.firestore) {this.loading=false;this.bump(false);return;}
    this.activeWorkspace=ws;this.loading=true;this.bump(false);
    const gen=this.generation;
    try {
      const membership=await getDoc(doc(this.firestore,'workspaces',ws,'members',this.authUid));
      if(gen!==this.generation) return;
      if(!membership.data()?.active) {this.fail('Your access to this warehouse was removed.');return;}
      const manager=['OWNER','SUPERVISOR'].includes(membership.data()?.role);
      const names:string[]=[...collections,...(manager?['audit','imports']:[])];
      const data=new Map<string,Record<string,unknown>[]>();
      const update=()=>{ if(gen!==this.generation || data.size<names.length+1)return;this.rebuild(ws,data);this.loading=false;this.cloudError='';this.lastSync=new Date().toISOString();this.bump(false); };
      const error=()=>{if(gen===this.generation)this.fail('Your connection or warehouse access changed. Sign in again to reload.');};
      this.unsubscribe.push(onSnapshot(doc(this.firestore,'workspaces',ws),snap=>{data.set('workspaces',[snap.data()!]);update();},error));
      for(const name of names) this.unsubscribe.push(onSnapshot(collection(this.firestore,'workspaces',ws,name),snap=>{
        const values=snap.docs.map(d=>d.data());
        if(name==='members') {
          const me=values.find(m=>m.user_id===this.authUid);
          if(!me?.active){error();return;}
          if(['OWNER','SUPERVISOR'].includes(me.role)!==manager){void this.chooseWorkspace(ws);return;}
        }
        data.set(name,values);update();
      },error));
    } catch { if(gen===this.generation)this.fail('Could not load your warehouse. Check your connection and try again.'); }
  }
  private rebuild(ws:string,data:Map<string,Record<string,unknown>[]>) {
    const db=emptyDb();
    for(const [table,values] of data) for(const raw of values as any[]) {
      const v=structuredClone(raw);
      if(table==='members'){db.memberships.push({workspace_id:ws,user_id:v.user_id,role:v.role,active:v.active});db.users[v.user_id]=v.user;}
      else if(table==='events')(db.events[v.pallet_id]??=[]).push(v);
      else if(table==='audit'||table==='lineage')db[table].push(v);
      else (db[table as keyof Db] as Record<string,unknown>)[v.id ?? v.token]=v;
    }
    for(const list of Object.values(db.events))list.sort((a,b)=>a.revision-b.revision);
    this.db=db;this.engine=new Engine(db);
    for(const a of Object.values(db.attachments)) {
      if(a.state!=='ready')continue;
      const path=a.data_url;if(!path.startsWith('storage://'))continue;
      const loading=this.photoUrls.has(path);
      const known=this.photoUrls.get(path);
      a.data_url=known || '';a.thumb_url=known || '';
      if(!loading && this.storage){const gen=this.generation;this.photoUrls.set(path,'');void getBlob(ref(this.storage,path.slice(10))).then(blob=>{
        if(gen!==this.generation)return;const url=URL.createObjectURL(blob);this.photoUrls.set(path,url);
        const current=this.db.attachments[a.id];if(current){current.data_url=url;current.thumb_url=url;this.bump(false);}
      }).catch(()=>{this.photoUrls.delete(path);});}
    }
  }
  override async send(actorId:string,input:CommandEnvelope):Promise<Outcome> {
    if(!this.functions || !this.auth?.currentUser || actorId!==this.auth.currentUser.uid) return {status:'offline',message:'Sign in again before saving.'};
    if(!navigator.onLine) return {status:'offline',message:'Reconnect before making changes. Nothing has been saved.'};
    let cmd=JSON.parse(JSON.stringify(input)) as CommandEnvelope;
    const previous=this.pending.find(p=>p.command.command_id===cmd.command_id && p.actor_id===actorId);
    if(previous) cmd=previous.command;
    try {
      if(cmd.kind==='add_photo' && String(cmd.payload.data_url).startsWith('data:')) {
        const ext=String(cmd.payload.media_type).split('/')[1];
        const path=`workspaces/${cmd.workspace_id}/photos/${actorId}/${cmd.command_id}.${ext}`;
        const upload=await uploadString(ref(this.storage!,path),String(cmd.payload.data_url),'data_url',{contentType:String(cmd.payload.media_type),customMetadata:{uploadedBy:actorId}});
        cmd.payload={...cmd.payload,bytes:upload.metadata.size,data_url:`storage://${path}`,thumb_url:`storage://${path}`};
      }
      if(this.authUid!==actorId)return {status:'offline',message:'Your account changed. Sign in before saving.'};
      this.pending=[...this.pending.filter(p=>p.command.command_id!==cmd.command_id),{actor_id:actorId,command:cmd,sent_at:new Date().toISOString()}];
      await set(`${this.scope}:${actorId}`,this.pending,this.liveStore);
    } catch {return {status:'offline',message:'Could not prepare this change safely. Check your connection and browser storage, then try again.'};}
    this.bump(false);
    try {
      const response=await httpsCallable<CommandEnvelope,CommandResult>(this.functions,'command')(cmd);
      if(this.authUid!==actorId)return {status:'result',result:response.data};
      this.pending=this.pending.filter(p=>p.command.command_id!==cmd.command_id);
      await set(`${this.scope}:${actorId}`,this.pending,this.liveStore).catch(()=>{});
      // The accepted result is authoritative immediately; collection listeners fill in related records.
      if(response.data.ok && response.data.current_state && this.authUid===actorId && this.activeWorkspace===cmd.workspace_id) this.db.pallets[response.data.current_state.id]=response.data.current_state;
      this.bump(false);return {status:'result',result:response.data};
    } catch(err) {
      if(this.authUid!==actorId)return {status:'unknown',command_id:cmd.command_id,message:'Your account changed. Sign in to the original account to check this request.'};
      const code=(err as {code?:string}).code;
      if(['functions/permission-denied','functions/unauthenticated','functions/invalid-argument','functions/failed-precondition','functions/resource-exhausted'].includes(code || '')){
        await this.discardPending(cmd.command_id);
        return {status:'result',result:{ok:false,command_id:cmd.command_id,kind:cmd.kind,code:code==='functions/permission-denied'?'FORBIDDEN':'INVALID_INPUT',message:cloudMessage(err),correlation_id:cmd.command_id}};
      }
      return {status:'unknown',command_id:cmd.command_id,message:'The result could not be confirmed. Check this request before trying the action again.'};
    }
  }
  override async recover(actorId:string,_ws:string,id:string):Promise<Outcome>{const p=this.pending.find(p=>p.actor_id===actorId&&p.command.command_id===id);return p?this.send(actorId,p.command):{status:'unknown',command_id:id,message:'This device no longer has the request. Check pallet history before repeating it.'};}
  override async discardPending(id:string){this.pending=this.pending.filter(p=>p.command.command_id!==id);if(this.authUid)await set(`${this.scope}:${this.authUid}`,this.pending,this.liveStore).catch(()=>{});this.bump(false);}
  override async queueOffline():Promise<Outcome>{return {status:'offline',message:'Reconnect before making changes. Offline saving is not enabled for live warehouses.'};}
  override setNetwork() {} // Browser connectivity controls live status.
  override setFaults() {}
  override async reset():Promise<void>{throw new Error('Sample-data reset is disabled for live warehouses.');}
  override async seed():Promise<void>{throw new Error('Sample data cannot be added to a live warehouse.');}
  override async importSnapshot(){return {ok:false as const,problems:['Local backups cannot replace a live warehouse. Use the CSV import.']};}
  override async reload(){if(this.activeWorkspace)await this.chooseWorkspace(this.activeWorkspace);}
}
export function cloudMessage(err:unknown):string {
  const code=(err as {code?:string}).code || '';
  if(code.includes('invalid-credential') || code.includes('wrong-password') || code.includes('user-not-found'))return 'Email or password is incorrect.';
  if(code.includes('email-already-in-use'))return 'This email already has an account. Sign in or reset the password.';
  if(code.includes('too-many-requests'))return 'Too many attempts. Wait a little before trying again.';
  if(code.includes('weak-password'))return 'Use a stronger password with at least 8 characters.';
  if(code.includes('network-request-failed'))return 'Could not connect. Check your internet connection.';
  return err instanceof Error ? err.message.replace(/^Firebase:\s*/,'').replace(/\s*\(auth\/[^)]+\)\.?$/,'') : 'Something went wrong. Please try again.';
}
