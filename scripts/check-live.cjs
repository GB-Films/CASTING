// Explicit live verification. Creates and removes one disposable test match.
// Usage: node scripts/check-live.cjs <firebase-tools-lib-directory>
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const lib=process.argv[2];
if(!lib)throw new Error('Supply the authenticated firebase-tools lib directory to allow test cleanup.');
const sandbox={window:{}};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'..','firebase-config.js'),'utf8'),sandbox);
const config=sandbox.window.CASTING_FIREBASE_CONFIG;
const id=randomUUID();
const documentName=`projects/${config.projectId}/databases/(default)/documents/matches/${id}`;
const base=`https://firestore.googleapis.com/v1/projects/${config.projectId}/databases/(default)/documents`;
let admin,created=false;
async function request(url,body,token){
 const response=await fetch(url,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},...(body?{body:JSON.stringify(body)}:{})});
 return {status:response.status,data:await response.json()};
}
(async()=>{
 const account=require(path.join(lib,'auth')).getGlobalDefaultAccount();
 await require(path.join(lib,'requireAuth')).requireAuth({...account,nonInteractive:true});
 admin=new (require(path.join(lib,'apiv2')).Client)({urlPrefix:'https://firestore.googleapis.com',apiVersion:'v1'});
 const login=await request(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${config.apiKey}`,{returnSecureToken:true});
 assert.equal(login.status,200,'Anonymous authentication must be enabled');
 const token=login.data.idToken;
 console.log('PASS: anonymous sign-in');
 const row={id,runId:randomUUID(),playerId:login.data.localId,playerName:'QA técnica',difficulty:'normal',score:7,durationSeconds:2,kills:0,attempt:0,room:1,outcome:'lost',endedAt:Date.now(),gameVersion:'2.2.0'};
 const encode=row=>Object.fromEntries(Object.entries(row).map(([k,v])=>[k,typeof v==='number'?{integerValue:String(v)}:{stringValue:v}]));
 const write=(values,exists)=>({writes:[{update:{name:documentName,fields:encode(values)},updateTransforms:[{fieldPath:'createdAt',setToServerValue:'REQUEST_TIME'}],currentDocument:{exists}}]});
 const invalid=await request(base+':commit',write({...row,score:-1},false),token);
 assert.equal(invalid.status,403,'Negative scores must be denied');console.log('PASS: invalid score denied');
 const valid=await request(base+':commit',write(row,false),token);
 assert.equal(valid.status,200,'Valid authenticated match must be saved');created=true;console.log('PASS: valid match saved with server timestamp');
 const get=await request(base+'/matches/'+id,null,token);assert.equal(get.status,200);assert.equal(get.data.fields.score.integerValue,'7');assert.ok(get.data.fields.createdAt.timestampValue);console.log('PASS: saved match read back');
 const update=await request(base+':commit',write({...row,score:1000},true),token);
 assert.equal(update.status,403,'Saved scores must be immutable');console.log('PASS: score overwrite denied');
 const remove=await request(base+':commit',{writes:[{delete:documentName}]},token);assert.equal(remove.status,403);console.log('PASS: client deletion denied');
 const unbounded=await request(base+':runQuery',{structuredQuery:{from:[{collectionId:'matches'}]}});assert.equal(unbounded.status,403);console.log('PASS: unbounded public query denied');
 const bounded=await request(base+':runQuery',{structuredQuery:{from:[{collectionId:'matches'}],limit:50}});assert.equal(bounded.status,200);assert.ok(bounded.data.some(r=>r.document?.name===documentName));console.log('PASS: public bounded ranking can see saved match');
})().catch(error=>{console.error(error.message);process.exitCode=1;}).finally(async()=>{
 if(created){
  try{const result=await admin.get('/'+documentName);assert.equal(result.body.fields.playerName.stringValue,'QA técnica');assert.equal(result.body.fields.id.stringValue,id);await admin.delete('/'+documentName);console.log('Cleaned up the disposable test match.');}
  catch(error){console.error('Test cleanup failed: '+error.message);process.exitCode=1;}
 }
});
