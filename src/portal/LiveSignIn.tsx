import { useState, type FormEvent } from 'react';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail, sendEmailVerification, updateProfile, reload } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { useApp } from '../app/state';
import { FirebaseBackend, cloudMessage } from '../data/firebase';
import { BRAND } from '../brand';

export function LiveSignIn() {
  const {backend,go}=useApp();const b=backend as FirebaseBackend;
  const [mode,setMode]=useState<'signin'|'register'|'reset'>('signin');
  const [email,setEmail]=useState('');const [password,setPassword]=useState('');const [name,setName]=useState('');
  const [warehouse,setWarehouse]=useState('');const [busy,setBusy]=useState(false);const [message,setMessage]=useState('');const [error,setError]=useState('');
  const run=async(task:()=>Promise<void>)=>{setBusy(true);setError('');setMessage('');try{await task();}catch(e){setError(cloudMessage(e));}finally{setBusy(false);}};
  const submit=(e:FormEvent)=>{e.preventDefault();void run(async()=>{
    if(mode==='reset'){await sendPasswordResetEmail(b.auth!,email.trim());setMessage('If this email has an account, a reset link has been sent.');return;}
    if(mode==='register') {const c=await createUserWithEmailAndPassword(b.auth!,email.trim(),password);await updateProfile(c.user,{displayName:name.trim()});await sendEmailVerification(c.user);setMessage('Check your email for the verification link.');}
    else {await signInWithEmailAndPassword(b.auth!,email.trim(),password);go('find');}
  });};
  const user=b.auth?.currentUser;
  return <main className="auth-shell page-enter"><button className="btn ghost" onClick={()=>go('home')}>← Wherehouse</button><div className="panel stack auth-card">
    <h1>{!b.configured?'Let’s get your warehouse set up.':b.loading?'Opening your warehouse…':user?'Your warehouse':mode==='register'?'Create your account':mode==='reset'?'Reset your password':'Sign in'}</h1>
    {!b.configured?<><p>Live accounts need the final connection to be enabled. Contact us to arrange setup.</p><a className="btn primary" href={`mailto:${BRAND.supportEmail}`}>Contact setup & support</a><a href="?demo=1#signin">Try a separate sample warehouse</a></>:b.loading?<div role="status" className="cloud-loading">Loading your shared records…</div>:user?<>
      {!user.emailVerified?<><p>Open the verification email, then come back here.</p><button className="btn primary" disabled={busy} onClick={()=>void run(async()=>{await reload(user);await user.getIdToken(true);if(!user.emailVerified){setMessage('The email has not been verified yet.');return;}window.location.reload();})}>I’ve verified my email</button><button className="btn" disabled={busy} onClick={()=>void run(async()=>{await sendEmailVerification(user);setMessage('Verification email sent.');})}>Resend email</button></>:b.workspaceIds.length?<><p>{b.cloudError || 'Your account is ready.'}</p>{b.workspaceIds.map(id=><button className="btn primary" key={id} disabled={busy} onClick={()=>void run(async()=>{await b.chooseWorkspace(id);go('find');})}>Open warehouse</button>)}</>:<>
        <p>Joining a crew? Ask your manager to add <strong>{user.email}</strong> in People. This page will update when they do.</p><details><summary>I’m setting up a new warehouse</summary><form className="stack" onSubmit={e=>{e.preventDefault();void run(async()=>{await httpsCallable(b.functions!,'createWarehouse')({name:warehouse,timezone:Intl.DateTimeFormat().resolvedOptions().timeZone});go('locations');});}}><label>Warehouse name<input required minLength={2} maxLength={100} value={warehouse} onChange={e=>setWarehouse(e.target.value)} /></label><button className="btn primary" disabled={busy}>Create warehouse</button></form></details>
      </>}
      <button className="btn ghost" disabled={busy} onClick={()=>void run(()=>b.logout())}>Sign out</button>
    </>:<><form className="stack" onSubmit={submit}>{mode==='register'&&<label>Your name<input required maxLength={100} autoComplete="name" value={name} onChange={e=>setName(e.target.value)} /></label>}<label>Email<input required type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} /></label>{mode!=='reset'&&<label>Password<input required type="password" minLength={mode==='register'?8:1} autoComplete={mode==='register'?'new-password':'current-password'} value={password} onChange={e=>setPassword(e.target.value)} /></label>}<button className="btn primary big" disabled={busy}>{busy?'Please wait…':mode==='register'?'Create account':mode==='reset'?'Send reset link':'Sign in'}</button></form><div className="row"><button className="btn ghost" onClick={()=>setMode(mode==='signin'?'register':'signin')}>{mode==='signin'?'Create account':'Back to sign in'}</button>{mode==='signin'&&<button className="btn ghost" onClick={()=>setMode('reset')}>Forgot password?</button>}</div></>}
    {(error||b.cloudError)&&<p role="alert" className="auth-error">{error||b.cloudError}</p>}{message&&<p role="status">{message}</p>}
  </div></main>;
}
