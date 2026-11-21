(()=>{'use strict';
const $=id=>document.getElementById(id),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const norm=s=>String(s||'').normalize('NFKC').replace(/[\s·ㆍ.,()\-]/g,'').toLowerCase();
const catalog=window.BENEFIT_CATALOG||[];let extra=[],recommended=new Set(),provided=new Map(),decisions={};
let phraseTemplates={},isAdmin=false,templateReady=false;
const full=()=>[...catalog,...extra];
function findCatalog(name){return full().find(c=>norm(c.name)===norm(name))}
function counts(){ $('leftCount').textContent=recommended.size;$('rightCount').textContent=provided.size;$('addCount').textContent=[...provided.keys()].filter(k=>!recommended.has(k)).length;$('removeCount').textContent=[...recommended].filter(k=>!provided.has(k)).length;}
function leftRender(){const q=norm($('leftSearch').value),items=full().filter(c=>norm(c.name+' '+c.group+' '+c.detail).includes(q));const groups=new Map();items.forEach(c=>{if(!groups.has(c.group))groups.set(c.group,[]);groups.get(c.group).push(c)});$('leftItems').innerHTML=[...groups].map(([g,rows])=>`<div class="benefit-group"><h3>${esc(g)} <small>${rows.length}개</small></h3>${rows.map(c=>`<label class="benefit-row"><input type="checkbox" data-left="${esc(c.name)}" ${recommended.has(c.name)?'checked':''}><span><b>${esc(c.name)}</b><small>${esc(c.detail)}</small></span></label>`).join('')}</div>`).join('')||'<p class="empty">검색 결과가 없습니다.</p>'; $('leftItems').querySelectorAll('[data-left]').forEach(x=>x.onchange=()=>{if(x.checked)recommended.add(x.dataset.left);else recommended.delete(x.dataset.left);update()})}
function rightRender(){const q=norm($('rightSearch').value);const arr=[...provided.values()].filter(x=>norm(x.name+' '+x.detail).includes(q));$('rightItems').innerHTML=arr.map(x=>`<div class="benefit-row read-only"><span class="check-icon">✓</span><span><b>${esc(x.name)}</b><small>${esc([x.detail,x.frequency,x.minutes?x.minutes+'분':''].filter(Boolean).join(' · '))}</small></span></div>`).join('')||'<p class="empty">'+(provided.size?'검색 결과가 없습니다.':'계획서 파일을 업로드하세요.')+'</p>'}
function update(){counts();diffRender()}
function changes(){const add=[...provided.keys()].filter(k=>!recommended.has(k)),remove=[...recommended].filter(k=>!provided.has(k));return {add,remove}}
function templateFor(name,kind){return phraseTemplates[encodeURIComponent(name)]?.[kind]||''}
function fillTemplate(template,name,target,reason){
 return template.replaceAll('{급여명}',name).replaceAll('{대체급여}',target||'').replaceAll('{사유}',reason||'');
}
function diffRender(){const {add,remove}=changes();const all=[...add.map(name=>({name,kind:'add'})),...remove.map(name=>({name,kind:'remove'}))];$('diffItems').innerHTML=all.length?all.map(x=>{const key=x.kind+':'+x.name,d=decisions[key]||{};return `<div class="diff-row"><div class="diff-title"><span class="diff-tag ${x.kind}">${x.kind==='add'?'추가 후보':'제외 후보'}</span><strong>${esc(x.name)}</strong></div><div class="diff-fields"><label>처리<select data-kind="${esc(key)}"><option value="${x.kind}" ${(!d.kind||d.kind===x.kind)?'selected':''}>${x.kind==='add'?'추가':'제외'}</option><option value="replace" ${d.kind==='replace'?'selected':''}>대체</option><option value="ignore" ${d.kind==='ignore'?'selected':''}>문구 제외</option></select></label><label>대체 대상 급여<input data-replace="${esc(key)}" placeholder="대체할 기존/변경 급여" value="${esc(d.replace||'')}"></label><label class="reason-input">사유<input data-reason="${esc(key)}" placeholder="선택 입력" value="${esc(d.reason||'')}"></label></div></div>`}).join(''):'<p class="empty">선택된 급여와 업로드된 급여의 차이가 없습니다.</p>';
 $('diffItems').querySelectorAll('[data-kind]').forEach(el=>el.onchange=()=>{(decisions[el.dataset.kind]??={}).kind=el.value});$('diffItems').querySelectorAll('[data-replace]').forEach(el=>el.oninput=()=>{(decisions[el.dataset.replace]??={}).replace=el.value});$('diffItems').querySelectorAll('[data-reason]').forEach(el=>el.oninput=()=>{(decisions[el.dataset.reason]??={}).reason=el.value});}
function getRows(wb){const results=[];for(const sheet of wb.SheetNames){const rows=XLSX.utils.sheet_to_json(wb.Sheets[sheet],{header:1,defval:'',raw:false});let header=-1, col=-1,detailCol=-1,freqCol=-1,minCol=-1;for(let i=0;i<rows.length;i++){const r=rows[i].map(v=>String(v??'').replace(/\s+/g,''));const ix=r.findIndex(v=>v==='장기요양필요내용'||v==='필요내용');if(ix>=0){header=i;col=ix;detailCol=r.findIndex(v=>v==='세부제공내용');freqCol=r.findIndex(v=>v.startsWith('횟수'));minCol=r.findIndex(v=>v.startsWith('시간'));break}}
 if(header<0)continue;for(let i=header+1;i<rows.length;i++){const r=rows[i],name=String(r[col]??'').trim();if(!name||name==='장기요양필요내용'||name==='필요내용')continue;if(name.includes('종합의견')||name.includes('총괄확인자'))break;results.push({name,detail:detailCol>=0?String(r[detailCol]||'').trim():'',frequency:freqCol>=0?String(r[freqCol]||'').trim():'',minutes:minCol>=0?String(r[minCol]||'').trim():''})}}
 return results;}
$('planFile').addEventListener('change',async e=>{const file=e.target.files[0];if(!file)return;$('fileStatus').textContent='파일을 분석하는 중입니다...';try{if(!window.XLSX)throw Error('엑셀 분석 라이브러리를 불러오지 못했습니다. 인터넷 연결을 확인하세요.');const wb=XLSX.read(await file.arrayBuffer(),{type:'array'}),rows=getRows(wb);if(!rows.length)throw Error('급여제공계획서의 「장기요양 필요내용」 열을 찾지 못했습니다. 지원하는 양식인지 확인하세요.');provided=new Map();for(const r of rows){const found=findCatalog(r.name),name=found?.name||r.name;provided.set(name,{...r,name})} $('fileStatus').textContent=`${file.name} · 급여 ${provided.size}개 확인` ;rightRender();update()}catch(err){$('fileStatus').textContent='분석 실패: '+err.message;console.error(err)}});
$('leftSearch').oninput=leftRender;$('rightSearch').oninput=rightRender;
$('addCustom').onclick=()=>{const name=prompt('추가할 급여명을 입력하세요.');if(!name?.trim())return;const n=name.trim();if(findCatalog(n)){alert('이미 목록에 있는 급여입니다. 검색하여 체크하세요.');return}const group=prompt('급여 분류를 입력하세요.','직접 추가')?.trim()||'직접 추가';extra.push({group,name:n,detail:''});recommended.add(n);phraseOptions();$('leftSearch').value='';leftRender();update()};
$('clearAll').onclick=()=>{if(!confirm('현재 선택과 비교 결과를 모두 초기화할까요?'))return;recommended=new Set();provided=new Map();extra=[];decisions={};$('planFile').value='';$('fileStatus').textContent='업로드된 파일이 없습니다.';$('opinion').value='';$('commonReason').value='';leftRender();rightRender();update()};
$('generate').onclick=()=>{const {add,remove}=changes(),lines=[],common=$('commonReason').value.trim();for(const [kind,arr] of [['add',add],['remove',remove]])for(const name of arr){const d=decisions[kind+':'+name]||{};const action=d.kind||kind;if(action==='ignore')continue;const reason=d.reason?.trim()||common;const suffix=reason?' '+reason.replace(/[.。\s]+$/,'')+'.':'';if(action==='replace'&&!d.replace?.trim()){alert('「'+name+'」의 대체 대상 급여를 입력하세요.');return}
 const custom=templateFor(name,action);
 if(custom){const text=fillTemplate(custom,name,d.replace?.trim(),reason);lines.push('- '+text.trim());}
 else if(action==='replace')lines.push(`- ${name} 급여를 ${d.replace.trim()} 급여로 대체함.${suffix}`);
 else if(action==='add')lines.push(`- ${name} 급여를 추가함.${suffix}`);
 else lines.push(`- ${name} 급여를 제외함.${suffix}`)}$('opinion').value=lines.length?'개인별장기요양이용계획서와 다른 내용\n\n'+lines.join('\n'):'개인별장기요양이용계획서와 비교한 결과, 선택한 급여 항목의 추가·대체·제외 사항이 없음.'};
$('copyOpinion').onclick=async()=>{const v=$('opinion').value;if(!v.trim())return alert('먼저 종합의견을 생성하세요.');try{await navigator.clipboard.writeText(v);alert('종합의견을 복사했습니다.')}catch{ $('opinion').select();document.execCommand('copy');alert('복사를 시도했습니다.')}};
// 급여별 문구는 Firestore에서 실시간 공유하며, 관리자만 편집합니다.
const phrasePanel=$('phraseAdmin');
const phraseStatus=$('phraseStatus');
const phraseSelect=$('phraseBenefit');
const phraseAction=$('phraseAction');
const phraseText=$('phraseText');
function phraseOptions(){
 const previous=phraseSelect.value;
 phraseSelect.innerHTML='<option value="">급여 선택</option>'+full().map(c=>`<option value="${esc(c.name)}">${esc(c.group)} · ${esc(c.name)}</option>`).join('');
 if([...phraseSelect.options].some(o=>o.value===previous))phraseSelect.value=previous;
}
function phraseLoad(){
 const name=phraseSelect.value;
 phraseText.value=name?templateFor(name,phraseAction.value):'';
}
phraseSelect.onchange=phraseLoad;
phraseAction.onchange=phraseLoad;
$('phraseSave').onclick=async()=>{
 if(!isAdmin)return alert('관리자만 문구를 저장할 수 있습니다.');
 const name=phraseSelect.value,kind=phraseAction.value,value=phraseText.value.trim();
 if(!name)return alert('급여를 선택하세요.');
 if(!value)return alert('문구를 입력하세요. 삭제하려면 문구 삭제 버튼을 사용하세요.');
 phraseStatus.textContent='저장 중...';
 try{
  await window.benefitPhraseSet(name,kind,value);
  phraseStatus.textContent='저장했습니다. 다른 직원 화면에도 실시간 반영됩니다.';
 }catch(e){phraseStatus.textContent='저장 실패: '+e.message}
};
$('phraseDelete').onclick=async()=>{
 if(!isAdmin)return;
 const name=phraseSelect.value,kind=phraseAction.value;
 if(!name||!confirm('선택한 급여의 '+({add:'추가',remove:'제외',replace:'대체'}[kind])+' 문구를 삭제할까요?'))return;
 try{await window.benefitPhraseDelete(name,kind);phraseStatus.textContent='삭제했습니다.'}
 catch(e){phraseStatus.textContent='삭제 실패: '+e.message}
};
window.benefitPhraseReady=({admin,templates,set,remove})=>{
 isAdmin=admin;templateReady=true;phraseTemplates=templates||{};
 window.benefitPhraseSet=set;window.benefitPhraseDelete=remove;
 phrasePanel.hidden=!admin;phraseStatus.textContent=admin?'급여별 추가·제외·대체 문구를 등록할 수 있습니다.':'';
 phraseOptions();phraseLoad();
};
window.benefitPhraseChanged=templates=>{phraseTemplates=templates||{};phraseLoad()};
phraseOptions();
leftRender();rightRender();update();
})();
