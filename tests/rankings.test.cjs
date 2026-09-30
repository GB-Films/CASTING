const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {webcrypto}=require('node:crypto');
const root=path.join(__dirname,'..');
const core=require('../rankings-core.js');
class Element {
 constructor(id=''){this.id=id;this.value='';this.hidden=true;this.children=[];this.style={};this.dataset={};this.textContent='';this.attributes={};this.handlers={};this.classList={add(){},remove(){},toggle(){}};}
 addEventListener(event,fn){this.handlers[event]=fn;}
 setAttribute(k,v){this.attributes[k]=v;}
 removeAttribute(k){delete this.attributes[k];}
 focus(){this.owner.activeElement=this;}
 append(child){this.children.push(child);}
 after(){}
 replaceChildren(...children){this.children=children;}
 querySelectorAll(){return [];}
 getContext(){return {};}
 matches(selector){return this.id==='playerName'&&selector.includes('input');}
}
function harness({noStorage=false,service=null}={}){
 const elements=new Map();const data=new Map();const handlers={};
 const document={addEventListener(){},getElementById(id){if(!elements.has(id)){const el=new Element(id);el.owner=document;elements.set(id,el);}return elements.get(id);},createElement(){const el=new Element();el.owner=document;return el;},querySelectorAll(){return [];},body:new Element('body'),activeElement:null};
 const storage={get length(){return data.size;},key(i){return [...data.keys()][i]??null;},getItem(k){return data.get(k)??null;},setItem(k,v){if(noStorage)throw Error('Storage disabled');data.set(k,v);},removeItem(k){data.delete(k);}};
 const sandbox={window:null,document,localStorage:storage,navigator:{onLine:false,maxTouchPoints:0},crypto:webcrypto,console,Uint8Array,URLSearchParams,location:{search:'?qa=1'},innerWidth:1280,innerHeight:720,devicePixelRatio:1,matchMedia:()=>({matches:false}),requestAnimationFrame(){},setInterval(){},setTimeout,clearTimeout,addEventListener(event,fn){(handlers[event]??=[]).push(fn);}};
 sandbox.window=sandbox;const context=vm.createContext(sandbox);
 const $=id=>document.getElementById(id);
 $('mainMenu').hidden=false;$('rankingDifficulty').value='normal';$('rankingSource').value='global';
 for(const name of ['firebase-config.js','rankings-core.js','rankings.js']){
  let code=fs.readFileSync(path.join(root,name),'utf8');
  if(name==='rankings.js'&&service){
   sandbox.CASTING_FIREBASE_CONFIG={apiKey:'test-only',projectId:'test-only',appId:'test-only',authDomain:'test-only'};
   sandbox.testSDKs=service;
   code=code.replace("import(base+'firebase-app.js')","Promise.resolve(testSDKs.app)").replace("import(base+'firebase-auth.js')","Promise.resolve(testSDKs.auth)").replace("import(base+'firebase-firestore.js')","Promise.resolve(testSDKs.db)");
  }
  vm.runInContext(code,context,{filename:name});
 }
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
 const script=html.match(/<script>\s*([\s\S]*?)<\/script>/)[1];
 // Keep production code intact; replace startup only to avoid loading embedded art.
 const source=script.replace(/\ninit\(\);/,"\nready=true;mode='menu';images.dir_cheer={src:'cheer'};images.dir_shock={src:'shock'};window.testQuit=toMenu;");
 vm.runInContext(source,context,{filename:'index.html'});
 return {context,$,data,handlers,records:()=>[...data.entries()].filter(([k])=>k.includes(':match:')).map(([,v])=>JSON.parse(v))};
}
test('names: whitespace normalized; three characters; accents; unsafe markup rejected',()=>{
 assert.equal(core.normalizeName('  Ana   María  '),'Ana María');
 for(const n of ['Ana','José','GB Films','A B','Zoë','Jugador_1'])assert.equal(core.validName(n),true,n);
 for(const n of ['','  ','ab','---','<img src=x>','x'.repeat(25)])assert.equal(core.validName(n),false,n);
});
test('start button and Enter cannot bypass mandatory name; name keys do not become controls',()=>{
 const h=harness();h.$('startBtn').onclick();assert.equal(h.context.__qa.getMode(),'menu');
 assert.match(h.$('playerNameError').textContent,/3 a 24/);
 let prevented=false;
 for(const fn of h.handlers.keydown)fn({target:h.$('playerName'),code:'KeyM',preventDefault(){prevented=true;}});
 assert.equal(prevented,false);
 h.$('playerName').value='  Ana María  ';
 for(const fn of h.handlers.keydown)fn({target:h.$('playerName'),code:'Enter',preventDefault(){}});
 assert.equal(h.context.__qa.getMode(),'play');assert.equal(h.context.__qa.getGame().playerName,'Ana María');
});
test('loss, retry, victory: separate IDs, original name, identical displayed score, no duplicate finish',()=>{
 const h=harness();h.$('playerName').value='Guido';h.context.__qa.start();
 const g=h.context.__qa.getGame();g.score=1234;g.time=65;g.kills=4;h.context.__qa.finish(false);h.context.__qa.finish(false);
 assert.equal(h.records().length,1);assert.equal(h.records()[0].score,1234);assert.equal(h.$('statScore').textContent,'1.234');
 h.$('playerName').value='Otra persona';h.$('retryBtn').onclick();g.score=4321;g.time=120;h.context.__qa.finish(true);
 const rows=h.records();assert.equal(rows.length,2);assert.notEqual(rows[0].id,rows[1].id);assert.equal(rows[0].runId,rows[1].runId);assert.equal(rows[1].attempt,1);assert.equal(rows[1].outcome,'won');assert.equal(rows[1].playerName,'Guido');
 assert.match(h.$('scoreSaveStatus').textContent,/este dispositivo/);
 h.$('resultMenuBtn').onclick();assert.equal(h.records().length,2);
});
test('return to menu records abandonment once and preserves pending matches after reload',async()=>{
 const h=harness();h.$('playerName').value='Ana';h.context.__qa.start();h.context.__qa.getGame().score=800;h.context.testQuit();h.context.testQuit();
 assert.equal(h.records().length,1);assert.equal(h.records()[0].outcome,'abandoned');assert.equal(h.records()[0].synced,false);
 vm.runInContext(fs.readFileSync(path.join(root,'rankings.js'),'utf8'),h.context);
 h.$('rankingSource').value='local';await h.$('rankingSource').onchange();
 assert.equal(h.$('rankingRows').children.length,1);assert.equal(h.$('rankingRows').children[0].children[1].textContent,'Ana');
});
test('ranking separates difficulties, orders by score and shorter time, renders names as text',async()=>{
 const h=harness();for(const row of [{name:'Ana',diff:'normal',score:100,time:50},{name:'José',diff:'normal',score:200,time:70},{name:'Luz',diff:'normal',score:200,time:30},{name:'Eva',diff:'hard',score:900,time:10}]){
  h.$('playerName').value=row.name;h.$('startBtn').onclick();const g=h.context.__qa.getGame();g.score=row.score;g.time=row.time;g.difficulty=row.diff;h.context.__qa.finish(false);h.$('resultMenuBtn').onclick();
 }
 h.$('rankingSource').value='local';await h.$('rankingSource').onchange();
 assert.deepEqual(h.$('rankingRows').children.map(r=>r.children[1].textContent),['Luz','José','Ana']);
 h.$('rankingDifficulty').value='hard';await h.$('rankingDifficulty').onchange();assert.equal(h.$('rankingRows').children[0].children[1].textContent,'Eva');
});
test('storage failure is explicit and does not claim persistent saving',()=>{
 const h=harness({noStorage:true});h.$('playerName').value='Ana';h.$('startBtn').onclick();h.context.__qa.finish(false);
 assert.match(h.$('scoreSaveStatus').textContent,/Mantené esta pestaña abierta/);
 assert.equal(h.records().length,0);
});
test('invalid or forged data is rejected locally before queuing',()=>{
 const h=harness();assert.equal(h.context.CastingRanking.save({id:'bad',score:-1}),false);assert.equal(h.records().length,0);
});
function mockFirebase(){
 const docs=new Map();const queries=[];let writes=0,failAfterCommit=false;
 const auth={currentUser:{uid:'test-player'},authStateReady:async()=>{}};
 return {docs,queries,get writes(){return writes;},set failAfterCommit(value){failAfterCommit=value;},
  app:{initializeApp:()=>({})},auth:{getAuth:()=>auth,signInAnonymously:async()=>{}},
  db:{getFirestore:()=>({}),doc:(_db,_collection,id)=>id,serverTimestamp:()=>({server:true}),
   runTransaction:async(_db,fn)=>{await fn({get:async id=>({exists:()=>docs.has(id)}),set:(id,row)=>{docs.set(id,row);writes++;}});if(failAfterCommit){failAfterCommit=false;throw Error('Connection lost after commit');}},
   collection:()=>({}),where:(...args)=>({where:args}),orderBy:(...args)=>({orderBy:args}),limit:n=>({limit:n}),query:(...args)=>{queries.push(args);return args;},
   getDocsFromServer:async()=>({docs:[...docs.values()].map(row=>({data:()=>row}))})}
 };
}
test('queued matches upload on reconnect; stable ID avoids duplicates after ambiguous acknowledgement',async()=>{
 const service=mockFirebase();const h=harness({service});await h.context.CastingRanking.flush();
 h.$('playerName').value='Ana';h.$('startBtn').onclick();h.context.__qa.getGame().score=240;h.context.__qa.finish(false);
 await h.context.CastingRanking.flush();assert.equal(service.docs.size,0);
 h.context.navigator.onLine=true;service.failAfterCommit=true;await h.context.CastingRanking.flush();
 assert.equal(service.docs.size,1);assert.equal(h.records()[0].synced,false);
 await h.context.CastingRanking.flush();assert.equal(h.records()[0].synced,true);assert.equal(service.writes,1);
 const row=[...service.docs.values()][0];assert.equal(row.playerId,'test-player');assert.equal(row.score,240);assert.ok(row.createdAt);assert.equal('synced' in row,false);
});
test('global leaderboard queries server data with bounded results and difficulty filter',async()=>{
 const service=mockFirebase();const h=harness({service});await h.context.CastingRanking.flush();h.context.navigator.onLine=true;
 h.$('rankingDifficulty').value='hard';await h.$('rankingDifficulty').onchange();
 const q=service.queries[0];assert.ok(q.some(item=>item?.limit===50));assert.ok(q.some(item=>JSON.stringify(item?.where)==='["difficulty","==","hard"]'));
 assert.match(h.$('rankingStatus').textContent,/Sé la primera/);
});
