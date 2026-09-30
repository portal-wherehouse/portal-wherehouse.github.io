import { WarehouseLoading } from '../portal/WarehouseLoading';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useApp } from '../app/state';
import { FirebaseBackend } from './firebase';

export function LiveView({children}:{children:ReactNode}){
 const {backend,route,workspaceId}=useApp();const [ready,setReady]=useState('');const [busy,setBusy]=useState(false);
 const key=route.name+':'+(route.id||'')+':'+workspaceId;
 useEffect(()=>{let alive=true;if(backend instanceof FirebaseBackend)void backend.openView(route).then(()=>{if(alive)setReady(key);});return()=>{alive=false;};},[backend,key]);
 if(!(backend instanceof FirebaseBackend))return <>{children}</>;
 if(ready!==key||(backend.viewLoading&&route.name!=='find'))return <WarehouseLoading name={workspaceId ? backend.db.workspaces[workspaceId]?.name : undefined} />;
 const moreKeys=['records','history','activity','audit','imports','rack','children'].filter(k=>backend.pageMore(k));
 const run=async(fn:()=>Promise<void>)=>{setBusy(true);try{await fn();}catch(e){backend.viewError=(e as Error).message;}finally{setBusy(false);}};
 return <>{backend.viewError&&<p role="alert">{backend.viewError} <button className="btn small" onClick={()=>void run(()=>backend.refreshView())}>Retry</button></p>}{children}
 <div className="row" style={{marginTop:20}}>
 {['map','locations','jobs','job','overview'].includes(route.name)&&<span className="muted" style={{fontSize:12}}>Counts may lag recent changes. <button className="btn ghost small" onClick={()=>void run(()=>backend.refreshView())}>Refresh</button></span>}
 {moreKeys.map(k=><button className="btn" disabled={busy} key={k} onClick={()=>void run(()=>backend.more(k))}>{busy?'Loading…':k==='history'||k==='activity'?'Show older changes':k==='audit'?'More team history':'Show more records'}</button>)}
 {backend.directoryMore().map(t=><button className="btn small" disabled={busy} key={t} onClick={()=>void run(()=>backend.more('directory:'+t))}>More {t}</button>)}
 </div></>;
}

export function PhotoImage({id,thumbnail=true,alt}:{id:string;thumbnail?:boolean;alt:string}){
 const {backend}=useApp();const [url,setUrl]=useState('');const [error,setError]=useState('');const element=useRef<HTMLSpanElement>(null);
 const attachment=backend.db.attachments[id];const path=thumbnail?attachment?.thumb_url:attachment?.data_url;
 useEffect(()=>{
  let active=true,started=false;setUrl('');setError('');
  const load=()=>{if(started)return;started=true;if(backend instanceof FirebaseBackend)void backend.photoUrl(id,thumbnail).then(s=>{if(active)setUrl(s);}).catch(()=>{if(active)setError('Photo could not load. Reopen it to retry.');});else setUrl(path||'');};
  if(!thumbnail)load();const observer=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting))load();});if(element.current)observer.observe(element.current);
  return()=>{active=false;observer.disconnect();};
 },[backend,id,path,thumbnail]);
 return <span ref={element} style={{display:'block',minHeight:thumbnail?60:120}}>{url?<img src={url} alt={alt}/>:<span role="status">{error||'Loading photo…'}</span>}</span>;
}
