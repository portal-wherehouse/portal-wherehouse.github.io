import {createRequire} from 'node:module';
import {createHash,randomBytes} from 'node:crypto';
const require=createRequire(new URL('../../firebase/functions/package.json',import.meta.url));
const {getFirestore,Timestamp}=require('firebase-admin/firestore');
export async function issueKey(email,overrides={}){
 const key='WH-'+randomBytes(24).toString('hex');
 await getFirestore().doc(`activationKeys/${createHash('sha256').update(key).digest('hex')}`).create({email:email.toLowerCase(),days:30,redeem_before:Timestamp.fromMillis(Date.now()+86400000),revoked:false,redeemed_by:null,...overrides});return key;
}
export const licenseStore=()=>({db:getFirestore(),Timestamp});
