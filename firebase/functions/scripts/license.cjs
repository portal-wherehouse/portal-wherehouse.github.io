// Run only as the service owner with Google Application Default Credentials.
const {randomBytes,createHash}=require('node:crypto');
const {initializeApp,applicationDefault}=require('firebase-admin/app');
const {getFirestore,Timestamp}=require('firebase-admin/firestore');
const [action,project,identifier,daysRaw='30']=process.argv.slice(2);
if(!['issue','trial','extend','revoke'].includes(action)||!project||!identifier){console.error('Usage: node license.cjs issue PROJECT EMAIL [DAYS]\n       node license.cjs extend PROJECT WORKSPACE_ID [DAYS]\n       node license.cjs revoke PROJECT WORKSPACE_ID');process.exit(1);}
const days=Number(daysRaw);if(!Number.isInteger(days)||days<1||days>366)throw Error('Days must be 1–366.');
initializeApp({credential:applicationDefault(),projectId:project});const db=getFirestore();
(async()=>{
 if(action==='issue'||action==='trial'){
  if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(identifier))throw Error('Enter the account holder’s email.');
  const key='WH-'+randomBytes(24).toString('hex');const hash=createHash('sha256').update(key).digest('hex');
  await db.doc(`activationKeys/${hash}`).create({email:identifier.toLowerCase().trim(),days,redeem_before:Timestamp.fromMillis(Date.now()+14*86400000),revoked:false,redeemed_by:null,created_at:Timestamp.now(),...(action==='trial'?{limits:{commandsPerUserMinute:30,commandsPerUserDay:200,maxPalletRecords:1000,photoMonthBytes:100*1024**2,photoStoredBytes:500*1024**2}}:{})});
  console.log(`Account: ${identifier}\nUsage key: ${key}\nValid for ${days} days after activation. Redeem within 14 days. Share privately with this account holder.`);
 } else {
  const license=db.doc(`licenses/${identifier}`);await db.runTransaction(async tx=>{const current=await tx.get(license);if(!current.exists)throw Error('Warehouse license not found.');tx.update(license,action==='revoke'?{active:false}:{active:true,expires_at:Timestamp.fromMillis(Math.max(Date.now(),current.get('expires_at').toMillis())+days*86400000)});});
  console.log(`Warehouse ${identifier}: ${action==='revoke'?'access deactivated':'license extended'}.`);
 }
})().catch(e=>{console.error(e.message);process.exitCode=1;});
