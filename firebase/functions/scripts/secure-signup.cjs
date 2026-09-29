// Owner-only configuration; never imported by the app or automated emulator tests.
// --check is read-only. --apply closes direct client signup while retaining sign-in.
const {applicationDefault}=require('firebase-admin/app');
async function configureSignup({project,apply=false,request}) {
  if(!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(project||'') || project.startsWith('demo-')) throw Error('Supply your explicit live project ID. This command is not an emulator test.');
  const url=`https://identitytoolkit.googleapis.com/admin/v2/projects/${project}/config`;
  const before=await request(url);
  if(before.client?.permissions?.disabledUserSignup===true)return true;
  if(!apply)return false;
  await request(`${url}?updateMask=client.permissions.disabledUserSignup`,{method:'PATCH',body:JSON.stringify({client:{permissions:{disabledUserSignup:true}}})});
  const after=await request(url);
  if(after.client?.permissions?.disabledUserSignup!==true)throw Error('Signup restriction was not confirmed. Do not treat the checkbox as enforced yet.');
  return true;
}
module.exports={configureSignup};
if(require.main===module)(async()=>{
  const [mode,project,...extra]=process.argv.slice(2);
  if(!['--check','--apply'].includes(mode)||extra.length||!project)throw Error('Usage: node firebase/functions/scripts/secure-signup.cjs --check|--apply PROJECT');
  if(process.env.FIREBASE_AUTH_EMULATOR_HOST||process.env.FIRESTORE_EMULATOR_HOST)throw Error('Do not run this live configuration command inside emulator tests.');
  const credential=applicationDefault();
  const protectedSignup=await configureSignup({project,apply:mode==='--apply',request:async(url,options={})=>{
    const {access_token}=await credential.getAccessToken();
    const response=await fetch(url,{...options,headers:{Authorization:`Bearer ${access_token}`,'Content-Type':'application/json'},signal:AbortSignal.timeout(15000)});
    if(!response.ok){const body=await response.json().catch(()=>({}));throw Error(`Google configuration request failed (${response.status}): ${body.error?.message||'check project access'}. No provider or billing upgrade was requested.`);}
    return response.json();
  }});
  console.log(protectedSignup?'Confirmed: direct client signup is disabled. Existing users can sign in; the verified createAccount function creates new accounts.':'Direct client signup is still enabled. Deploy createAccount and its reCAPTCHA permission, then run --apply.');
  if(!protectedSignup)process.exitCode=2;
})().catch(error=>{console.error(error.message);process.exitCode=1;});
