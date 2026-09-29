import './local-only.mjs';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(new URL('../../firebase/functions/package.json',import.meta.url));
const {getFirestore}=require('firebase-admin/firestore');
const {getAuth}=require('firebase-admin/auth');
export async function signupToken(overrides={}){
 const token='local-signup-'+randomUUID();
 await getFirestore().doc(`signupTestTokens/${createHash('sha256').update(token).digest('hex')}`).set({used:false,assessment:{tokenProperties:{valid:true,hostname:'portal-wherehouse.github.io',createTime:new Date().toISOString(),...overrides}}});
 return token;
}
export async function testSignup(){
 const base={name:'New teammate',email:`signup-${Date.now()}@example.com`,password:'Warehouse-test-123!'};
 const call=async(data)=>{
  const response=await fetch('http://127.0.0.1:5001/demo-wherehouse/us-east1/createAccount',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({data})});
  return {status:response.status,...await response.json()};
 };
 await getFirestore().doc('registrationLimits/current').delete();
 assert.equal((await call(base)).status,400);
 for(const token of ['fake',await signupToken({valid:false}),await signupToken({hostname:'evil.example'}),await signupToken({createTime:new Date(Date.now()-180000).toISOString()})])assert.equal((await call({...base,checkboxToken:token})).status,403);
 await assert.rejects(getAuth().getUserByEmail(base.email),e=>e.code==='auth/user-not-found');
 console.log('PASS signup rejects missing, forged, expired and wrong-domain checkbox tokens before creating an account');
 const token=await signupToken();const accepted=await call({...base,checkboxToken:token});assert.equal(accepted.status,200,JSON.stringify(accepted));
 const user=await getAuth().getUserByEmail(base.email);assert.equal(user.emailVerified,false);assert.equal(user.displayName,base.name);
 assert.equal((await call({...base,email:`replay-${Date.now()}@example.com`,checkboxToken:token})).status,403);
 console.log('PASS signup creates an unverified account once and rejects checkbox token replay');
 const duplicate=await call({...base,checkboxToken:await signupToken()});assert.equal(duplicate.status,400);assert.match(duplicate.error.message,/signing in/);
 for(let i=0;i<3;i++)await call({...base,checkboxToken:'fake'});
 assert.equal((await call({...base,checkboxToken:await signupToken()})).status,429);
 assert.equal((await getAuth().getUser(user.uid)).uid,user.uid);
 console.log('PASS signup attempt limits preserve existing accounts');
 await getFirestore().doc('registrationLimits/current').delete();
}
