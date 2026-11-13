import { auth, db } from './firebase-config.js';
import { collection, getDocs, doc, setDoc, writeBatch } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';

const btn = document.getElementById('migrateAllDataBtn');
const fileInput = document.getElementById('legacyDbFile');
const statusEl = document.getElementById('migrationStatus');

function status(t, err=false){ if(statusEl){ statusEl.textContent=t; statusEl.style.color=err?'#b91c1c':'#334155'; } }
function parseJson(v){ if(Array.isArray(v)||(v&&typeof v==='object')) return v; if(typeof v!=='string'||!v.trim()) return v; try{return JSON.parse(v)}catch{return v} }
function cleanRow(r){
  const o={};
  for(const [k,v] of Object.entries(r)){
    if(['rowsJson','rows','attendanceDates','dates','attendanceTimeRows'].includes(k)) o[k]=parseJson(v);
    else o[k]=v;
  }
  if(!Array.isArray(o.rows) && Array.isArray(o.rowsJson)) o.rows=o.rowsJson;
  delete o.rowsJson;
  if(!Array.isArray(o.dates) && Array.isArray(o.attendanceDates)) o.dates=o.attendanceDates;
  return o;
}
function safeId(parts){ return parts.join('__').replace(/[^a-zA-Z0-9가-힣_-]/g,'_').slice(0,1400); }
async function importSheet(wb, sheetName, collectionName, user, keyMaker){
  const ws=wb.Sheets[sheetName]; if(!ws) return {sheetName,count:0,missing:true};
  const rows=XLSX.utils.sheet_to_json(ws,{defval:'',raw:false});
  let count=0;
  for(let i=0;i<rows.length;i++){
    const raw=rows[i]; if(!Object.values(raw).some(v=>String(v??'').trim())) continue;
    const data=cleanRow(raw);
    const id=safeId(keyMaker(data,i));
    data.firestoreId=id; data.migratedFrom='googleSheets'; data.ownerUid=user.uid;
    try { await setDoc(doc(db,collectionName,id),data,{merge:true}); count++; }
    catch(e){ console.error(sheetName,'이전 실패',i+2,e); }
    if((i+1)%25===0) status(`${sheetName} Firebase 이전 중... ${i+1}/${rows.length}`);
  }
  return {sheetName,count,missing:false};
}

btn?.addEventListener('click', async ()=>{
  const file=fileInput?.files?.[0]; const user=auth.currentUser;
  if(!file) return alert('기존 Google Sheets DB 엑셀 파일을 먼저 선택해주세요.');
  if(!user) return alert('로그인 후 이용해주세요.');
  if(!confirm('급여제공계획서·상담일지·출석관리 시트를 Firebase로 이전합니다. 계속할까요?')) return;
  btn.disabled=true;
  try{
    status('DB 엑셀 파일을 읽는 중...');
    const wb=XLSX.read(new Uint8Array(await file.arrayBuffer()),{type:'array',cellDates:true});
    const results=[];
    results.push(await importSheet(wb,'급여제공계획서','carePlans',user,(r,i)=>[r.id||'plan',r.longTermNumber||'',r.writtenDate||'',i+2]));
    results.push(await importSheet(wb,'상담일지','counsels',user,(r,i)=>[r.id||'counsel',r.longTermNumber||r.certNumber||'',r.counselDate||r.writtenDate||r.reflectionDate||'',i+2]));
    results.push(await importSheet(wb,'출석관리','attendance',user,(r,i)=>[r.id||'attendance',r.month||r.attendanceMonth||'',r.longTermNumber||r.certNumber||'',r.name||r.recipientName||'',i+2]));
    const msg=results.map(x=>`${x.sheetName}: ${x.missing?'시트 없음':x.count+'건'}`).join(' / ');
    status('Firebase 전체 이전 완료 · '+msg);
    alert('Firebase 전체 이전이 완료되었습니다.\n'+msg+'\n\n이제 제공확인 페이지는 Google Apps Script가 아니라 Firestore에서 계획서·상담일지·출석을 읽습니다.');
  }catch(e){ console.error(e); status('전체 이전 실패: '+(e.message||e),true); alert('이전 중 오류가 발생했습니다.\n'+(e.message||e)); }
  finally{ btn.disabled=false; }
});
