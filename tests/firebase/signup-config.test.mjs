import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {configureSignup}=createRequire(import.meta.url)('../../firebase/functions/scripts/secure-signup.cjs');
test('signup config uses only the intended field and confirms it without altering provider settings',async()=>{
 const requests=[];let enabled=false;
 const request=async(url,options)=>{requests.push({url,options});if(options){assert.equal(options.method,'PATCH');assert.ok(url.endsWith('?updateMask=client.permissions.disabledUserSignup'));assert.deepEqual(JSON.parse(options.body),{client:{permissions:{disabledUserSignup:true}}});enabled=true;}return {client:{permissions:{disabledUserSignup:enabled}},signIn:{email:{enabled:true}}};};
 assert.equal(await configureSignup({project:'fixture-project',request}),false);assert.equal(requests.length,1);
 assert.equal(await configureSignup({project:'fixture-project',request,apply:true}),true);assert.equal(requests.length,4);
 assert.equal(await configureSignup({project:'fixture-project',request,apply:true}),true);assert.equal(requests.length,5);
});
test('signup config refuses false success and invalid project targets',async()=>{
 const request=async()=>({});
 await assert.rejects(configureSignup({project:'fixture-project',apply:true,request}),/not confirmed/);
 await assert.rejects(configureSignup({project:'demo-wherehouse',apply:true,request}),/explicit live/);
 await assert.rejects(configureSignup({project:'',request}),/explicit live/);
});
