import {auth,db,onAuthStateChanged,doc,collection,query,where,onSnapshot,serverTimestamp,$,today,profile,msg,safe,periodFor,dueFor,activeUid} from './task-shared.js';
import {setDoc,deleteDoc,addDoc,updateDoc} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';

let uid=null,staff=[],assignments=[],completions=[],schedules=[],handoffs=[],unsubs=[],viewUid=null;

// 기존 직원 선택 드롭다운 대신 이름 버튼을 한 줄씩 자동 배치합니다.
const controls=$('otherTasksControls');
const toggle=$('otherTasksToggle');
const originalSelect=$('otherTasksStaff');
const back=$('myTasksButton');
const viewBar=document.createElement('div');
viewBar.id='taskStaffButtonBar';
viewBar.className='task-staff-button-bar';
viewBar.setAttribute('aria-label','직원별 오늘의 업무 조회');
const style=document.createElement('style');
style.textContent=`
.task-staff-button-bar{display:flex;flex-wrap:wrap;align-items:center;gap:9px;margin:14px 0 18px}
.task-staff-button{appearance:none;border:1px solid #cbd5e1;border-radius:9px;padding:10px 16px;background:#fff;color:#334155;font-size:14px;font-weight:650;cursor:pointer;transition:background .15s,border-color .15s}
.task-staff-button:hover{border-color:#2563eb;background:#eff6ff}
.task-staff-button.active{background:#1d4ed8;border-color:#1d4ed8;color:white}
.task-staff-button:focus-visible{outline:3px solid #93c5fd;outline-offset:2px}
.task-readonly-note{padding:10px 14px;border-radius:8px;background:#eff6ff;color:#1e40af;font-size:13px}
`;
document.head.appendChild(style);
const taskPage=document.querySelector('.task-page');
const oldContainer=document.querySelector('.task-view-controls');
if(oldContainer){oldContainer.replaceWith(viewBar)}else if(taskPage){taskPage.insertBefore(viewBar,$('taskMessage'))}
// 기존 HTML과 호환: 컨트롤은 삭제하지 않고 화면에서만 대체합니다.
if(toggle)toggle.hidden=true;
if(controls)controls.hidden=true;
if(back)back.hidden=true;
if(originalSelect)originalSelect.hidden=true;

function staffName(u){return String(u?.name||u?.displayName||u?.staffName||u?.id||'직원')}
function sortedStaff(){return staff.filter(u=>u.id&&u.id!==uid).sort((a,b)=>{
  const ar=a.role==='admin'?0:1,br=b.role==='admin'?0:1;
  return ar-br||staffName(a).localeCompare(staffName(b),'ko');
})}
function renderStaffButtons(){
  if(!viewBar)return;
  const current=viewUid;
  viewBar.replaceChildren();
  const addButton=(id,name)=>{
    const b=document.createElement('button');
    b.type='button';b.className='task-staff-button'+(current===id?' active':'');
    b.textContent=name;b.setAttribute('aria-pressed',String(current===id));
    b.addEventListener('click',()=>{viewUid=id;renderStaffButtons();render()});
    viewBar.appendChild(b);
  };
  addButton(null,'내 업무');
  sortedStaff().forEach(u=>addButton(u.id,staffName(u)));
  if(viewUid&&!staff.some(u=>u.id===viewUid)){viewUid=null;renderStaffButtons()}
}
function mergeStaff(list){
  const map=new Map(staff.map(u=>[u.id,u]));
  for(const u of list){if(!u?.id)continue;const old=map.get(u.id)||{};
    map.set(u.id,{...old,...u,name:u.name||old.name||u.displayName||u.staffName||u.id,role:u.role||old.role||''});
  }
  staff=[...map.values()];renderStaffButtons();
}
function render(){
  if(!uid)return;
  const date=today();const readOnly=Boolean(viewUid&&viewUid!==uid);const targetUid=readOnly?viewUid:uid;
  const targetName=staffName(staff.find(u=>u.id===targetUid)||{name:'선택한 직원'});
  $('taskDate').textContent=date+' · '+(readOnly?targetName+' 업무 조회 (읽기 전용)':'내 업무 및 마감기한');
  const rows=assignments.filter(a=>a.cycle!=='once'||a.rule<=date).map(a=>({...a,period:periodFor(a,date),due:dueFor(a,date),active:activeUid(a,date,schedules)})).filter(a=>{
    const h=handoffs.find(h=>h.assignmentId===a.id&&h.period===a.period&&h.status==='accepted');
    const pending=handoffs.find(h=>h.assignmentId===a.id&&h.period===a.period&&h.status==='pending');
    a.handoff=h;a.pending=pending;a.effective=h?.toUid||a.active;
    return a.effective===targetUid||(!readOnly&&(pending?.toUid===uid||pending?.fromUid===uid));
  });
  const done=a=>completions.some(c=>c.assignmentId===a.id&&c.period===a.period&&c.completed);
  $('totalCount').textContent=rows.length;$('doneCount').textContent=rows.filter(done).length;
  $('pendingCount').textContent=rows.filter(a=>!done(a)).length;
  msg('taskMessage',rows.length?'':readOnly?'선택한 직원의 업무가 없습니다.':'업무가 없습니다. 근무표 미등록 시 관리자에게 확인하세요.');
  $('taskList').innerHTML=rows.sort((a,b)=>a.due.localeCompare(b.due)).map(a=>{
    const incoming=a.pending?.toUid===uid;const outgoing=a.pending?.fromUid===uid;
    const canComplete=!readOnly&&a.effective===uid&&!incoming&&!outgoing;
    const isDone=done(a);
    const options=staff.filter(u=>u.id!==uid&&schedules.some(s=>s.uid===u.id&&s.date===date&&['○','O','o','△','●','⊙','◐','◑'].includes(String(s.mark||'').trim()))).map(u=>`<option value="${safe(u.id)}">${safe(staffName(u))}</option>`).join('');
    return `<div class="task-item ${isDone?'completed':''}"><div style="width:100%"><label><input type="checkbox" data-id="${safe(a.id)}" data-period="${safe(a.period)}" ${isDone?'checked':''} ${canComplete?'':'disabled'}><span><strong>${safe(a.title)}</strong><small>${safe(a.description||'')}</small><small>마감 ${safe(a.due)} · ${a.handoff?'인계 수락됨':incoming?'인계 요청 수신':outgoing?'인계 수락 대기':a.effective===a.assigneeUid?'주담당':'부담당'}</small></span></label>${!readOnly&&incoming?`<button class="accept-handoff" data-hid="${safe(a.pending.id)}">인계 수락</button><button class="reject-handoff" data-hid="${safe(a.pending.id)}">거절</button>`:''}${canComplete&&!isDone&&!a.handoff?`<div class="handoff-controls"><select class="handoff-to" data-id="${safe(a.id)}"><option value="">인계받을 직원 선택</option>${options}</select><input class="handoff-reason" data-id="${safe(a.id)}" placeholder="인계 사유 (선택)"><button class="handoff-send" data-id="${safe(a.id)}" data-period="${safe(a.period)}">업무 인계 요청</button></div>`:''}</div></div>`;
  }).join('');
  $('taskList').querySelectorAll('input[type=checkbox]').forEach(el=>el.onchange=async()=>{
    el.disabled=true;const id=el.dataset.id,period=el.dataset.period,ref=doc(db,'taskCompletions',`${id}_${period}`);
    try{if(el.checked)await setDoc(ref,{assignmentId:id,period,assigneeUid:uid,completed:true,completedAt:serverTimestamp()});else await deleteDoc(ref)}
    catch(e){alert('완료 저장 실패: '+e.message);el.checked=!el.checked}finally{el.disabled=false}
  });
  $('taskList').querySelectorAll('.handoff-send').forEach(b=>b.onclick=async()=>{
    const toUid=$('taskList').querySelector(`.handoff-to[data-id="${b.dataset.id}"]`).value;
    const reason=$('taskList').querySelector(`.handoff-reason[data-id="${b.dataset.id}"]`).value;
    if(!toUid)return alert('인계받을 직원을 선택하세요.');
    if(!confirm('선택한 직원에게 업무 인계를 요청할까요?'))return;
    try{await addDoc(collection(db,'taskHandoffs'),{assignmentId:b.dataset.id,period:b.dataset.period,fromUid:uid,toUid,reason,status:'pending',createdAt:serverTimestamp()});msg('handoffMessage','업무 인계를 요청했습니다. 상대 직원의 수락을 기다립니다.')}
    catch(e){alert(e.message)}
  });
  $('taskList').querySelectorAll('.accept-handoff,.reject-handoff').forEach(b=>b.onclick=async()=>{
    try{await updateDoc(doc(db,'taskHandoffs',b.dataset.hid),{status:b.classList.contains('accept-handoff')?'accepted':'rejected',respondedAt:serverTimestamp()})}
    catch(e){alert(e.message)}
  });
}
onAuthStateChanged(auth,async user=>{
  unsubs.forEach(f=>f());unsubs=[];
  if(!user)return;uid=user.uid;viewUid=null;
  try{
    const p=await profile(user);$('adminLink').hidden=p.role!=='admin';
    mergeStaff([{id:uid,name:p.name||p.displayName||user.displayName||'내 계정',role:p.role||''}]);
    const watch=(name,cb)=>unsubs.push(onSnapshot(collection(db,name),s=>{cb(s.docs.map(d=>({id:d.id,...d.data()})));render()},e=>msg('taskMessage',name+' 조회 실패: '+e.message)));
    // 직원 목록은 기존 업무 배정/근무표에서도 취합하여 직원 계정의 users 전체 조회 권한에 의존하지 않습니다.
    watch('taskAssignments',x=>{assignments=x;mergeStaff(x.flatMap(a=>[{id:a.assigneeUid,name:a.assigneeName||a.assigneeUid},...(a.backupUid?[{id:a.backupUid,name:a.backupName||a.backupUid}]:[])]))});
    watch('taskCompletions',x=>completions=x);
    watch('staffSchedules',x=>{schedules=x;mergeStaff(x.map(s=>({id:s.uid,name:s.staffName||s.uid})))});
    watch('taskHandoffs',x=>handoffs=x);
    // 관리자는 users 역할값을 통해 정확히 관리자 우선 정렬합니다.
    if(p.role==='admin')watch('users',x=>mergeStaff(x.map(u=>({id:u.id,name:u.name||u.displayName||u.staffName||u.id,role:u.role||''}))));
  }catch(e){msg('taskMessage','사용자 확인 실패: '+e.message)}
});
