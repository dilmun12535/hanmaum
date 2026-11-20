import {manualEditorMarkup,wireManualEditor} from './task-manual-rich.js';
import {auth,db,onAuthStateChanged,doc,collection,query,where,onSnapshot,addDoc,updateDoc,deleteDoc,serverTimestamp,$,today,profile,msg,safe,activeUid} from './task-shared.js';
import {getDocs, getDoc, setDoc} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
let me=null, staff=[], templates=[], assignments=[], completions=[], schedules=[], handoffs=[], selected=null, unsubs=[];
const chosenRoles=new Map();
const roleFor=id=>chosenRoles.get(id)||'primary';
$('filterDate').value=today();
const cycles={daily:'매일',weekly:'매주',monthly:'매월',yearly:'매년',once:'1회성'};
const pad=n=>String(n).padStart(2,'0');
function keyFor(t,date){const d=new Date(date+'T12:00:00');if(t.cycle==='daily')return date;if(t.cycle==='once')return t.rule===date?date:null;if(t.cycle==='monthly')return date.slice(0,7);if(t.cycle==='yearly')return date.slice(0,4);if(t.cycle==='weekly'){const day=d.getDay(),diff=(day+6)%7;d.setDate(d.getDate()-diff);return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;}return null}
function dueFor(t,date){const d=new Date(date+'T12:00:00');if(t.cycle==='daily')return date;if(t.cycle==='once')return t.rule;if(t.cycle==='monthly'){const [y,m]=date.split('-').map(Number),last=new Date(y,m,0).getDate();return `${y}-${pad(m)}-${pad(t.rule==='last'?last:Math.min(last,Number(t.rule)||last))}`;}if(t.cycle==='yearly'){const [month,day]=String(t.rule).split('-').map(Number),y=Number(date.slice(0,4));if(!month||!day)return date;const last=new Date(y,month,0).getDate();return `${y}-${pad(month)}-${pad(Math.min(day,last))}`;}if(t.cycle==='weekly'){const offset=(Number(t.rule)-d.getDay()+7)%7;d.setDate(d.getDate()+offset);return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;}return date}
function setRules(){
 const c=$('taskCycle').value,wrap=$('dueWrap');let el=$('taskRule')||$('taskOnceDate')||$('taskYearlyRule');
 wrap.firstChild.textContent=c==='once'?'마감 날짜':c==='yearly'?'매년 마감일':'마감 기준';
 if(c==='once'||c==='yearly'){
   const inp=document.createElement('input');inp.type=c==='once'?'date':'text';inp.id=c==='once'?'taskOnceDate':'taskYearlyRule';inp.required=true;
   if(c==='once')inp.value=today();else{inp.placeholder='예: 12-20';inp.pattern='(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])';inp.title='월-일 형식으로 입력하세요. 예: 12-20';inp.value='12-20'}
   el.replaceWith(inp);return;
 }
 if(el.id!=='taskRule'){const sel=document.createElement('select');sel.id='taskRule';el.replaceWith(sel);el=sel;}
 const opts=c==='daily'?[['당일','당일 마감']]:c==='weekly'?[['1','월요일'],['2','화요일'],['3','수요일'],['4','목요일'],['5','금요일'],['6','토요일'],['0','일요일']]:[...Array.from({length:31},(_,i)=>[String(i+1),`${i+1}일`]),['last','말일']];
 el.innerHTML=opts.map(([v,t])=>`<option value="${v}">${t}</option>`).join('');
}
$('taskCycle').addEventListener('change',setRules);setRules();
const label=t=>t.cycle==='daily'?'당일 마감':t.cycle==='weekly'?['일','월','화','수','목','금','토'][Number(t.rule)]+'요일 마감':t.cycle==='monthly'?(t.rule==='last'?'말일':t.rule+'일')+' 마감':t.cycle==='yearly'?String(t.rule).replace('-','월 ')+'일 마감':t.rule;
function renderTemplates(){
 const search=$('taskSearch').value.trim();
 $('taskTemplates').innerHTML=templates.filter(t=>t.title.includes(search)).map(t=>{
 const linked=assignments.filter(a=>a.templateId===t.id);
 const names=linked.flatMap(a=>[{name:a.assigneeName||staff.find(u=>u.id===a.assigneeUid)?.name||'이름 없음',role:'주',id:a.assigneeUid},...(a.backupUid?[{name:a.backupName||staff.find(u=>u.id===a.backupUid)?.name||'이름 없음',role:'부',id:a.backupUid}]:[])]);
 const unique=[...new Map(names.map(n=>[n.id+'_'+n.role,n])).values()];
 return `<div class="task-item task-template ${selected===t.id?'selected':''}" draggable="true" tabindex="0" data-id="${safe(t.id)}"><div class="task-template-info"><strong>${safe(t.title)}</strong><small>${cycles[t.cycle]||''} · ${safe(label(t))}</small><small>${safe(t.description||'')}</small><div class="task-assignees"><span class="task-assignee-title">배정 ${unique.length}명</span>${unique.length?unique.map(n=>`<span class="task-assignee-chip">${safe(n.name)} (${n.role})</span>`).join(''):'<span class="task-meta">미배정</span>'}</div></div><div class="task-template-actions"><label class="task-role-label">담당 <select class="task-role-select" data-id="${safe(t.id)}" aria-label="${safe(t.title)} 담당 구분"><option value="primary" ${roleFor(t.id)==='primary'?'selected':''}>주담당</option><option value="backup" ${roleFor(t.id)==='backup'?'selected':''}>부담당</option></select></label><button type="button" class="task-manual-edit" data-id="${safe(t.id)}">매뉴얼 ${t.manual?'수정':'작성'}</button><button type="button" class="task-select" data-id="${safe(t.id)}">선택</button><button type="button" class="task-delete-template" data-id="${safe(t.id)}">삭제</button></div></div>`;
 }).join('')||'<p class="task-meta">등록된 업무가 없습니다.</p>';
 $('taskTemplates').querySelectorAll('.task-template').forEach(el=>{el.addEventListener('dragstart',e=>{if(e.target.closest('button,select')){e.preventDefault();return}selected=el.dataset.id;e.dataTransfer.setData('text/plain',selected);e.dataTransfer.setData('application/x-hanmaum-role',roleFor(selected));e.dataTransfer.effectAllowed='copy'});el.addEventListener('click',e=>{if(e.target.closest('button,select'))return;selected=el.dataset.id;renderTemplates()});el.addEventListener('keydown',e=>{if(e.key==='Enter'){selected=el.dataset.id;renderTemplates()}})});
 $('taskTemplates').querySelectorAll('.task-manual-edit').forEach(b=>b.onclick=()=>editManual(b.dataset.id));
 $('taskTemplates').querySelectorAll('.task-role-select').forEach(sel=>sel.addEventListener('change',()=>chosenRoles.set(sel.dataset.id,sel.value)));
 $('taskTemplates').querySelectorAll('.task-select').forEach(b=>b.onclick=()=>{selected=b.dataset.id;renderTemplates()});
 $('taskTemplates').querySelectorAll('.task-delete-template').forEach(b=>b.onclick=async()=>{if(!confirm('등록된 업무를 삭제할까요? 기존 배정은 별도로 유지됩니다.'))return;try{await deleteDoc(doc(db,'taskTemplates',b.dataset.id))}catch(e){alert(e.message)}})
}
async function assign(tid,uid,role='primary'){
 const t=templates.find(x=>x.id===tid),u=staff.find(x=>x.id===uid);if(!t||!u)return;
 const related=assignments.filter(a=>a.templateId===tid);
 if(role==='backup'){
   const candidates=related.filter(a=>a.assigneeUid!==uid);
   if(!candidates.length){msg('adminMessage','먼저 다른 직원에게 주담당자를 지정하세요.');return}
   let base=candidates.find(a=>!a.backupUid);
   if(candidates.length>1){
     const choices=candidates.map((a,i)=>`${i+1}. ${a.assigneeName} (현재 부: ${a.backupName||'미지정'})`).join('\n');
     const answer=prompt('어느 주담당자의 부담당자로 배정할까요? 번호를 입력하세요.\n'+choices, String(Math.max(1,candidates.indexOf(base)+1)));
     if(answer===null)return;const idx=Number(answer)-1;if(!Number.isInteger(idx)||idx<0||idx>=candidates.length){msg('adminMessage','올바른 주담당 번호를 선택하세요.');return}base=candidates[idx];
   }else base=candidates[0];
   if(base.backupUid===uid){msg('adminMessage','이미 해당 주담당자의 부담당자로 배정되어 있습니다.');return}
   try{await updateDoc(doc(db,'taskAssignments',base.id),{backupUid:uid,backupName:u.name});msg('adminMessage',`${u.name} 직원을 ${base.assigneeName} 주담당의 부담당자로 지정했습니다.`)}catch(e){alert(e.message)}return;
 }
 if(related.some(a=>a.assigneeUid===uid)){msg('adminMessage','해당 직원은 이미 이 업무의 주담당자입니다.');return}
 try{await addDoc(collection(db,'taskAssignments'),{templateId:tid,title:t.title,description:t.description||'',cycle:t.cycle,rule:t.rule,assigneeUid:uid,assigneeName:u.name,backupUid:'',backupName:'',createdBy:me.uid,createdAt:serverTimestamp()});msg('adminMessage',`${u.name} 직원에게 주담당 업무를 배정했습니다.`)}catch(e){alert('업무 배정 실패: '+e.message)}
}
function renderBoard(){
 $('staffBoard').innerHTML=staff.map(u=>`<div class="staff-drop" data-uid="${safe(u.id)}"><h3>${safe(u.name)} ${u.role==='admin'?'<span class="task-admin-chip">관리자</span>':''} <small class="task-meta">(${assignments.filter(a=>a.assigneeUid===u.id||a.backupUid===u.id).length}개)</small></h3>${assignments.filter(a=>a.assigneeUid===u.id||a.backupUid===u.id).map(a=>`<div class="staff-assignment"><span><strong>${safe(a.title)}</strong><small class="task-meta">${a.assigneeUid===u.id?'주담당':'부담당'} · ${cycles[a.cycle]||''} · ${safe(label(a))}</small>${a.backupUid&&a.assigneeUid===u.id?`<small class="task-meta">부담당: ${safe(a.backupName)}</small>`:''}</span><button type="button" class="task-delete" data-id="${safe(a.id)}" data-role="${a.assigneeUid===u.id?'primary':'backup'}">해제</button></div>`).join('')||'<p class="task-meta">여기로 업무를 끌어다 놓으세요.</p>'}</div>`).join('')||'<p>직원 정보가 없습니다. Firebase users 컬렉션을 확인하세요.</p>';
 $('staffBoard').querySelectorAll('.staff-drop').forEach(el=>{el.addEventListener('dragover',e=>{e.preventDefault();el.classList.add('drag-over')});el.addEventListener('dragleave',()=>el.classList.remove('drag-over'));el.addEventListener('drop',e=>{e.preventDefault();el.classList.remove('drag-over');assign(e.dataTransfer.getData('text/plain'),el.dataset.uid,e.dataTransfer.getData('application/x-hanmaum-role')||roleFor(e.dataTransfer.getData('text/plain')))});el.addEventListener('click',e=>{if(e.target.closest('button'))return;if(selected)assign(selected,el.dataset.uid,roleFor(selected))})});
 $('staffBoard').querySelectorAll('.task-delete').forEach(b=>b.onclick=async()=>{const isBackup=b.dataset.role==='backup';if(!confirm(isBackup?'이 직원의 부담당 배정만 해제할까요?':'이 직원의 주담당 배정을 해제할까요? 해당 주담당의 부담당도 함께 해제됩니다.'))return;try{if(isBackup)await updateDoc(doc(db,'taskAssignments',b.dataset.id),{backupUid:'',backupName:''});else await deleteDoc(doc(db,'taskAssignments',b.dataset.id))}catch(e){alert(e.message)}})
}
function renderStatus(){const date=$('filterDate').value;const rows=assignments.filter(a=>a.cycle!=='once'||a.rule<=date).map(a=>{const period=keyFor(a,date),due=dueFor(a,date);const done=completions.find(c=>c.assignmentId===a.id&&c.period===period);const active=activeUid(a,date,schedules);const transfer=handoffs.find(h=>h.assignmentId===a.id&&h.period===period&&h.status==='accepted');return {...a,due,done,active,transfer}});$('adminTasks').innerHTML=rows.map(a=>`<div class="task-item ${a.done?.completed?'completed':''}"><div><strong>${safe(a.title)}</strong><small>${safe(a.assigneeName)} (부: ${safe(a.backupName||"미지정")}) · 당일 담당: ${safe(staff.find(u=>u.id===(a.transfer?.toUid||a.active))?.name||"미배정/근무표 확인")} · ${cycles[a.cycle]} · 마감 ${safe(a.due)} · ${a.done?.completed?'완료 ('+safe(staff.find(u=>u.id===a.done.assigneeUid)?.name||a.done.assigneeUid)+')':a.due<date?'기한 초과':'미완료'}</small></div></div>`).join('')||'<p>조회할 업무가 없습니다.</p>';msg('adminMessage',`${date} · 배정 ${rows.length}건 / 완료 ${rows.filter(a=>a.done?.completed).length}건`)}
$('taskSearch').addEventListener('input',renderTemplates);$('filterDate').addEventListener('change',renderStatus);
$('templateForm').addEventListener('submit',async e=>{e.preventDefault();const b=e.submitter;b.disabled=true;try{await addDoc(collection(db,'taskTemplates'),{title:$('taskTitle').value.trim(),description:$('taskDescription').value.trim(),cycle:$('taskCycle').value,rule:$('taskCycle').value==='once'?$('taskOnceDate').value:$('taskCycle').value==='yearly'?$('taskYearlyRule').value:$('taskRule').value,createdBy:me.uid,createdAt:serverTimestamp()});$('taskTitle').value='';$('taskDescription').value='';msg('adminMessage','업무를 등록했습니다. 왼쪽 목록에서 오른쪽 직원에게 끌어다 놓으세요.')}catch(err){alert('업무 등록 실패: '+err.message)}finally{b.disabled=false}});
onAuthStateChanged(auth,async user=>{unsubs.forEach(f=>f());unsubs=[];if(!user)return;me=user;try{const p=await profile(user);if(p.role!=='admin'){msg('adminMessage','관리자만 접근할 수 있습니다.');return}const snap=await getDocs(collection(db,'users'));staff=snap.docs.map(d=>({id:d.id,name:d.data().name||d.data().displayName||d.data().email||d.id,role:d.data().role||''})).sort((a,b)=>(b.role==='admin')-(a.role==='admin')||a.name.localeCompare(b.name,'ko')); $('adminWorkspace').hidden=false;const watch=(coll,cb)=>unsubs.push(onSnapshot(collection(db,coll),s=>{cb(s.docs.map(d=>({id:d.id,...d.data()})));renderTemplates();renderBoard();renderStatus()},e=>msg('adminMessage',`${coll} 조회 실패: ${e.message}`)));watch('taskTemplates',x=>templates=x);watch('taskAssignments',x=>assignments=x);watch('taskCompletions',x=>completions=x);watch('staffSchedules',x=>schedules=x);watch('taskHandoffs',x=>handoffs=x)}catch(e){msg('adminMessage','관리자 화면 로딩 실패: '+e.message)}});

// 근무표: 날짜 헤더는 1\n화 형태, A열 번호 B열 이름, C열 직종
$('scheduleUpload').onclick=async()=>{const file=$('scheduleFile').files[0];if(!file){msg('scheduleMessage','엑셀 파일을 선택하세요.');return}const button=$('scheduleUpload');button.disabled=true;try{if(!window.XLSX)throw Error('엑셀 읽기 라이브러리를 불러오지 못했습니다.');const wb=XLSX.read(await file.arrayBuffer(),{type:'array'});const ws=wb.Sheets[wb.SheetNames[0]];const rows=XLSX.utils.sheet_to_json(ws,{header:1,defval:''});const header=rows.findIndex(r=>String(r[1]).trim()==='근무자');if(header<0)throw Error('근무자 열을 찾을 수 없습니다.');const range=rows.slice(0,header).flat().map(String).join(' ');const match=range.match(/(20\d{2})[.\-/](\d{1,2})[.\-/]\d{1,2}/);if(!match)throw Error('근무표 상단에서 연도와 월을 찾지 못했습니다.');const year=+match[1],month=+match[2];const cols=rows[header].map((v,i)=>({i,day:parseInt(String(v).trim(),10)})).filter(x=>x.i>=3&&x.day>=1&&x.day<=31);let count=0,unknown=[];for(const row of rows.slice(header+1)){const name=String(row[1]||'').trim();if(!name)continue;const person=staff.find(u=>u.name.trim()===name);if(!person){unknown.push(name);continue}for(const {i,day} of cols){const mark=String(row[i]||'').trim();if(!mark)continue;const date=`${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;await setDoc(doc(db,'staffSchedules',`${person.id}_${date}`),{uid:person.id,date,mark,staffName:person.name,updatedBy:me.uid,updatedAt:serverTimestamp()});count++}}msg('scheduleMessage',`${count}건 저장 완료.${unknown.length?' 직원명 미일치: '+[...new Set(unknown)].join(', '):''}`)}catch(e){msg('scheduleMessage','근무표 업로드 실패: '+e.message)}finally{button.disabled=false}};

// Firebase에 저장된 직원별 월간 근무표 조회 및 개별 수정
let schedulePanelOpen=false;
const scheduleMonthEl=$('scheduleMonth'),scheduleStaffEl=$('scheduleStaff');
scheduleMonthEl.value=today().slice(0,7);
$('scheduleToggle').addEventListener('click',()=>{schedulePanelOpen=!schedulePanelOpen;$('schedulePanel').hidden=!schedulePanelOpen;$('scheduleToggle').setAttribute('aria-expanded',String(schedulePanelOpen));$('scheduleToggle').textContent=schedulePanelOpen?'근무표 접기':'저장된 근무표 보기';if(schedulePanelOpen)renderScheduleTable()});
scheduleMonthEl.addEventListener('change',renderScheduleTable);scheduleStaffEl.addEventListener('change',renderScheduleTable);
function renderScheduleTable(){
 if(!schedulePanelOpen)return;const month=scheduleMonthEl.value;if(!/^\d{4}-\d{2}$/.test(month)){msg('scheduleEditMessage','조회 월을 선택하세요.');return}
 const prior=scheduleStaffEl.value;scheduleStaffEl.innerHTML='<option value="">전체 직원</option>'+staff.map(u=>`<option value="${safe(u.id)}">${safe(u.name)}</option>`).join('');scheduleStaffEl.value=staff.some(u=>u.id===prior)?prior:'';
 const members=staff.filter(u=>!scheduleStaffEl.value||u.id===scheduleStaffEl.value);const [year,mon]=month.split('-').map(Number),days=new Date(year,mon,0).getDate();
 const records=schedules.filter(s=>s.date?.startsWith(month+'-'));const byKey=new Map(records.map(s=>[s.uid+'_'+s.date,s]));
 msg('scheduleCount',`${records.length}건 저장 · ${members.length}명 표시`);
 const head=Array.from({length:days},(_,i)=>`<th>${i+1}</th>`).join('');
 $('scheduleTable').innerHTML=`<table class="schedule-grid"><thead><tr><th>직원</th>${head}</tr></thead><tbody>${members.map(u=>`<tr><td>${safe(u.name)}</td>${Array.from({length:days},(_,i)=>{const date=month+'-'+pad(i+1),rec=byKey.get(u.id+'_'+date),mark=rec?.mark||'';return `<td><select class="schedule-mark ${['○','O','o','●','⊙'].includes(mark)?'work':['◐','◑','△'].includes(mark)?'half':mark?'off':''}" data-uid="${safe(u.id)}" data-date="${date}" aria-label="${safe(u.name)} ${date} 근무 상태"><option value="" ${!mark?'selected':''}>미등록</option>${[['○','○ 근무'],['◐','◐ 반차'],['◑','◑ 반차'],['X','X 휴무'],['-','－ 휴무']].map(([v,l])=>`<option value="${v}" ${mark===v?'selected':''}>${l}</option>`).join('')}${mark&&!['○','◐','◑','X','-'].includes(mark)?`<option selected value="${safe(mark)}">${safe(mark)}</option>`:''}</select></td>`}).join('')}</tr>`).join('')}</tbody></table>`;
 $('scheduleTable').querySelectorAll('.schedule-mark').forEach(sel=>{sel.addEventListener('change',async()=>{const mark=sel.value,uid=sel.dataset.uid,date=sel.dataset.date,person=staff.find(u=>u.id===uid);if(!mark){msg('scheduleEditMessage','미등록으로 변경하려면 기존 기록을 삭제하는 기능이 필요합니다. 근무 또는 휴무 기호를 선택하세요.');renderScheduleTable();return}sel.disabled=true;try{await setDoc(doc(db,'staffSchedules',`${uid}_${date}`),{uid,date,mark,staffName:person?.name||uid,updatedBy:me.uid,updatedAt:serverTimestamp()});msg('scheduleEditMessage',`${person?.name||uid} · ${date} · ${mark} 저장 완료`)}catch(e){msg('scheduleEditMessage','근무표 수정 실패: '+e.message);renderScheduleTable()}finally{sel.disabled=false}})});
}
// 기존 실시간 리스너가 근무표 변경을 수신하면 조회 화면도 갱신
const oldRenderSchedule=renderStatus;renderStatus=function(){oldRenderSchedule();renderScheduleTable()};

// 매뉴얼은 업무 템플릿에 저장하며 관리자만 수정할 수 있습니다.
function editManual(id){
 const t=templates.find(x=>x.id===id);if(!t)return;
 let modal=document.getElementById('taskManualEditor');
 if(!modal){modal=document.createElement('dialog');modal.id='taskManualEditor';modal.className='task-manual-dialog';document.body.appendChild(modal);}
 const m=t.manual||{};
 modal.innerHTML=`<form class="task-manual-form"><h2>${safe(t.title)} · 매뉴얼 편집</h2>
 ${manualEditorMarkup(m)}
 <div class="task-manual-buttons"><button type="button" class="manual-cancel">닫기</button><button type="submit">저장</button></div><p class="manual-editor-message" role="status"></p></form>`;
 const getHtml=wireManualEditor(modal);
 modal.querySelector('.manual-cancel').onclick=()=>modal.close();
 modal.querySelector('form').onsubmit=async e=>{
  e.preventDefault();const f=e.currentTarget,btn=f.querySelector('[type=submit]');btn.disabled=true;
  try{await updateDoc(doc(db,'taskTemplates',id),{manual:{...m,html:getHtml()},manualUpdatedAt:serverTimestamp()});modal.close();}
  catch(err){f.querySelector('.manual-editor-message').textContent='저장 실패: '+err.message;btn.disabled=false;}
 };
 modal.showModal();
}
