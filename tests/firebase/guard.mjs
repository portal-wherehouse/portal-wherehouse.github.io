export const localEnvironment={GCLOUD_PROJECT:'demo-wherehouse',FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:9099',FIRESTORE_EMULATOR_HOST:'127.0.0.1:8080',FIREBASE_STORAGE_EMULATOR_HOST:'127.0.0.1:9199'};
export function assertLocal(env=process.env,required=true){
 for(const [key,value]of Object.entries(localEnvironment))if((required||env[key])&&env[key]!==value)throw Error(`LOCAL TESTS ONLY: ${key} must be ${value}. Refusing to contact Firebase.`);
 if(env.VITE_FIREBASE_APPCHECK_SITE_KEY)throw Error('LOCAL TESTS ONLY: real App Check keys are not permitted.');
 for(const key of ['GOOGLE_CLOUD_PROJECT','GCP_PROJECT','CLOUDSDK_CORE_PROJECT'])if(env[key]&&env[key]!=='demo-wherehouse')throw Error(`LOCAL TESTS ONLY: refusing ${key}=${env[key]}.`);
 for(const key of ['FIREBASE_CONFIG','VITE_FIREBASE_CONFIG'])if(env[key]){let value;try{value=JSON.parse(env[key]);}catch{throw Error(`LOCAL TESTS ONLY: ${key} must be explicit demo JSON.`);}if(value.projectId!=='demo-wherehouse'||value.storageBucket&&value.storageBucket!=='demo-wherehouse.appspot.com')throw Error(`LOCAL TESTS ONLY: live ${key} rejected.`);}
}
