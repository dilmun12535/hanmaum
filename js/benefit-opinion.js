(()=>{'use strict';
const $=id=>document.getElementById(id),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const norm=s=>String(s||'').normalize('NFKC').replace(/[\s·ㆍ.,()\-]/g,'').toLowerCase();
const catalog=window.BENEFIT_CATALOG||[];
let drafts={},draftId='',step=0,mappings=[],templates={},frequencyDefaults={},frequencyOrder=[],admin=false,saveTimer;
const empty=()=>({title:'새 계획서',recommended:[],extra:[],provided:[],frequencies:{},goals:{},decisions:{},fee:{},commonReason:'',diseases:'',opinion:'',fileName:''});
const current=()=>drafts[draftId];const all=()=>[...catalog,...(current()?.extra||[])];
const storageKey=()=> 'hanmaum-benefit-wizard-local-v2';
function persist(){if(!current())return;try{localStorage.setItem(storageKey(),JSON.stringify({drafts,draftId}));$('draftStatus').textContent='이 브라우저에 임시 저장됨';}catch(e){$('draftStatus').textContent='임시 저장 실패: '+e.message;}}
function scheduleSave(){clearTimeout(saveTimer);$('draftStatus').textContent='임시 저장 중…';saveTimer=setTimeout(persist,180)}
function makeDraft(){const id='draft-'+Date.now()+'-'+Math.random().toString(36).slice(2,7);drafts[id]=empty();draftId=id;step=0;render();persist()}
function loadLocalDrafts(){
 drafts={};draftId='';
 try{const raw=JSON.parse(localStorage.getItem(storageKey())||'{}');
  if(raw.drafts&&typeof raw.drafts==='object'&&!Array.isArray(raw.drafts))drafts=raw.drafts;
  if(raw.draftId&&drafts[raw.draftId])draftId=raw.draftId;
 }catch(e){console.warn('임시 계획서 복원 실패',e)}
 if(!draftId){draftId=Object.keys(drafts)[0]||'';}
 if(!draftId)makeDraft();else render();
 $('draftStatus').textContent='이 PC의 브라우저에 임시 저장됨';
}
function options(){const d=current();if(!d)return;const sel=$('draftPicker');sel.innerHTML=Object.entries(drafts).map(([id,v])=>`<option value="${esc(id)}" ${id===draftId?'selected':''}>${esc(v.title||'새 계획서')}</option>`).join('');$('draftTitle').value=d.title||'';}
function stepRender(){document.querySelectorAll('[data-panel]').forEach(el=>el.hidden=Number(el.dataset.panel)!==step);document.querySelectorAll('[data-step]').forEach(b=>{b.classList.toggle('active',Number(b.dataset.step)===step);b.setAttribute('aria-current',Number(b.dataset.step)===step?'step':'false')});$('prevStep').disabled=step===0;$('nextStep').textContent=step===4?'작성 완료':'다음 단계 →';$('stepIndicator').textContent=(step+1)+' / 5';}
function render(){const d=current();if(!d)return;options();stepRender();leftRender();rightRender();frequencyRender();goalRender();diffRender();feeRender();$('commonReason').value=d.commonReason||'';$('diseases').value=d.diseases||'';$('opinion').value=d.opinion||'';$('fileStatus').textContent=d.fileName?`${d.fileName} · 급여 ${d.provided.length}개 (임시 분석 결과)`:'업로드된 파일이 없습니다.';}
function groupList(items){const groups=new Map();items.forEach(c=>{const g=c.group||'기타';if(!groups.has(g))groups.set(g,[]);groups.get(g).push(c)});return [...groups].map(([g,rows])=>`<section class="benefit-group"><h3>${esc(g)} <small>${rows.length}개</small></h3>${rows.map(c=>`<label class="benefit-row"><input type="checkbox" data-left="${esc(c.name)}" ${current().recommended.includes(c.name)?'checked':''}><span><b>${esc(c.name)}</b><small>${esc(c.detail||'')}</small></span></label>`).join('')}</section>`).join('')}
function leftRender(){const q=norm($('leftSearch').value),items=all().filter(c=>norm(c.name+' '+c.group+' '+(c.detail||'')).includes(q));$('leftItems').innerHTML=groupList(items)||'<p class="empty">검색 결과가 없습니다.</p>';$('leftItems').querySelectorAll('[data-left]').forEach(x=>x.onchange=()=>{const d=current(),name=x.dataset.left;d.recommended=x.checked?[...new Set([...d.recommended,name])]:d.recommended.filter(v=>v!==name);scheduleSave();diffRender()})}
function rightRender(){const d=current(),q=norm($('rightSearch').value);$('rightItems').innerHTML=d.provided.filter(x=>norm(x.name+' '+x.detail).includes(q)).map(x=>`<div class="benefit-row read-only"><span class="check-icon">✓</span><span><b>${esc(x.name)}</b><small>${esc([x.detail,x.frequency,x.minutes?x.minutes+'분':''].filter(Boolean).join(' · '))}</small></span></div>`).join('')||'<p class="empty">센터 계획 급여가 없습니다. 엑셀을 업로드하세요.</p>'}
function parseFrequency(raw){const t=String(raw||'').replace(/\s/g,'');if(t==='필요시'||t==='필요시제공'||t==='수시')return {cycle:'필요시',count:'1'};
const m=t.match(/^(일|주|월)\s*(\d+)(?:회)?$/);return m?{cycle:m[1],count:m[2]}:{cycle:'일',count:'1'};}
// 관리자 기본값은 필요내용그룹 또는 세부 급여명으로 등록될 수 있음.
const canonicalGroup = g => ({'피부청결유지화장 등 외모관리':'피부청결유지','의사소통, 정서':'의사소통.정서','인지기능프로그램':'인지기능 프로그램','가족대상 프로그램':'가족대상프로그램','환경관리':'환경정리'})[g] || g;
const catalogGroups=new Map(catalog.map(x=>[norm(x.name),canonicalGroup(x.group)]));
const goalCodes=new Map(Object.entries({A10:['옷갈아입기','세면하기','양치하기','몸씻기','머리감기','몸단장','손발톱 정리','피부청결유지','머리단장'],A20:['식사하기'],A50:['이동'],A60:['화장실 이용하기'],A80:['약복용'],A90:['관절움직임(신체)'],C10:['행동변화'],D10:['의사소통.정서'],G10:['외출','병원동행'],K30:['기초건강관리','교육 상담','감염간호'],M10:['신체 인지기능 향상 프로그램','신체기능의 훈련','기본동작 훈련','일상생활동작 훈련','인지기능 프로그램','사회적응훈련','가족대상프로그램','물리치료','작업치료'],M20:['응급서비스'],M30:['송영서비스','환경정리','물품관리']}).flatMap(([code,groups])=>groups.map(g=>[norm(g),code])));
function frequencyKeys(x){return [...new Set([x.name,catalogGroups.get(norm(x.name)),x.group].filter(Boolean).map(norm))];}
function frequencyRank(x){const keys=frequencyKeys(x);const i=frequencyOrder.findIndex(n=>keys.includes(norm(n)));return i<0?Number.MAX_SAFE_INTEGER:i;}
function orderedProvided(d){return [...d.provided].sort((a,b)=>frequencyRank(a)-frequencyRank(b));}
function frequencyDefault(x){const exact=frequencyDefaults[encodeURIComponent(x.name)];if(exact)return exact;const keys=frequencyKeys(x);return Object.entries(frequencyDefaults).find(([k])=>keys.includes(norm(decodeURIComponent(k))))?.[1]||{};}
function groupedProvided(d){
 const groups=new Map();
 for(const x of orderedProvided(d)){
  const raw=catalogGroups.get(norm(x.name))||x.group||x.name;
  const name=canonicalGroup(raw);
  const key=norm(name);
  if(!groups.has(key))groups.set(key,{...x,name,group:undefined,members:[]});
  groups.get(key).members.push(x);
 }
 return [...groups.values()].sort((a,b)=>frequencyRank(a)-frequencyRank(b));
}
function frequencyRender(){
 const d=current(), container=$('frequencyItems');
 const groups=groupedProvided(d);
 const quickNames=["식사하기","약복용"];
 const quick=d.quickCounts||(d.quickCounts={});
 const rows=groups.map((x,i)=>{
  const v=Object.assign({},...x.members.map(m=>d.frequencies[m.name]||{}),d.frequencies[x.name]||{}),def=frequencyDefault(x);
  const original=parseFrequency(x.frequency);
  const cycle=v.cycle??def.cycle??original.cycle;
  const manualCount=quickNames.includes(x.name)&&quick[x.name]!==undefined&&quick[x.name]!==""?quick[x.name]:v.count;
  const count=manualCount!==undefined && manualCount!==null && String(manualCount).trim()!=='' ? manualCount : (def.count??original.count);
  const minutes=v.minutes??def.minutes??x.minutes??'10';
  const group=x.serviceType||'주야간보호';
  const code=goalCodes.get(norm(x.name))||x.code||x.goalCode||'';
  return `<tr><td class="frequency-status">${i+1}</td><td class="frequency-code">${esc(code)}</td><td class="frequency-service">${esc(group)}</td><th scope="row">${esc(x.name)}</th><td><select aria-label="${esc(x.name)} 주기" data-cycle="${esc(x.name)}">${['일','주','월','필요시'].map(z=>`<option value="${z}" ${cycle===z?'selected':''}>${z}</option>`).join('')}</select></td><td><input aria-label="${esc(x.name)} 횟수" type="number" min="0" step="1" inputmode="numeric" data-count="${esc(x.name)}" value="${esc(count)}"></td><td><input aria-label="${esc(x.name)} 시간(분)" type="number" min="0" step="1" inputmode="numeric" data-minutes="${esc(x.name)}" value="${esc(minutes)}"></td></tr>`;
 });
 container.innerHTML=rows.length?`<div class="frequency-table-wrap"><table class="frequency-plan-table"><colgroup><col style="width:5%"><col style="width:9%"><col style="width:15%"><col><col style="width:10%"><col style="width:10%"><col style="width:11%"></colgroup><thead><tr><th>NO</th><th>세부 목표 코드</th><th>급여종류</th><th>필요내용그룹</th><th>주기</th><th>횟수</th><th>시간 (분)</th></tr></thead><tbody>${rows.join('')}</tbody></table></div><p class="frequency-note">같은 필요내용그룹은 한 줄로 표시됩니다. 관리자 기본값이 자동 적용됩니다. 식사하기·약복용 등 직접 입력한 횟수가 우선 적용되며 현재 계획서에만 저장됩니다. 횟수를 비우면 기본값으로 돌아갑니다.</p>`:'<p class="empty">2단계에서 센터 계획서를 업로드하세요.</p>';
 const quickBox=document.createElement('section');
 quickBox.style.cssText='background:#eff5ff;border:1px solid #cbdcf5;border-radius:10px;padding:16px;margin:0 0 16px';
 quickBox.innerHTML=`<strong>식사 및 복약 횟수 설정</strong><div style="display:flex;flex-wrap:wrap;gap:16px;margin-top:12px">${quickNames.map((name,i)=>`<label style="flex:1;min-width:160px">${i===0?'식사':'복약'} 횟수 (일)<span style="display:flex;align-items:center;gap:8px;margin-top:6px"><input style="width:100%;min-width:0" type="number" min="0" step="1" inputmode="numeric" data-quick-count="${name}" placeholder="관리자 기본값" value="${esc(quick[name]??'')}">회</span></label>`).join('')}</div><small style="display:block;margin-top:10px;color:#526987">입력한 횟수가 아래 급여 목록에 우선 반영됩니다. 비워두면 관리자 기본값을 적용합니다.</small>`;
 container.prepend(quickBox);
 quickBox.querySelectorAll('[data-quick-count]').forEach(el=>el.addEventListener('input',()=>{
  if(el.value!==''&&(!el.validity.valid||!Number.isInteger(Number(el.value))))return;
  const name=el.dataset.quickCount;
  if(el.value===''){delete quick[name];for(const key of [name,...(groups.find(g=>g.name===name)?.members||[]).map(m=>m.name)]){if(d.frequencies[key])delete d.frequencies[key].count;}}
  else quick[name]=el.value;
  const row=Array.from(container.querySelectorAll('[data-count]')).find(x=>x.dataset.count===name);
  const g=groups.find(x=>x.name===name);
  if(row&&g)row.value=quick[name]??frequencyDefault(g).count??parseFrequency(g.frequency).count;
  persist();
 }));
 container.querySelectorAll('[data-cycle],[data-count],[data-minutes]').forEach(el=>el.addEventListener('input',()=>{
  const name=el.dataset.cycle||el.dataset.count||el.dataset.minutes;
  const v=d.frequencies[name]||{};
  const field=el.hasAttribute('data-cycle')?'cycle':el.hasAttribute('data-count')?'count':'minutes';
  if(field==='count' && el.value==='') delete v.count;
  else if(field==='count' && (!Number.isInteger(Number(el.value)) || Number(el.value)<0)) return;
  else v[field]=el.value;
  if(field==='count'&&quickNames.includes(name)){if(el.value==='')delete quick[name];else quick[name]=el.value;const top=Array.from(quickBox.querySelectorAll('[data-quick-count]')).find(x=>x.dataset.quickCount===name);if(top)top.value=el.value;}
  d.frequencies[name]=v;persist();
 }));
 container.querySelectorAll('[data-count]').forEach(el=>el.addEventListener('change',()=>{if(el.value===''||!el.validity.valid)frequencyRender();}));
}
let goalDefaults={},goalLoaded=false,goalError='';
function goalText(x){return goalDefaults[encodeURIComponent(x.name)]??Object.entries(goalDefaults).find(([k])=>norm(decodeURIComponent(k))===norm(x.name))?.[1]??'';}
async function copyGoal(text){if(!text)return;try{await navigator.clipboard.writeText(text);}catch{const t=document.createElement('textarea');t.value=text;document.body.append(t);t.select();const ok=document.execCommand('copy');t.remove();if(!ok)return alert('복사하지 못했습니다.');}$('goalStatus').textContent='복사 완료';}
function goalGroups(d){const groups=new Map();for(const g of groupedProvided(d)){const code=goalCodes.get(norm(g.name))||g.code||g.goalCode||'';const key=code||norm(g.name);if(!groups.has(key))groups.set(key,{code,names:[],texts:new Set()});const row=groups.get(key);row.names.push(g.name);for(const x of g.members){const v=goalText(x);if(v)row.texts.add(v.trim());}const v=goalText(g);if(v)row.texts.add(v.trim());}return [...groups.values()].map(g=>({...g,text:[...g.texts].filter(Boolean).join('\n')}));}
function goalRender(){const d=current();if(!d)return;$('goalStatus').textContent=goalError?'불러오기 실패: '+goalError:goalLoaded?'':'관리자 세부 목표 불러오는 중…';const rows=goalGroups(d);$('goalItems').innerHTML=rows.map((g,i)=>`<div class="wizard-field-card"><div style="display:flex;align-items:center;justify-content:space-between;gap:12px"><strong>${esc([g.code,g.names.join(' · ')].filter(Boolean).join(' | '))}</strong><button type="button" class="secondary" data-goal-copy="${i}" ${g.text?'':'disabled'}>복사</button></div><p style="white-space:pre-wrap;margin-top:10px">${esc(g.text||(goalLoaded?'관리자 등록 문구 없음':'불러오는 중…'))}</p></div>`).join('')||'<p class="empty">2단계에서 센터 계획서를 업로드하세요.</p>';$('goalItems').querySelectorAll('[data-goal-copy]').forEach(b=>b.onclick=()=>copyGoal(rows[Number(b.dataset.goalCopy)].text));}
$('copyAllGoals').onclick=()=>{const rows=goalGroups(current()).filter(g=>g.text).map(g=>[g.code,g.names.join(' · ')].filter(Boolean).join(' | ')+'\n'+g.text);if(!rows.length)return alert('등록된 세부 목표가 없습니다.');copyGoal(rows.join('\n\n'));};
window.benefitGoalsChanged=x=>{goalDefaults=x||{};goalLoaded=true;goalError='';goalRender();};window.benefitGoalsError=x=>{goalError=x;goalRender();};
function getRows(wb){const results=[];for(const sheet of wb.SheetNames){const rows=XLSX.utils.sheet_to_json(wb.Sheets[sheet],{header:1,defval:'',raw:false});let header=-1,col=-1,detailCol=-1,freqCol=-1,minCol=-1;for(let i=0;i<rows.length;i++){const r=rows[i].map(v=>String(v??'').replace(/\s+/g,''));const ix=r.findIndex(v=>v==='장기요양필요내용'||v==='필요내용');if(ix>=0){header=i;col=ix;detailCol=r.findIndex(v=>v==='세부제공내용');freqCol=r.findIndex(v=>v.startsWith('횟수'));minCol=r.findIndex(v=>v.startsWith('시간'));break}}if(header<0)continue;for(let i=header+1;i<rows.length;i++){const r=rows[i],name=String(r[col]??'').trim();if(!name||name==='장기요양필요내용'||name==='필요내용')continue;if(name.includes('종합의견')||name.includes('총괄확인자'))break;results.push({name,detail:detailCol>=0?String(r[detailCol]||'').trim():'',frequency:freqCol>=0?String(r[freqCol]||'').trim():'',minutes:minCol>=0?String(r[minCol]||'').trim():''})}}return results}
function mappingMatches(){const d=current(),provided=d.provided.map(x=>x.name),add=provided.filter(k=>!d.recommended.some(r=>norm(r)===norm(k))),remove=d.recommended.filter(k=>!provided.some(p=>norm(p)===norm(k))),usedA=new Set(),usedR=new Set(),matches=[];for(const m of mappings){if(m.kind!=='replace')continue;const a=add.find(x=>norm(x)===norm(m.target)),r=remove.find(x=>norm(x)===norm(m.source));if(a&&r&&!usedA.has(a)&&!usedR.has(r)){matches.push({...m,source:r,target:a});usedA.add(a);usedR.add(r)}}return {matches,add:add.filter(x=>!usedA.has(x)),remove:remove.filter(x=>!usedR.has(x))}}
function diffRender(){const d=current();if(!d)return;const {matches,add,remove}=mappingMatches();$('leftCount').textContent=d.recommended.length;$('rightCount').textContent=d.provided.length;$('addCount').textContent=add.length;$('removeCount').textContent=remove.length;const all=[...add.map(name=>({name,kind:'add'})),...remove.map(name=>({name,kind:'remove'}))];$('diffItems').innerHTML=matches.map(m=>`<div class="diff-row"><div class="diff-title"><span class="diff-tag">대체 자동매칭</span><strong>${esc(m.source)} → ${esc(m.target)}</strong></div><p>${esc(m.text||'등록된 문구가 없습니다.')}</p></div>`).join('')+all.map(x=>{const key=x.kind+':'+x.name,v=d.decisions[key]||{};return `<div class="diff-row"><div class="diff-title"><span class="diff-tag ${x.kind}">${x.kind==='add'?'추가 후보':'제외 후보'}</span><strong>${esc(x.name)}</strong></div><div class="diff-fields"><label>처리<select data-kind="${esc(key)}"><option value="${x.kind}" ${!v.kind||v.kind===x.kind?'selected':''}>${x.kind==='add'?'추가':'제외'}</option><option value="replace" ${v.kind==='replace'?'selected':''}>대체</option><option value="ignore" ${v.kind==='ignore'?'selected':''}>출력 제외</option></select></label><label>대체 대상 급여<input data-replace="${esc(key)}" value="${esc(v.replace||'')}" placeholder="대체 급여"></label><label>사유<input data-reason="${esc(key)}" value="${esc(v.reason||'')}" placeholder="선택 입력"></label></div></div>`}).join('')||(!matches.length?'<p class="empty">차이가 있는 급여가 없습니다.</p>':'');$('diffItems').querySelectorAll('[data-kind],[data-replace],[data-reason]').forEach(el=>el.oninput=()=>{const key=el.dataset.kind||el.dataset.replace||el.dataset.reason;const field=el.dataset.kind?'kind':el.dataset.replace?'replace':'reason';(d.decisions[key]??={})[field]=el.value;scheduleSave()})}
function templateFor(name,kind,target){const mapping=mappings.find(m=>m.kind===kind&&norm(m.source)===norm(name)&&(kind!=='replace'||!target||norm(m.target)===norm(target)));return mapping?.text||templates[encodeURIComponent(name)]?.[kind]||''}
function fill(s,name,target,reason){const disease=(current()?.diseases||'').trim();return String(s).replaceAll('{질환}',disease||'[질환 입력 필요]').replaceAll('{질환명}',disease||'[질환 입력 필요]').replaceAll('{급여명}',name).replaceAll('{공단급여}',name).replaceAll('{센터급여}',target||name).replaceAll('{대체급여}',target||'').replaceAll('{사유}',reason||'')}
const feeFields=['feeAgencyCount','feeAgencyRate','feeWeekCount','feeWeekRate','feeSaturday','feeSatRate'];
const feeRates=['3시간 미만','3시간 이상 6시간 미만','6시간 이상 8시간 미만','8시간 이상 10시간 미만','10시간 이상 13시간 미만'];
function feeSentence(f={}){if(!f.feeAgencyCount||!f.feeAgencyRate||!f.feeWeekCount||!f.feeWeekRate||(f.feeSaturday&&!f.feeSatRate))return '';const rate=f.feeAgencyRate;return `* 개인별장기요양이용계획서에는 주 ${f.feeAgencyCount}회 ${rate}${rate.endsWith('미만')?'으로':'로'} 명시되어있으나 수급자 및 보호자 욕구 반영하여 주야간보호 주 ${f.feeWeekCount}회 ${f.feeWeekRate} 수가${f.feeSaturday?', 주 1회 '+f.feeSatRate+' 수가':''}를 적용하여 이용하도록 함.`;}
function feeRender(){const f=current().fee||{};for(const id of feeFields){const el=$(id);if(id==='feeSaturday')el.checked=!!f[id];else el.value=f[id]||'';} $('feeSaturdayRow').hidden=!f.feeSaturday;$('feePreview').textContent=feeSentence(f)||'공단 권장 수가와 센터 이용 수가를 선택하면 문구가 표시됩니다.';}
for(const id of feeFields){const el=$(id);if(id!=='feeSaturday'){const values=id.endsWith('Count')?Array.from({length:6},(_,i)=>String(i+1)):feeRates;el.innerHTML='<option value="">선택</option>'+values.map(v=>`<option value="${v}">${id.endsWith('Count')?'주 '+v+'회':v}</option>`).join('');}el.onchange=()=>{const f=current().fee??={};f[id]=id==='feeSaturday'?el.checked:el.value;if(id==='feeWeekCount'&&f.feeWeekCount==='6')f.feeSaturday=false;if(id==='feeSaturday'&&f.feeSaturday&&f.feeWeekCount==='6')f.feeWeekCount='5';feeRender();scheduleSave();};}
function generate(){
 const d=current(),{matches,add,remove}=mappingMatches(),common=d.commonReason||'';
 const f=d.fee||{},fee=feeSentence(f);if(!fee&&feeFields.some(id=>id!=='feeSatRate'&&f[id])){alert('수가 변경 내용의 필수 항목을 모두 선택하세요.');return;}
 const groups={add:[],replace:[],remove:[]};
 for(const m of matches){groups.replace.push(fill(m.text||`${m.source} 급여를 ${m.target} 급여로 대체하여 제공함`,m.source,m.target,common));}
 for(const [kind,arr] of [['add',add],['remove',remove]])for(const name of arr){
  const v=d.decisions[kind+':'+name]||{},action=v.kind||kind,reason=v.reason||common;
  if(action==='ignore')continue;
  if(action==='replace'&&!v.replace?.trim()){alert('「'+name+'」의 대체 대상 급여를 입력하세요.');return;}
  const t=templateFor(name,action,v.replace);
  const fallback=action==='replace'?`${name}는 ${v.replace}로 대체하여 제공함`:action==='add'?`${name}는 ${reason||'필요성 확인 후'} 급여 추가함`:`${name}는 ${reason||'제외 사유 확인 후'} 급여 제외함`;
  groups[action].push(fill(t||fallback,name,v.replace,reason));
 }
 const sections=[['add','- 추가한 급여'],['replace','- 대체한 급여'],['remove','- 제외한 급여']]
  .filter(([key])=>groups[key].length).map(([key,title])=>title+'\n'+groups[key].join('\n'));
 d.opinion=sections.length?'개인별장기요양이용계획서와 다른 내용\n'+sections.join('\n\n'):'개인별장기요양이용계획서와 비교한 결과, 선택한 급여 항목의 추가·대체·제외 사항이 없음.';
 if(fee)d.opinion=(sections.length?d.opinion:'개인별장기요양이용계획서와 다른 내용')+'\n\n'+fee;
 $('opinion').value=d.opinion;scheduleSave();
 if(d.opinion.includes('[질환 입력 필요]'))alert('질환이 필요한 문구가 있습니다. 위의 질환 입력칸을 확인하세요.');
}

$('leftSearch').oninput=leftRender;$('rightSearch').oninput=rightRender;
$('addCustom').onclick=()=>{const name=prompt('추가할 공단 권장 급여명');if(!name?.trim())return;const n=name.trim(),d=current();if(all().some(c=>norm(c.name)===norm(n))){alert('이미 등록된 급여입니다. 검색하여 체크하세요.');return}d.extra.push({group:'직접 추가',name:n,detail:''});d.recommended.push(n);leftRender();diffRender();scheduleSave()};
$('planFile').onchange=async e=>{const file=e.target.files?.[0];if(!file)return;$('fileStatus').textContent='분석 중…';try{if(!window.XLSX)throw Error('엑셀 분석 라이브러리가 없습니다.');const rows=getRows(XLSX.read(await file.arrayBuffer(),{type:'array'}));if(!rows.length)throw Error('「장기요양 필요내용」 열을 찾지 못했습니다.');const map=new Map();for(const r of rows){const found=all().find(c=>norm(c.name)===norm(r.name));const name=found?.name||r.name;map.set(name,{...r,name})}current().provided=[...map.values()];current().fileName=file.name;rightRender();frequencyRender();goalRender();diffRender();$('fileStatus').textContent=`${file.name} · ${map.size}개 분석됨`;scheduleSave()}catch(err){$('fileStatus').textContent='분석 실패: '+err.message}finally{e.target.value=''}};
$('draftTitle').oninput=e=>{current().title=e.target.value;const opt=$('draftPicker').selectedOptions[0];if(opt)opt.textContent=e.target.value||'새 계획서';scheduleSave()};$('draftPicker').onchange=e=>{draftId=e.target.value;step=0;render();persist()};$('newDraft').onclick=()=>makeDraft();$('deleteDraft').onclick=()=>{if(!confirm('현재 계획서의 임시 작성 내용을 삭제할까요?'))return;delete drafts[draftId];draftId=Object.keys(drafts)[0]||'';if(!draftId)makeDraft();else{step=0;render();persist()}};
document.querySelectorAll('[data-step]').forEach(b=>b.onclick=()=>{step=Number(b.dataset.step);stepRender();if(step===4)diffRender()});$('prevStep').onclick=()=>{if(step>0){step--;stepRender()}};$('nextStep').onclick=()=>{if(step<4){step++;stepRender()}else alert('작성한 종합의견을 복사해 사용하세요.')};
$('diseases').oninput=e=>{current().diseases=e.target.value;scheduleSave()};$('commonReason').oninput=e=>{current().commonReason=e.target.value;scheduleSave()};$('opinion').oninput=e=>{current().opinion=e.target.value;scheduleSave()};$('generate').onclick=generate;$('copyOpinion').onclick=async()=>{if(!current().opinion.trim())return alert('종합의견을 먼저 작성하세요.');try{await navigator.clipboard.writeText(current().opinion);alert('복사했습니다.')}catch{$('opinion').select();document.execCommand('copy')}};
window.benefitPhraseReady=({admin:yes,templates:items})=>{admin=!!yes;templates=items||{};$('benefitAdminLink').hidden=!admin};window.benefitPhraseChanged=x=>{templates=x||{}};window.benefitMappingsChanged=x=>{mappings=Array.isArray(x)?x:[];diffRender()};window.benefitFrequencyDefaultsChanged=x=>{frequencyDefaults=x&&typeof x==='object'?x:{};if(current())frequencyRender()};window.benefitFrequencyOrderChanged=x=>{frequencyOrder=Array.isArray(x)?x:[];if(current()){frequencyRender();goalRender()}};
// 임시 계획서는 로그인과 관계없이 이 PC/브라우저의 localStorage에만 저장합니다.
// 관리자 문구 및 급여 기본값은 기존 Firebase 연동을 그대로 사용합니다.
window.benefitWizardSetUser=()=>{}; // 기존 Firebase 모듈과의 호환용: 임시 계획서를 다시 불러오지 않음
loadLocalDrafts();
})();
