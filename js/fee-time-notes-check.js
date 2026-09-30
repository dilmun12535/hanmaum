const $=id=>document.getElementById(id), pad=n=>String(n).padStart(2,'0'); let records=[], results=[], filter='all', wb=null;
function norm(v){return String(v??'').replace(/\s+/g,' ').trim()} function compact(v){return norm(v).replace(/\s+/g,'')}
function dateVal(v){if(v instanceof Date&&!isNaN(v))return `${v.getFullYear()}-${pad(v.getMonth()+1)}-${pad(v.getDate())}`; if(typeof v==='number'){const d=XLSX.SSF.parse_date_code(v);if(d)return `${d.y}-${pad(d.m)}-${pad(d.d)}`} const s=norm(v);let m=s.match(/(20\d{2})[.\/-]\s*(\d{1,2})[.\/-]\s*(\d{1,2})/);if(m)return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;return ''}
function numberMinutes(v){
  if(typeof v==='number' && Number.isFinite(v)) return Math.round(v);
  const s=norm(v).replace(/,/g,'');
  let m=s.match(/(\d{2,4})\s*분/); if(m) return Number(m[1]);
  if(/^\d{2,4}$/.test(s)) return Number(s);
  return null;
}
function band(m){if(m==null)return '';if(m<180)return '3시간 미만';if(m<360)return '3시간 이상 6시간 미만';if(m<480)return '6시간 이상 8시간 미만';if(m<600)return '8시간 이상 10시간 미만';if(m<780)return '10시간 이상 13시간 미만';return '13시간 이상'}
function feeBand(v){
  const s=compact(v).replace(/수가/g,'');
  if(!s)return '';
  // 긴 구간부터 판정해야 '10시간이상13시간미만'의 끝부분 '3시간미만'을
  // 잘못 3시간 미만으로 인식하지 않는다.
  if(s.includes('10시간이상13시간미만'))return '10시간 이상 13시간 미만';
  if(s.includes('8시간이상10시간미만'))return '8시간 이상 10시간 미만';
  if(s.includes('6시간이상8시간미만'))return '6시간 이상 8시간 미만';
  if(s.includes('3시간이상6시간미만'))return '3시간 이상 6시간 미만';
  if(s.includes('13시간이상'))return '13시간 이상';
  if(/^3시간미만$/.test(s))return '3시간 미만';
  return norm(v);
}
function sameName(a,b){return compact(a)===compact(b)} function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function rows(sh){return XLSX.utils.sheet_to_json(sh,{header:1,defval:'',raw:true})}
function detectName(rs,sheet){for(let r=0;r<Math.min(rs.length,35);r++){for(let c=0;c<Math.min((rs[r]||[]).length,12);c++){let s=norm(rs[r][c]);if(/수급자명|성명/.test(s)){for(let k=c+1;k<=c+3;k++){let x=norm(rs[r][k]);if(x&&!/수급자명|성명|생년|성별/.test(x))return x}}}} const s=sheet.replace(/[\[\]()_\-0-9]/g,' ').trim();return s.length<=12?s:''}
function parseWorkbook(workbook){
 const out=[];
 workbook.SheetNames.forEach(sn=>{
  const rs=rows(workbook.Sheets[sn]), name=detectName(rs,sn); if(!name)return;

  // 제공기록지 실제 양식 대응:
  // 날짜행: A열에 "(2024) 년 월/일", 각 날짜칸에는 "03 / 04 (월)"
  // 바로 다음 행: A열 "총시간", 날짜와 같은 열에 "605분"처럼 기록됨.
  for(let r=0;r<rs.length;r++){
    const row=rs[r]||[];
    const joined=norm(row.slice(0,5).join(' '));
    const ym=joined.match(/\(?\s*(20\d{2})\s*\)?\s*년\s*월\/?일/);
    if(!ym) continue;
    const year=Number(ym[1]);

    let totalRow=-1;
    for(let rr=r+1;rr<Math.min(rs.length,r+5);rr++){
      const lead=compact((rs[rr]||[]).slice(0,5).join(' '));
      if(/총시간|총이용시간|총이용분|이용시간\(분\)|총시간\(분\)/.test(lead)){ totalRow=rr; break; }
    }
    if(totalRow<0) continue;

    for(let c=0;c<row.length;c++){
      const ds=norm(row[c]);
      const dm=ds.match(/(\d{1,2})\s*\/\s*(\d{1,2})/);
      if(!dm) continue;
      const month=Number(dm[1]), day=Number(dm[2]);
      if(month<1||month>12||day<1||day>31) continue;
      const dt=`${year}-${pad(month)}-${pad(day)}`;
      const total=numberMinutes(rs[totalRow]?.[c]);
      if(total==null || total<0 || total>1440) continue;

      // 같은 날짜 열에 있는 모든 '특이사항' 행을 합쳐 가져온다.
      const notes=[];
      for(let rr=totalRow+1;rr<rs.length;rr++){
        const lead=compact((rs[rr]||[]).slice(0,Math.min(c,8)).join(' '));
        if(lead.includes('특이사항')){
          const t=norm(rs[rr]?.[c]);
          if(t && t!=='□' && t!=='■' && !/^※?별지첨부$/.test(compact(t))) notes.push(t);
        }
      }
      out.push({name,date:dt,totalMinutes:total,note:[...new Set(notes)].join('\n'),sheet:sn});
    }
  }
 });
 const m=new Map(); out.forEach(x=>m.set(`${compact(x.name)}|${x.date}`,x)); return [...m.values()];
}
function planStart(p){return dateVal(p.applicationStartDate||p.startDate||p.writtenDate)} function planEnd(p){return dateVal(p.applicationEndDate||p.endDate)||'9999-12-31'}
function choosePlan(plans,rec){const valid=plans.filter(p=>sameName(p.recipientName||p.name,rec.name)&&planStart(p)<=rec.date&&planEnd(p)>=rec.date);valid.sort((a,b)=>planStart(b).localeCompare(planStart(a)));return valid[0]||null}
function expectedFee(p,date){if(!p)return '';const dow=new Date(date+'T12:00:00').getDay();const weekend=dow===0||dow===6;return feeBand((weekend?p.weekendFee:p.weekdayFee)||p.planFee||'')}
function weekday(date){return ['일','월','화','수','목','금','토'][new Date(date+'T12:00:00').getDay()]}
async function run(){if(!wb){alert('제공기록지 엑셀을 먼저 선택해주세요.');return} $('fileStatus').textContent='제공기록지 분석 중...';records=parseWorkbook(wb);if(!records.length){$('fileStatus').textContent='총 이용시간(분)이 있는 날짜를 찾지 못했습니다.';return} const months=[...new Set(records.map(x=>x.date.slice(0,7)))];let plans=[];for(const m of months){const x=await window.HanmaumFirestore.carePlans(m);plans.push(...x)}const pm=new Map();plans.forEach(p=>pm.set(p.firestoreId||p.id||JSON.stringify(p),p));plans=[...pm.values()];results=records.map(rec=>{const p=choosePlan(plans,rec),dur=rec.totalMinutes,actual=band(dur),expected=expectedFee(p,rec.date);return {...rec,plan:p,dur,actual,expected,mismatch:!!expected&&expected!==actual}}).filter(x=>x.mismatch);$('days').textContent=records.length;$('mismatch').textContent=results.length;$('withNote').textContent=results.filter(x=>x.note).length;$('withoutNote').textContent=results.filter(x=>!x.note).length;$('fileStatus').textContent=`이용일 ${records.length}건 · 계획서 ${plans.length}건 연동`;render()}
function render(){const list=filter==='nonote'?results.filter(x=>!x.note):results;$('body').innerHTML=list.length?list.map(x=>`<tr class="bad"><td><b>${esc(x.name)}</b></td><td>${x.date}</td><td>${weekday(x.date)}</td><td><b>${esc(x.expected)}</b></td><td><b>${x.dur}분</b><br><span class="muted">${Math.floor(x.dur/60)}시간 ${x.dur%60}분</span></td><td>${esc(x.actual)}</td><td><span class="badge badge-bad">불일치</span></td><td class="note">${x.note?esc(x.note):'<span class="badge badge-bad">특이사항 없음</span>'}</td><td>${x.plan?`${planStart(x.plan)} ~ ${planEnd(x.plan)}`:'<span class="muted">계획서 없음</span>'}</td></tr>`).join(''):'<tr><td colspan="9" class="empty">해당 결과가 없습니다.</td></tr>'}
function exportX(){if(!results.length){alert('다운로드할 불일치 결과가 없습니다.');return}const data=results.map(x=>({'수급자':x.name,'날짜':x.date,'요일':weekday(x.date),'계획서 수가':x.expected,'총 이용시간(분)':x.dur,'총 이용시간':`${Math.floor(x.dur/60)}시간 ${x.dur%60}분`,'실제 시간구간':x.actual,'특이사항':x.note||'특이사항 없음','계획서 적용기간':x.plan?`${planStart(x.plan)} ~ ${planEnd(x.plan)}`:'계획서 없음'}));const ws=XLSX.utils.json_to_sheet(data);ws['!cols']=[12,12,7,25,16,25,70,25].map(w=>({wch:w}));const b=XLSX.utils.book_new();XLSX.utils.book_append_sheet(b,ws,'수가시간 불일치');XLSX.writeFile(b,'수가_이용시간_특이사항_검증.xlsx')}
$('file').addEventListener('change',async e=>{const f=e.target.files[0];if(!f)return;wb=XLSX.read(await f.arrayBuffer(),{type:'array',cellDates:true});$('fileStatus').textContent=`${f.name} 읽기 완료`});$('check').onclick=run;$('download').onclick=exportX;$('reset').onclick=()=>location.reload();document.querySelectorAll('.filters button').forEach(b=>b.onclick=()=>{filter=b.dataset.f;document.querySelectorAll('.filters button').forEach(x=>x.classList.toggle('active',x===b));render()});
