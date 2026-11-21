import {auth,db} from './firebase-config.js';
import {onAuthStateChanged} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import {doc,getDoc,onSnapshot,setDoc,serverTimestamp} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
const $=id=>document.getElementById(id),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ref=doc(db,'portalSettings','benefitOpinionMappings');
const freqRef=doc(db,'portalSettings','benefitFrequencyDefaults');
let frequencyDefaults={},frequencyOrder=[],freqUnsub=null;
const allFrequencyNames=()=>[...new Set([...Object.keys(frequencyDefaults).map(decodeURIComponent),...(window.BENEFIT_CATALOG||[]).map(x=>x.name)])];
const orderedNames=()=>allFrequencyNames().sort((a,b)=>{const ai=frequencyOrder.indexOf(a),bi=frequencyOrder.indexOf(b);return (ai<0?Number.MAX_SAFE_INTEGER:ai)-(bi<0?Number.MAX_SAFE_INTEGER:bi)||a.localeCompare(b,'ko')});
let dragName=null;
let entries=[],isAdmin=false,unsub=null;
$('benefitCatalog').innerHTML=(window.BENEFIT_CATALOG||[]).map(x=>`<option value="${esc(x.name)}"></option>`).join('');
// 기본 datalist 화살표는 브라우저별로 클릭 동작이 달라 직접 여닫는 목록을 사용합니다.
(function initTargetBenefitCombo(){
 const input=$('targetBenefit'),button=$('targetBenefitArrow'),panel=$('targetBenefitOptions');
 if(!input||!button||!panel)return;
 const names=[...new Set((window.BENEFIT_CATALOG||[]).map(x=>String(x.name||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ko'));
 let opened=false,active=-1,visible=[];
 const close=()=>{opened=false;panel.hidden=true;input.setAttribute('aria-expanded','false');button.setAttribute('aria-expanded','false');active=-1;};
 const paint=()=>{
  const term=input.value.trim().toLocaleLowerCase();
  visible=names.filter(n=>!term||n.toLocaleLowerCase().includes(term));
  if(!visible.length){panel.innerHTML='<div class="benefit-combo-empty">일치하는 급여가 없습니다. 직접 입력할 수 있습니다.</div>';return;}
  panel.innerHTML=visible.map((n,i)=>`<button type="button" role="option" data-index="${i}" class="benefit-combo-option${i===active?' active':''}">${esc(n)}</button>`).join('');
 };
 const open=(all=false)=>{opened=true;active=-1;if(all){input.dataset.showAll='1';}else{delete input.dataset.showAll;}paint();panel.hidden=false;input.setAttribute('aria-expanded','true');button.setAttribute('aria-expanded','true');};
 const choose=i=>{if(!visible[i])return;input.value=visible[i];input.dispatchEvent(new Event('input',{bubbles:true}));close();input.focus();};
 button.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();if(opened)close();else{input.focus();input.value=input.value;open(true);}});
 input.addEventListener('input',()=>{if(!opened)open();else paint();});
 input.addEventListener('keydown',e=>{if(e.key==='Escape'){close();return;}if(e.key==='ArrowDown'){e.preventDefault();if(!opened)open(true);else{active=Math.min(active+1,visible.length-1);paint();panel.querySelector('.active')?.scrollIntoView({block:'nearest'});}}else if(e.key==='ArrowUp'&&opened){e.preventDefault();active=Math.max(0,active-1);paint();panel.querySelector('.active')?.scrollIntoView({block:'nearest'});}else if(e.key==='Enter'&&opened&&active>=0){e.preventDefault();choose(active);}});
 panel.addEventListener('mousedown',e=>e.preventDefault());
 panel.addEventListener('click',e=>{const opt=e.target.closest('[data-index]');if(opt)choose(Number(opt.dataset.index));});
 document.addEventListener('click',e=>{if(!e.target.closest('.benefit-combo'))close();});
 $('changeKind')?.addEventListener('change',close);
})();
const showStatus=s=>$('adminStatus').textContent=s;
const kindName={replace:'대체',add:'추가',remove:'제외'};
function render(){const q=$('mappingSearch').value.trim().toLowerCase();const filtered=entries.filter(x=>(x.source+' '+x.target+' '+x.text).toLowerCase().includes(q));$('mappingList').innerHTML=filtered.length?filtered.map(x=>`<article class="admin-mapping-item"><strong>${esc(x.source)} ${x.kind==='replace'?'→ '+esc(x.target):''}</strong> <small>(${kindName[x.kind]||'대체'})</small><p>${esc(x.text)}</p><div class="admin-mapping-actions"><button type="button" data-edit="${esc(x.id)}">수정</button><button type="button" class="delete" data-delete="${esc(x.id)}">삭제</button></div></article>`).join(''):'<p class="empty">등록된 문구가 없습니다.</p>';}
function reset(){ $('mappingForm').reset();$('editingId').value='';$('targetWrap').hidden=false;showStatus('');}
$('changeKind').onchange=()=>{$('targetWrap').hidden=$('changeKind').value!=='replace';};
$('resetMapping').onclick=reset;
$('mappingSearch').oninput=render;
$('mappingList').onclick=async e=>{const b=e.target.closest('button');if(!b)return;const id=b.dataset.edit||b.dataset.delete;const item=entries.find(x=>x.id===id);if(!item)return;if(b.dataset.edit){$('editingId').value=id;$('sourceBenefit').value=item.source;$('targetBenefit').value=item.target||'';$('changeKind').value=item.kind||'replace';$('mappingText').value=item.text;$('changeKind').onchange();$('mappingForm').scrollIntoView({behavior:'smooth',block:'center'});return;}if(!confirm('이 문구를 삭제할까요?'))return;await save(entries.filter(x=>x.id!==id));};
async function save(next){if(!isAdmin)throw Error('관리자만 수정할 수 있습니다.');showStatus('저장 중...');try{await setDoc(ref,{entries:next,updatedAt:serverTimestamp()});showStatus('저장했습니다. 다른 직원 화면에 실시간 반영됩니다.');}catch(e){showStatus('저장 실패: '+e.message);}}
$('mappingForm').onsubmit=async e=>{e.preventDefault();const source=$('sourceBenefit').value.trim(),kind=$('changeKind').value,target=$('targetBenefit').value.trim(),text=$('mappingText').value.trim();if(!source||!text)return;if(kind==='replace'&&!target)return alert('대체할 센터 계획 급여를 입력하세요.');const id=$('editingId').value||('map_'+Date.now()+'_'+Math.random().toString(36).slice(2,7));const item={id,source,kind,target:kind==='replace'?target:'',text};const other=entries.filter(x=>x.id!==id);if(other.some(x=>x.kind===kind&&x.source===source&&x.target===item.target))return alert('같은 급여 조합의 문구가 이미 있습니다. 기존 문구를 수정하세요.');await save([...other,item]);reset();};
function captureFrequencyEdits(){
 for(const row of $('frequencyDefaultRows').querySelectorAll('tr[data-benefit]')){
  const old=row.dataset.benefit,name=row.querySelector('.freq-name')?.value.trim();if(!name)continue;
  const val={cycle:row.querySelector('.freq-cycle').value,count:Number(row.querySelector('.freq-count').value||0),minutes:Number(row.querySelector('.freq-minutes').value||0)};
  if(old!==name){delete frequencyDefaults[encodeURIComponent(old)];frequencyOrder=frequencyOrder.map(n=>n===old?name:n)}
  frequencyDefaults[encodeURIComponent(name)]=val;
 }
}
function frequencyRender(){
 const q=$('frequencySearch').value.trim().toLowerCase();
 $('frequencyDefaultRows').innerHTML=orderedNames().filter(n=>n.toLowerCase().includes(q)).map(n=>{const v=frequencyDefaults[encodeURIComponent(n)]||{};return `<tr data-benefit="${esc(n)}" draggable="true"><td class="freq-grip" title="끌어서 순서 변경" aria-label="${esc(n)} 순서 이동">⠿</td><td><input class="freq-name" value="${esc(n)}" aria-label="급여명"></td><td><select class="freq-cycle">${['일','주','월','필요시'].map(c=>`<option value="${c}" ${v.cycle===c?'selected':''}>${c}</option>`).join('')}</select></td><td><input class="freq-count" type="number" min="0" step="1" value="${esc(v.count??1)}"></td><td><input class="freq-minutes" type="number" min="0" step="1" value="${esc(v.minutes??10)}"></td><td><button type="button" class="secondary freq-remove" title="기본값 제거">삭제</button></td></tr>`}).join('');
}
const frequencyRows=$('frequencyDefaultRows');
frequencyRows.addEventListener('dragstart',e=>{const row=e.target.closest('tr[data-benefit]');if(!row||!e.target.closest('.freq-grip')){e.preventDefault();return;}captureFrequencyEdits();dragName=row.dataset.benefit;e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',dragName);row.classList.add('freq-dragging')});
frequencyRows.addEventListener('dragover',e=>{const row=e.target.closest('tr[data-benefit]');if(!dragName||!row)return;e.preventDefault();e.dataTransfer.dropEffect='move';frequencyRows.querySelectorAll('.freq-drop-target').forEach(x=>x.classList.remove('freq-drop-target'));row.classList.add('freq-drop-target')});
frequencyRows.addEventListener('drop',e=>{e.preventDefault();const row=e.target.closest('tr[data-benefit]');if(!row||!dragName)return;const target=row.dataset.benefit;if(target!==dragName){const order=orderedNames().filter(n=>n!==dragName);order.splice(order.indexOf(target),0,dragName);frequencyOrder=order;frequencyRender();$('frequencyDefaultStatus').textContent='순서가 변경되었습니다. 「기본값 저장」을 눌러 적용하세요.';}dragName=null});
frequencyRows.addEventListener('dragend',()=>{dragName=null;frequencyRows.querySelectorAll('.freq-dragging,.freq-drop-target').forEach(x=>x.classList.remove('freq-dragging','freq-drop-target'))});
$('frequencySearch').oninput=()=>{captureFrequencyEdits();frequencyRender()};
$('addFrequencyRow').onclick=()=>{captureFrequencyEdits();const name=prompt('추가할 센터 급여명');if(!name?.trim())return;frequencyDefaults[encodeURIComponent(name.trim())]??={cycle:'일',count:1,minutes:10};$('frequencySearch').value=name.trim();frequencyRender();};
$('frequencyDefaultRows').onclick=e=>{if(!e.target.closest('.freq-remove'))return;const row=e.target.closest('tr');if(!confirm('이 급여의 기본 횟수 설정을 삭제할까요?'))return;delete frequencyDefaults[encodeURIComponent(row.dataset.benefit)];frequencyOrder=frequencyOrder.filter(n=>n!==row.dataset.benefit);row.remove();$('frequencyDefaultStatus').textContent='변경사항을 적용하려면 기본값 저장을 누르세요.';};
$('saveFrequencyDefaults').onclick=async()=>{if(!isAdmin)return;captureFrequencyEdits();const order=orderedNames();try{$('frequencyDefaultStatus').textContent='저장 중…';await setDoc(freqRef,{values:frequencyDefaults,order,updatedAt:serverTimestamp()});frequencyOrder=order;$('frequencyDefaultStatus').textContent='기본값과 급여 순서 저장 완료 · 직원 화면에 실시간 반영됩니다.';}catch(e){$('frequencyDefaultStatus').textContent='저장 실패: '+e.message;}};
onAuthStateChanged(auth,async user=>{if(unsub){unsub();unsub=null;}if(freqUnsub){freqUnsub();freqUnsub=null;}if(!user){$('adminAccess').textContent='로그인이 필요합니다.';return;}try{const u=await getDoc(doc(db,'users',user.uid));isAdmin=u.exists()&&u.data().role==='admin';$('adminAccess').hidden=isAdmin;$('adminWorkspace').hidden=!isAdmin;if(!isAdmin){$('adminAccess').textContent='관리자만 문구를 등록하거나 수정할 수 있습니다.';return;}freqUnsub=onSnapshot(freqRef,s=>{frequencyDefaults=s.exists()?s.data().values||{}:{};frequencyOrder=s.exists()&&Array.isArray(s.data().order)?s.data().order:[];frequencyRender()},e=>$('frequencyDefaultStatus').textContent='불러오기 실패: '+e.message);unsub=onSnapshot(ref,s=>{entries=s.exists()?s.data().entries||[]:[];render();},e=>showStatus('불러오기 실패: '+e.message));}catch(e){$('adminAccess').textContent='권한 확인 실패: '+e.message;}});
