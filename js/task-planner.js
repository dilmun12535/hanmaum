// 먼저 화면을 그린 후 Firebase 모듈을 비동기로 연결합니다.
// 연결 실패 시 빈 영역 대신 원인을 화면에 표시합니다.
import { addDoc, setDoc, updateDoc, deleteDoc } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
let auth,db,onAuthStateChanged,collection,onSnapshot,doc,serverTimestamp,today,safe,periodFor,dueFor,activeUid;
today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
safe=t=>String(t??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

const host=document.getElementById('dailyPlanner');
if(host){host.innerHTML='<div class="planner-head"><div><h2>나의 일일 업무 플래너</h2><p>왼쪽 업무를 오른쪽 시간표로 드래그해 배치하세요.</p></div><span class="planner-readonly">연결 중</span></div><div class="planner-columns"><section class="planner-backlog"><h3>내 업무</h3><p>업무 목록을 불러오는 중입니다.</p></section><section class="planner-timeline"><h3>시간표</h3><div class="planner-empty">로그인 확인 중...</div></section></div><p class="planner-message" id="plannerMessage" role="status"></p>';}
let me=null,target=null,personal=[],plans=[],assignments=[],templates=[],schedules=[],handoffs=[],completions=[],unsubs=[];
const workingMarks=new Set(['○','O','o','●','⊙','◐','◑','△']);
function handoffStaff(){
 const people=new Map();
 schedules.forEach(x=>people.set(x.uid,{uid:x.uid,name:x.staffName||x.uid}));
 assignments.forEach(a=>{if(a.assigneeUid)people.set(a.assigneeUid,{uid:a.assigneeUid,name:a.assigneeName||a.assigneeUid});if(a.backupUid)people.set(a.backupUid,{uid:a.backupUid,name:a.backupName||a.backupUid})});
 return [...people.values()].filter(x=>x.uid!==me&&schedules.some(y=>y.uid===x.uid&&y.date===today()&&workingMarks.has(String(y.mark||'').trim()))).sort((a,b)=>a.name.localeCompare(b.name,'ko'));
}
const pad=n=>String(n).padStart(2,'0');
const times=Array.from({length:14},(_,i)=>`${pad(8+i)}:00`);
const durations=[60,120,180,240];
const keyFor=a=>'assigned:'+a.id;
const planId=(user,date,key)=>encodeURIComponent(user+'|'+date+'|'+key);
const options=(selected,values)=>values.map(v=>`<option value="${safe(v)}" ${String(selected)===String(v)?'selected':''}>${safe(v)}</option>`).join('');
const done=a=>completions.some(c=>c.assignmentId===a.id&&c.period===a.period&&c.completed);
function visibleAssignments(date){return assignments.filter(a=>a.cycle!=='once'||a.rule<=date).map(a=>({...a,period:periodFor(a,date),due:dueFor(a,date),active:activeUid(a,date,schedules)})).filter(a=>{
 a.handoff=handoffs.find(h=>h.assignmentId===a.id&&h.period===a.period&&h.status==='accepted');
 a.pending=handoffs.find(h=>h.assignmentId===a.id&&h.period===a.period&&h.status==='pending');
 a.effective=a.handoff?.toUid||a.active;
 return a.effective===target||(target===me&&(a.pending?.toUid===me||a.pending?.fromUid===me));
});}
function items(){const date=today();const assigned=visibleAssignments(date).map(a=>({key:keyFor(a),title:a.title,type:'assigned',done:done(a),due:a.due,assignment:a}));const mine=personal.filter(p=>p.ownerUid===target&&p.date===date).map(p=>({key:'personal:'+p.id,title:p.title,type:'personal',done:!!p.completed,id:p.id}));return [...assigned,...mine].map(i=>({...i,plan:plans.find(p=>p.ownerUid===target&&p.date===date&&p.taskKey===i.key)}));}
function card(i,readonly){const p=i.plan,a=i.assignment,incoming=a?.pending?.toUid===me,outgoing=a?.pending?.fromUid===me;
 const canComplete=!readonly&&(!a||(a.effective===me&&!incoming&&!outgoing));
 const status=a?(incoming?'인계 요청 수신':outgoing?'인계 수락 대기':a.handoff?'인계 수락됨':a.effective===a.assigneeUid?'주담당':'부담당'):'개인 업무';
 const checkbox=`<label class="planner-complete"><input type="checkbox" data-action="check" data-key="${safe(i.key)}" ${i.done?'checked':''} ${canComplete?'':'disabled'}><span>완료</span></label>`;
 const opts=handoffStaff().map(u=>`<option value="${safe(u.uid)}">${safe(u.name)}</option>`).join('');
 const handoff=!readonly&&a&&canComplete&&!i.done&&!a.handoff?`<details class="planner-handoff"><summary>업무 인계</summary><div class="planner-handoff-fields"><select class="planner-handoff-to" aria-label="인계받을 직원"><option value="">직원 선택</option>${opts}</select><input class="planner-handoff-reason" placeholder="인계 사유 (선택)" maxlength="200"><button class="planner-small planner-send" data-action="handoff" data-key="${safe(i.key)}">인계 요청</button></div></details>`:'';
 const response=!readonly&&incoming?`<div class="planner-handoff-actions"><button class="planner-small" data-action="accept" data-hid="${safe(a.pending.id)}">인계 수락</button><button class="planner-small danger" data-action="reject" data-hid="${safe(a.pending.id)}">거절</button></div>`:'';
 return `<div class="planner-task ${i.done?'is-done':''}" draggable="${!readonly}" data-key="${safe(i.key)}"><span class="planner-grip" aria-hidden="true">⠿</span><div class="planner-task-main"><div class="planner-task-top"><div class="planner-task-text"><strong>${safe(i.title)}</strong><small>${safe(status)}${i.due?' · 마감 '+safe(i.due):''}${p?' · '+p.duration+'분':''}</small></div>${checkbox}</div>${handoff}${response}</div>${!readonly&&i.type==='personal'?`<button class="planner-small danger" data-action="delete" data-id="${safe(i.id)}">삭제</button>`:''}${!readonly&&p?`<button class="planner-small" data-action="unplan" data-key="${safe(i.key)}">시간 해제</button>`:''}</div>`;
}
function render(){if(!host||!me)return;const readonly=target!==me;const all=items();const unplanned=all.filter(i=>!i.plan?.start);const planned=all.filter(i=>i.plan?.start);host.innerHTML=`<div class="planner-head"><div><h2>${readonly?'직원 업무 플래너 (조회 전용)':'나의 일일 업무 플래너'}</h2><p>${today()} · 배정 업무와 개인 업무를 시간표에 배치하세요.</p></div>${!readonly?'<button class="planner-primary" id="plannerAddToggle">+ 내 업무 추가</button>':'<span class="planner-readonly">조회 전용</span>'}</div>
${!readonly?`<form id="plannerForm" class="planner-form" hidden><label>업무명<input id="plannerTitle" maxlength="120" placeholder="예: 상담일지 정리" required></label><label>시작 시간<select id="plannerStart">${options('13:00',times)}</select></label><label>예상 소요<select id="plannerDuration">${durations.map(d=>`<option value="${d}" ${d===60?'selected':''}>${d}분</option>`).join('')}</select></label><button class="planner-primary" type="submit">등록</button></form>`:''}
<div class="planner-summary"><span>전체 <b>${all.length}</b></span><span>완료 <b>${all.filter(i=>i.done).length}</b></span><span>시간 배치 <b>${planned.length}</b></span></div>
<div class="planner-columns"><section class="planner-backlog"><h3>내 업무 목록 <small>미배치 ${unplanned.length}개</small></h3><p>업무를 오른쪽 시간대로 끌어놓거나 시간 선택으로 배치하세요.</p>${unplanned.map(i=>card(i,readonly)).join('')||'<div class="planner-empty">미배정 업무가 없습니다.</div>'}</section><section class="planner-timeline"><h3>시간별 업무 배치 <small>08:00 ~ 22:00 · 1시간 단위</small></h3><div class="planner-scroll">${times.map(t=>`<div class="planner-slot" data-time="${t}"><div class="planner-clock">${t}</div><div class="planner-slot-body">${planned.filter(i=>i.plan.start===t || (i.plan.start?.slice(0,2)===t.slice(0,2) && i.plan.start?.endsWith(':30'))).map(i=>card(i,readonly)).join('')||'<span class="planner-slot-hint">여기에 놓기</span>'}</div></div>`).join('')}</div></section></div>
${!readonly?`<div class="planner-adjust"><label>시간 배치할 업무<select id="plannerPick"><option value="">업무 선택</option>${all.map(i=>`<option value="${safe(i.key)}">${safe(i.title)}</option>`).join('')}</select></label><label>시작<select id="plannerPickTime">${options('09:00',times)}</select></label><label>소요<select id="plannerPickDuration">${durations.map(d=>`<option value="${d}">${d}분</option>`).join('')}</select></label><button class="planner-primary" id="plannerPlace">시간 배치</button></div>`:''}<p class="planner-message" id="plannerMessage" role="status"></p>`;
if(readonly)return;
host.querySelector('#plannerAddToggle').onclick=()=>{const f=host.querySelector('#plannerForm');f.hidden=!f.hidden};
host.querySelector('#plannerForm').onsubmit=async e=>{e.preventDefault();const title=host.querySelector('#plannerTitle').value.trim();if(!title)return;const start=host.querySelector('#plannerStart').value,duration=Number(host.querySelector('#plannerDuration').value);try{const ref=await addDoc(collection(db,'personalTasks'),{ownerUid:me,date:today(),title,completed:false,createdAt:serverTimestamp()});await savePlan('personal:'+ref.id,start,duration)}catch(err){error(err)}};
host.querySelector('#plannerPlace').onclick=async()=>{const key=host.querySelector('#plannerPick').value;if(!key)return error('업무를 선택하세요.');await savePlan(key,host.querySelector('#plannerPickTime').value,Number(host.querySelector('#plannerPickDuration').value))};
host.querySelectorAll('[data-action]').forEach(b=>{
 const action=b.dataset.action;
 const handler=async()=>{const item=all.find(i=>i.key===b.dataset.key);try{
  if(action==='manual'){openManual(item);return;}
      if(action==='check'){
   if(!item||target!==me)return;
   if(item.type==='personal')await updateDoc(doc(db,'personalTasks',item.id),{completed:b.checked,updatedAt:serverTimestamp()});
   else{const a=item.assignment;if(a.effective!==me||a.pending)return;const ref=doc(db,'taskCompletions',`${a.id}_${a.period}`);if(b.checked)await setDoc(ref,{assignmentId:a.id,period:a.period,assigneeUid:me,completed:true,completedAt:serverTimestamp()});else await deleteDoc(ref)}
  }else if(action==='delete'){
   if(!confirm('개인 업무를 삭제할까요?'))return;
   const key='personal:'+b.dataset.id,p=plans.find(p=>p.ownerUid===me&&p.date===today()&&p.taskKey===key);
   if(p)await deleteDoc(doc(db,'taskTimePlans',p.id));await deleteDoc(doc(db,'personalTasks',b.dataset.id));
  }else if(action==='unplan')await deleteDoc(doc(db,'taskTimePlans',planId(me,today(),b.dataset.key)));
  else if(action==='handoff'){
   const a=item?.assignment;if(!a||a.effective!==me||a.pending||item.done)return;
   const area=b.closest('.planner-handoff'),toUid=area.querySelector('.planner-handoff-to').value,reason=area.querySelector('.planner-handoff-reason').value.trim();
   if(!toUid)return error('인계받을 직원을 선택하세요.');if(!confirm('선택한 직원에게 업무 인계를 요청할까요?'))return;
   await addDoc(collection(db,'taskHandoffs'),{assignmentId:a.id,period:a.period,fromUid:me,toUid,reason,status:'pending',createdAt:serverTimestamp()});
  }else if(action==='accept'||action==='reject'){
   const h=handoffs.find(h=>h.id===b.dataset.hid);if(!h||h.toUid!==me||h.status!=='pending')return;
   await updateDoc(doc(db,'taskHandoffs',h.id),{status:action==='accept'?'accepted':'rejected',respondedAt:serverTimestamp()});
  }
 }catch(err){if(action==='check')b.checked=!b.checked;error(err)}};
 b.addEventListener(action==='check'?'change':'click',handler);
});
host.querySelectorAll('.planner-task[draggable=true]').forEach(el=>{el.addEventListener('dragstart',e=>{if(e.target.closest('button,input,select,details')){e.preventDefault();return;}e.dataTransfer.setData('text/plain',el.dataset.key);e.dataTransfer.effectAllowed='move';el.classList.add('dragging')});el.addEventListener('dragend',()=>el.classList.remove('dragging'))});
host.querySelectorAll('.planner-slot').forEach(el=>{el.addEventListener('dragover',e=>{e.preventDefault();el.classList.add('drag-over')});el.addEventListener('dragleave',()=>el.classList.remove('drag-over'));el.addEventListener('drop',async e=>{e.preventDefault();el.classList.remove('drag-over');const key=e.dataTransfer.getData('text/plain');if(!all.some(i=>i.key===key))return;const existing=plans.find(p=>p.ownerUid===me&&p.date===today()&&p.taskKey===key);await savePlan(key,el.dataset.time,existing?.duration||60)})});}
async function savePlan(key,start,duration){if(target!==me)return;try{await setDoc(doc(db,'taskTimePlans',planId(me,today(),key)),{ownerUid:me,date:today(),taskKey:key,start,duration,updatedAt:serverTimestamp()})}catch(err){error(err)}}
function error(err){if(!host)return;const node=host.querySelector('#plannerMessage');const text=typeof err==='string'?err:'저장 실패: '+(err?.message||String(err));if(node)node.textContent=text;else host.insertAdjacentHTML('beforeend','<p class="planner-message" role="alert">'+safe(text)+'</p>')}
window.addEventListener('task-staff-view-change',e=>{target=e.detail.uid||me;render()});
async function boot(){
  if(!host)return;
  try{
    const shared=await import('./task-shared.js');
    ({auth,db,onAuthStateChanged,collection,onSnapshot,doc,serverTimestamp,today,safe,periodFor,dueFor,activeUid}=shared);
    onAuthStateChanged(auth,user=>{
      unsubs.forEach(f=>f());unsubs=[];
      me=user?.uid||null;target=me;
      if(!me){host.innerHTML='<p class="planner-message">로그인이 필요합니다.</p>';return;}
      render();
      const watch=(name,cb)=>unsubs.push(onSnapshot(collection(db,name),s=>{
        cb(s.docs.map(d=>({id:d.id,...d.data()})));render();
      },e=>error(name+' 조회 실패: '+e.message)));
      watch('personalTasks',v=>personal=v);
      watch('taskTimePlans',v=>plans=v);
      watch('taskAssignments',v=>assignments=v);
      watch('taskTemplates',v=>templates=v);
      watch('staffSchedules',v=>schedules=v);
      watch('taskHandoffs',v=>handoffs=v);
      watch('taskCompletions',v=>completions=v);
    },e=>error('로그인 상태 확인 실패: '+e.message));
  }catch(e){
    host.innerHTML='<div class="planner-head"><div><h2>일일 업무 플래너</h2><p>플래너 초기화 중 오류가 발생했습니다.</p></div></div><p class="planner-message" role="alert">'+safe(e.message||String(e))+'</p>';
    console.error('[일일 업무 플래너]',e);
  }
}
window.addEventListener('error',e=>{if(e.filename?.includes('task-planner'))error('스크립트 오류: '+e.message)});
boot();

function openManual(item){
 const a=item?.assignment,t=templates.find(x=>x.id===a?.templateId),m=t?.manual||{};
 let modal=document.getElementById('taskManualViewer');
 if(!modal){modal=document.createElement('dialog');modal.id='taskManualViewer';modal.className='task-manual-dialog';document.body.appendChild(modal);}
 const link=/^https?:\/\//i.test(m.link||'')?`<p><a href="${safe(m.link)}" target="_blank" rel="noopener noreferrer">참고 링크 열기</a></p>`:'';
 modal.innerHTML=`<div class="task-manual-view"><h2>${safe(item.title)} · 업무 매뉴얼</h2>${m.overview||m.steps||m.cautions||m.link?`<h3>업무 개요</h3><p>${safe(m.overview||'-')}</p><h3>진행 순서</h3><p>${safe(m.steps||'-')}</p><h3>주의사항</h3><p>${safe(m.cautions||'-')}</p>${link}`:'<p>아직 등록된 매뉴얼이 없습니다. 관리자에게 문의하세요.</p>'}<button type="button" class="manual-close">닫기</button></div>`;
 modal.querySelector('.manual-close').onclick=()=>modal.close();modal.showModal();
}
