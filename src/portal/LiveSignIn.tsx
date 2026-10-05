import { WarehouseLoading } from './WarehouseLoading';
import { SignupCheckbox } from './SignupCheckbox';
import { useEffect, useState, type FormEvent } from 'react';
import { signInWithEmailAndPassword, sendPasswordResetEmail, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { VerifyEmail } from './VerifyEmail';
import { GoogleMark } from './GoogleMark';
import { accountReturn, clearAccountReturn } from '../site/accountReturn';
import { loadSavedSurvey } from '../domain/survey';
import { TRIAL_DAYS } from '../domain/license';
import { httpsCallable } from 'firebase/functions';
import { useApp } from '../app/state';
import { FirebaseBackend, cloudMessage } from '../data/firebase';
import { BRAND } from '../brand';
import { signupProblem } from './signupProblem';

export function LiveSignIn({ onActivated }: { onActivated?: (name: string) => void }) {
  const {backend,go}=useApp();const b=backend as FirebaseBackend;
  // Sent here by the website's "Create an account to begin your survey": return to #start once verified.
  const [back]=useState(accountReturn);
  const [mode,setMode]=useState<'signin'|'register'|'reset'>(()=>back?.mode??(loadSavedSurvey()?'register':'signin'));
  const signedIn=()=>{if(back&&b.auth?.currentUser?.emailVerified){clearAccountReturn();go('start');}else go('overview',{replace:true});};
  const verified=()=>{if(back){clearAccountReturn();history.replaceState(history.state,'',`${location.pathname}${location.search}#start`);}window.location.reload();};
  const [email,setEmail]=useState('');const [password,setPassword]=useState('');const [name,setName]=useState('');
  const [checkboxToken,setCheckboxToken]=useState('');const [checkboxReset,setCheckboxReset]=useState(0);
  const [warehouse,setWarehouse]=useState('');const [usageKey,setUsageKey]=useState('');const [busy,setBusy]=useState(false);const [message,setMessage]=useState('');const [error,setError]=useState('');
  const [exists,setExists]=useState(false);
  const run=async(task:()=>Promise<void>)=>{setBusy(true);setError('');setMessage('');setExists(false);try{await task();}catch(e){setError(cloudMessage(e));}finally{setBusy(false);}};
  const submit=(e:FormEvent)=>{e.preventDefault();void run(async()=>{
    if(mode==='reset'){await sendPasswordResetEmail(b.auth!,email.trim());setMessage('If this email has an account, a reset link has been sent.');return;}
    if(mode==='register') {
      if(!checkboxToken)throw new Error('Complete the checkbox before creating your account.');
      try {
        await b.prepareSignup();
        try {await httpsCallable(b.functions!,'createAccount')({email:email.trim(),password,name:name.trim(),checkboxToken});}
        catch(e){const m=signupProblem(e);if(m.exists)setExists(true);throw new Error(m.text);}
        setCheckboxToken('');
        // Signed in, the code screen below opens and emails the 6-digit code.
        await signInWithEmailAndPassword(b.auth!,email.trim(),password);
      } finally {setCheckboxToken('');setCheckboxReset(value=>value+1);}
    }
    else {await signInWithEmailAndPassword(b.auth!,email.trim(),password);signedIn();}
  });};
  const user=b.auth?.currentUser;
  const userVerified=!!user?.emailVerified;
  useEffect(()=>{if(back&&userVerified){clearAccountReturn();go('start');}},[back,userVerified,go]);
  // A verified account with a warehouse to open goes straight in. This page replaces itself in history, so
  // Back from the warehouse never lands on an "Open warehouse" screen.
  const {workspaceId}=useApp();
  const ready=!!b.configured&&!b.loading&&!b.cloudError&&userVerified&&b.workspaceIds.length>0&&!b.licenseBlocked&&!b.readOnly&&!back;
  const openId=b.activeWorkspace||b.workspaceIds[0];
  const [autoFailed,setAutoFailed]=useState(false);
  useEffect(()=>{if(!ready||autoFailed)return;let live=true;void (async()=>{try{if(b.activeWorkspace!==openId||!workspaceId)await b.chooseWorkspace(openId);if(live)go('overview',{replace:true});}catch{if(live)setAutoFailed(true);}})();return()=>{live=false;};},[ready,openId,autoFailed]);
  return <main className="auth-shell page-enter"><button className="btn ghost" onClick={()=>go('home')}>← Wherehouse</button><div className="panel stack auth-card">
    <h1>{!b.configured?'Let’s get your warehouse set up.':b.loading?'Opening your warehouse…':user?(user.emailVerified?'Your warehouse':'Check your email'):mode==='register'?(back?'Create an account to begin your survey':loadSavedSurvey()?'Create your account to start your free trial':'Create your account'):mode==='reset'?'Reset your password':back?'Sign in to begin your survey':'Sign in'}</h1>
    {!b.configured?<><p>Live accounts need the final connection to be enabled. Contact us to arrange setup.</p><a className="btn primary" href={`mailto:${BRAND.supportEmail}`}>Contact setup & support</a><a href="?demo=1#signin">Try a separate sample warehouse</a></>:b.loading?<WarehouseLoading name={b.activeWorkspace ? b.db.workspaces[b.activeWorkspace]?.name : undefined} />:user?<>
      {!user.emailVerified?<VerifyEmail key={user.uid} b={b} user={user} onVerified={verified}/>:b.workspaceIds.length && !b.licenseBlocked && !b.readOnly?<><p role="status">{b.cloudError || (autoFailed ? 'Your account is ready.' : 'Opening your warehouse…')}</p>{b.workspaceIds.filter(id=>id===(b.activeWorkspace||b.workspaceIds[0])).map(id=><button className="btn primary" key={id} disabled={busy} onClick={()=>void run(async()=>{await b.chooseWorkspace(id);go('overview',{replace:true});})}>Open warehouse</button>)}</>:<>
        {!b.licenseBlocked&&!b.readOnly&&<form className="stack auth-trial" data-testid="trial-form" onSubmit={e=>{e.preventDefault();void run(async()=>{const made=await httpsCallable(b.functions!,'createWarehouse')({name:warehouse.trim()||'My warehouse',trial:true,timezone:Intl.DateTimeFormat().resolvedOptions().timeZone,survey:loadSavedSurvey()??undefined});onActivated?.(warehouse.trim()||'My warehouse');await b.chooseWorkspace((made.data as {workspaceId:string}).workspaceId);go('overview',{replace:true});});}}><h2>Start your free {TRIAL_DAYS}-day trial</h2><p className="muted">No card needed. Name your warehouse and a setup checklist walks you through the rest.</p><label>Name your warehouse<input required minLength={2} maxLength={100} value={warehouse} onChange={e=>setWarehouse(e.target.value)} placeholder="Main warehouse" /></label><button className="btn primary big" disabled={busy}>Start my free trial</button></form>}
        <p>Joining a crew? Ask your manager to add <strong>{user.email}</strong> in People. Sign in with that exact email.</p><button className="btn" disabled={busy} onClick={()=>void run(async()=>{await httpsCallable(b.functions!,'joinAuthorizedWarehouses')({});await b.reload();setMessage('Access checked. Your authorized warehouse will appear here.');})}>Refresh access</button><details open={b.licenseBlocked||b.readOnly}><summary>Activate my warehouse with a usage key</summary><form className="stack" onSubmit={e=>{e.preventDefault();void run(async()=>{const activated=await httpsCallable(b.functions!,'createWarehouse')({name:warehouse || 'My warehouse',usageKey,workspaceId:b.activeWorkspace || undefined,timezone:Intl.DateTimeFormat().resolvedOptions().timeZone});onActivated?.(warehouse.trim() || 'My warehouse');await b.chooseWorkspace((activated.data as {workspaceId:string}).workspaceId);go('overview',{replace:true});});}}><label>Warehouse name<input required minLength={2} maxLength={100} value={warehouse} onChange={e=>setWarehouse(e.target.value)} /></label><label>Usage key<input required autoComplete="off" type="password" value={usageKey} onChange={e=>setUsageKey(e.target.value)} placeholder="WH-…" /></label><p className="muted">Use the key issued for your account. Employees join through their manager’s authorized email list.</p><button className="btn primary" disabled={busy}>Activate warehouse</button></form></details>
      </>}
      <button className="btn ghost" disabled={busy} onClick={()=>void run(async()=>{await b.logout();setMode('signin');setPassword('');setCheckboxToken('');})}>Sign out</button>
    </>:<><form className="stack" onSubmit={submit}>{mode==='register'&&<label>Your name<input required maxLength={100} autoComplete="name" value={name} onChange={e=>setName(e.target.value)} /></label>}<label>Email<input required type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} /></label>{mode!=='reset'&&<label>Password<input required type="password" minLength={mode==='register'?8:1} autoComplete={mode==='register'?'new-password':'current-password'} value={password} onChange={e=>setPassword(e.target.value)} /></label>}{mode==='register'&&<SignupCheckbox resetCount={checkboxReset} onToken={setCheckboxToken}/>}<button className="btn primary big" disabled={busy||(mode==='register'&&!checkboxToken)}>{busy?'Please wait…':mode==='register'?'Create account':mode==='reset'?'Send reset link':'Sign in'}</button></form>{mode!=='reset'&&<><p className="auth-or"><span>or</span></p><button type="button" className="btn big auth-google" disabled={busy} onClick={()=>void run(async()=>{await signInWithPopup(b.auth!,new GoogleAuthProvider());signedIn();})}><GoogleMark/>Continue with Google</button></>}{mode==='register'&&<p className="muted">We only email you verification and sign-in codes. No newsletters, no spam.</p>}<div className="row"><button className="btn ghost" onClick={()=>{setCheckboxToken('');setMode(mode==='signin'?'register':'signin');}}>{mode==='signin'?'Create account':'Back to sign in'}</button>{mode==='signin'&&<button className="btn ghost" onClick={()=>setMode('reset')}>Forgot password?</button>}</div></>}
    {(error||b.cloudError)&&<p role="alert" className="auth-error">{error||b.cloudError}</p>}{exists&&mode==='register'&&!user&&<div className="row"><button type="button" className="btn" onClick={()=>{setExists(false);setError('');setMode('signin');}}>Sign in instead</button><button type="button" className="btn ghost" onClick={()=>{setExists(false);setError('');setMode('reset');}}>Reset my password</button></div>}{message&&<p role="status">{message}</p>}
  </div></main>;
}

