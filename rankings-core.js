(function(root){
 'use strict';
 const NAME=/^[A-Za-zÀ-ÖØ-öø-ÿ0-9 ._'-]+$/;
 const difficulties=['easy','normal','hard'];
 const outcomes=['won','lost','abandoned'];
 function normalizeName(value){return String(value??'').normalize('NFC').trim().replace(/\s+/g,' ');}
 function validName(value){const name=normalizeName(value);return name.length>=3&&name.length<=24&&NAME.test(name)&&/[A-Za-zÀ-ÖØ-öø-ÿ0-9]/.test(name);}
 function newId(){
  if(root.crypto?.randomUUID)return root.crypto.randomUUID();
  const bytes=new Uint8Array(16);root.crypto.getRandomValues(bytes);
  return Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
 }
 function validRecord(r){return r&&/^[a-f0-9-]{32,36}$/.test(r.id)&&/^[a-f0-9-]{32,36}$/.test(r.runId)&&validName(r.playerName)&&r.playerName===normalizeName(r.playerName)&&difficulties.includes(r.difficulty)&&outcomes.includes(r.outcome)&&Number.isInteger(r.score)&&r.score>=0&&r.score<=10000000&&Number.isInteger(r.durationSeconds)&&r.durationSeconds>=0&&r.durationSeconds<=604800&&Number.isInteger(r.kills)&&r.kills>=0&&r.kills<=100000&&Number.isInteger(r.attempt)&&r.attempt>=0&&r.attempt<=100000&&Number.isInteger(r.room)&&r.room>=1&&r.room<=4&&Number.isInteger(r.endedAt)&&r.endedAt>0&&r.gameVersion==='2.2.0';}
 function compare(a,b){return b.score-a.score||a.durationSeconds-b.durationSeconds||a.endedAt-b.endedAt||a.id.localeCompare(b.id);}
 const core={normalizeName,validName,newId,validRecord,compare};
 root.CastingRankingCore=core;
 if(typeof module!=='undefined')module.exports=core;
})(typeof window!=='undefined'?window:globalThis);
