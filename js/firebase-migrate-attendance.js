import { auth, db } from './firebase-config.js';
import { doc, setDoc } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';

const btn = document.getElementById('migrateAttendanceBtn');
const input = document.getElementById('legacyAttendanceDbFile');
const status = document.getElementById('attendanceMigrationStatus');

function setStatus(t, error=false){ if(status){ status.textContent=t; status.style.color=error?'#b91c1c':'#334155'; } }
function parse(v){ if(Array.isArray(v)||(v&&typeof v==='object')) return v; if(typeof v!=='string'||!v.trim()) return v; try{return JSON.parse(v)}catch{return v} }
function safeId(parts){ return parts.join('__').replace(/[^a-zA-Z0-9가-힣_-]/g,'_').slice(0,1400); }

btn?.addEventListener('click', async () => {
  const file=input?.files?.[0], user=auth.currentUser;
  if(!file) return alert('기존 Google Sheets DB 엑셀 파일을 선택해주세요.');
  if(!user) return alert('로그인 후 이용해주세요.');
  if(!confirm('엑셀의 출석관리 시트 전체를 Firebase로 이전할까요?\n기존 Firebase 출석자료는 지우지 않고 추가/갱신합니다.')) return;
  btn.disabled=true;
  try{
    setStatus('DB 엑셀을 읽는 중...');
    const wb=XLSX.read(new Uint8Array(await file.arrayBuffer()),{type:'array',cellDates:true});
    const ws=wb.Sheets['출석관리'];
    if(!ws) throw new Error('엑셀에서 "출석관리" 시트를 찾지 못했습니다.');
    const rows=XLSX.utils.sheet_to_json(ws,{defval:'',raw:false});
    let count=0;
    for(let i=0;i<rows.length;i++){
      const r=rows[i]; if(!Object.values(r).some(v=>String(v??'').trim())) continue;
      const dates=parse(r.attendanceDates || r.dates || []);
      const leaveTimes=parse(r.leaveTimes || r.leaveTimesJson || {});
      const attendanceTimeRows=parse(r.attendanceTimeRows || {});
      const id=safeId([r.id||'attendance',r.month||r.attendanceMonth||'',r.longTermNumber||r.certNumber||'',r.recipientName||r.name||'',i+2]);
      await setDoc(doc(db,'attendance',id),{
        ...r, firestoreId:id,
        attendanceDates:Array.isArray(dates)?dates:[], dates:Array.isArray(dates)?dates:[],
        leaveTimes:(leaveTimes&&typeof leaveTimes==='object')?leaveTimes:{},
        attendanceTimeRows:(attendanceTimeRows&&typeof attendanceTimeRows==='object')?attendanceTimeRows:{},
        attendanceCount:Number(r.attendanceCount || (Array.isArray(dates)?dates.length:0)),
        ownerUid:user.uid, migratedFrom:'googleSheets', migratedAt:new Date().toISOString()
      },{merge:true});
      count++;
      if(count%25===0) setStatus(`Firebase 이전 중... ${count}건`);
    }
    setStatus(`출석관리 Firebase 이전 완료 · ${count}건`);
    alert(`출석관리 데이터 ${count}건을 Firebase로 이전했습니다.`);
  }catch(e){ console.error(e); setStatus('이전 실패: '+(e.message||e),true); alert('출석 이전 중 오류가 발생했습니다.\n'+(e.message||e)); }
  finally{ btn.disabled=false; }
});
