(function(){
 'use strict';
 const core=window.CastingRankingCore;
 const $=id=>document.getElementById(id);
 const prefix='gb-casting-rankings-v1:match:';
 const volatile=new Map();
 let storageWarning=false,backend=null,connecting=null,flushing=null,renderSequence=0,lastAttemptId=null,returnFocus=null;
 const resultLabels={won:'Casting aprobado',lost:'Toma fallida',abandoned:'Abandonada'};
 const savedNameKey='gb-casting-rankings-v1:name';
 try{$('playerName').value=localStorage.getItem(savedNameKey)||'';}catch{}
 function records(){
  const result=new Map(volatile);
  try{for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i);if(!key?.startsWith(prefix))continue;try{const row=JSON.parse(localStorage.getItem(key));if(core.validRecord(row))result.set(row.id,row);}catch{}}}catch{storageWarning=true;}
  return [...result.values()];
 }
 function store(row){
  volatile.set(row.id,row);
  try{localStorage.setItem(prefix+row.id,JSON.stringify(row));volatile.delete(row.id);}catch{storageWarning=true;}
 }
 function prune(){
  const saved=records().filter(r=>r.synced).sort((a,b)=>b.endedAt-a.endedAt);
  for(const row of saved.slice(100)){volatile.delete(row.id);try{localStorage.removeItem(prefix+row.id);}catch{}}
 }
 function configured(){const c=window.CASTING_FIREBASE_CONFIG;return !!(c?.apiKey&&c?.projectId&&c?.appId&&c?.authDomain);}
 function message(text){$('rankingConnection').textContent=text;}
 function deadline(promise,ms=15000){let timer;return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('ranking-timeout')),ms);})]).finally(()=>clearTimeout(timer));}
 function pendingText(){const n=records().filter(r=>!r.synced).length;return n?`${n} ${n===1?'partida pendiente':'partidas pendientes'} de envío.`:'';}
 function showSaveStatus(){
  if(!lastAttemptId)return;
  const row=records().find(r=>r.id===lastAttemptId);
  $('scoreSaveStatus').textContent=row?.synced?'Puntaje guardado en el ranking global.':storageWarning?'No pudimos guardar en este dispositivo. Mantené esta pestaña abierta hasta recuperar conexión.':!configured()?'Puntaje guardado en este dispositivo. El ranking global todavía no está habilitado.':'Puntaje guardado en este dispositivo; pendiente de envío al ranking global.';
 }
 async function connect(){
  if(backend)return backend;
  if(!configured()){message('Ranking global aún no habilitado. '+pendingText());return null;}
  if(navigator.onLine===false){message('Sin conexión. '+pendingText());return null;}
  if(connecting)return connecting;
  connecting=(async()=>{
   const base='https://www.gstatic.com/firebasejs/12.19.0/';
   const [appSDK,authSDK,dbSDK]=await deadline(Promise.all([import(base+'firebase-app.js'),import(base+'firebase-auth.js'),import(base+'firebase-firestore.js')]));
   const app=appSDK.initializeApp(window.CASTING_FIREBASE_CONFIG,'casting-ranking');
   const auth=authSDK.getAuth(app);
   await deadline(auth.authStateReady());
   if(!auth.currentUser)await deadline(authSDK.signInAnonymously(auth));
   const db=dbSDK.getFirestore(app);
   backend={auth,db,sdk:dbSDK};
   message('Ranking global conectado. '+pendingText());
   return backend;
  })();
  try{return await connecting;}catch(error){console.warn('No se pudo conectar el ranking:',error.code||error.message);message('No pudimos conectar el ranking. Tus partidas quedan pendientes.');return null;}finally{connecting=null;}
 }
 async function flush(){
  if(flushing)return flushing;
  flushing=(async()=>{
   const service=await connect();if(!service)return;
   const {db,auth,sdk}=service;
   for(;;){
    const row=records().filter(r=>!r.synced).sort((a,b)=>a.endedAt-b.endedAt)[0];if(!row)break;
    if(navigator.onLine===false)break;
    try{
     const {synced,...match}=row;
     // Stable document ID plus transaction: retrying never adds another match.
     const ref=sdk.doc(db,'matches',row.id);
     await deadline(sdk.runTransaction(db,async transaction=>{
      const existing=await transaction.get(ref);
      if(!existing.exists())transaction.set(ref,{...match,playerId:auth.currentUser.uid,createdAt:sdk.serverTimestamp()});
     }));
     store({...row,synced:true});showSaveStatus();
    }catch(error){console.warn('Partida pendiente:',error.code||error.message);message('No se pudo enviar una partida. '+pendingText());showSaveStatus();return;}
   }
   prune();message(navigator.onLine===false?'Sin conexión. '+pendingText():'Ranking global conectado. '+pendingText());
  })();
  try{await flushing;}finally{flushing=null;}
 }
 function acceptPlayer(){
  const name=core.normalizeName($('playerName').value);
  if(!core.validName(name)){$('playerNameError').textContent='Ingresá un nombre o apodo de 3 a 24 caracteres (letras, números, espacios, punto, guion o apóstrofe).';$('playerName').setAttribute('aria-invalid','true');$('playerName').focus();return null;}
  $('playerName').value=name;$('playerNameError').textContent='';$('playerName').removeAttribute('aria-invalid');
  try{localStorage.setItem(savedNameKey,name);}catch{}
  return name;
 }
 function save(match){
  if(!core.validRecord(match)){message('No se pudo registrar el puntaje: datos de partida inválidos.');return false;}
  if(records().some(r=>r.id===match.id))return true;
  lastAttemptId=match.id;store({...match,synced:false});showSaveStatus();
  message(pendingText());void flush();return true;
 }
 function cell(row,text){const td=document.createElement('td');td.textContent=text;row.append(td);return td;}
 function renderRows(rows,local){
  $('rankingRows').replaceChildren();
  rows.forEach((match,index)=>{
   const tr=document.createElement('tr');cell(tr,String(index+1));cell(tr,match.playerName);cell(tr,match.score.toLocaleString('es-AR'));
   cell(tr,`${Math.floor(match.durationSeconds/60)}:${String(match.durationSeconds%60).padStart(2,'0')}`);
   const result=cell(tr,resultLabels[match.outcome]||'');const date=document.createElement('small');
   date.textContent=new Date(match.endedAt).toLocaleString('es-AR',{dateStyle:'short',timeStyle:'short'});result.append(date);
   if(local&&!match.synced){const pending=document.createElement('small');pending.textContent='Pendiente de envío';result.append(pending);}
   $('rankingRows').append(tr);
  });
 }
 async function renderRanking(){
  const sequence=++renderSequence,difficulty=$('rankingDifficulty').value,local=$('rankingSource').value==='local';
  $('rankingRows').replaceChildren();$('rankingStatus').textContent='Buscando partidas…';
  if(local){const rows=records().filter(r=>r.difficulty===difficulty).sort(core.compare).slice(0,50);renderRows(rows,true);$('rankingStatus').textContent=rows.length?'Partidas de este dispositivo.':'Todavía no jugaste una partida en esta dificultad.';return;}
  const service=await connect();if(sequence!==renderSequence)return;
  if(!service){$('rankingStatus').textContent=configured()?'No se puede consultar el ranking global ahora. Podés ver tus partidas en este dispositivo.':'El ranking global todavía no está habilitado. Podés ver tus partidas en este dispositivo.';return;}
  try{
   const {db,sdk}=service;
   const q=sdk.query(sdk.collection(db,'matches'),sdk.where('difficulty','==',difficulty),sdk.orderBy('score','desc'),sdk.orderBy('durationSeconds','asc'),sdk.orderBy('createdAt','asc'),sdk.limit(50));
   const snapshot=await deadline(sdk.getDocsFromServer(q));if(sequence!==renderSequence)return;
   const rows=snapshot.docs.map(doc=>doc.data());renderRows(rows,false);
   $('rankingStatus').textContent=rows.length?'Ranking global · cada fila es una partida.':'Sé la primera persona en dejar un puntaje en esta dificultad.';
  }catch(error){if(sequence!==renderSequence)return;console.warn('No se pudo leer el ranking:',error.code||error.message);$('rankingStatus').textContent='No pudimos cargar el ranking global. Probá actualizar o consultá tus partidas locales.';}
 }
 function openRanking(){returnFocus=document.activeElement;$('leaderboardModal').hidden=false;$('closeLeaderboard').focus();void renderRanking();}
 function closeRanking(){renderSequence++;$('leaderboardModal').hidden=true;returnFocus?.focus();}
 const saveStatus=document.createElement('p');saveStatus.id='scoreSaveStatus';saveStatus.setAttribute('role','status');saveStatus.setAttribute('aria-live','polite');$('resultBest').after(saveStatus);
 const resultButton=document.createElement('button');resultButton.className='secondary';resultButton.textContent='VER RANKING';resultButton.onclick=openRanking;$('resultMenuBtn').after(resultButton);
 $('leaderboardBtn').onclick=openRanking;$('closeLeaderboard').onclick=closeRanking;
 $('rankingDifficulty').onchange=renderRanking;$('rankingSource').onchange=renderRanking;
 $('refreshLeaderboard').onclick=()=>{void flush();void renderRanking();};
 $('playerName').addEventListener('input',()=>{$('playerNameError').textContent='';$('playerName').removeAttribute('aria-invalid');});
 $('leaderboardModal').addEventListener('keydown',e=>{
  e.stopPropagation();if(e.key==='Escape'){e.preventDefault();closeRanking();return;}
  if(e.key==='Tab'){const items=[...$('leaderboardModal').querySelectorAll('button,select')];const first=items[0],last=items.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}
 });
 addEventListener('online',()=>{void flush();if(!$('leaderboardModal').hidden)void renderRanking();});
 addEventListener('storage',()=>{showSaveStatus();});
 window.CastingRanking={acceptPlayer,newId:core.newId,save,flush};
 void flush();
})();
