import { WarehouseLoading } from './WarehouseLoading';
import { SignupCheckbox } from './SignupCheckbox';
import { useState, type FormEvent } from 'react';
import { signInWithEmailAndPassword, sendPasswordResetEmail, sendEmailVerification, reload } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { useApp } from '../app/state';
import { FirebaseBackend, cloudMessage } from '../data/firebase';
import { BRAND } from '../brand';

export function LiveSignIn({ onActivated }: { onActivated?: (name: string) => void }) {
  const {backend,go}=useApp();const b=backend as FirebaseBackend;
  const [mode,setMode]=useState<'signin'|'register'|'reset'>('signin');
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
    <h1>{!b.configured?'Let’s get your warehouse set up.':b.loading?'Opening your warehouse…':user?'Your warehouse':mode==='register'?'Create your account':mode==='reset'?'Reset your password':'Sign in'}</h1>
    {!b.configured?<><p>Live accounts need the final connection to be enabled. Contact us to arrange setup.</p><a className="btn primary" href={`mailto:${BRAND.supportEmail}`}>Contact setup & support</a><a href="?demo=1#signin">Try a separate sample warehouse</a></>:b.loading?<WarehouseLoading name={b.activeWorkspace ? b.db.workspaces[b.activeWorkspace]?.name : undefined} />:user?<>
      {!user.emailVerified?<><p>Open the verification email, then come back here.</p><button className="btn primary" disabled={busy} onClick={()=>void run(async()=>{await reload(user);await user.getIdToken(true);if(!user.emailVerified){setMessage('The email has not been verified yet.');return;}window.location.reload();})}>I’ve verified my email</button><button className="btn" disabled={busy} onClick={()=>void run(async()=>{await sendEmailVerification(user);setMessage('Verification email sent.');})}>Resend email</button></>:b.workspaceIds.length && !b.licenseBlocked?<><p>{b.cloudError || 'Your account is ready.'}</p>{b.workspaceIds.map(id=><button className="btn primary" key={id} disabled={busy} onClick={()=>void run(async()=>{await b.chooseWorkspace(id);go('overview');})}>Open warehouse</button>)}</>:<>
        <p>Joining a crew? Ask your manager to add <strong>{user.email}</strong> in the Manager dashboard. Sign in with that exact email.</p><button className="btn" disabled={busy} onClick={()=>void run(async()=>{await httpsCallable(b.functions!,'joinAuthorizedWarehouses')({});await b.reload();setMessage('Access checked. Your authorized warehouse will appear here.');})}>Refresh access</button><details open={b.licenseBlocked}><summary>Activate my warehouse with a usage key</summary><form className="stack" onSubmit={e=>{e.preventDefault();void run(async()=>{const activated=await httpsCallable(b.functions!,'createWarehouse')({name:warehouse || 'My warehouse',usageKey,timezone:Intl.DateTimeFormat().resolvedOptions().timeZone});onActivated?.(warehouse.trim() || 'My warehouse');await b.chooseWorkspace((activated.data as {workspaceId:string}).workspaceId);go('overview');});}}><label>Warehouse name<input required minLength={2} maxLength={100} value={warehouse} onChange={e=>setWarehouse(e.target.value)} /></label><label>Usage key<input required autoComplete="off" type="password" value={usageKey} onChange={e=>setUsageKey(e.target.value)} placeholder="WH-…" /></label><p className="muted">Use the key issued for your account. Employees join through their manager’s authorized email list.</p><button className="btn primary" disabled={busy}>Activate warehouse</button></form></details>
      </>}
      <button className="btn ghost" disabled={busy} onClick={()=>void run(async()=>{await b.logout();setMode('signin');setPassword('');setCheckboxToken('');})}>Sign out</button>
    </>:<><form className="stack" onSubmit={submit}>{mode==='register'&&<label>Your name<input required maxLength={100} autoComplete="name" value={name} onChange={e=>setName(e.target.value)} /></label>}<label>Email<input required type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} /></label>{mode!=='reset'&&<label>Password<input required type="password" minLength={mode==='register'?8:1} autoComplete={mode==='register'?'new-password':'current-password'} value={password} onChange={e=>setPassword(e.target.value)} /></label>}{mode==='register'&&<SignupCheckbox resetCount={checkboxReset} onToken={setCheckboxToken}/>}<button className="btn primary big" disabled={busy||(mode==='register'&&!checkboxToken)}>{busy?'Please wait…':mode==='register'?'Create account':mode==='reset'?'Send reset link':'Sign in'}</button></form><div className="row"><button className="btn ghost" onClick={()=>{setCheckboxToken('');setMode(mode==='signin'?'register':'signin');}}>{mode==='signin'?'Create account':'Back to sign in'}</button>{mode==='signin'&&<button className="btn ghost" onClick={()=>setMode('reset')}>Forgot password?</button>}</div></>}
    {(error||b.cloudError)&&<p role="alert" className="auth-error">{error||b.cloudError}</p>}{message&&<p role="status">{message}</p>}
  </div></main>;
}
