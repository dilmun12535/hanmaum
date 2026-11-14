const sections=[
{title:'영양상태',fields:[['영양상태',['양호','적당','부족','매우 나쁨']],['식사형태',['일반식','다진식','죽식','미음','유동식','연하식','갈은식','기타']],['식사 시 문제점',['양호','저작곤란','소화불량','오심·구토','연하곤란','기타']],['기피식품',['없음','있음']],['소변상태',['양호','요실금','배뇨곤란','유치도뇨관','방광루','요루','기타']],['대변상태',['양호','지속적인 설사','변비','장루','기타']],['기저귀 착용여부',['착용','미착용']]],custom:['기피식품 종류'],make:v=>[`${v['영양상태']==='양호'?'영양상태는 양호하심':`영양상태는 ${v['영양상태']} 상태이심`}.`,`${v['식사형태']}으로 식사하심.`,v['식사 시 문제점']==='양호'?'식사 시 문제점은 없으심.':`식사 시 ${v['식사 시 문제점']}이 있으심.`,v['기피식품']==='없음'?'기피식품은 없으심.':`기피식품은 ${v['기피식품 종류']||'OOO'}이심.`].join('\n')},
{title:'구강상태',fields:[['치아상태',['양호','청결불량','치아 약함','틀니','잔존 치아 없음','기타']],['잇몸상태',['양호','치은염증','치석','기타']]],make:v=>`치아상태는 ${v['치아상태']} 상태이심.\n잇몸상태는 ${v['잇몸상태']} 상태이심.`},
{title:'질병상태',disease:true},
{title:'신체상태',fields:['옷 벗고 입기','세수하기','양치질하기','식사하기','목욕하기','체위변경 하기','일어나 앉기','옮겨 앉기','화장실 사용하기','몸단장하기'].map(x=>[x,['완전자립','부분도움','완전도움']]),custom:['신체상태 추가 설명'],make:v=>[...Object.keys(v).filter(k=>!['신체상태 추가 설명'].includes(k)).map(k=>`${k}: ${v[k]} 상태이심.`),v['신체상태 추가 설명']||''].filter(Boolean).join('\n')},
{title:'인지상태 · CIST',cist:true},
{title:'의사소통',fields:[['청력상태',['정상(보청기 사용)','정상(보청기 미사용)','가까운 곳에서 대화 가능','큰소리만 들을 수 있음','소리에 거의 반응 없음','판단 불능']],['의사소통',['모두 이해하고 의사 표현','대부분 이해하고 의사 표현','가끔 이해하고 의사 표현','거의 이해하지 못함']],['발음능력',['정확하게 발음','웅얼거리는 소리','간혹 어눌한 발음','전혀 발음하지 못함']]],make:v=>`청력상태는 ${v['청력상태']} 상태이심.\n의사소통은 ${v['의사소통']} 상태이심.\n발음능력은 ${v['발음능력']} 상태이심.`},
{title:'가족 및 환경상태',fields:[['동거인',['독거','배우자','부모','자녀','자부·사위','기타']],['주수발자',['유','무']],['경제상태',['안정','불안정','연금생활','기초생활수급','의료급여']],['수발 부담',['전혀 부담되지 않음','아주 가끔 부담됨','가끔 부담됨','자주 부담됨','항상 부담됨']],['거주환경',['아파트','단독주택','연립주택','다세대주택','기타']]],custom:['자녀 수 및 가족관계','가족 및 환경 추가 설명'],make:v=>[`동거인은 ${v['동거인']}이심.`,`주수발자는 ${v['주수발자']==='유'?'있으심':'없으심'}.`,`경제상태는 ${v['경제상태']} 상태이심.`,`수발 부담은 ${v['수발 부담']}으로 확인됨.`,`거주환경은 ${v['거주환경']}이심.`,v['자녀 수 및 가족관계']||'',v['가족 및 환경 추가 설명']||''].filter(Boolean).join('\n')},
{title:'자원이용 욕구',fields:[['정기진료',['유','무']],['종교',['천주교','기독교','불교','무교','기타']]],custom:['병원명(진료과)','이용 중인 지역사회 자원'],make:v=>[v['정기진료']==='유'?`${v['병원명(진료과)']||'병원'}에서 정기적으로 진료받으심.`:'정기진료는 받지 않으심.',`종교는 ${v['종교']}이심.`,v['이용 중인 지역사회 자원']?`이용 중인 지역사회 자원: ${v['이용 중인 지역사회 자원']}`:''].filter(Boolean).join('\n')}

];
// 신체상태: 동작별 장기요양 필요내용 (관리자 편집 가능)
const physicalNeeds={
 '옷 벗고 입기':['입을 옷 준비하기','옷갈아입기 지시 및 지켜보기 도움','옷갈아입기 도움','옷 입고 뒷정리 하기','전적인 도움받아 옷 갈아입기'],
 '세수하기':['세면도구 준비','세면 지시 및 지켜보기','세면도움','세면 후 뒷정리 하기','전적인 도움받아 세수하기'],
 '양치질하기':['양치도구 준비','양치질 지시 및 지켜보기','양치질 도움','틀니관리','전적인 도움받아 양치질하기'],
 '화장실 사용하기':['화장실 이용 지시 및 지켜보기','화장실 이용 도움','이동변기 사용 도움','기저귀 교환 도움','침상 배설도움','배변문제 관리','장루(인공항문)관리 도움(위생관리)','배뇨문제 관리','요루, 도뇨관 관리'],
 '식사하기':['식사 준비 도움','식사 지시 및 지켜보기','식사 도움','식사 후 정리 도움','전적인 식사 도움'],
 '목욕하기':['목욕 준비 도움','목욕 지시 및 지켜보기','몸 씻기 도움','목욕 후 정리 도움','전적인 목욕 도움'],
 '체위변경 하기':['체위변경 지시 및 지켜보기','체위변경 도움','전적인 체위변경 도움'],
 '일어나 앉기':['일어나 앉기 지시 및 지켜보기','일어나 앉기 도움','전적인 일어나 앉기 도움'],
 '옮겨 앉기':['옮겨 앉기 지시 및 지켜보기','옮겨 앉기 도움','전적인 옮겨 앉기 도움'],
 '몸단장하기':['몸단장 도구 준비','몸단장 지시 및 지켜보기','몸단장 도움','몸단장 후 정리 도움','전적인 몸단장 도움']
};
function physicalNeedOptions(f){return settings.physicalNeeds?.[f]||physicalNeeds[f]||[]}
function physicalResult(){return sections[3].fields.map(([f,opts])=>{
 const level=state[3][f]||opts[0], illness=String(state[3]['진단명::'+f]||'').trim();
 const chosen=(state[3]['필요내용::'+f]||[]).filter(x=>physicalNeedOptions(f).includes(x));
 const ending=level==='완전자립'?'스스로 수행할 수 있는 상태임.':level==='부분도움'?'주수발자의 부분적인 도움이 필요한 상태임.':'주수발자의 전적인 도움이 필요한 상태임.';
 const raw=template(3,f,level);
 const details=chosen.map(x=>settings.physicalPhrases?.[f]?.[x]||x).join(', ');
 return raw.replaceAll('{질환}',illness||'진단명 미입력').replaceAll('{도움사유}',details||'일상생활 동작 수행에 어려움이 있어').replaceAll('{필요내용}',details||'선택된 필요내용 없음').replaceAll('{도움수준}',ending);
 }).join('\n')+(state[3]['신체상태 추가 설명']?'\n'+state[3]['신체상태 추가 설명']:'')}
function renderPhysical(area){
 const table=document.createElement('div');table.className='physical-table';
 sections[3].fields.forEach(([f,opts])=>{
  const row=document.createElement('div');row.className='physical-row';
  const level=document.createElement('div');level.className='physical-level';level.innerHTML=`<strong>${esc(f)}</strong><div class="chips">${opts.map(o=>`<label class="chip"><input type="radio" name="physical-${esc(f)}" value="${esc(o)}" ${state[3][f]===o?'checked':''}>${esc(o)}</label>`).join('')}</div>`;
  level.querySelectorAll('input').forEach(el=>el.onchange=()=>{state[3][f]=el.value;update()});
  const diagnosis=document.createElement('div');diagnosis.className='physical-diagnosis';diagnosis.innerHTML='<label>진단명</label><input type="text" placeholder="예: 요통, 치매">';diagnosis.querySelector('input').value=state[3]['진단명::'+f]||'';diagnosis.querySelector('input').oninput=e=>{state[3]['진단명::'+f]=e.target.value;update()};
  const needs=document.createElement('div');needs.className='physical-needs';needs.innerHTML='<strong>장기요양 필요내용 (복수 선택)</strong>';
  const options=document.createElement('div');options.className='need-options';needs.appendChild(options);
  function renderOptions(){options.innerHTML='';physicalNeedOptions(f).forEach(item=>{const label=document.createElement('label');label.className='need-item';const cb=document.createElement('input');cb.type='checkbox';cb.checked=(state[3]['필요내용::'+f]||[]).includes(item);cb.onchange=()=>{let arr=state[3]['필요내용::'+f]||[];state[3]['필요내용::'+f]=cb.checked?[...arr,item]:arr.filter(x=>x!==item);update()};label.append(cb,document.createTextNode(item));options.appendChild(label)})}
  renderOptions();row.append(level,diagnosis,needs);
  if(role==='admin'){
   const admin=document.createElement('div');admin.className='adminbox physical-admin';admin.innerHTML='<strong>관리자: 상태별 문구 및 세부 항목 설정</strong><p class="muted">{질환}, {필요내용}, {도움사유}, {도움수준} 사용 가능. 필요내용 문구는 선택된 항목만 연결됩니다.</p>';
   opts.forEach(o=>{const label=document.createElement('label');label.className='admin-label';label.textContent=o;const ta=document.createElement('textarea');ta.value=template(3,f,o);label.appendChild(ta);admin.appendChild(label);ta.dataset.level=o});
   const needLabel=document.createElement('label');needLabel.className='admin-label';needLabel.textContent='장기요양 필요내용 (한 줄에 하나씩)';const nt=document.createElement('textarea');nt.value=physicalNeedOptions(f).join('\n');needLabel.appendChild(nt);admin.appendChild(needLabel);
   const phraseLabel=document.createElement('label');phraseLabel.className='admin-label';phraseLabel.textContent='세부 항목별 출력 문구 (각 줄: 항목명 = 출력 문구)';const pt=document.createElement('textarea');pt.value=physicalNeedOptions(f).map(x=>x+' = '+(settings.physicalPhrases?.[f]?.[x]||x)).join('\n');phraseLabel.appendChild(pt);admin.appendChild(phraseLabel);
   const saveBtn=document.createElement('button');saveBtn.className='primary';saveBtn.textContent='이 동작 설정 저장';saveBtn.onclick=()=>{admin.querySelectorAll('[data-level]').forEach(el=>settings.phrases[id(3,f,el.dataset.level)]=el.value);const items=[...new Set(nt.value.split('\n').map(x=>x.trim()).filter(Boolean))];settings.physicalNeeds??={};settings.physicalNeeds[f]=items;settings.physicalPhrases??={};settings.physicalPhrases[f]={};pt.value.split('\n').forEach(line=>{const n=line.indexOf('=');if(n<0)return;const key=line.slice(0,n).trim(),value=line.slice(n+1).trim();if(items.includes(key))settings.physicalPhrases[f][key]=value});save();renderOptions();update();alert('저장했습니다.')};admin.appendChild(saveBtn);row.appendChild(admin)
  }
  table.appendChild(row)
 });area.appendChild(table);
 const extra=document.createElement('div');extra.className='field';extra.innerHTML='<label>신체상태 추가 설명 (선택)</label><textarea placeholder="필요한 경우 입력"></textarea>';extra.querySelector('textarea').value=state[3]['신체상태 추가 설명']||'';extra.querySelector('textarea').oninput=e=>{state[3]['신체상태 추가 설명']=e.target.value;update()};area.appendChild(extra);
}
// 가족 및 환경상태: 복수 동거인, 자녀 수, 주수발자 관계를 반영한 독립 화면
const familyLiving=['독거','배우자','부모','자녀','자부·사위','손자녀','친척','친구·이웃','기타'];
const familyRelations=['배우자','자녀','자부','사위','형제자매','친척','기타'];
const familyDefaults={
 children:'- 슬하에 {자녀내역}이 있으심.',
 living:'- {거주환경}에서 {생활형태}하고 계심.',
 care:'- {주수발자관계}께서 주수발을 담당하고 계심. {거주지역문장}{경제상태문장} {수발부담문장}',
 noCare:'- 현재 주수발자는 없으심. {경제상태문장}'
};
function familyText(){
 const v=state[6], sons=Math.max(0,Number(v['아들 수'])||0), daughters=Math.max(0,Number(v['딸 수'])||0);
 const children=[sons?`아드님 ${sons}명`:'',daughters?`따님 ${daughters}명`:''].filter(Boolean).join(', ');
 const living=v['동거인 목록']||['독거'], childTypes=v['동거 자녀 구분']||[];
 const polite={'배우자':'배우자님','부모':'부모님','자부·사위':'며느님 또는 사위님','손자녀':'손자녀분','친척':'친척분','친구·이웃':'친구 또는 이웃분'};
 const companions=living.filter(x=>x!=='독거').flatMap(x=>{
  if(x==='자녀')return childTypes.length?childTypes.map(t=>t==='아들'?'아드님':'따님'):['자녀분'];
  if(x==='손자녀')return (v['동거 손자녀 구분']||[]).length?(v['동거 손자녀 구분']).map(t=>t==='손자'?'손자분':'손녀분'):['손자녀분'];
  if(x==='친구·이웃')return (v['동거 친구이웃 구분']||[]).length?(v['동거 친구이웃 구분']).map(t=>t==='친구'?'친구분':'이웃분'):['친구 또는 이웃분'];
  return [x==='기타'?(v['동거인 기타']||'기타 가족'):polite[x]||x];
 });
 const home=v['거주환경']==='기타'?(v['거주환경 기타']||'기타 주거지'):v['거주환경'];
 const life=living.includes('독거')?'혼자 생활':companions.length?`${companions.join(', ')}과 함께 생활`:'생활';
 const relRaw=v['주수발자 관계']==='기타'?(v['주수발자 관계 기타']||'주수발자'):v['주수발자 관계'];
 const relNames={'배우자':'배우자분','자녀':'자녀분','자부':'며느님','사위':'사위분','형제자매':'형제자매분','친척':'친척분'};
 const childCare=v['주수발자 자녀 구분'];
 const siblingCare=v['주수발자 형제자매 구분'];
 const childCareNames={'아들':'아드님','딸':'따님'};
 const siblingCareNames={'형':'형님','누나':'누님','오빠':'오라버니','언니':'언니','남동생':'남동생분','여동생':'여동생분'};
 const rel=relRaw==='자녀'?(childCareNames[childCare]||'자녀분'):relRaw==='형제자매'?(siblingCareNames[siblingCare]||'형제자매분'):(relNames[relRaw]||relRaw||'주수발자');
 const subject=rel.endsWith('께서')?rel:rel+'께서';
 const locationSubject=rel.endsWith('께서는')?rel:rel+'께서는';
 const location=v['주수발자 거주지역'];
 const locationSentence=location==='같은 지역'?`${locationSubject} 같은 지역에 거주하고 계심.`:location==='다른 지역'?`${locationSubject} 다른 지역에 거주하고 계심.`:'';
 const economic={'안정':'경제상태는 안정적인 편이심.','불안정':'경제적으로 어려움이 있으심.','연금생활':'연금으로 생활하고 계심.','기초생활수급':'기초생활수급 대상자이심.','의료급여':'의료급여 대상자이심.'}[v['경제상태']]||'';
 const burdens={'전혀 부담되지 않음':'수발에 대한 부담은 없다고 하심.','아주 가끔 부담됨':'수발에 대한 부담을 아주 가끔 느낀다고 하심.','가끔 부담됨':'수발에 대한 부담을 가끔 느낀다고 하심.','자주 부담됨':'수발에 대한 부담을 자주 느낀다고 하심.','항상 부담됨':'수발에 대한 부담을 항상 느낀다고 하심.'};
 const burden=burdens[v['수발 부담']]||'';
 const lines=[];
 if(children)lines.push(`- 슬하에 ${children}이 있으심.`);
 if(home)lines.push(living.includes('독거')?`- ${home}에서 혼자 생활하고 계심.`:`- ${home}에서 ${life}하고 계심.`);
 if(v['주수발자']==='유'){
  lines.push(`- ${subject} 주수발을 담당하고 계심.`);
  if(locationSentence)lines.push(`- ${locationSentence}`);
  if(economic)lines.push(`- ${economic}`);
  if(burden)lines.push(`- ${burden}`);
 }else{
  lines.push('- 현재 주수발자는 없으심.');
  if(economic)lines.push(`- ${economic}`);
 }
 if(String(v['가족 및 환경 추가 설명']||'').trim())lines.push(v['가족 및 환경 추가 설명'].trim());
 return lines.join('\n');
}
function renderFamily(area){
 const v=state[6];Object.assign(v,{'동거인 목록':v['동거인 목록']||['독거'],'아들 수':v['아들 수']??'0','딸 수':v['딸 수']??'0','주수발자 관계':v['주수발자 관계']||'자녀','주수발자 거주지역':v['주수발자 거주지역']??'선택 안 함'});
 const field=(title)=>{const w=document.createElement('div');w.className='field';const h=document.createElement('label');h.textContent=title;w.append(h);area.append(w);return w};
 const input=(parent,label,key,type='text')=>{const w=document.createElement('label');w.className='family-input';w.textContent=label;const el=document.createElement('input');el.type=type;if(type==='number'){el.min='0';el.step='1'}el.value=v[key]??'';el.oninput=()=>{v[key]=el.value;update()};w.append(el);parent.append(w);return el};
 const radio=(parent,key,opts,after)=>{const chips=document.createElement('div');chips.className='chips';opts.forEach(o=>{const label=document.createElement('label');label.className='chip';const el=document.createElement('input');el.type='radio';el.name='family-'+key;el.value=o;el.checked=v[key]===o;el.onchange=()=>{v[key]=o;if(after)after();update()};label.append(el,document.createTextNode(o));chips.append(label)});parent.append(chips)};
 const living=field('동거인 (복수 선택)');const lc=document.createElement('div');lc.className='chips';living.append(lc);
 familyLiving.forEach(o=>{const label=document.createElement('label');label.className='chip';const el=document.createElement('input');el.type='checkbox';el.checked=v['동거인 목록'].includes(o);el.onchange=()=>{let arr=v['동거인 목록'];if(el.checked)arr=o==='독거'?['독거']:[...arr.filter(x=>x!=='독거'),o];else arr=arr.filter(x=>x!==o);v['동거인 목록']=arr;draw();show(6)};label.append(el,document.createTextNode(o));lc.append(label)});
 if(v['동거인 목록'].includes('자녀')){
  const sub=document.createElement('div');sub.className='inline-detail';
  const title=document.createElement('label');title.textContent='함께 거주하는 자녀 구분 (복수 선택)';sub.append(title);
  const chips=document.createElement('div');chips.className='chips';sub.append(chips);
  ['아들','딸'].forEach(type=>{
   const label=document.createElement('label');label.className='chip';
   const cb=document.createElement('input');cb.type='checkbox';cb.checked=(v['동거 자녀 구분']||[]).includes(type);
   cb.onchange=()=>{const arr=v['동거 자녀 구분']||[];v['동거 자녀 구분']=cb.checked?[...arr,type]:arr.filter(x=>x!==type);update()};
   label.append(cb,document.createTextNode(type));chips.append(label);
  });
  living.append(sub);
 }
 if(v['동거인 목록'].includes('기타'))input(living,'기타 동거인','동거인 기타');
 const children=field('자녀 수');const numbers=document.createElement('div');numbers.className='family-number-row';children.append(numbers);input(numbers,'아들 (명)','아들 수','number');input(numbers,'딸 (명)','딸 수','number');
 const care=field('주수발자 유무');radio(care,'주수발자',['무','유'],()=>{draw();show(6)});
 if(v['주수발자']==='유'){
  const rel=field('주수발자 관계');radio(rel,'주수발자 관계',familyRelations,()=>{draw();show(6)});
  const relationSubchoices=v['주수발자 관계']==='자녀'?['아들','딸']:v['주수발자 관계']==='형제자매'?['형','누나','오빠','언니','남동생','여동생']:null;
  if(relationSubchoices){
   const key=v['주수발자 관계']==='자녀'?'주수발자 자녀 구분':'주수발자 형제자매 구분';
   const sub=document.createElement('div');sub.className='inline-detail';
   const title=document.createElement('label');title.textContent=v['주수발자 관계']==='자녀'?'주수발자 자녀 구분 (선택)':'주수발자 형제자매 구분 (선택)';sub.append(title);
   radio(sub,key,['선택 안 함',...relationSubchoices]);rel.append(sub);
  }
  if(v['주수발자 관계']==='기타')input(rel,'기타 관계','주수발자 관계 기타');
  const loc=field('주수발자 거주지역 (선택)');radio(loc,'주수발자 거주지역',['선택 안 함','같은 지역','다른 지역']);
 }
 const economy=field('경제상태');radio(economy,'경제상태',['안정','불안정','연금생활','기초생활수급','의료급여']);
 if(v['주수발자']==='유'){const burden=field('수발 부담');radio(burden,'수발 부담',['전혀 부담되지 않음','아주 가끔 부담됨','가끔 부담됨','자주 부담됨','항상 부담됨'])}
 const housing=field('거주환경');radio(housing,'거주환경',['아파트','단독주택','연립주택','다세대주택','기타'],()=>{draw();show(6)});if(v['거주환경']==='기타')input(housing,'기타 거주환경','거주환경 기타');
 const extra=field('가족 및 환경 추가 설명 (선택)');const ta=document.createElement('textarea');ta.value=v['가족 및 환경 추가 설명']||'';ta.oninput=()=>{v['가족 및 환경 추가 설명']=ta.value;update()};extra.append(ta);
 if(role==='admin'){
  const admin=document.createElement('div');admin.className='adminbox';admin.innerHTML='<strong>관리자: 가족 및 환경상태 출력 문구</strong><p class="muted">{자녀내역}, {거주환경}, {생활형태}, {주수발자관계}, {경제상태}, {수발부담}, {거주지역}를 사용할 수 있습니다. 거주기간은 사용하지 않습니다.</p>';
  for(const [k,name] of [['children','자녀'],['living','거주환경'],['care','주수발자 있음'],['noCare','주수발자 없음']]){const label=document.createElement('label');label.className='admin-label';label.textContent=name;const t=document.createElement('textarea');t.dataset.familyTemplate=k;t.value=settings.familyTemplates?.[k]||familyDefaults[k];label.append(t);admin.append(label)}
  const btn=document.createElement('button');btn.className='primary';btn.textContent='가족 및 환경 문구 저장';btn.onclick=()=>{settings.familyTemplates??={};admin.querySelectorAll('[data-family-template]').forEach(t=>settings.familyTemplates[t.dataset.familyTemplate]=t.value);save();update();alert('저장했습니다.')};admin.append(btn);area.append(admin)
 }
}
// 자원이용 욕구: 관리자 병원 목록 및 전화번호 자동 입력
const communityResources=['노인맞춤 돌봄 서비스','노인 돌봄 기본 서비스','노인 돌봄 종합 서비스','단기 가사 서비스','독거노인 사회관계 활성화','초기 독거노인 자립지원','가사간병','재가복지','급식 및 도시락 배달','보건소 사업','개인 간병인','산업재해 간병인','치매안심센터','복지관(마을회관)','노인정','이동 서비스','종교단체','이·미용','주거개선 사업'];
function resourceText(){
 const v=state[7], hospital=String(v['병원명']||'').trim(), regular=v['정기진료']||'유',religion=v['종교']||'무교';
 const phrases=settings.resourcePhrases||{};
 const apply=(key,def)=>String(phrases[key]??def).replaceAll('{병원명}',hospital).replaceAll('{종교}',religion==='기타'?(v['종교 기타']||'기타'):religion).replaceAll('{지역사회자원}',(v['지역사회자원 목록']||[]).join(', '));
 return [hospital?(regular==='유'?apply('regular','- {병원명}에서 정기적으로 진료를 받고 약을 처방받으심.'):apply('irregular','- {병원명}에서 필요시 진료받으심.')):regular==='무'?apply('none','- 정기진료는 받지 않으심.'):'',apply('religion','- 종교는 {종교}이심.'),(v['지역사회자원 목록']||[]).length?apply('community','- 지역사회 자원으로 {지역사회자원}를 이용하고 계심.'):''].filter(Boolean).join('\n');
}
function renderResources(area){
 const v=state[7];v['정기진료']??='유';v['종교']??='무교';v['지역사회자원 목록']??=[];
 const field=(name)=>{const wrap=document.createElement('div');wrap.className='field';const label=document.createElement('label');label.textContent=name;wrap.append(label);area.append(wrap);return wrap};
 const hospital=field('진료 병원');const sel=document.createElement('select');const names=settings.hospitals||[];sel.innerHTML='<option value="">직접 입력 / 병원 선택</option>'+names.map((h,i)=>`<option value="${i}">${esc(h.name)}</option>`).join('');hospital.append(sel);
 const hospitalName=document.createElement('input');hospitalName.placeholder='병원명 (직접 입력 가능)';hospitalName.value=v['병원명']||'';hospital.append(hospitalName);
 const phoneField=field('전화번호 (판단근거에는 출력하지 않음)');const phone=document.createElement('input');phone.type='tel';phone.placeholder='병원 선택 시 자동 표시 / 직접 입력 가능';phone.value=v['병원 전화번호']||'';phoneField.append(phone);
 sel.onchange=()=>{const h=names[Number(sel.value)];if(sel.value==='')return;v['병원명']=hospitalName.value=h.name;v['병원 전화번호']=phone.value=h.phone||'';update()};
 hospitalName.oninput=()=>{v['병원명']=hospitalName.value;update()};phone.oninput=()=>{v['병원 전화번호']=phone.value;update()};
 const matched=names.findIndex(h=>h.name===v['병원명']);if(matched>=0)sel.value=String(matched);
 const radio=(title,key,options)=>{const wrap=field(title),chips=document.createElement('div');chips.className='chips';wrap.append(chips);options.forEach(o=>{const label=document.createElement('label');label.className='chip';const input=document.createElement('input');input.type='radio';input.name='resource-'+key;input.checked=v[key]===o;input.onchange=()=>{v[key]=o;if(key==='종교')draw();update()};label.append(input,document.createTextNode(o));chips.append(label)});return wrap};
 radio('정기진료','정기진료',['유','무']);const religion=radio('종교활동','종교',['천주교','기독교','불교','무교','기타']);if(v['종교']==='기타'){const other=document.createElement('input');other.placeholder='종교 직접 입력';other.value=v['종교 기타']||'';other.oninput=()=>{v['종교 기타']=other.value;update()};religion.append(other)}
 const community=field('지역사회 자원 (복수 선택)');const checks=document.createElement('div');checks.className='resource-grid';community.append(checks);communityResources.forEach(item=>{const label=document.createElement('label');label.className='resource-check';const input=document.createElement('input');input.type='checkbox';input.checked=v['지역사회자원 목록'].includes(item);input.onchange=()=>{v['지역사회자원 목록']=input.checked?[...v['지역사회자원 목록'],item]:v['지역사회자원 목록'].filter(x=>x!==item);update()};label.append(input,document.createTextNode(item));checks.append(label)});
 if(role==='admin'){
 const admin=document.createElement('div');admin.className='adminbox';admin.innerHTML='<strong>관리자 · 자주 이용하는 병원 등록</strong><p class="muted">병원명과 전화번호만 등록합니다. 저장된 목록은 이 브라우저에 보관됩니다.</p><label>병원명<input data-hname placeholder="병원명"></label><label>전화번호<input data-hphone placeholder="전화번호"></label><button class="primary" data-add>병원 등록</button><div data-hlist></div>';area.append(admin);
 const renderList=()=>{const list=admin.querySelector('[data-hlist]');list.innerHTML='';(settings.hospitals||[]).forEach((h,i)=>{const line=document.createElement('div');line.className='hospital-admin-row';const name=document.createElement('input');name.value=h.name;name.setAttribute('aria-label','병원명');const tel=document.createElement('input');tel.value=h.phone||'';tel.setAttribute('aria-label','전화번호');const edit=document.createElement('button');edit.textContent='수정';edit.onclick=()=>{if(!name.value.trim())return alert('병원명을 입력하세요.');settings.hospitals[i]={name:name.value.trim(),phone:tel.value.trim()};save();draw()};const del=document.createElement('button');del.textContent='삭제';del.onclick=()=>{if(!confirm('병원 목록에서 삭제할까요?'))return;settings.hospitals.splice(i,1);save();draw()};line.append(name,tel,edit,del);list.append(line)})};
 admin.querySelector('[data-add]').onclick=()=>{const name=admin.querySelector('[data-hname]').value.trim(),phone=admin.querySelector('[data-hphone]').value.trim();if(!name)return alert('병원명을 입력하세요.');settings.hospitals??=[];if(settings.hospitals.some(h=>h.name===name))return alert('이미 등록된 병원입니다.');settings.hospitals.push({name,phone});save();draw()};renderList();
 const phrase=field('관리자 · 판단근거 문구 설정');phrase.classList.add('adminbox');const configs=[['regular','정기진료 있음','- {병원명}에서 정기적으로 진료를 받고 약을 처방받으심.'],['irregular','정기진료 없음 (병원 입력)','- {병원명}에서 필요시 진료받으심.'],['none','정기진료 없음 (병원 미입력)','- 정기진료는 받지 않으심.'],['religion','종교','- 종교는 {종교}이심.'],['community','지역사회 자원','- 지역사회 자원으로 {지역사회자원}를 이용하고 계심.']];configs.forEach(([key,label,def])=>{const l=document.createElement('label');l.textContent=label;const t=document.createElement('textarea');t.dataset.resourcePhrase=key;t.value=settings.resourcePhrases?.[key]??def;l.append(t);phrase.append(l)});const btn=document.createElement('button');btn.className='primary';btn.textContent='자원이용 문구 저장';btn.onclick=()=>{settings.resourcePhrases??={};phrase.querySelectorAll('[data-resource-phrase]').forEach(t=>settings.resourcePhrases[t.dataset.resourcePhrase]=t.value);save();update()};phrase.append(btn);
 }
}
const diseaseGroups=[
 ['만성질환',['당뇨','고혈압','만성 호흡기질환','암','기타']],
 ['순환기계',['뇌경색','뇌출혈','협심증','심근경색증','고지혈증','기타']],
 ['신경계',['치매','파킨슨병','간질','기타']],
 ['근골격계',['관절염','요통','좌골통','골절 등 후유증','기타']],
 ['정신·행동장애',['조울증','우울증','수면장애','정신질환','기타']],
 ['호흡기계',['호흡곤란','결핵','기관지 절개관','흡인','산소요법','기타']],
 ['만성 신장질환',['만성신부전증','복막투석','혈액투석','기타']],
 ['기타 질환',['알레르기(식품)','알레르기(기타)','기타']]
];
const diseaseState={checked:{},extra:{},history:'',dementia:'',notes:''};
function diseaseText(){
 const selected=[];
 for(const [group,items] of diseaseGroups)for(const item of items){const k=group+'::'+item;if(!diseaseState.checked[k])continue;
 const custom= item==='기타'?diseaseState.extra[k]?.trim():'';
 if(item==='기타'&&!custom)continue;
 const label=(item==='치매'&&diseaseState.dementia)?`${diseaseState.dementia} 치매`:custom||item;
 const phrase=settings.diseasePhrases?.[k]??'{질환명}이 있으심.';
 selected.push(phrase.replaceAll('{질환명}',label).replaceAll('{중증도}',diseaseState.dementia||'중증도 미입력'));
 }
 return [diseaseState.history.trim()?`과거 병력: ${diseaseState.history.trim()}`:'',...selected,diseaseState.notes.trim()].filter(Boolean).join('\n')||'선택된 질환이 없습니다.';
}
function renderDisease(area){
 // 과거 병력을 질병상태의 맨 위에 표시
 const historyRow=document.createElement('div');historyRow.className='field';
 const historyLabel=document.createElement('label');historyLabel.textContent='과거 병력';
 const historyInput=document.createElement('textarea');historyInput.value=diseaseState.history;
 historyInput.placeholder='과거 병력을 입력하세요';
 historyInput.oninput=()=>{diseaseState.history=historyInput.value;update()};
 historyRow.append(historyLabel,historyInput);area.appendChild(historyRow);
 const intro=document.createElement('p');intro.className='muted';intro.textContent='진단된 질환을 복수 선택하세요. 기타 질환은 직접 입력할 수 있습니다.';area.appendChild(intro);
 for(const [group,items] of diseaseGroups){
  const wrap=document.createElement('div');wrap.className='field';
  const title=document.createElement('label');title.textContent=group;wrap.appendChild(title);
  const chips=document.createElement('div');chips.className='chips';wrap.appendChild(chips);
  for(const item of items){
   const k=group+'::'+item;let otherWrap=null;let dementiaSelect=null;const chip=document.createElement('label');chip.className='chip';
   const cb=document.createElement('input');cb.type='checkbox';cb.checked=!!diseaseState.checked[k];
   cb.onchange=()=>{diseaseState.checked[k]=cb.checked;if(item==='기타'&&otherWrap)otherWrap.classList.toggle('hidden',!cb.checked);if(dementiaSelect){dementiaSelect.disabled=false;if(!cb.checked)diseaseState.dementia='';dementiaSelect.value=diseaseState.dementia;}update()};
   chip.append(cb,document.createTextNode(item));chips.appendChild(chip);
   if(group==='신경계'&&item==='치매'){
    const select=document.createElement('select');select.setAttribute('aria-label','치매 중증도');
    [['','중증도 선택'],['경도','경도'],['중등도','중등도'],['중증','중증']].forEach(([value,label])=>{
      const opt=document.createElement('option');opt.value=value;opt.textContent=label;select.appendChild(opt)
    });
    select.value=diseaseState.dementia;select.disabled=false;dementiaSelect=select;
    select.onchange=()=>{diseaseState.dementia=select.value;if(select.value&&!cb.checked){cb.checked=true;diseaseState.checked[k]=true;}update()};
    chips.appendChild(select);
   }
   if(item==='기타'){
    const input=document.createElement('input');input.type='text';input.placeholder=group+' 기타 질환명';
    input.value=diseaseState.extra[k]||'';input.oninput=()=>{diseaseState.extra[k]=input.value;update()};
    otherWrap=document.createElement('div');otherWrap.className='disease-other-input'+(cb.checked?'':' hidden');otherWrap.appendChild(input);wrap.appendChild(otherWrap)
   }
   if(role==='admin'){
    const admin=document.createElement('div');admin.className='adminbox';
    const lbl=document.createElement('label');lbl.textContent=item+' 선택 시 출력 문구 ({질환명}, {중증도} 사용 가능)';
    const ta=document.createElement('textarea');ta.value=settings.diseasePhrases?.[k]??'{질환명}이 있으심.';
    const btn=document.createElement('button');btn.className='primary';btn.textContent='문구 저장';
    btn.onclick=()=>{(settings.diseasePhrases??={})[k]=ta.value;save();update()};
    admin.append(lbl,ta,btn);wrap.appendChild(admin)
   }
  }
  area.appendChild(wrap)
 }
 const notesRow=document.createElement('div');notesRow.className='field';
 const notesLabel=document.createElement('label');notesLabel.textContent='추가 판단근거 (직접 입력)';
 const notesInput=document.createElement('textarea');notesInput.value=diseaseState.notes;
 notesInput.placeholder='추가 판단근거를 입력하세요';
 notesInput.oninput=()=>{diseaseState.notes=notesInput.value;update()};
 notesRow.append(notesLabel,notesInput);area.appendChild(notesRow);
}
const cistDomains=[['지남력',5],['주의력',3],['시공간기능',2],['집행기능',6],['기억력',10],['언어기능',4]];
const key='hanmaeum-needs-v5-settings';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const id=(s,f,o)=>`${s}::${f}::${o}`;
let settings={phrases:{},custom:{},cist:{},extras:{}};
try{const saved=JSON.parse(localStorage.getItem(key));if(saved&&typeof saved==='object')settings={...settings,...saved}}catch{}
let active=0,role='staff',adminEditing=false;const state={};sections.forEach((s,i)=>{state[i]={};(s.fields||[]).forEach(([k,opts])=>state[i][k]=opts[0]);(s.custom||[]).forEach(k=>state[i][k]='')});
const nav=document.getElementById('nav'),panels=document.getElementById('panels');
function save(){
 localStorage.setItem(key,JSON.stringify(settings));
 if(role!=='admin' || !window.needsIsAdmin){document.getElementById('saveStatus').textContent='관리자만 설정을 저장할 수 있습니다.';return;}
 document.getElementById('saveStatus').textContent='Firestore에 관리자 문구 저장 중…';
 window.dispatchEvent(new CustomEvent('needs-settings-save',{detail:structuredClone(settings)}));
}
window.addEventListener('needs-settings-loaded',e=>{
 if(!e.detail||typeof e.detail!=='object')return;
 settings={phrases:{},custom:{},cist:{},extras:{},...e.detail};
 localStorage.setItem(key,JSON.stringify(settings));draw();
 showNeedsStatus('Firestore의 공유 관리자 설정을 불러왔습니다.');
});
let needsStatusTimer;
function showNeedsStatus(message){
 const el=document.getElementById('saveStatus');
 if(!el)return;
 clearTimeout(needsStatusTimer);
 el.textContent=message||'';
 // 성공 안내만 3초 후 숨기고 오류 및 확인 필요 메시지는 유지
 if(/Firestore에 저장되었습니다|공유 관리자 설정을 불러왔습니다/.test(message||'')){
   needsStatusTimer=setTimeout(()=>{if(el.textContent===message)el.textContent='';},3000);
 }
}
window.addEventListener('needs-settings-status',e=>showNeedsStatus(e.detail||''));
function defaultPhrase(i,f,o){const x={
'영양상태':{'양호':'영양상태는 양호하심.','적당':'영양상태는 적당한 상태이심.','부족':'영양상태가 부족하심.','매우 나쁨':'영양상태가 매우 좋지 않으심.'},
'식사형태':{},'식사 시 문제점':{'양호':'식사 시 문제점은 없으심.'},
'기피식품':{'없음':'기피식품은 없으심.','있음':'기피식품은 {기피식품 종류}이심.'},
'소변상태':{'양호':'소변상태는 양호하심.','요실금':'요실금 증상이 있으심.','배뇨곤란':'배뇨에 어려움이 있으심.','유치도뇨관':'유치도뇨관을 사용하심.','방광루':'방광루가 있으심.','요루':'요루가 있으심.','기타':'소변상태에 특이사항이 있으심.'},
'대변상태':{'양호':'대변상태는 양호하심.','지속적인 설사':'지속적인 설사 증상이 있으심.','변비':'변비 증상이 있으심.','장루':'장루를 사용하심.','기타':'대변상태에 특이사항이 있으심.'},
'기저귀 착용여부':{'착용':'기저귀를 착용하심.','미착용':'기저귀는 착용하지 않으심.'}
};if(x[f]&&x[f][o])return x[f][o];if(i===1&&f==='치아상태'&&o==='틀니')return '치아상태는 {틀니종류}를 사용하심.';if(f==='식사형태')return `${o==='기타'?'{기타}':o}으로 식사하심.`;if(f==='치아상태'||f==='잇몸상태')return `${f}는 ${o} 상태이심.`;if(f==='정기진료')return o==='유'?'정기적으로 진료받으심.':'정기진료를 받지 않으심.';if(f==='주수발자')return o==='유'?'주수발자가 있으심.':'주수발자가 없으심.';if(f==='희망 서비스')return `${o} 이용을 희망하심.`;if(f==='발음능력'||f==='청력상태'||f==='의사소통')return `${f}는 ${o} 상태이심.`;if(f==='식사 시 문제점')return `식사 시 ${o}이 있으심.`;if(f==='기피식품')return '';if(i===3 && ['완전자립','부분도움','완전도움'].includes(o)){const ending=o==='완전자립'?'스스로 수행할 수 있는 상태임.':o==='부분도움'?'주수발자의 부분적인 도움이 필요한 상태임.':'주수발자의 전적인 도움이 필요한 상태임.';return `${f}는 {질환}으로 인해 {도움사유} ${ending}`;}return `${f}: ${o} 상태이심.`}
function fields(i){return [...(sections[i].fields||[]),...(settings.extras[i]||[])]}
function template(i,f,o){const k=id(i,f,o);let saved=settings.phrases[k];if(i===5&&f==='청력상태'&&o.startsWith('정상(보청기 ')&&saved===undefined){const legacy=settings.phrases[id(i,f,'정상(보청기 사용 포함)')];if(typeof legacy==='string')saved=legacy.replaceAll('정상(보청기 사용 포함)',o);}if(i===1&&f==='치아상태'&&o==='틀니'&&saved==='치아상태는 틀니 상태이심.')return defaultPhrase(i,f,o);if(i===3&&saved===`${f}: ${o} 상태이심.`)return defaultPhrase(i,f,o);return Object.prototype.hasOwnProperty.call(settings.phrases,k)?saved:defaultPhrase(i,f,o)}
function customTemplate(i,f){const k=id(i,f,'input');return Object.prototype.hasOwnProperty.call(settings.custom,k)?settings.custom[k]:`{${f}}`}
function otherValue(i,f){return String(state[i]['기타 입력::'+f]||'').trim()}
function displayChoice(i,f,choice){return choice==='기타'?(otherValue(i,f)||'OOO'):choice}
function interpolate(str,i,f,choice){return String(str).replace(/\{([^{}]+)\}/g,(_,k)=>{
 if(k==='틀니종류')return state[1]['틀니종류']||'틀니 종류 미선택';
  if(k==='기타' || k==='기타내용' || k==='기타 입력' || k==='기타 입력값')return otherValue(i,f)||'OOO';
 if(k===f && choice==='기타')return otherValue(i,f)||'OOO';
 return String(state[i][k]||'OOO')
})}
function mealSentence(){
 const meal=state[0]['식사형태'],issue=state[0]['식사 시 문제점'];
 let mealText=interpolate(template(0,'식사형태',meal),0,'식사형태',meal).trim().replace(/[.。\s]+$/,'');
 if(meal==='기타' && otherValue(0,'식사형태'))mealText=mealText.replace(/기타/g,otherValue(0,'식사형태'));
 if(!issue)return mealText+'.';
 let issueText=interpolate(template(0,'식사 시 문제점',issue),0,'식사 시 문제점',issue).trim().replace(/[.。\s]+$/,'');
 if(issue==='기타' && otherValue(0,'식사 시 문제점'))issueText=issueText.replace(/기타/g,otherValue(0,'식사 시 문제점'));
 // 기존 관리자 설정의 기본 결합식을 사용 중이라면 새 문장 순서로 자동 전환.
 const oldDefault='{식사형태문구}, {식사문제문구}.';
 const pattern=(!settings.mealJoinTemplate||settings.mealJoinTemplate===oldDefault)
  ?'{식사문제연결문구}, {식사형태문구}.' : settings.mealJoinTemplate;
 const issueClause=issueText.replace(/(?:은|는)\s*없으심$/,'은 없으며')
   .replace(/이 있으심$/,'이 있으시며')
   .replace(/가 있으심$/,'가 있으시며')
   .replace(/을 호소하심$/,'을 호소하시며')
   .replace(/하심$/,'하시며');
 return pattern.replace(/\{식사형태문구\}/g,mealText)
  .replace(/\{식사문제연결문구\}/g,issueClause)
  .replace(/\{식사문제문구\}/g,issueText)
  .replace(/\s+,/g,',').replace(/,\s*\./g,'.').trim();
}
function excretionSentence(){
 const urine=state[0]['소변상태'],stool=state[0]['대변상태'],diaper=state[0]['기저귀 착용여부'];
 const get=(f,o)=>interpolate(template(0,f,o),0,f,o).trim();
 const custom=String(state[0]['기저귀 착용 사유']||'').trim();
 const reasons=[];
 if(urine==='요실금')reasons.push('요실금');
 if(stool==='지속적인 설사')reasons.push('설사');
 const config=settings.excretion||{};
 if(diaper==='착용'){
   // 기저귀 착용 사유와 별개로 정상 배설상태도 누락 없이 출력한다.
   const normalLines=[];
   if(urine==='양호')normalLines.push(get('소변상태',urine));
   if(stool==='양호')normalLines.push(get('대변상태',stool));
   let diaperText='';
   if(custom)diaperText=(config.customReason||'{사유}로 인해 기저귀를 착용하심.').replaceAll('{사유}',custom);
   else if(reasons.length===2)diaperText=config.both||'요실금과 설사가 있으시어 기저귀를 착용하심.';
   else if(reasons.length===1)diaperText=(reasons[0]==='요실금'?config.urineReason:config.stoolReason)||(reasons[0]==='요실금'?'요실금이 있으시어 기저귀를 착용하심.':'설사가 있으시어 기저귀를 착용하심.');
   else diaperText=config.otherReason||'기저귀를 착용하심. (착용 사유 확인 필요)';
   return [...normalLines,diaperText].filter(Boolean).join('\n');
 }
 return [get('소변상태',urine),get('대변상태',stool),get('기저귀 착용여부','미착용')].filter(Boolean).join('\n');
}
function result(i){if(i===7)return resourceText();if(i===6)return familyText();if(i===3)return physicalResult();if(sections[i].disease)return diseaseText();if(sections[i].cist)return cistText();let lines=[];for(const [f,opts] of fields(i)){
 if(i===0&&(f==='식사형태'||f==='식사 시 문제점')){if(f==='식사형태'&&state[0]['식사형태'])lines.push(mealSentence());continue}
 if(i===0&&['소변상태','대변상태','기저귀 착용여부'].includes(f)){if(f==='소변상태')lines.push(excretionSentence());continue}
 const choice=state[i][f]??opts[0];const t=template(i,f,choice);if(t.trim()){let rendered=interpolate(t,i,f,choice);if(i===3){const illness=String(state[i]['질환']||'').trim();const reason=String(state[i]['도움사유']||'').trim();rendered=rendered.replaceAll('{질환}',illness||'질환 미입력').replaceAll('{도움사유}',reason||'일상생활 동작 수행에 어려움이 있어');}  if(choice==='기타'&&otherValue(i,f))rendered=rendered.replace(/기타/g,otherValue(i,f));lines.push(rendered)}}
 for(const f of sections[i].custom||[]){
  const value=String(state[i][f]||'').trim();
  if(!value)continue;
  // 기피식품은 선택 문구 안의 {기피식품 종류} 자리에만 삽입한다.
  if(i===0&&f==='기피식품 종류')continue;
  if(i===3&&['질환','도움사유'].includes(f))continue;
  const raw=customTemplate(i,f);
  // 다른 직접 입력값도 이미 선택 문구에서 참조한 경우 중복 출력하지 않는다.
  const referenced=fields(i).some(([name,opts])=>{
    const selected=state[i][name]??opts[0];
    return template(i,name,selected).includes('{'+f+'}');
  });
  if(!referenced)lines.push(interpolate(raw,i,f));
 }return lines.join('\n')}
const cistBehaviors=['망상 (남을 의심하거나, 위협을 느낌)','환각 (헛것을 보거나 환청을 듣는다.)','배회 (의미 없이 걷는다.)','반복적인 행동 (의미 없는 행동을 한다.)','부적절한 행동 (불결행위 및 숨기는 행동을 한다.)','폭력적 행동 (주변인에게 폭력적인 행동을 보인다.)','우울 (슬프거나 처져있고 때로는 운다.)','불안 (서성이거나, 안절부절 못한다.)'];
const cistBehaviorPhrases=['망상 증상을 보이심.','환각 증상을 보이심.','배회하는 모습을 보이심.','반복적인 행동을 보이심.','부적절한 행동을 보이심.','폭력적인 행동을 보이심.','우울한 모습을 보이심.','불안한 모습을 보이심.'];
const cistDefaultTemplate='<CIST 평가결과>\n{양호문구}\n{저하문구}\n{부재문구}\n\n*평가 결과 {인지저하원인}로 인한 전반적인 인지저하가 의심되는 상태이심.\n{추가관찰}';
const cistLegacyTemplate='CIST 평가 결과 총 {총점}/30점이심.\n{영역별점수}.\n상대적으로 높은 수행 영역: {상대적강점}.\n상대적으로 낮은 수행 영역: {상대적약점}.\n{기준안내}\n{추가관찰}';
function cistText(){
 const els=[...document.querySelectorAll('[data-score]')],nums=els.map(e=>e.value.trim()===''?null:Number(e.value));
 if(nums.some((n,j)=>n!==null&&(!Number.isInteger(n)||n<0||n>cistDomains[j][1])))return '점수 입력 오류: 영역별 점수 범위를 확인하세요.';
 if(nums.some(n=>n===null))return '영역별 점수를 모두 입력하면 판단근거가 생성됩니다.';
 const good=[],low=[],absent=[];
 const thresholds=[3,2,2,4,6,3];
 cistDomains.forEach(([name],j)=>{const score=nums[j];(score===0?absent:score>=thresholds[j]?good:low).push(name)});
 const total=nums.reduce((a,b)=>a+b,0);
 const note=document.getElementById('cistNote')?.value.trim()||'';
 const cause=document.getElementById('cistCause')?.value.trim()||'';
 const checked=[...document.querySelectorAll('[data-cist-behavior]:checked')].map(el=>Number(el.dataset.cistBehavior));
 const behaviorText=checked.length?checked.map(i=>'- '+(settings.cistBehaviorPhrases?.[i]||cistBehaviorPhrases[i])).join('\n'):'- 상기와 같은 문제상황은 보이지 않으심.';
 const vals={인지저하원인:cause||'원인 미입력',총점:total,영역별점수:cistDomains.map(([n,m],j)=>`${n} ${nums[j]}/${m}점`).join(', '),
  양호문구:good.length?`- ${good.join(', ')}은 양호하심.`:'',
  저하문구:low.length?`- ${low.join(', ')}의 저하가 관찰되심.`:'',
  부재문구:absent.length?`- ${absent.join(', ')}의 부재가 나타나심.`:'',
  추가관찰:[behaviorText,note?`- ${note.replace(/^[-\s]+/,'')}`:''].filter(Boolean).join('\n')};
 const configured=settings.cist.template;
 const tpl=(!configured||configured===cistLegacyTemplate?cistDefaultTemplate:configured).replace(/평가 결과 치매로 인한 전반적인 인지저하가 의심되는 상태이심\./g,'평가 결과 {인지저하원인}로 인한 전반적인 인지저하가 의심되는 상태이심.');
 return tpl.replace(/\{([^{}]+)\}/g,(_,k)=>vals[k]??'').split('\n').filter((line,i,all)=>line.trim()!==''||i>0&&all[i-1].trim()!==''&&all.slice(i+1).some(x=>x.trim()!=='')).join('\n').trim();
}
function draw(){document.body.classList.toggle('admin-mode',role==='admin'&&adminEditing);document.body.classList.toggle('staff-mode',!adminEditing);nav.innerHTML='';panels.innerHTML='';sections.forEach((s,i)=>{const b=document.createElement('button');b.textContent=`${i+1}. ${s.title}`;b.onclick=()=>show(i);nav.appendChild(b);const p=document.createElement('section');p.className='panel';p.id='panel'+i;p.innerHTML=`<h2>${i+1}. ${esc(s.title)}</h2><p class="muted">항목을 선택하면 관리자 지정 문구가 자동 생성됩니다.</p><div id="fields${i}"></div><div class="output"><h3>판단근거 미리보기</h3><div class="result" id="result${i}"></div><div class="actions"><button class="primary" data-copy>이 영역 복사</button></div></div>`;panels.appendChild(p);const area=p.querySelector('#fields'+i);if(s.disease){renderDisease(area)}else if(i===6){renderFamily(area)}else if(i===7){renderResources(area)}else if(i===3){renderPhysical(area)}else if(s.cist){area.innerHTML=`<p class="muted">영역별 판정 기준: 지남력 3점 이상, 주의력 2점 이상, 시공간기능 2점, 집행기능 4점 이상, 기억력 6점 이상, 언어기능 3점 이상은 양호 · 0점은 부재 · 그 외는 저하 의심</p><div class="scoregrid">${cistDomains.map(([name,max],j)=>`<label>${name} (0~${max})<input data-score="${j}" type="number" min="0" max="${max}" step="1" placeholder="점수"></label>`).join('')}</div><div class="field"><label>인지저하 원인 (직접 입력)</label><input id="cistCause" type="text" placeholder="예: 치매, 뇌경색"></div><div class="field"><label>문제행동 (1~8번, 해당하는 경우 체크)</label><div class="behavior-list">${cistBehaviors.map((label,j)=>`<label class="behavior-item"><input type="checkbox" data-cist-behavior="${j}"><span>${j+1}. ${esc(label)}</span></label>`).join('')}</div></div><div class="field"><label>추가 관찰 내용</label><textarea id="cistNote" placeholder="필요한 경우에만 입력"></textarea></div><div class="adminbox ${role==='admin'?'':'hidden'}"><strong>CIST 관리자 문구 설정</strong><p class="muted">영역별 점수에 따라 양호·저하 의심·부재로 자동 분류합니다. 사용 가능: {총점}, {영역별점수}, {양호문구}, {저하문구}, {부재문구}, {인지저하원인}, {추가관찰}.</p><label>자동 판단근거 템플릿<textarea id="cistTemplate">${esc(!settings.cist.template||settings.cist.template===cistLegacyTemplate?cistDefaultTemplate:settings.cist.template.replace(/평가 결과 치매로 인한 전반적인 인지저하가 의심되는 상태이심\./g,'평가 결과 {인지저하원인}로 인한 전반적인 인지저하가 의심되는 상태이심.'))}</textarea></label><button class="primary" id="saveCist">CIST 설정 저장</button></div>`;area.querySelectorAll('[data-score]').forEach(e=>e.oninput=update);area.querySelectorAll('[data-cist-behavior]').forEach(e=>e.onchange=update);area.querySelector('#cistNote').oninput=update;area.querySelector('#cistCause').oninput=update;const sc=area.querySelector('#saveCist');if(sc)sc.onclick=()=>{settings.cist={template:area.querySelector('#cistTemplate').value};save();update()}}else{fields(i).forEach(([f,opts])=>{if(state[i][f]===undefined||!opts.includes(state[i][f]))state[i][f]=opts[0];if(i===0&&f==='소변상태'){const h=document.createElement('h3');h.textContent='배설 양상';h.className='subsection-heading';area.appendChild(h)}const row=document.createElement('div');row.className='field';row.innerHTML=`<label>${esc(f)}</label><div class="chips">${(i===5&&f==='청력상태'?opts.filter(o=>!o.startsWith('정상(보청기 ')):opts).map(o=>`<label class="chip"><input type="radio" name="field-${i}-${esc(f)}" value="${esc(o)}" ${state[i][f]===o?'checked':''}>${esc(o)}</label>`).join('')}${i===5&&f==='청력상태'?`<div class="hearing-normal"><label class="chip hearing-main"><input type="radio" name="field-${i}-${esc(f)}" value="${esc(state[i][f].startsWith('정상(보청기 ')?state[i][f]:'정상(보청기 미사용)')}" ${state[i][f].startsWith('정상(보청기 ')?'checked':''}>정상</label><span class="hearing-sub">( <label><input type="radio" name="hearing-aid" value="정상(보청기 사용)" ${state[i][f]==='정상(보청기 사용)'?'checked':''}>보청기 사용</label><label><input type="radio" name="hearing-aid" value="정상(보청기 미사용)" ${state[i][f]==='정상(보청기 미사용)'?'checked':''}>보청기 미사용</label> )</span></div>`:''}</div><div class="adminbox ${role==='admin'?'':'hidden'}"><strong>선택지별 판단근거 편집</strong><p class="muted">각 선택지에 출력할 문장을 입력하세요. {기타}로 기타 입력값을, 신체상태에서는 {질환}·{도움사유}로 입력값을 삽입할 수 있습니다. 빈 문구는 출력하지 않습니다.</p>${opts.map(o=>`<label class="admin-label">${esc(o)}<textarea data-phrase="${esc(o)}">${esc(template(i,f,o))}</textarea></label>`).join('')}<button class="primary" data-save>이 항목 문구 저장</button></div>`;if(opts.includes('기타')){
 const otherBox=document.createElement('div');otherBox.className='other-input-box';
 const otherLabel=document.createElement('label');otherLabel.textContent=f+' 기타 내용 (직접 입력)';
 const otherInput=document.createElement('input');otherInput.type='text';otherInput.placeholder='기타 선택 시 입력 가능';otherInput.value=state[i]['기타 입력::'+f]||'';
 const toggleOther=()=>{otherInput.disabled=state[i][f]!=='기타';otherBox.classList.toggle('hidden',otherInput.disabled)};
 otherInput.oninput=()=>{state[i]['기타 입력::'+f]=otherInput.value;update()};
 otherBox.append(otherLabel,otherInput);row.querySelector('.chips').after(otherBox);
 row.querySelectorAll('input[type=radio]').forEach(e=>e.onchange=()=>{state[i][f]=e.value;toggleOther();update()});toggleOther();
 }else {row.querySelectorAll('.chips input[type=radio]').forEach(e=>e.onchange=()=>{state[i][f]=e.value;if(i===5&&f==='청력상태'){const main=row.querySelector('.hearing-main input');const sub=row.querySelectorAll('[name=hearing-aid]');if(e.name==='hearing-aid'){main.value=e.value;main.checked=true;}else if(e===main){const chosen=[...sub].find(x=>x.checked);state[i][f]=chosen?chosen.value:'정상(보청기 미사용)';main.value=state[i][f];}else{sub.forEach(x=>x.checked=false);} }update()});} row.querySelector('[data-save]').onclick=()=>{row.querySelectorAll('[data-phrase]').forEach(e=>settings.phrases[id(i,f,e.dataset.phrase)]=e.value);save();update()};
// 기피식품 입력란은 '있음'을 선택한 경우에만 해당 항목 바로 아래 표시
if(i===0&&f==='기피식품'){
 const box=document.createElement('div');box.className='inline-detail hidden';
 box.innerHTML='<label>기피식품 종류 (직접 입력)</label><input type="text" placeholder="예: 사과, 버섯, 생선">';
 const input=box.querySelector('input');input.value=state[0]['기피식품 종류']||'';
 input.oninput=()=>{state[0]['기피식품 종류']=input.value;update()};
 row.querySelector('.chips').after(box);
 const toggle=()=>box.classList.toggle('hidden',state[0]['기피식품']!=='있음');
 row.querySelectorAll('input[type=radio]').forEach(el=>el.addEventListener('change',toggle));toggle();
}
// 틀니 선택 시 종류를 바로 아래에서 선택 (직원/관리자 공통)
if(i===1&&f==='치아상태'){
 const box=document.createElement('div');box.className='inline-detail hidden';
 const types=['완전틀니','아래쪽 부분틀니','위쪽 부분틀니','임플란트'];
 box.innerHTML='<label>틀니 종류</label><div class="chips">'+types.map(t=>'<label class="chip"><input type="radio" name="denture-type" value="'+t+'" '+(state[1]['틀니종류']===t?'checked':'')+'>'+t+'</label>').join('')+'</div>';
 box.querySelectorAll('input').forEach(el=>el.onchange=()=>{state[1]['틀니종류']=el.value;update()});
 row.querySelector('.chips').after(box);
 const toggle=()=>box.classList.toggle('hidden',state[1]['치아상태']!=='틀니');
 row.querySelectorAll(':scope > .chips input[type=radio]').forEach(el=>el.addEventListener('change',toggle));toggle();
}
area.appendChild(row)});if(i===0){
 const reasonBox=document.createElement('div');reasonBox.className='field';reasonBox.innerHTML='<label>기저귀 착용 사유 (필요할 때만 직접 입력)</label><input type="text" id="diaperReason" placeholder="예: 이동이 어려워 화장실 이용에 도움이 필요함"><p class="muted">직접 입력한 사유가 있으면 요실금·설사 자동 조합 대신 이 사유를 우선 사용합니다.</p>';
 reasonBox.querySelector('input').value=state[0]['기저귀 착용 사유']||'';
 reasonBox.querySelector('input').oninput=e=>{state[0]['기저귀 착용 사유']=e.target.value;update()};
 const diaperRow=[...area.querySelectorAll('.field')].find(el=>el.querySelector('label')?.textContent==='기저귀 착용여부');
 if(diaperRow)diaperRow.after(reasonBox);else area.appendChild(reasonBox);
}
if(i===0&&role==='admin'){
 const joinBox=document.createElement('div');joinBox.className='adminbox';
 joinBox.innerHTML='<strong>식사형태 + 식사 시 문제점 통합 출력 설정</strong><p class="muted">각 선택지 문구는 위에서 개별 수정하고, 최종 출력에서는 아래 틀로 한 문장으로 합칩니다. 사용 변수: {식사형태문구}, {식사문제연결문구}, {식사문제문구}</p><textarea id="mealJoinTemplate" rows="3"></textarea><button class="primary" id="saveMealJoin">통합 문구 형식 저장</button>';
 area.appendChild(joinBox);joinBox.querySelector('textarea').value=(settings.mealJoinTemplate&&settings.mealJoinTemplate!=='{식사형태문구}, {식사문제문구}.'?settings.mealJoinTemplate:'{식사문제연결문구}, {식사형태문구}.');
 joinBox.querySelector('button').onclick=()=>{const t=joinBox.querySelector('textarea').value;if(!t.includes('{식사형태문구}')||(!t.includes('{식사문제연결문구}')&&!t.includes('{식사문제문구}')))return alert('식사형태문구와 식사문제 관련 변수 하나를 포함해 주세요.');settings.mealJoinTemplate=t;save();update()};
 const exBox=document.createElement('div');exBox.className='adminbox';
 exBox.innerHTML='<strong>배설 양상 · 기저귀 조합 문구 설정</strong><p class="muted">착용 상태에서는 중복 문구 없이 한 문장으로 출력합니다. 미착용 상태에서는 위의 소변·대변 선택지별 문구가 각각 출력됩니다.</p>'+
 [['urineReason','요실금 + 착용','요실금이 있으시어 기저귀를 착용하심.'],['stoolReason','설사 + 착용','설사가 있으시어 기저귀를 착용하심.'],['both','요실금 + 설사 + 착용','요실금과 설사가 있으시어 기저귀를 착용하심.'],['otherReason','기타 상태 + 착용','기저귀를 착용하심. (착용 사유 확인 필요)'],['customReason','직접 입력 사유 + 착용','{사유}로 인해 기저귀를 착용하심.']].map(([key,label,def])=>`<label class="admin-label">${label}<textarea data-exkey="${key}">${esc(settings.excretion?.[key]??def)}</textarea></label>`).join('')+'<button class="primary" id="saveExcretion">배설 조합 문구 저장</button>';
 area.appendChild(exBox);
 exBox.querySelector('button').onclick=()=>{const next={};exBox.querySelectorAll('[data-exkey]').forEach(el=>next[el.dataset.exkey]=el.value);if(!next.customReason.includes('{사유}'))return alert('직접 입력 사유 문구에 {사유}를 포함해 주세요.');settings.excretion=next;save();update()};

 }
 (s.custom||[]).filter(f=>!(i===0&&f==='기피식품 종류')).forEach(f=>{const row=document.createElement('div');row.className='field';row.innerHTML=`<label>${esc(f==='질환'?'신체상태 관련 질환':f==='도움사유'?'신체상태 도움 필요 사유':f)} (직접 입력)</label><input type="text" placeholder="내용을 입력하세요"><div class="adminbox ${role==='admin'?'':'hidden'}"><strong>직접 입력 문구 설정</strong><p class="muted">{${esc(f)}}를 입력값으로 치환합니다.</p><textarea>${esc(customTemplate(i,f))}</textarea><button class="primary">입력 문구 저장</button></div>`;row.querySelector('input').value=state[i][f]||'';row.querySelector('input').oninput=e=>{state[i][f]=e.target.value;update()};row.querySelector('.adminbox button').onclick=()=>{settings.custom[id(i,f,'input')]=row.querySelector('textarea').value;save();update()};area.appendChild(row)});if(role==='admin'){const box=document.createElement('div');box.className='adminbox';box.innerHTML='<strong>새 선택 항목 추가</strong><p class="muted">이 영역에 새로운 선택 항목을 추가할 수 있습니다.</p><label>항목명<input type="text" class="newName" placeholder="예: 기저귀 착용여부"></label><label>선택지 (쉼표로 구분)<input type="text" class="newOptions" placeholder="예: 착용, 미착용"></label><button class="primary">항목 추가</button>';box.querySelector('button').onclick=()=>{const name=box.querySelector('.newName').value.trim(),opts=box.querySelector('.newOptions').value.split(',').map(x=>x.trim()).filter(Boolean);if(!name||!opts.length)return alert('항목명과 선택지를 입력하세요.');if(fields(i).some(([f])=>f===name))return alert('이미 존재하는 항목명입니다.');(settings.extras[i]??=[]).push([name,opts]);state[i][name]=opts[0];save();draw()};area.appendChild(box)}}p.querySelector('[data-copy]').onclick=()=>copyText(result(i));const layout=document.createElement('div');layout.className='assessment-columns';area.parentNode.insertBefore(layout,area);layout.appendChild(area);layout.appendChild(p.querySelector('.output'));});update();syncAdminEditUi()}
function show(i){active=i;document.querySelectorAll('nav button').forEach((b,j)=>b.classList.toggle('active',j===i));const target=document.getElementById('panel'+i);if(target)target.scrollIntoView({behavior:'smooth',block:'start'});}
// 미리보기에서 사용자 선택/입력으로 달라지는 값만 강조합니다.
// 출력 텍스트와 복사 데이터는 변경하지 않습니다.
function dynamicPreviewWords(i){
 // 파란색 강조는 사용자가 키보드로 직접 입력한 텍스트만 적용합니다.
 // 라디오/체크박스 선택값과 자동 생성된 관계·지역·경제상태는 강조하지 않습니다.
 const values=[];
 const add=v=>{if(typeof v==='string'&&v.trim())values.push(v.trim())};
 const panel=document.getElementById('fields'+i);
 panel?.querySelectorAll('input[type="text"],textarea').forEach(el=>{
  if(!el.closest('.adminbox')&&!el.disabled)add(el.value);
 });
 // 질병상태에서 DOM 외부 상태에 보관하는 직접 입력값
 if(i===2){
  add(diseaseState.history);add(diseaseState.notes);
  Object.entries(diseaseState.extra).forEach(([k,v])=>{if(diseaseState.checked[k])add(v)});
 }
 return [...new Set(values)].sort((a,b)=>b.length-a.length);
}
function renderPreview(e,output,i){
 const warning='(착용 사유 확인 필요)';
 const words=dynamicPreviewWords(i).filter(x=>x!==warning);
 const pieces=[{text:warning,type:'warning'},...words.map(text=>({text,type:'dynamic'}))].sort((a,b)=>b.text.length-a.text.length);
 e.replaceChildren();let pos=0;
 while(pos<output.length){
  let next=-1,found=null;
  for(const item of pieces){const at=output.indexOf(item.text,pos);if(at!==-1&&(next===-1||at<next||(at===next&&item.text.length>found.text.length))){next=at;found=item}}
  if(next===-1){e.appendChild(document.createTextNode(output.slice(pos)));break}
  if(next>pos)e.appendChild(document.createTextNode(output.slice(pos,next)));
  const span=document.createElement('span');span.className=found.type==='warning'?'diaper-warning':'dynamic-value';span.textContent=found.text;e.appendChild(span);
  pos=next+found.text.length;
 }
}
// 영양·배설 상충 선택 방지: 기존 UI 배치 및 문구 설정은 변경하지 않음.
const restrictedMealTypes=new Set(['다진식','죽식','미음','유동식','연하식','갈은식']);
let lastNutritionField='';
document.addEventListener('change',e=>{
 const el=e.target;
 if(el?.matches?.('#fields0 input[type="radio"]')){
  const row=el.closest('.field');
  const label=row?.querySelector(':scope > label')?.textContent?.trim();
  if(['식사형태','식사 시 문제점','소변상태','대변상태','기저귀 착용여부'].includes(label)){
   lastNutritionField=label;
   // 기존 onchange 핸들러가 상태를 갱신한 직후 한 번 더 동기화
   queueMicrotask(()=>update());
  }
 }
},true);
function syncNutritionRestrictions(){
 const v=state[0];if(!v)return;
 const issue=v['식사 시 문제점'];
 const meal=v['식사형태'];
 const needsModifiedMeal=issue==='저작곤란'||issue==='연하곤란';
 // 이미 선택된 값이 충돌할 때에는 마지막으로 변경한 항목을 우선한다.
 // 질환이나 식사형태를 임의로 추측하여 선택하지 않는다.
 if(needsModifiedMeal&&meal==='일반식'){
  v['식사형태']='';
 }else if(issue==='양호'&&restrictedMealTypes.has(meal)){
  if(lastNutritionField==='식사형태')v['식사 시 문제점']='';
  else v['식사형태']='일반식';
 }
 const eligible=v['소변상태']==='요실금'||v['대변상태']==='지속적인 설사';
 if(!eligible&&v['기저귀 착용여부']==='착용')v['기저귀 착용여부']='미착용';
 const disabled=(field,value)=>
  (field==='식사 시 문제점'&&value==='양호'&&restrictedMealTypes.has(v['식사형태']))||
  (field==='식사형태'&&value==='일반식'&&['저작곤란','연하곤란'].includes(v['식사 시 문제점']))||
  (field==='식사형태'&&restrictedMealTypes.has(value)&&v['식사 시 문제점']==='양호')||
  (field==='기저귀 착용여부'&&value==='착용'&&!eligible);
 document.querySelectorAll('#fields0 .field').forEach(row=>{
  const field=row.querySelector(':scope > label')?.textContent?.trim();
  if(!['식사형태','식사 시 문제점','소변상태','대변상태','기저귀 착용여부'].includes(field))return;
  row.querySelectorAll(':scope > .chips input[type="radio"]').forEach(input=>{
   const block=disabled(field,input.value);
   input.disabled=block;
   input.checked=v[field]===input.value;
   const chip=input.closest('.chip');
   if(chip){chip.style.opacity=block?'0.42':'';chip.style.cursor=block?'not-allowed':'';}
  });
 });
}
function update(){syncNutritionRestrictions();sections.forEach((s,i)=>{const e=document.getElementById('result'+i);if(e)renderPreview(e,result(i),i)})}

async function copyText(t){if(t.includes('점수 입력 오류')||t.includes('점수를 모두 입력'))return alert('점수를 확인하세요.');try{await navigator.clipboard.writeText(t)}catch{const el=document.createElement('textarea');el.value=t;document.body.appendChild(el);el.select();document.execCommand('copy');el.remove()}alert('판단근거를 복사했습니다.')}
document.getElementById('copyAll').onclick=()=>copyText(sections.map((s,i)=>`[${i+1}. ${s.title}]\n${result(i)}`).join('\n\n'));
// 관리자는 기본적으로 직원과 같은 작성 화면을 사용하고, 버튼으로 문구 편집을 전환합니다.
function syncAdminEditUi(){
  const allowed=role==='admin' && window.needsIsAdmin===true;
  document.body.classList.toggle('admin-mode',allowed&&adminEditing);
  document.body.classList.toggle('staff-mode',!allowed||!adminEditing);
  let style=document.getElementById('needsAdminEditStyle');
  if(!style){
    style=document.createElement('style');style.id='needsAdminEditStyle';
    style.textContent='body:not(.admin-mode) .adminbox{display:none!important}';
    document.head.appendChild(style);
  }
  const copy=document.getElementById('copyAll');
  if(!copy)return;
  let button=document.getElementById('adminEditToggle');
  if(!button){
    button=document.createElement('button');
    button.type='button';button.id='adminEditToggle';
    button.style.marginRight='10px';
    copy.parentNode.insertBefore(button,copy);
    button.addEventListener('click',()=>{
      if(role!=='admin'||window.needsIsAdmin!==true)return;
      adminEditing=!adminEditing;
      syncAdminEditUi();
    });
  }
  button.hidden=!allowed;
  button.style.display=allowed?'':'none';
  button.textContent=adminEditing?'판단근거 작성으로 돌아가기':'관리자 문구 편집';
}
function applyAdminAccess(){
  role=window.needsIsAdmin===true?'admin':'staff';
  if(role!=='admin')adminEditing=false;
  draw();
  syncAdminEditUi();
}
window.addEventListener('needs-admin-auth',applyAdminAccess);
applyAdminAccess();
