import { initializeAppCheck, getToken as getAppCheckToken, setTokenAutoRefreshEnabled, ReCaptchaEnterpriseProvider } from 'firebase/app-check';
import { palletQuery, PAGE_SIZE, type LiveFilter } from './liveQueries';
import { normalizeCode, parsePalletCode, parseLabelPayload } from '../domain/codes';
import { initializeApp, type FirebaseOptions } from 'firebase/app';
import { getAuth, onAuthStateChanged, signOut, connectAuthEmulator, type Auth } from 'firebase/auth';
import { collection, doc, getDoc, getFirestore, onSnapshot, connectFirestoreEmulator, type Firestore, type Unsubscribe, getDocs, query, where, orderBy, limit, startAfter, documentId, type Query, type QueryDocumentSnapshot } from 'firebase/firestore';
import { getFunctions, httpsCallable, connectFunctionsEmulator, type Functions } from 'firebase/functions';
import { getStorage, ref, uploadString, getBlob, connectStorageEmulator, type FirebaseStorage } from 'firebase/storage';
import { createStore, get, set } from 'idb-keyval';
import { Backend, type Outcome, type PendingSend } from './backend';
import { Outbox } from './outbox';
import { Engine, emptyDb } from '../demo/engine';
import type { CommandEnvelope, CommandResult } from '../domain/types';

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
  prepareSignup: () => Promise<void> = async () => { throw new Error('Account registration is not configured.'); };
  workspaceIds: string[]=[];
  invitations: {email:string;name:string;role:string}[]=[];
  licenseBlocked=false;
  private expiryTimer: ReturnType<typeof setTimeout> | null=null;
  activeWorkspace: string | null=null;
  private unsubscribe: Unsubscribe[]=[];
  private profileStop: Unsubscribe | null=null;
  private generation=0;
  private photoUrls=new Map<string,string>();
  private photoPending=new Map<string,Promise<string>>();
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
    if(import.meta.env.DEV&&import.meta.env.VITE_FIREBASE_EMULATORS==='true'&&(config.projectId!=='demo-wherehouse'||config.storageBucket!=='demo-wherehouse.appspot.com'||import.meta.env.VITE_FIREBASE_APPCHECK_SITE_KEY))throw Error('Local testing requires demo-wherehouse, its emulator bucket and no live App Check key.');
    b.configured=true; b.loading=true;
    const app=initializeApp(config);
    const appCheckKey=import.meta.env.VITE_FIREBASE_APPCHECK_SITE_KEY;
    let appCheck:ReturnType<typeof initializeAppCheck>|null=null;
    b.auth=getAuth(app); b.firestore=getFirestore(app); b.functions=getFunctions(app,'us-east1'); b.storage=getStorage(app);
    if(import.meta.env.DEV && import.meta.env.VITE_FIREBASE_EMULATORS==='true') {
      connectAuthEmulator(b.auth,'http://127.0.0.1:9099',{disableWarnings:true});
      connectFirestoreEmulator(b.firestore,'127.0.0.1',8080);
      connectFunctionsEmulator(b.functions,'127.0.0.1',5001);
      connectStorageEmulator(b.storage,'127.0.0.1',9199);
    }
    b.prepareSignup=async()=>{
      if(import.meta.env.DEV && import.meta.env.VITE_FIREBASE_EMULATORS==='true') return;
      if(!appCheckKey)throw new Error('Account verification is not configured. Contact support.');
      if(!appCheck)appCheck=initializeAppCheck(app,{provider:new ReCaptchaEnterpriseProvider(appCheckKey),isTokenAutoRefreshEnabled:true});
      try { await getAppCheckToken(appCheck); } catch { throw new Error('Could not verify this browser. Refresh the page and try again.'); }
    };
    b.scope=config.projectId!;
    onAuthStateChanged(b.auth, async user=>{
      b.profileStop?.(); b.clear(); b.authUid=user?.uid ?? null; b.workspaceIds=[]; b.pending=[];
      b.loading=!!user; b.cloudError=''; b.bump(false);
      if(!user || !user.emailVerified) {if(appCheck)setTokenAutoRefreshEnabled(appCheck,false); b.loading=false; b.bump(false); return; }
      if(appCheckKey&&!appCheck)appCheck=initializeAppCheck(app,{provider:new ReCaptchaEnterpriseProvider(appCheckKey),isTokenAutoRefreshEnabled:true});else if(appCheck)setTokenAutoRefreshEnabled(appCheck,true);
      const uid=user.uid;
      try { b.pending=(await get<PendingSend[]>(`${b.scope}:${uid}`,b.liveStore)) ?? []; }
      catch { b.cloudError='This browser cannot save recovery requests. Enable browser storage before making changes.'; }
      if(b.authUid!==uid) return;
      try { await httpsCallable(b.functions!,'joinAuthorizedWarehouses')({}); } catch { b.cloudError='Could not check authorized warehouse access. Try Refresh access.'; }
      if(b.authUid!==uid)return;
      b.profileStop=onSnapshot(doc(b.firestore!,'users',uid), snapshot=>{b.metrics.reads++;
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
    if(this.expiryTimer)clearTimeout(this.expiryTimer);this.expiryTimer=null;this.invitations=[];
    this.viewGeneration++;this.viewKey='';this.viewStops.forEach(f=>f());this.viewStops=[];this.pages.clear();
    this.generation++; this.unsubscribe.forEach(f=>f());this.unsubscribe=[];
    for(const url of this.photoUrls.values()) URL.revokeObjectURL(url);
    this.photoUrls.clear();this.photoPending.clear(); this.db=emptyDb(); this.engine=new Engine(this.db);this.activeWorkspace=null;
  }
  private fail(message:string) { this.clear();this.cloudError=message;this.loading=false;this.bump(false); }
  override async logout() { this.profileStop?.();this.profileStop=null;this.clear();this.authUid=null;this.pending=[];this.workspaceIds=[];this.bump(false);if(this.auth) await signOut(this.auth); }
  override async chooseWorkspace(ws:string) {
    this.clear();this.cloudError='';this.licenseBlocked=false;
    if(!ws || !this.authUid || !this.firestore) {this.loading=false;this.bump(false);return;}
    this.activeWorkspace=ws;this.loading=true;this.bump(false);
    const gen=this.generation;
    try {
      const licenseRef=doc(this.firestore,'licenses',ws);
      const checkLicense=(data:any)=>{
        if(gen!==this.generation)return false;
        if(this.expiryTimer)clearTimeout(this.expiryTimer);
        const remaining=(data?.expires_at?.toMillis() || 0)-Date.now();
        if(!data?.active||remaining<=0){this.licenseBlocked=true;this.fail('This warehouse needs an active usage key. Contact the account owner.');return false;}
        this.expiryTimer=setTimeout(()=>checkLicense(data),Math.min(remaining,2147483647));
        return true;
      };
      const license=await getDoc(licenseRef);if(!checkLicense(license.data()))return;
      this.unsubscribe.push(onSnapshot(licenseRef,snap=>{this.metrics.reads++;checkLicense(snap.data());},()=>{if(gen===this.generation)this.fail('Could not verify warehouse access. Sign in again.');}));
      const membership=await getDoc(doc(this.firestore,'workspaces',ws,'members',this.authUid));
      if(gen!==this.generation) return;
      if(!membership.data()?.active) {this.fail('Your access to this warehouse was removed.');return;}
      const manager=['OWNER','SUPERVISOR'].includes(membership.data()?.role);
      const root=await getDoc(doc(this.firestore,'workspaces',ws));this.metrics.reads+=3;
      if(gen!==this.generation)return;this.ingest('workspaces',[root.data()]);this.ingest('members',[membership.data()]);
      this.unsubscribe.push(onSnapshot(doc(this.firestore,'workspaces',ws,'members',this.authUid),s=>{this.metrics.reads++;
        if(gen!==this.generation)return;if(!s.get('active')){this.fail('Your warehouse access was removed.');return;}
        this.ingest('members',[s.data()]);if(['OWNER','SUPERVISOR'].includes(s.get('role'))!==manager){void this.chooseWorkspace(ws);return;}this.bump(false);
      }));
      await Promise.all(['warehouses','members','jobs','locations'].map(table=>this.page('directory:'+table,table,query(this.col(table),orderBy(table==='jobs'||table==='locations'?'code':documentId()),limit(PAGE_SIZE)),true)));
      if(gen!==this.generation)return;this.loading=false;this.cloudError='';this.bump(false);
    } catch { if(gen===this.generation)this.fail('Could not load your warehouse. Check your connection and try again.'); }
  }
  summary:any=null;
  viewLoading=false;
  viewError='';
  viewKey='';
  private viewGeneration=0;
  private viewStops:Unsubscribe[]=[];
  private pages=new Map<string,{q:Query;cursor:QueryDocumentSnapshot|undefined;more:boolean;table:string}>();
  private viewRoute:{name:string;id?:string}={name:'find'};
  private metrics={reads:0,photoBytes:0};
  usage(){return {...this.metrics};}
  private ingest(table:string,values:any[]){
    for(const v of values){
      if(table==='invites')continue;
      if(table==='members'){const old=this.db.memberships.findIndex(m=>m.user_id===v.user_id);if(old>=0)this.db.memberships.splice(old,1);this.db.memberships.push(v);this.db.users[v.user_id]=v.user;}
      else if(table==='events'){const list=this.db.events[v.pallet_id]??=[];const at=list.findIndex(e=>e.id===v.id);if(at>=0)list[at]=v;else list.push(v);list.sort((a,b)=>a.revision-b.revision);}
      else if(table==='audit'||table==='lineage'){const list=this.db[table] as any[];const at=list.findIndex(x=>table==='lineage'?x.child_id===v.child_id:x.id===v.id);if(at>=0)list[at]=v;else list.push(v);if(table==='audit')list.sort((a,b)=>a.accepted_at.localeCompare(b.accepted_at));}
      else {const id=v.id??v.token;(this.db as any)[table][id]={...(this.db as any)[table][id],...v};}
    }
  }
  private async docs(q:Query){const snap=await getDocs(q);this.metrics.reads+=Math.max(1,snap.size);return snap;}
  private async one(table:string,id:string,refresh=false){
    if(!id||id.includes('/')||!this.firestore||!this.activeWorkspace)return;
    if(!refresh&&(this.db as any)[table]?.[id])return;
    const gen=this.generation,s=await getDoc(doc(this.firestore,'workspaces',this.activeWorkspace,table,id));this.metrics.reads++;
    if(gen===this.generation){if(s.exists())this.ingest(table,[s.data()]);else if((this.db as any)[table]&&!Array.isArray((this.db as any)[table]))delete (this.db as any)[table][id];}
  }
  private col(table:string){return collection(this.firestore!,'workspaces',this.activeWorkspace!,table);}
  private async hydrate(pallets:any[]){
    await Promise.all([...new Set(pallets.map(p=>p.job_id).filter(Boolean))].map(id=>this.one('jobs',id)));
    await Promise.all([...new Set(pallets.flatMap(p=>[p.current_location_id,p.last_confirmed_location_id]).filter(Boolean))].map(id=>this.one('locations',id)));
  }
  private async related(table:string,values:any[]){
    if(table==='pallets')await this.hydrate(values);
    if(table==='events'){
      await Promise.all([...new Set(values.map(e=>e.pallet_id))].map(id=>this.one('pallets',id)));
      await this.hydrate(values.map(e=>this.db.pallets[e.pallet_id]).filter(Boolean));
      await Promise.all([...new Set(values.map(e=>e.actor_id))].map(id=>this.db.users[id]?Promise.resolve():this.one('members',id,true)));
    }
  }
  async page(key:string,table:string,q:Query,listen=false){
    const gen=this.generation,viewGen=this.viewGeneration;
    const accept=async(s:any)=>{
      if(gen!==this.generation||(!key.startsWith('directory:')&&viewGen!==this.viewGeneration))return;
      const removed=typeof s.docChanges==='function'?s.docChanges().filter((c:any)=>c.type==='removed'):[];
      if(table==='pallets')await Promise.all(removed.map((c:any)=>this.one(table,c.doc.id,true)));
      const values=s.docs.map((d:any)=>d.data());this.ingest(table,values);
      if(table==='invites')this.invitations=values;
      await this.related(table,values);
      if(gen!==this.generation)return;
      // A live first-page refresh never rewinds a cursor the user has already advanced.
      if(!this.pages.has(key))this.pages.set(key,{q,cursor:s.docs.at(-1),more:s.size===PAGE_SIZE,table});
      this.lastSync=new Date().toISOString();this.bump(false);
    };
    if(listen){
      await new Promise<void>((resolve,reject)=>{
        let first=true;const stop=onSnapshot(q,s=>{this.metrics.reads+=Math.max(1,s.docChanges().length);void accept(s).then(()=>{if(first){first=false;resolve();}}).catch(reject);},e=>{if(first)reject(e);else{this.viewError=cloudMessage(e);this.bump(false);}});
        (key.startsWith('directory:')?this.unsubscribe:this.viewStops).push(stop);
      });
    }else await accept(await this.docs(q));
  }
  pageMore(key:string){return !!this.pages.get(key)?.more;}
  async more(key:string){
    const p=this.pages.get(key);if(!p?.more||!p.cursor)return;const gen=this.generation;
    const s=await this.docs(query(p.q,startAfter(p.cursor)));if(gen!==this.generation)return;
    const values=s.docs.map(d=>d.data());this.ingest(p.table,values);await this.related(p.table,values);p.cursor=s.docs.at(-1);p.more=s.size===PAGE_SIZE;if(key==='directory:jobs'||key==='directory:locations')await this.loadCounts(p.table as 'jobs'|'locations');this.bump(false);
  }
  directoryMore(){return ['jobs','locations'].filter(t=>this.pageMore('directory:'+t));}
  async refreshView(){this.viewKey='';await this.openView(this.viewRoute);}
  async openView(route:{name:string;id?:string}){
    if(!this.activeWorkspace||!this.firestore)return;
    const key=route.name+':'+(route.id||'');if(this.viewKey===key)return;
    this.viewKey=key;this.viewRoute=route;this.viewGeneration++;const gen=this.viewGeneration;
    this.viewStops.forEach(f=>f());this.viewStops=[];
    for(const key of this.pages.keys())if(!key.startsWith('directory:'))this.pages.delete(key);
    this.viewLoading=true;this.viewError='';this.bump(false);
    this.db.pallets={};this.db.events={};this.db.attachments={};this.db.labels={};this.db.lineage=[];this.db.audit=[];this.db.imports={};
    try{
      const name=route.name,id=route.id;
      if(name==='pallet'&&id){
        await this.one('pallets',id,true);const p=this.db.pallets[id];if(p)await this.hydrate([p]);
        if(gen!==this.viewGeneration)return;
        this.viewStops.push(onSnapshot(doc(this.col('pallets'),id),s=>{this.metrics.reads++;if(gen===this.viewGeneration&&s.exists()){this.ingest('pallets',[s.data()]);void this.hydrate([s.data()]).then(()=>this.bump(false));}}));
        await Promise.all([
          this.page('history','events',query(this.col('events'),where('pallet_id','==',id),orderBy('revision','desc'),limit(PAGE_SIZE)),true),
          this.page('photos','attachments',query(this.col('attachments'),where('pallet_id','==',id),where('state','==','ready'),limit(3)),true),
          this.loadLabels([id]),this.one('lineage',id),
          this.page('children','lineage',query(this.col('lineage'),where('parent_id','==',id),limit(PAGE_SIZE)))
        ]);
        for(const l of this.db.lineage)await Promise.all([this.one('pallets',l.parent_id),this.one('pallets',l.child_id)]);
      }
      else if(name==='people')await Promise.all([this.page('audit','audit',query(this.col('audit'),orderBy('accepted_at','desc'),orderBy(documentId(),'desc'),limit(PAGE_SIZE)),true),this.page('invites','invites',query(this.col('invites'),limit(PAGE_SIZE)),true)]);
      else if(name==='import')await this.page('imports','imports',query(this.col('imports'),orderBy('created_at','desc'),limit(PAGE_SIZE)));
      else if(name==='job'&&id){await this.one('jobs',id,true);await this.page('records','pallets',palletQuery(this.firestore,this.activeWorkspace,{job_id:id,include_archived:true}),true);}
      else if(name==='location'&&id){await this.one('locations',id,true);await this.page('records','pallets',palletQuery(this.firestore,this.activeWorkspace,{location_id:id,include_archived:true}),true);await this.loadLabels([id]);}
      else if(name==='move'&&id){await this.one('pallets',id,true);if(this.db.pallets[id])await this.hydrate([this.db.pallets[id]]);}

      if(['locations','map','overview'].includes(name))await this.loadCounts('locations');
      if(['jobs','job','overview'].includes(name))await this.loadCounts('jobs');
      if(name==='overview'){this.summary=(await httpsCallable(this.functions!,'getWarehouseSummary')({workspaceId:this.activeWorkspace})).data;await this.page('activity','events',query(this.col('events'),orderBy('accepted_at','desc'),orderBy(documentId(),'desc'),limit(PAGE_SIZE)),true);}
      if(name==='locations'||name==='labels')await this.loadLabels(Object.keys(this.db.locations));
    }catch(e){if(gen===this.viewGeneration)this.viewError=cloudMessage(e);}
    finally{if(gen===this.viewGeneration){this.viewLoading=false;this.bump(false);}}
  }
  private searchGeneration=0;
  async search(f:LiveFilter){
    const gen=++this.searchGeneration,viewGen=++this.viewGeneration;
    this.viewStops.forEach(s=>s());this.viewStops=[];this.pages.delete('search');this.db.pallets={};this.viewError='';this.viewLoading=true;this.bump(false);
    try{
      const text=normalizeCode(f.q||'');let jobs:string[]=[],locations:string[]=[];
      if(text){const [j,l]=await Promise.all([this.docs(query(this.col('jobs'),where('code','==',text),limit(1))),this.docs(query(this.col('locations'),where('code','==',text),limit(1)))]);this.ingest('jobs',j.docs.map(d=>d.data()));this.ingest('locations',l.docs.map(d=>d.data()));jobs=j.docs.map(d=>d.id);locations=l.docs.map(d=>d.id);}
      if(gen!==this.searchGeneration||viewGen!==this.viewGeneration)return;
      await this.page('search','pallets',palletQuery(this.firestore!,this.activeWorkspace!,f,jobs,locations),true);
    }catch(e){if(gen===this.searchGeneration)this.viewError=cloudMessage(e);}
    finally{if(gen===this.searchGeneration){this.viewLoading=false;this.bump(false);}}
  }
  async loadLabels(ids:string[]){
    for(let i=0;i<ids.length;i+=25){const s=await this.docs(query(this.col('labels'),where('target_id','in',ids.slice(i,i+25)),where('revoked_at','==',null),limit(100)));this.ingest('labels',s.docs.map(d=>d.data()));}this.bump(false);
  }
  async preloadScan(raw:string){
    if(!this.activeWorkspace||!this.firestore||raw.startsWith('CMD:'))return;
    const label=parseLabelPayload(raw);let id:string|undefined,kind:string|undefined;
    if(label){await this.one('labels',label.token,true);const l=this.db.labels[label.token];if(!l||l.revoked_at)return;id=l.target_id;kind=l.kind;}
    else {const code=parsePalletCode(raw);const table=code?'pallets':'locations';const s=await this.docs(query(this.col(table),where('code','==',code||normalizeCode(raw)),limit(1)));this.ingest(table,s.docs.map(d=>d.data()));id=s.docs[0]?.id;kind=code?'P':'L';}
    if(!id)return;
    await this.one(kind==='P'?'pallets':'locations',id,true);
    if(kind==='P'&&this.db.pallets[id])await this.hydrate([this.db.pallets[id]]);
    if(kind==='L'&&this.viewRoute.name==='station'){
      // An explicit rack count needs that rack's complete contents, fetched in bounded pages.
      await this.page('rack-scan','pallets',palletQuery(this.firestore,this.activeWorkspace,{location_id:id,include_archived:true}));while(this.pageMore('rack-scan'))await this.more('rack-scan');
    }this.bump(false);
  }
  async loadCounts(table:'jobs'|'locations'){
    const ids=Object.keys(this.db[table]);for(let i=0;i<ids.length;i+=50){const result=(await httpsCallable(this.functions!,'getDirectoryCounts')({workspaceId:this.activeWorkspace,table,ids:ids.slice(i,i+50)})).data as {values:Record<string,any>};for(const [id,counts]of Object.entries(result.values))if(this.db[table][id])Object.assign(this.db[table][id],counts);}this.bump(false);
  }
  async filteredList(key:string,filters:any[]){
    this.viewGeneration++;this.pages.delete(key);this.viewStops.forEach(s=>s());this.viewStops=[];this.db.pallets={};
    try{await this.page(key,'pallets',query(this.col('pallets'),...filters,orderBy('code'),limit(PAGE_SIZE)),true);}catch(e){this.viewError=cloudMessage(e);this.bump(false);}
  }
  async loadActivity(types:string[],actor:string){
    this.viewGeneration++;this.viewStops.forEach(s=>s());this.viewStops=[];this.pages.delete('activity');this.db.events={};
    try{await this.page('activity','events',query(this.col('events'),...(types.length?[where('type','in',types)]:[]),...(actor?[where('actor_id','==',actor)]:[]),orderBy('accepted_at','desc'),orderBy(documentId(),'desc'),limit(PAGE_SIZE)),true);}catch(e){this.viewError=cloudMessage(e);this.bump(false);}
  }
  async prepareExport(progress:(rows:number)=>void){
    const gen=this.generation;let n=0;
    for(const table of ['jobs','locations','members','pallets','events']){
      let cursor:QueryDocumentSnapshot|undefined;
      do{const q=query(this.col(table),orderBy(documentId()),...(cursor?[startAfter(cursor)]:[]),limit(100));const s=await this.docs(q);if(gen!==this.generation)throw Error('Account changed.');this.ingest(table,s.docs.map(d=>d.data()));n+=s.size;progress(n);cursor=s.size===100?s.docs.at(-1):undefined;}while(cursor);
    }
    this.bump(false);
  }
  async loadRack(id:string){this.viewGeneration++;this.viewStops.forEach(stop=>stop());this.viewStops=[];this.pages.delete('rack');this.db.pallets={};await this.page('rack','pallets',palletQuery(this.firestore!,this.activeWorkspace!,{location_id:id,include_archived:true}),true);}
  async photoUrl(id:string,thumbnail=true):Promise<string>{
    const a=this.db.attachments[id];if(!a||!this.storage)return '';const path=thumbnail?a.thumb_url:a.data_url;
    if(!path.startsWith('storage://'))return path;
    if(this.photoUrls.has(path))return this.photoUrls.get(path)!;
    if(this.photoPending.has(path))return this.photoPending.get(path)!;
    const gen=this.generation;
    const pending=getBlob(ref(this.storage,path.slice(10)),thumbnail&&a.thumb_url!==a.data_url?128*1024:5*1024*1024).then(blob=>{
      this.metrics.photoBytes+=blob.size;if(gen!==this.generation)return '';
      const url=URL.createObjectURL(blob);this.photoUrls.set(path,url);
      while(this.photoUrls.size>40){const first=this.photoUrls.keys().next().value!;URL.revokeObjectURL(this.photoUrls.get(first)!);this.photoUrls.delete(first);}
      return url;
    }).finally(()=>this.photoPending.delete(path));this.photoPending.set(path,pending);return pending;
  }
  override async send(actorId:string,input:CommandEnvelope):Promise<Outcome> {
    if(!this.functions || !this.auth?.currentUser || actorId!==this.auth.currentUser.uid) return {status:'offline',message:'Sign in again before saving.'};
    if(!navigator.onLine) return {status:'offline',message:'Reconnect before making changes. Nothing has been saved.'};
    let cmd=JSON.parse(JSON.stringify(input)) as CommandEnvelope;
    const previous=this.pending.find(p=>p.command.command_id===cmd.command_id && p.actor_id===actorId);
    if(previous) cmd=previous.command;
    try {
      if(cmd.kind==='add_photo' && String(cmd.payload.data_url).startsWith('data:')) {
        const bytesOf=(url:string)=>Math.floor((url.split(',')[1]||'').length*3/4)-(url.endsWith('==')?2:url.endsWith('=')?1:0);
        const reservation=(await httpsCallable(this.functions,'reservePhotoUpload')({workspaceId:cmd.workspace_id,uploadId:cmd.command_id,bytes:bytesOf(String(cmd.payload.data_url)),thumbBytes:bytesOf(String(cmd.payload.thumb_url))})).data as {full:string;thumb:string};
        const metadata={contentType:'image/jpeg',customMetadata:{uploadedBy:actorId}};
        const [full]=await Promise.all([uploadString(ref(this.storage!,reservation.full),String(cmd.payload.data_url),'data_url',metadata),uploadString(ref(this.storage!,reservation.thumb),String(cmd.payload.thumb_url),'data_url',metadata)]);
        cmd.payload={...cmd.payload,bytes:full.metadata.size,data_url:`storage://${reservation.full}`,thumb_url:`storage://${reservation.thumb}`};
      }
      if(this.authUid!==actorId)return {status:'offline',message:'Your account changed. Sign in before saving.'};
      this.pending=[...this.pending.filter(p=>p.command.command_id!==cmd.command_id),{actor_id:actorId,command:cmd,sent_at:new Date().toISOString()}];
      await set(`${this.scope}:${actorId}`,this.pending,this.liveStore);
    } catch(err) {return {status:'offline',message:cloudMessage(err)};}
    this.bump(false);
    try {
      const response=await httpsCallable<CommandEnvelope,CommandResult>(this.functions,'command')(cmd);
      if(this.authUid!==actorId)return {status:'result',result:response.data};
      this.pending=this.pending.filter(p=>p.command.command_id!==cmd.command_id);
      await set(`${this.scope}:${actorId}`,this.pending,this.liveStore).catch(()=>{});
      // The accepted result is authoritative immediately; collection listeners fill in related records.
      if(response.data.ok && response.data.current_state && this.authUid===actorId && this.activeWorkspace===cmd.workspace_id) this.db.pallets[response.data.current_state.id]=response.data.current_state;
      if(response.data.ok){const id=response.data.target_id;if(['create_job','close_job','reopen_job'].includes(cmd.kind)&&id)await this.one('jobs',id,true);if(['create_location','rename_location','deactivate_location','reactivate_location'].includes(cmd.kind)&&id)await this.one('locations',id,true);if(response.data.current_state)await this.hydrate([response.data.current_state]);}
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
  override async reload(){const ws=this.activeWorkspace || this.workspaceIds[0];if(ws)await this.chooseWorkspace(ws);}
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
