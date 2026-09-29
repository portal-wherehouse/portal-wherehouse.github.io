import { useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { useApp } from '../../app/state';
import { FirebaseBackend, cloudMessage } from '../../data/firebase';
import { ROLE_LABEL } from '../../ui/ui';
import type { Role } from '../../domain/types';

export function AuthorizedEmails() {
 const {backend,workspaceId,role,toast}=useApp();const b=backend as FirebaseBackend;
 const [name,setName]=useState('');const [email,setEmail]=useState('');const [access,setAccess]=useState<Role>('OPERATOR');const [busy,setBusy]=useState(false);const [error,setError]=useState('');
 const run=async(task:()=>Promise<void>)=>{setBusy(true);setError('');try{await task();}catch(e){setError(cloudMessage(e));}finally{setBusy(false);}};
 return <section className="panel stack"><div><h2 className="panel-title">Authorize an email</h2><p className="muted">Add your crew before they sign up. They’ll verify their email and enter this warehouse with their own account.</p></div>
 <form className="access-form" onSubmit={e=>{e.preventDefault();void run(async()=>{const result=await httpsCallable(b.functions!,'authorizeEmail')({workspaceId,name,email,role:access});toast((result.data as {status:string}).status==='added'?'Teammate added.':'Email authorized. Share the sign-in link with this person.');setName('');setEmail('');});}}>
 <label>Name<input className="input" required maxLength={120} value={name} onChange={e=>setName(e.target.value)} /></label>
 <label>Email<input className="input" required type="email" maxLength={200} value={email} onChange={e=>setEmail(e.target.value)} /></label>
 <label>Role<select className="select" value={access} onChange={e=>setAccess(e.target.value as Role)}>{(['OPERATOR','SUPERVISOR','VIEWER',...(role==='OWNER'?['OWNER']:[])] as Role[]).map(r=><option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select></label>
 <button className="btn primary" disabled={busy}>{busy?'Saving…':'Authorize email'}</button></form>
 <p className="muted">No email is sent automatically. Customer sign-in: <a href={`${location.origin}${location.pathname}#signin`}>{location.origin}{location.pathname}#signin</a></p>
 {error&&<p role="alert">{error}</p>}
 {!!b.invitations.length&&<><h3 className="panel-title">Waiting to join</h3>{b.invitations.map(i=><div className="row" key={i.email}><span className="grow">{i.name} · {i.email} · {ROLE_LABEL[i.role as Role]}</span><button className="btn small" disabled={busy || (i.role==='OWNER'&&role!=='OWNER')} onClick={()=>void run(async()=>{await httpsCallable(b.functions!,'cancelAuthorization')({workspaceId,email:i.email});toast('Authorization removed.');})}>Remove authorization</button></div>)}</>}
 </section>;
}
