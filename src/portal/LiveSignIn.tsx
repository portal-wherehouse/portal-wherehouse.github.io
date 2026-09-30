import { WarehouseLoading } from './WarehouseLoading';
import { SignupCheckbox } from './SignupCheckbox';
import { useState, type FormEvent } from 'react';
import { signInWithEmailAndPassword, sendPasswordResetEmail, sendEmailVerification, reload, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { loadSavedSurvey } from '../domain/survey';
import { TRIAL_DAYS } from '../domain/license';
import { httpsCallable } from 'firebase/functions';
import { useApp } from '../app/state';
import { FirebaseBackend, cloudMessage } from '../data/firebase';
import { BRAND } from '../brand';

export function LiveSignIn({ onActivated }: { onActivated?: (name: string) => void }) {
  const {backend,go}=useApp();const b=backend as FirebaseBackend;
  const [mode,setMode]=useState<'signin'|'register'|'reset'>(()=>loadSavedSurvey()?'register':'signin');
  const [email,setEmail]=useState('');const [password,setPassword]=useState('');const [name,setName]=useState('');
  const [checkboxToken,setCheckboxToken]=useState('');const [checkboxReset,setCheckboxReset]=useState(0);
  const [warehouse,setWarehouse]=useState('');const [usageKey,setUsageKey]=useState('');const [busy,setBusy]=useState(false);const [message,setMessage]=useState('');const [error,setError]=useState('');
  const run=async(task:()=>Promise<void>)=>{setBusy(true);setError('');setMessage('');try{await task();}catch(e){setError(cloudMessage(e));}finally{setBusy(false);}};
  const submit=(e:FormEvent)=>{e.preventDefault();void run(async()=>{
    if(mode==='reset'){await sendPasswordResetEmail(b.auth!,email.trim());setMessage('If this email has an account, a reset link has been sent.');return;}
    if(mode==='register') {
      if(!checkboxToken)throw new Error('Complete the checkbox before creating your account.');
      try {
        await b.prepareSignup();
        await httpsCallable(b.functions!,'createAccount')({email:email.trim(),password,name:name.trim(),checkboxToken});
        setCheckboxToken('');
        const c=await signInWithEmailAndPassword(b.auth!,email.trim(),password);
        await sendEmailVerification(c.user);setMessage('Check your email for the verification link.');
      } finally {setCheckboxToken('');setCheckboxReset(value=>value+1);}
    }
    else {await signInWithEmailAndPassword(b.auth!,email.trim(),password);go('overview');}
  });};
  const user=b.auth?.currentUser;
  return <main className="auth-shell page-enter"><button className="btn ghost" onClick={()=>go('home')}>← Wherehouse</button><div className="panel stack auth-card">
    <h1>{!b.configured?'Let’s get your warehouse set up.':b.loading?'Opening your warehouse…':user?'Your warehouse':mode==='register'?(loadSavedSurvey()?'Create your account to start your free trial':'Create your account'):mode==='reset'?'Reset your password':'Sign in'}</h1>
    {!b.configured?<><p>Live accounts need the final connection to be enabled. Contact us to arrange setup.</p><a className="btn primary" href={`mailto:${BRAND.supportEmail}`}>Contact setup & support</a><a href="?demo=1#signin">Try a separate sample warehouse</a></>:b.loading?<WarehouseLoading name={b.activeWorkspace ? b.db.workspaces[b.activeWorkspace]?.name : undefined} />:user?<>
      {!user.emailVerified?<><p>Open the verification email, then come back here.</p><button className="btn primary" disabled={busy} onClick={()=>void run(async()=>{await reload(user);await user.getIdToken(true);if(!user.emailVerified){setMessage('The email has not been verified yet.');return;}window.location.reload();})}>I’ve verified my email</button><button className="btn" disabled={busy} onClick={()=>void run(async()=>{await sendEmailVerification(user);setMessage('Verification email sent.');})}>Resend email</button></>:b.workspaceIds.length && !b.licenseBlocked && !b.readOnly?<><p>{b.cloudError || 'Your account is ready.'}</p>{b.workspaceIds.filter(id=>id===(b.activeWorkspace||b.workspaceIds[0])).map(id=><button className="btn primary" key={id} disabled={busy} onClick={()=>void run(async()=>{await b.chooseWorkspace(id);go('overview');})}>Open warehouse</button>)}</>:<>
        {!b.licenseBlocked&&!b.readOnly&&<form className="stack auth-trial" data-testid="trial-form" onSubmit={e=>{e.preventDefault();void run(async()=>{const made=await httpsCallable(b.functions!,'createWarehouse')({name:warehouse.trim()||'My warehouse',trial:true,timezone:Intl.DateTimeFormat().resolvedOptions().timeZone});onActivated?.(warehouse.trim()||'My warehouse');await b.chooseWorkspace((made.data as {workspaceId:string}).workspaceId);go('overview');});}}><h2>Start your free {TRIAL_DAYS}-day trial</h2><p className="muted">No card needed. Name your warehouse and a setup checklist walks you through the rest.</p><label>Name your warehouse<input required minLength={2} maxLength={100} value={warehouse} onChange={e=>setWarehouse(e.target.value)} placeholder="Main warehouse" /></label><button className="btn primary big" disabled={busy}>Start my free trial</button></form>}
        <p>Joining a crew? Ask your manager to add <strong>{user.email}</strong> in the Manager dashboard. Sign in with that exact email.</p><button className="btn" disabled={busy} onClick={()=>void run(async()=>{await httpsCallable(b.functions!,'joinAuthorizedWarehouses')({});await b.reload();setMessage('Access checked. Your authorized warehouse will appear here.');})}>Refresh access</button><details open={b.licenseBlocked||b.readOnly}><summary>Activate my warehouse with a usage key</summary><form className="stack" onSubmit={e=>{e.preventDefault();void run(async()=>{const activated=await httpsCallable(b.functions!,'createWarehouse')({name:warehouse || 'My warehouse',usageKey,workspaceId:b.activeWorkspace || undefined,timezone:Intl.DateTimeFormat().resolvedOptions().timeZone});onActivated?.(warehouse.trim() || 'My warehouse');await b.chooseWorkspace((activated.data as {workspaceId:string}).workspaceId);go('overview');});}}><label>Warehouse name<input required minLength={2} maxLength={100} value={warehouse} onChange={e=>setWarehouse(e.target.value)} /></label><label>Usage key<input required autoComplete="off" type="password" value={usageKey} onChange={e=>setUsageKey(e.target.value)} placeholder="WH-…" /></label><p className="muted">Use the key issued for your account. Employees join through their manager’s authorized email list.</p><button className="btn primary" disabled={busy}>Activate warehouse</button></form></details>
      </>}
      <button className="btn ghost" disabled={busy} onClick={()=>void run(async()=>{await b.logout();setMode('signin');setPassword('');setCheckboxToken('');})}>Sign out</button>
    </>:<><form className="stack" onSubmit={submit}>{mode==='register'&&<label>Your name<input required maxLength={100} autoComplete="name" value={name} onChange={e=>setName(e.target.value)} /></label>}<label>Email<input required type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} /></label>{mode!=='reset'&&<label>Password<input required type="password" minLength={mode==='register'?8:1} autoComplete={mode==='register'?'new-password':'current-password'} value={password} onChange={e=>setPassword(e.target.value)} /></label>}{mode==='register'&&<SignupCheckbox resetCount={checkboxReset} onToken={setCheckboxToken}/>}<button className="btn primary big" disabled={busy||(mode==='register'&&!checkboxToken)}>{busy?'Please wait…':mode==='register'?'Create account':mode==='reset'?'Send reset link':'Sign in'}</button></form>{mode!=='reset'&&<><p className="auth-or"><span>or</span></p><button type="button" className="btn big auth-google" disabled={busy} onClick={()=>void run(async()=>{await signInWithPopup(b.auth!,new GoogleAuthProvider());go('overview');})}><GoogleMark/>Continue with Google</button></>}<div className="row"><button className="btn ghost" onClick={()=>{setCheckboxToken('');setMode(mode==='signin'?'register':'signin');}}>{mode==='signin'?'Create account':'Back to sign in'}</button>{mode==='signin'&&<button className="btn ghost" onClick={()=>setMode('reset')}>Forgot password?</button>}</div></>}
    {(error||b.cloudError)&&<p role="alert" className="auth-error">{error||b.cloudError}</p>}{message&&<p role="status">{message}</p>}
  </div></main>;
}

function GoogleMark(){return <svg aria-hidden="true" width="18" height="18" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>;}
