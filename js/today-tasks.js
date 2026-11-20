import {auth,db,onAuthStateChanged,collection,onSnapshot,today,profile,msg,periodFor,dueFor,activeUid} from './task-shared.js';

// 오늘의 업무: 직원 선택과 요약 현황만 담당합니다.
// 완료 체크, 인계, 개인 업무 및 시간 배치는 task-planner.js에서 처리합니다.
let uid=null,staff=[],assignments=[],completions=[],schedules=[],handoffs=[],unsubs=[],viewUid=null;
const $=id=>document.getElementById(id);
const controls=$('otherTasksControls');
const toggle=$('otherTasksToggle');
const originalSelect=$('otherTasksStaff');
const back=$('myTasksButton');
const oldContainer=document.querySelector('.task-view-controls');
const taskPage=document.querySelector('.task-page');
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
/* 기존 하단 중복 업무 목록은 화면에서 제거합니다. */
#taskList,#handoffMessage{display:none!important}
`;
document.head.appendChild(style);
if(oldContainer)oldContainer.replaceWith(viewBar);
else if(taskPage)taskPage.insertBefore(viewBar,$('taskMessage'));
if(toggle)toggle.hidden=true;
if(controls)controls.hidden=true;
if(back)back.hidden=true;
if(originalSelect)originalSelect.hidden=true;
if($('taskList'))$('taskList').replaceChildren();
if($('handoffMessage'))$('handoffMessage').replaceChildren();

function staffName(u){return String(u?.name||u?.displayName||u?.staffName||u?.id||'직원')}
function sortedStaff(){return staff.filter(u=>u.id&&u.id!==uid).sort((a,b)=>{
  const ar=a.role==='admin'?0:1,br=b.role==='admin'?0:1;
  return ar-br||staffName(a).localeCompare(staffName(b),'ko');
})}
function notifyPlanner(){window.dispatchEvent(new CustomEvent('task-staff-view-change',{detail:{uid:viewUid||uid}}))}
function renderStaffButtons(){
  const current=viewUid;
  viewBar.replaceChildren();
  const addButton=(id,name)=>{
    const b=document.createElement('button');
    b.type='button';
    b.className='task-staff-button'+(current===id?' active':'');
    b.textContent=name;
    b.setAttribute('aria-pressed',String(current===id));
    b.addEventListener('click',()=>{viewUid=id;renderStaffButtons();render();notifyPlanner()});
    viewBar.appendChild(b);
  };
  addButton(null,'내 업무');
  sortedStaff().forEach(u=>addButton(u.id,staffName(u)));
  if(viewUid&&!staff.some(u=>u.id===viewUid)){
    viewUid=null;renderStaffButtons();notifyPlanner();
  }
}
function mergeStaff(list){
  const map=new Map(staff.map(u=>[u.id,u]));
  for(const u of list){
    if(!u?.id)continue;
    const old=map.get(u.id)||{};
    map.set(u.id,{...old,...u,name:u.name||old.name||u.displayName||u.staffName||u.id,role:u.role||old.role||''});
  }
  staff=[...map.values()];
  renderStaffButtons();
}
function render(){
  if(!uid)return;
  const date=today();
  const readOnly=Boolean(viewUid&&viewUid!==uid);
  const targetUid=readOnly?viewUid:uid;
  const targetName=staffName(staff.find(u=>u.id===targetUid)||{name:'선택한 직원'});
  if($('taskDate'))$('taskDate').textContent=date+' · '+(readOnly?targetName+' 업무 조회 (읽기 전용)':'내 업무 및 마감기한');
  const rows=assignments.filter(a=>a.cycle!=='once'||a.rule<=date)
    .map(a=>({...a,period:periodFor(a,date),due:dueFor(a,date),active:activeUid(a,date,schedules)}))
    .filter(a=>{
      const accepted=handoffs.find(h=>h.assignmentId===a.id&&h.period===a.period&&h.status==='accepted');
      const pending=handoffs.find(h=>h.assignmentId===a.id&&h.period===a.period&&h.status==='pending');
      a.effective=accepted?.toUid||a.active;
      return a.effective===targetUid||(!readOnly&&(pending?.toUid===uid||pending?.fromUid===uid));
    });
  const done=a=>completions.some(c=>c.assignmentId===a.id&&c.period===a.period&&c.completed);
  if($('totalCount'))$('totalCount').textContent=rows.length;
  if($('doneCount'))$('doneCount').textContent=rows.filter(done).length;
  if($('pendingCount'))$('pendingCount').textContent=rows.filter(a=>!done(a)).length;
  // 플래너가 유일한 업무 조작 화면입니다. 기존 하단 카드를 생성하지 않습니다.
  if($('taskList'))$('taskList').replaceChildren();
  if($('handoffMessage'))$('handoffMessage').replaceChildren();
  if(rows.length)msg('taskMessage','');
  else msg('taskMessage',readOnly?'선택한 직원의 배정 업무가 없습니다.':'배정 업무가 없습니다. 개인 업무는 플래너에서 추가할 수 있습니다.');
}
onAuthStateChanged(auth,async user=>{
  unsubs.forEach(f=>f());unsubs=[];
  if(!user){uid=null;return;}
  uid=user.uid;viewUid=null;staff=[];
  try{
    const p=await profile(user);
    if($('adminLink'))$('adminLink').hidden=p.role!=='admin';
    mergeStaff([{id:uid,name:p.name||p.displayName||user.displayName||'내 계정',role:p.role||''}]);
    const watch=(name,cb)=>unsubs.push(onSnapshot(collection(db,name),s=>{
      cb(s.docs.map(d=>({id:d.id,...d.data()})));render();
    },e=>msg('taskMessage',name+' 조회 실패: '+e.message)));
    watch('taskAssignments',x=>{
      assignments=x;
      mergeStaff(x.flatMap(a=>[{id:a.assigneeUid,name:a.assigneeName||a.assigneeUid},...(a.backupUid?[{id:a.backupUid,name:a.backupName||a.backupUid}]:[])]));
    });
    watch('taskCompletions',x=>completions=x);
    watch('staffSchedules',x=>{
      schedules=x;
      mergeStaff(x.map(s=>({id:s.uid,name:s.staffName||s.uid})));
    });
    watch('taskHandoffs',x=>handoffs=x);
    if(p.role==='admin')watch('users',x=>mergeStaff(x.map(u=>({id:u.id,name:u.name||u.displayName||u.staffName||u.id,role:u.role||''}))));
    render();
  }catch(e){msg('taskMessage','사용자 확인 실패: '+e.message)}
});
