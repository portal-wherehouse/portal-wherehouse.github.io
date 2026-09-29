// Explicit, resumable maintenance only. Never called from sign-in or ordinary commands.
// Pause warehouse access before --apply. Dry-run still performs billed reads on a live project.
const {initializeApp}=require('firebase-admin/app');
const {getFirestore,FieldPath}=require('firebase-admin/firestore');
const {getStorage}=require('firebase-admin/storage');
const [projectId,workspaceId,bucketName,flag]=process.argv.slice(2);
if(!projectId||!/^[-\w]{1,128}$/.test(workspaceId||'')||!bucketName||flag&&!['--apply','--dry-run'].includes(flag))throw Error('Usage: node firebase/functions/scripts/backfill.cjs PROJECT WORKSPACE BUCKET [--dry-run|--apply]');
const apply=flag==='--apply';initializeApp({projectId,storageBucket:bucketName});
const db=getFirestore(),root=db.doc(`workspaces/${workspaceId}`);
function terms(p,job){const words=`${p.code} ${p.description} ${job?.name||''} ${p.notes||''} ${p.supplier_ref||''}`.toLowerCase().match(/[\p{L}\p{N}-]+/gu)||[];const result=new Set();for(const w of words)for(let n=2;n<=Math.min(32,w.length);n++)result.add(w.slice(0,n));return [...result].slice(0,600);}
async function pages(table,visit){let cursor;do{let q=root.collection(table).orderBy(FieldPath.documentId()).limit(100);if(cursor)q=q.startAfter(cursor);const page=await q.get();for(const row of page.docs)await visit(row);cursor=page.size===100?page.docs.at(-1):null;}while(cursor);}
(async()=>{
 if(!(await root.get()).exists)throw Error('Warehouse not found.');
 if(apply&&(await db.doc(`licenses/${workspaceId}`).get()).get('active'))throw Error('Revoke/pause this warehouse before --apply; resume its license after verification.');
 let pallets=0,changed=0,retainedBytes=0;const jobs=new Map();
 await pages('pallets',async row=>{const p=row.data();if(!jobs.has(p.job_id))jobs.set(p.job_id,(await root.collection('jobs').doc(p.job_id).get()).data());const patch={has_hold:!!p.hold,search_terms:terms(p,jobs.get(p.job_id))};pallets++;if(p.has_hold!==patch.has_hold||JSON.stringify(p.search_terms)!==JSON.stringify(patch.search_terms)){changed++;if(apply)await row.ref.update(patch);}});
 const reservations=new Map();await pages('uploads',async row=>{const r=row.data();if(['reserved','deleting'].includes(r.state)){reservations.set(r.full,true);reservations.set(r.thumb,true);retainedBytes+=r.bytes+r.thumbBytes;}});
 let pageToken;do{const [files,next]=await getStorage().bucket().getFiles({prefix:`workspaces/${workspaceId}/photos/`,maxResults:100,autoPaginate:false,pageToken});for(const file of files)if(!reservations.has(file.name))retainedBytes+=Number(file.metadata.size||0);pageToken=next?.pageToken;}while(pageToken);
 if(apply)await root.collection('private').doc('photoQuota').set({retainedBytes},{merge:true});
 console.log(JSON.stringify({mode:apply?'applied':'dry-run',pallets,changed,retainedBytes,history:'unchanged',photoObjects:'unchanged'}));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
