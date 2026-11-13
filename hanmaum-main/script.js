const S={first:null,second:null,firstRows:[],secondRows:[],rows:[],months:[],people:[],selectedPerson:""};
const $=id=>document.getElementById(id);
const E={first:$("firstFile"),second:$("secondFile"),firstName:$("firstName"),secondName:$("secondName"),firstStatus:$("firstStatus"),secondStatus:$("secondStatus"),analyze:$("analyzeBtn"),reset:$("resetBtn"),download:$("downloadBtn"),monthBar:$("monthBar"),month:$("monthSelect"),prev:$("prevMonth"),next:$("nextMonth"),main:$("mainGrid"),peopleBody:$("peopleBody"),peopleFoot:$("peopleFoot"),search:$("personSearch"),title:$("title"),subtitle:$("subtitle"),copayRate:$("copayRate"),notifyBase:$("notifyBase"),attend:$("attendCount"),lateExtraTotal:$("lateExtraTotal"),billingBase:$("billingBase"),monthlyAmount:$("monthlyAmount"),secondFileAmount:$("secondFileAmount"),amountDiff:$("amountDiff"),amountStatus:$("amountStatus"),billingGuide:$("billingGuide"),thead:$("thead"),tbody:$("tbody"),statusHead:$("statusHead"),statusBody:$("statusBody")};

E.first.onchange=e=>setFile("first",e.target.files[0]);E.second.onchange=e=>setFile("second",e.target.files[0]);E.analyze.onclick=analyze;E.reset.onclick=()=>location.reload();E.month.onchange=()=>{renderPeople();renderDetail()};E.prev.onclick=()=>move(-1);E.next.onclick=()=>move(1);E.search.oninput=renderPeople;E.download.onclick=download;

function setFile(type,file){S[type]=file||null;E[type+"Name"].textContent=file?.name||"선택된 파일 없음";E[type+"Status"].textContent=file?"파일 선택 완료":"대기 중"}

async function analyze(){
 if(!S.first||!S.second){alert("두 파일을 모두 선택해주세요.");return}
 E.analyze.disabled=true;
 try{
  const[a,b]=await Promise.all([readBook(S.first),readBook(S.second)]);
  S.firstRows=parseFirst(a);S.secondRows=parseSecond(b);S.rows=combine(S.firstRows,S.secondRows);
  S.months=[...new Set(S.rows.map(r=>r.date.slice(0,7)))].sort();
  S.people=[...new Map(S.rows.map(r=>[r.key,{key:r.key,name:r.name,cert:r.cert||""}])).values()].sort((a,b)=>a.name.localeCompare(b.name,"ko")||(a.cert||"").localeCompare(b.cert||""));
  E.month.innerHTML=S.months.map(m=>`<option value="${m}">${m.slice(0,4)}년 ${Number(m.slice(5))}월</option>`).join("");
  if(S.months.length)E.month.value=S.months.at(-1);
  S.selectedPerson=S.people[0]?.key||"";
  E.firstStatus.textContent=`${a.SheetNames.length}개 시트 · ${S.firstRows.length}건`;
  E.secondStatus.textContent=`${b.SheetNames.length}개 시트 · ${S.secondRows.length}건`;
  E.monthBar.classList.remove("hidden");E.main.classList.remove("hidden");E.download.disabled=false;renderPeople();renderDetail();
 }catch(err){console.error(err);alert(err.message||"분석 오류")}finally{E.analyze.disabled=false}
}

function parseFirst(book){
 const out=[];
 book.SheetNames.forEach(sn=>{
  const rows=XLSX.utils.sheet_to_json(book.Sheets[sn],{header:1,defval:"",raw:true});
  rows.forEach(r=>{const date=pDate(r?.[0]),st=pTime(r?.[1]),en=pTime(r?.[2]),name=cName(r?.[3]),cert=cleanCert(r?.[4]);if(date&&validName(name)&&(st||en))out.push({name,cert,key:personKey(name,cert),date,start:st,end:en,sheet:sn})});
 });
 return unique(out,r=>`${r.key}|${r.date}|${r.start}|${r.end}`);
}

function parseSecond(book){
 const out=[];
 book.SheetNames.forEach(sn=>{
  const rows=XLSX.utils.sheet_to_json(book.Sheets[sn],{header:1,defval:"",raw:true});if(!rows.length)return;
  const meta=findMeta(rows,sn),h=findHeader(rows);if(!h)return;
  for(let i=h.row+1;i<rows.length;i++){
   const r=rows[i]||[],date=pDate(r[h.date]);if(!date)continue;
   const tr=pRange(r[h.time]),rowName=h.name>=0&&validName(cName(r[h.name]))?cName(r[h.name]):meta.name;
   if(!validName(rowName))continue;
   out.push({
     name:rowName,cert:meta.cert||"",key:personKey(rowName,meta.cert),date,start:tr.start,end:tr.end,status:detectStatus(r),grade:meta.grade,copayRate:meta.copayRate||"",sheet:sn,
     totalAmount:parseMoney(h.total>=0?r[h.total]:"")
   });
  }
 });
 return unique(out,r=>`${r.key}|${r.date}|${r.status}|${r.start}|${r.end}`);
}

function findHeader(rows){
 for(let i=0;i<Math.min(rows.length,40);i++){
  const r=(rows[i]||[]).map(v=>txt(v).replace(/\s+/g,""));
  const d=r.findIndex(v=>v==="날짜"||v.includes("이용일"));
  const t=r.findIndex(v=>v.includes("서비스시간")||v.includes("이용시간"));
  const n=r.findIndex(v=>v==="수급자명"||v==="고객명"||v==="성명");
  const total=r.findIndex(v=>v==="급여총액"||v.includes("급여총액"));
  if(d>=0&&t>=0)return{row:i,date:d,time:t,name:n,total}
 }
 return null
}
function findMeta(rows,sn){
 let name="",grade="",cert="",copayRate="";
 for(let i=0;i<Math.min(rows.length,20);i++){const r=rows[i]||[];for(let j=0;j<r.length;j++){const v=txt(r[j]).replace(/\s+/g,"");
  if(!name&&["수급자","수급자명","고객명","성명","대상자"].some(k=>v.includes(k))){for(let o=1;o<=4;o++){const n=cName(r[j+o]);if(validName(n)){name=n;break}}}
  if(!grade&&v==="등급"){for(let o=1;o<=3;o++){const g=txt(r[j+o]).replace(/\s+/g,"");if(/^[1-5]등급$|인지지원등급/.test(g)){grade=g;break}}}
  if(!cert&&(v.includes("인정번호")||v.includes("장기요양인정번호"))){for(let o=1;o<=4;o++){const c=cleanCert(r[j+o]);if(c){cert=c;break}}}
  if(!copayRate&&v.includes("본인부담률")){
    for(let o=1;o<=4;o++){
      const c=txt(r[j+o]).trim();
      if(c && !c.includes("본인부담률")){
        copayRate=normalizeCopayRate(c);
        if(copayRate) break;
      }
    }
  }
 }}
 if(!name){const n=cName(sn.replace(/^(report|page)\s*\d*/i,""));if(validName(n))name=n}
 return{name,grade,cert,copayRate}
}
function detectStatus(r){const a=(r||[]).map(v=>txt(v).replace(/\s+/g,""));if(a.some(v=>v.includes("결석")))return"결석";if(a.some(v=>v.includes("미이용")))return"미이용";return"출석"}


function normalizeCopayRate(value){
 const t=txt(value).replace(/\s+/g," ").trim();
 if(!t)return"";
 const pct=t.match(/(\d+(?:\.\d+)?)\s*%/);
 if(pct){
   const prefix=t.replace(pct[0],"").trim();
   return prefix ? `${prefix} ${pct[1]}%` : `${pct[1]}%`;
 }
 // 숫자만 저장된 경우 0.15 / 15 등을 모두 처리
 const n=Number(String(value).replace(/[^\d.]/g,""));
 if(Number.isFinite(n)&&n>0){
   const p=n<=1 ? n*100 : n;
   return `${Number.isInteger(p)?p:p.toFixed(1)}%`;
 }
 return t;
}

function cleanCert(v){return txt(v).replace(/\s+/g,"").toUpperCase()}
function personKey(name,cert){const n=nName(name),c=cleanCert(cert);return c?`${n}|${c}`:n}

function combine(first,second){
 const fm=group(first),sm=group(second),keys=new Set([...fm.keys(),...sm.keys()]),out=[];
 [...keys].sort().forEach(k=>{
  const f=fm.get(k),s=sm.get(k),x=s||f;if(!x)return;
  const fd=f?.start&&f?.end?duration(f.start,f.end):null,sd=s?.start&&s?.end?duration(s.start,s.end):null;
  const plannedRate=rate(fd),actualRate=rate(sd),rateMatch=!!(f&&s&&plannedRate&&actualRate&&plannedRate===actualRate);
  const late=s?.status==="출석"&&s?.end&&mins(s.end)>=1080;
  out.push({
   name:x.name,cert:s?.cert||f?.cert||"",key:x.key,date:x.date,grade:s?.grade||"",copayRate:s?.copayRate||"",
   firstStart:f?.start||"",firstEnd:f?.end||"",secondStart:s?.start||"",secondEnd:s?.end||"",
   status:s?.status||"",plannedDuration:fd,actualDuration:sd,plannedRate,actualRate,rateMatch,late,
   suggestion:suggest(f,s,plannedRate,actualRate),totalAmount:s?.totalAmount||0
  });
 });
 applyAverage(out);return out
}
function group(rows){const m=new Map();rows.forEach(r=>{const k=`${r.key}|${r.date}`;if(!m.has(k))m.set(k,r);else{const e=m.get(k),rank={출석:3,결석:2,미이용:1};if((rank[r.status]||0)>(rank[e.status]||0)||(r.end&&(!e.end||r.end>e.end)))m.set(k,r)}});return m}

function suggest(f,s,planRate,actualRate){
 if(!f||!s||!planRate||!actualRate||planRate===actualRate)return"";
 const actual=`${s.start||"-"}~${s.end||"-"}`;
 if(!f.start||!f.end||!s.start||!s.end)return`실제 ${actual} 반영`;
 const diff=duration(s.start,s.end)-duration(f.start,f.end);
 const sign=diff>0?"+":"";
 return`실제 ${actual} (${sign}${diff}분)`;
}

function applyAverage(rows){
 const m=new Map();
 rows.forEach(r=>{if(r.status!=="출석")return;const w=weekday(r.date);if(w==="토"||w==="일")return;const k=`${r.key}|${r.date.slice(0,7)}`;if(!m.has(k))m.set(k,{days:new Set(),late:new Map()});const x=m.get(k);x.days.add(r.date);if(r.late){const ex=Math.max(0,mins(r.secondEnd)-1080);x.late.set(r.date,Math.max(x.late.get(r.date)||0,ex))}});
 rows.forEach(r=>{const x=m.get(`${r.key}|${r.date.slice(0,7)}`),cnt=x?.days.size||0,total=x?[...x.late.values()].reduce((a,b)=>a+b,0):0;r.attendCount=cnt;r.lateExtra=total;r.avgLate=cnt?clock(1080+Math.round(total/cnt)):""});
}


const RATE_TABLE_2026 = {
  "3~6시간": {
    "1등급": 41820, "2등급": 38720, "3등급": 35740, "4등급": 34120, "5등급": 32490, "인지지원등급": 32490
  },
  "6~8시간": {
    "1등급": 56060, "2등급": 51930, "3등급": 47940, "4등급": 46300, "5등급": 44650, "인지지원등급": 44650
  },
  "8~10시간": {
    "1등급": 69730, "2등급": 64590, "3등급": 59640, "4등급": 58010, "5등급": 56360, "인지지원등급": 56360
  },
  "10~13시간": {
    "1등급": 76820, "2등급": 71160, "3등급": 65750, "4등급": 64090, "5등급": 62460, "인지지원등급": 56360
  },
  "13시간 초과": {
    "1등급": 82370, "2등급": 76310, "3등급": 70500, "4등급": 68860, "5등급": 67240, "인지지원등급": 56360
  }
};

function normalizeGrade(grade){
  const g=txt(grade).replace(/\s+/g,"");
  if(/^[1-5]등급$/.test(g)) return g;
  if(g==="인지지원"||g==="인지지원등급") return "인지지원등급";
  return "";
}

function getUnitPrice(rateName, grade){
  if(rateName==="미이용") return 0;
  const g=normalizeGrade(grade);
  return RATE_TABLE_2026[rateName]?.[g] || 0;
}

function formatWon(value){
  const n=Number(value)||0;
  return `${n.toLocaleString("ko-KR")}원`;
}

function buildBillingPlan(rows){
 const grade=normalizeGrade(rows.find(r=>r.grade)?.grade||"");
 const weekdayRows=rows.filter(r=>weekday(r.date)!=="토"&&weekday(r.date)!=="일");
 const weekdayAttend=weekdayRows.filter(r=>r.status==="출석"&&r.secondStart&&r.secondEnd);

 // 전달 적기통보의 대표 평일 시간 = 첫 번째 파일 평일 계획 중 가장 많이 등록된 시간
 const patternCount=new Map();
 weekdayRows.forEach(r=>{
   if(!r.firstStart||!r.firstEnd)return;
   const k=`${r.firstStart}|${r.firstEnd}`;
   if(!patternCount.has(k))patternCount.set(k,{start:r.firstStart,end:r.firstEnd,count:0});
   patternCount.get(k).count++;
 });
 const notify=[...patternCount.values()].sort((a,b)=>b.count-a.count)[0]||null;

 // 18시 이후 초과분 합계 / 실제 평일 출석일수
 const lateExtraTotal=weekdayAttend.reduce((sum,r)=>{
   return sum+(r.secondEnd&&mins(r.secondEnd)>1080?mins(r.secondEnd)-1080:0);
 },0);
 const attendanceCount=weekdayAttend.length;
 const avgExtra=attendanceCount?Math.round(lateExtraTotal/attendanceCount):0;

 let baseStart=notify?.start||"";
 let baseEnd=notify?.end||"";
 if(lateExtraTotal>0&&baseStart){
   baseEnd=clock(1080+avgExtra);
 }

 const baseDuration=baseStart&&baseEnd?duration(baseStart,baseEnd):null;
 const baseRate=rate(baseDuration);

 // 실제 출석 날짜를 수가별로 묶음. 날짜 추가는 수가별 한 행만.
 const attendRows=rows.filter(r=>r.status==="출석"&&r.secondStart&&r.secondEnd);
 const byRate=new Map();
 attendRows.forEach(r=>{
   const actualRate=r.actualRate||rate(r.actualDuration);
   if(!actualRate)return;
   if(!byRate.has(actualRate))byRate.set(actualRate,[]);
   byRate.get(actualRate).push(r);
 });

 const planRows=[];

 // 기본 수가 행
 if(baseRate){
   const dates=(byRate.get(baseRate)||[]).map(r=>r.date);
   planRows.push({
     type:"기본",
     start:baseStart,
     end:baseEnd,
     duration:baseDuration,
     rate:baseRate,
     dates:new Set(dates),
     note:lateExtraTotal>0?"18시 이후 평균 반영":"적기통보 유지"
   });
 }

 // 기본 수가와 다른 수가별로 딱 1행씩 추가
 [...byRate.entries()].forEach(([rateName,list])=>{
   if(rateName===baseRate)return;
   const sorted=[...list].sort((a,b)=>a.date.localeCompare(b.date));
   const sample=sorted[0];
   planRows.push({
     type:"추가",
     start:sample.secondStart||"",
     end:sample.secondEnd||"",
     duration:sample.actualDuration,
     rate:rateName,
     dates:new Set(sorted.map(r=>r.date)),
     note:`${rateName} 날짜 묶음`
   });
 });

 // 미이용 적기통보 유효성
 const unused=rows.filter(r=>r.status==="미이용");
 const validUnused=unused.filter(r=>{
   const isWeekday=weekday(r.date)!=="토"&&weekday(r.date)!=="일";
   const hasPriorPlan=!!(r.firstStart&&r.firstEnd);
   return isWeekday&&hasPriorPlan;
 });
 const invalidUnused=unused.filter(r=>!validUnused.includes(r));

 // 미이용은 해당 계획 수가별로 묶어서 정상 단가의 50% 청구
 const unusedByRate=new Map();
 validUnused.forEach(r=>{
   const plannedDur=(r.firstStart&&r.firstEnd)?duration(r.firstStart,r.firstEnd):null;
   const rateName=r.plannedRate||rate(plannedDur)||baseRate;
   if(!rateName)return;
   if(!unusedByRate.has(rateName))unusedByRate.set(rateName,[]);
   unusedByRate.get(rateName).push(r);
 });
 [...unusedByRate.entries()].forEach(([rateName,list])=>{
   const sample=list[0];
   planRows.push({
     type:"미이용",
     start:sample.firstStart||notify?.start||"",
     end:sample.firstEnd||notify?.end||"",
     duration:(sample.firstStart&&sample.firstEnd)?duration(sample.firstStart,sample.firstEnd):baseDuration,
     rate:rateName,
     dates:new Set(list.map(r=>r.date)),
     note:`${rateName} 미이용 50%`
   });
 });

 const rowByDate=new Map(rows.map(r=>[r.date,r]));

 planRows.forEach(p=>{
   p.fullUnitPrice=getUnitPrice(p.rate,grade);
   p.unitPrice=p.type==="미이용" ? Math.round(p.fullUnitPrice/2) : p.fullUnitPrice;
   p.referenceSubtotal=p.unitPrice*p.dates.size;

   // 실제 청구 맞춤금액:
   // 체크된 날짜들의 두 번째 파일 급여총액을 그대로 합산
   // 토요일/공휴일 가산 등이 포함된 실제 급여총액이므로 월합계와 정확히 연결됨
   p.secondFileSubtotal=[...p.dates].reduce((sum,date)=>{
     return sum+(rowByDate.get(date)?.totalAmount||0);
   },0);

   // 두 번째 파일에 급여총액이 존재하면 그 금액을 우선 사용.
   // 급여총액이 전혀 없는 경우에만 2026 기본 수가표 계산값을 예비값으로 사용.
   p.calculatedSubtotal=(p.secondFileSubtotal>0 ? p.secondFileSubtotal : p.referenceSubtotal);

   p.amountDiff=p.secondFileSubtotal-p.calculatedSubtotal;
 });

 const secondFileMonthlyAmount=rows.reduce((sum,r)=>{
   return (r.status==="출석"||r.status==="미이용") ? sum+(r.totalAmount||0) : sum;
 },0);

 let monthlyAmount=planRows.reduce((sum,p)=>sum+(p.calculatedSubtotal||0),0);
 let monthlyAmountDiff=secondFileMonthlyAmount-monthlyAmount;
 const hasLate=rows.some(r=>r.late);

 // 행 그룹화 과정에서 누락된 실제 급여총액이 있으면 기본청구 행에 자동 보정하여
 // 두 번째 파일 급여총액과 맞춘다.
 if(monthlyAmountDiff!==0 && planRows.length){
   const targetRow=planRows.find(p=>p.type==="기본") || planRows[0];
   if(targetRow){
     targetRow.adjustment=(targetRow.adjustment||0)+monthlyAmountDiff;
     targetRow.calculatedSubtotal+=monthlyAmountDiff;
     monthlyAmount+=monthlyAmountDiff;
     monthlyAmountDiff=secondFileMonthlyAmount-monthlyAmount;
   }
 }

 // 18시 이후가 없으면 반드시 완전 일치.
 // 18시 이후가 있어도 자동 맞춤 후 1,000원 미만만 허용.
 const amountOk=hasLate ? Math.abs(monthlyAmountDiff)<1000 : monthlyAmountDiff===0;

 return{
   grade,
   notify,
   attendanceCount,
   lateExtraTotal,
   avgExtra,
   baseStart,
   baseEnd,
   baseDuration,
   baseRate,
   planRows,
   monthlyAmount,
   secondFileMonthlyAmount,
   monthlyAmountDiff,
   hasLate,
   amountOk,
   unusedCount:unused.length,
   invalidUnusedCount:invalidUnused.length
 };
}

function renderPeople(){
 const month=E.month.value,q=E.search.value.trim();
 const rows=S.people.map(person=>{
   const r=S.rows.filter(x=>x.key===person.key&&x.date.startsWith(month));
   return{
     ...person,
     grade:r.find(x=>x.grade)?.grade||"-",
     copayRate:r.find(x=>x.copayRate)?.copayRate||"-",
     plan:r.filter(x=>x.firstStart||x.firstEnd).length,
     mov:r.filter(x=>x.secondStart||x.secondEnd||x.status).length
   };
 }).filter(x=>!q||x.name.includes(q)||x.cert.includes(q));
 E.peopleBody.innerHTML=rows.map((x,i)=>`
   <tr data-key="${esc(x.key)}" class="${x.key===S.selectedPerson?"active":""}">
    <td>${i+1}</td><td class="name"><b>${esc(x.name)}</b>${x.cert?`<small class="cert-mini">${esc(x.cert)}</small>`:""}</td>
    <td>${esc(x.grade)}</td><td class="copay-cell">${esc(x.copayRate)}</td><td>${x.plan}</td><td>${x.mov}</td>
   </tr>`).join("");
 [...E.peopleBody.querySelectorAll("tr")].forEach(tr=>tr.onclick=()=>{S.selectedPerson=tr.dataset.key;renderPeople();renderDetail()});
 E.peopleFoot.textContent=`전체 ${rows.length}명 · 동명이인은 인정번호로 구분`;
}

function renderDetail(){
 const month=E.month.value,personKeyValue=S.selectedPerson;if(!month||!personKeyValue)return;
 const rows=S.rows.filter(r=>r.key===personKeyValue&&r.date.startsWith(month));
 const person=rows[0]?.name||"";
 const [y,m]=month.split("-").map(Number),days=new Date(y,m,0).getDate();
 const billing=buildBillingPlan(rows);

 E.title.textContent=`${person} · ${y}년 ${m}월`;
 E.subtitle.textContent="전달 적기통보 → 실제 이용결과 → 다음 달 청구용 일정 자동 구성";

 const notifyText=billing.notify?`${billing.notify.start}~${billing.notify.end}`:"-";
 const baseText=billing.baseStart&&billing.baseEnd?`${billing.baseStart}~${billing.baseEnd}`:"-";

 E.copayRate.textContent=rows.find(r=>r.copayRate)?.copayRate||"-";
 E.notifyBase.textContent=notifyText;
 E.attend.textContent=`${billing.attendanceCount}일`;
 E.lateExtraTotal.textContent=`${billing.lateExtraTotal}분`;
 E.billingBase.textContent=baseText;
 E.monthlyAmount.textContent=formatWon(billing.monthlyAmount);
 E.secondFileAmount.textContent=formatWon(billing.secondFileMonthlyAmount);
 E.amountDiff.textContent=`${billing.monthlyAmountDiff>=0?"+":""}${billing.monthlyAmountDiff.toLocaleString("ko-KR")}원`;
 E.amountStatus.textContent=billing.amountOk
   ? (billing.monthlyAmountDiff===0 ? "완전 일치" : "1,000원 미만 맞춤")
   : "자동 맞춤 실패";
 E.amountStatus.className=billing.amountOk?"amount-ok":"amount-error";
 E.amountDiff.className=billing.amountOk?"amount-ok":"amount-error";

 if(billing.notify&&billing.lateExtraTotal>0){
   E.billingGuide.innerHTML=
     `<b>청구 권장:</b> 기존 평일 적기통보 <strong>${notifyText}</strong> 대신 `+
     `<strong class="change">${baseText}</strong> 행을 추가하고, `+
     `기본 수가(${billing.baseRate}) 날짜를 이 행으로 체크하세요. `+
     `18시 초과분 ${billing.lateExtraTotal}분 ÷ 평일 출석 ${billing.attendanceCount}일 = `+
     `${billing.avgExtra}분(반올림). `+
     `맞춤 청구금액 <strong>${formatWon(billing.monthlyAmount)}</strong> / 두 번째 파일 급여총액 <strong>${formatWon(billing.secondFileMonthlyAmount)}</strong>. `+
     `${billing.monthlyAmountDiff===0
       ? "금액을 완전히 맞췄습니다."
       : "18시 이후 평균 반영으로 인한 차이를 1,000원 미만으로 맞췄습니다."}`;
 }else if(billing.notify){
   E.billingGuide.innerHTML=`<b>청구 권장:</b> 18시 이후 평균 가산이 없어 기존 적기통보 <strong>${notifyText}</strong>를 유지합니다. 예상 월급액은 <strong>${formatWon(billing.monthlyAmount)}</strong>입니다.`;
 }else{
   E.billingGuide.innerHTML=`<b>확인 필요:</b> 첫 번째 파일에서 평일 적기통보 기준시간을 찾지 못했습니다.`;
 }

 // 공통 날짜 헤더
 let h='<tr>'+
   '<th class="fixed-col col-type">구분</th>'+
   '<th class="fixed-col col-start">시작시간</th>'+
   '<th class="fixed-col col-end">종료시간</th>'+
   '<th class="fixed-col col-duration">제공시간</th>'+
   '<th class="fixed-col col-rate">수가</th>'+
   '<th class="fixed-col col-unit">단가</th>'+
   '<th class="fixed-col col-count">횟수</th>'+
   '<th class="fixed-col col-amount">맞춤금액</th>'+
   '<th class="fixed-col col-secondamt">2번째금액</th>'+
   '<th class="fixed-col col-diffamt">차이</th>';

 for(let d=1;d<=days;d++){
   const dt=`${y}-${String(m).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
   const w=weekday(dt);
   h+=`<th class="day-head ${w==="토"?"sat":w==="일"?"sun":""}">${d}<br>(${w})</th>`;
 }
 h+="</tr>";
 E.thead.innerHTML=h;

 E.tbody.innerHTML=billing.planRows.map((p,idx)=>{
   let s='<tr>';
   const typeLabel=p.type==="기본"?"기본청구":p.type==="미이용"?"미이용":"추가수가";
   s+=`<td class="fixed-col col-type ${p.type==="미이용"?"unused-row-label":""}">${typeLabel}</td>`;
   s+=`<td class="fixed-col col-start"><b>${p.start||"-"}</b></td>`;
   s+=`<td class="fixed-col col-end"><b>${p.end||"-"}</b></td>`;
   s+=`<td class="fixed-col col-duration">${p.duration==null?"-":fmtDur(p.duration)}</td>`;
   s+=`<td class="fixed-col col-rate">${p.type==="미이용"?`${rateCell(p.rate)}<span class="unused-badge">50%</span>`:rateCell(p.rate)}</td>`;
   s+=`<td class="fixed-col col-unit">${formatWon(p.unitPrice)}</td>`;
   s+=`<td class="fixed-col col-count"><b>${p.dates.size}</b></td>`;
   s+=`<td class="fixed-col col-amount"><b>${formatWon(p.calculatedSubtotal)}</b>${p.adjustment?`<span class="day-note change">자동보정 ${p.adjustment>0?"+":""}${p.adjustment.toLocaleString("ko-KR")}원</span>`:""}</td>`;
   s+=`<td class="fixed-col col-secondamt"><b>${formatWon(p.secondFileSubtotal)}</b></td>`;
   const rowDiff=p.secondFileSubtotal-p.calculatedSubtotal;
   s+=`<td class="fixed-col col-diffamt ${Math.abs(rowDiff)>=1000?"amount-error":"amount-ok"}"><b>${((rowDiff>=0?"+":"")+rowDiff.toLocaleString("ko-KR")+"원")}</b></td>`;

   for(let d=1;d<=days;d++){
     const dt=`${y}-${String(m).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
     const checked=p.dates.has(dt);
     s+=checked
       ? `<td><span class="claim-check checked ${p.type==="미이용"?"unused-checked":""}">✓</span></td>`
       : `<td><span class="claim-check"></span></td>`;
   }
   return s+'</tr>';
 }).join("") || `<tr><td colspan="${10+days}" class="empty">청구 권장 일정을 만들 수 없습니다.</td></tr>`;

 // 출결/미이용 확인 표
 let sh='<tr><th class="status-label">구분</th>';
 for(let d=1;d<=days;d++){
   const dt=`${y}-${String(m).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
   const w=weekday(dt);
   sh+=`<th class="day-head ${w==="토"?"sat":w==="일"?"sun":""}">${d}<br>(${w})</th>`;
 }
 sh+="</tr>";
 E.statusHead.innerHTML=sh;

 const map=new Map(rows.map(r=>[r.date,r]));
 const statusRows=[
   ["출석",r=>r?.status==="출석"?'<span class="mini-check ok">✓</span>':""],
   ["결석",r=>r?.status==="결석"?'<span class="mini-check absent">✓</span>':""],
   ["미이용",r=>{
      if(r?.status!=="미이용")return"";
      const isWeekday=weekday(r.date)!=="토"&&weekday(r.date)!=="일";
      const hasPlan=!!(r.firstStart&&r.firstEnd);
      return isWeekday&&hasPlan
        ? '<span class="mini-check unused">✓</span><span class="day-note">정상</span>'
        : '<span class="mini-check warn">!</span><span class="day-note change">적기통보/평일 확인</span>';
   }],
   ["18시 이후",r=>r?.late?`<span class="lateTxt">${r.secondEnd}</span>`:""]
 ];

 E.statusBody.innerHTML=statusRows.map(([label,fn])=>{
   let s=`<tr><td class="status-label">${label}</td>`;
   for(let d=1;d<=days;d++){
     const dt=`${y}-${String(m).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
     s+=`<td>${fn(map.get(dt))||""}</td>`;
   }
   return s+"</tr>";
 }).join("");
}

function statusCell(r){if(!r?.status)return"-";const c=r.status==="출석"?"present":r.status==="결석"?"absent":"unused";return`<span class="pill ${c}">${r.status}</span>`}
function rateCheck(r){if(!r||!r.plannedRate||!r.actualRate)return'<span class="check gray">-</span>';return r.rateMatch?'<span class="check ok">✓</span>':'<span class="check bad">!</span>'}
function rateCell(v){if(!v)return"-";const c={"3~6시간":"rate1","6~8시간":"rate2","8~10시간":"rate3","10~13시간":"rate4","13시간 초과":"rate5"}[v]||"only";return`<span class="pill ${c}">${v}</span>`}
function rate(n){if(n==null)return"";if(n<180)return"3시간 미만";if(n<360)return"3~6시간";if(n<480)return"6~8시간";if(n<600)return"8~10시간";if(n<=780)return"10~13시간";return"13시간 초과"}


function fmtDur(n){
 if(n==null)return"-";
 const h=Math.floor(n/60),m=n%60;
 if(h&&m)return`${h}시간 ${m}분`;
 if(h)return`${h}시간`;
 return`${m}분`;
}

function move(x){const i=S.months.indexOf(E.month.value),n=i+x;if(n>=0&&n<S.months.length){E.month.value=S.months[n];renderPeople();renderDetail()}}

function download(){
 const month=E.month.value,person=S.selectedPerson;
 const rows=S.rows.filter(r=>r.name===person&&r.date.startsWith(month));
 const billing=buildBillingPlan(rows);

 const planRows=[];
 billing.planRows.forEach((p,idx)=>{
   planRows.push({
     구분:p.type==="기본"?"기본청구":p.type==="미이용"?"미이용":"추가수가",
     시작시간:p.start,
     종료시간:p.end,
     제공시간:p.duration==null?"":fmtDur(p.duration),
     수가:p.rate,
     단가:p.unitPrice,
     횟수:p.dates.size,
     맞춤청구금액:p.calculatedSubtotal,
     두번째파일금액:p.secondFileSubtotal,
     금액차이:p.amountDiff,
     적용일자:[...p.dates].join(", ")
   });
 });

 const detailRows=rows.map(r=>({
   수급자명:r.name,
   인정번호:r.cert||"",
   본인부담률:r.copayRate||"",
   날짜:r.date,
   요일:weekday(r.date),
   출결:r.status,
   적기통보_시작:r.firstStart,
   적기통보_종료:r.firstEnd,
   실제_시작:r.secondStart,
   실제_종료:r.secondEnd,
   실제수가:r.actualRate,
   "18시이후":r.late?"해당":"",
   미이용유효:r.status==="미이용"
     ? ((weekday(r.date)!=="토"&&weekday(r.date)!=="일"&&r.firstStart&&r.firstEnd)?"정상":"오류")
     : ""
 }));

 const wb=XLSX.utils.book_new();
 const summaryRows=[{
   수급자명:person,
   인정번호:rows[0]?.cert||"",
   등급:billing.grade,
   본인부담률:rows.find(r=>r.copayRate)?.copayRate||"",
   적기통보기준:billing.notify?`${billing.notify.start}~${billing.notify.end}`:"",
   평일출석일수:billing.attendanceCount,
   "18시초과분합계":billing.lateExtraTotal,
   청구기본시간:billing.baseStart&&billing.baseEnd?`${billing.baseStart}~${billing.baseEnd}`:"",
   맞춤청구금액:billing.monthlyAmount,
   두번째파일급여총액:billing.secondFileMonthlyAmount,
   금액차이:billing.monthlyAmountDiff,
   금액맞춤상태:billing.monthlyAmountDiff===0?"완전 일치":(billing.amountOk?"1,000원 미만 맞춤":"자동 맞춤 실패")
 }];
 XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(summaryRows),"청구요약");
 XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(planRows),"청구권장일정");
 XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(detailRows),"일자별상세");
 XLSX.writeFile(wb,`이동서비스_청구권장_${person}_${month}.xlsx`);
}

function readBook(file){return new Promise((res,rej)=>{const fr=new FileReader();fr.onload=e=>{try{res(XLSX.read(new Uint8Array(e.target.result),{type:"array",cellDates:false}))}catch{rej(new Error(file.name+" 읽기 실패"))}};fr.onerror=()=>rej(new Error(file.name+" 불러오기 실패"));fr.readAsArrayBuffer(file)})}

function parseMoney(value){
 if(value===null||value===undefined||value==="")return 0;
 if(typeof value==="number"&&Number.isFinite(value))return Math.round(value);
 const n=Number(String(value).replace(/[^\d.-]/g,""));
 return Number.isFinite(n)?Math.round(n):0;
}
function pDate(v){if(typeof v==="number"&&v>20000&&v<80000){const p=XLSX.SSF.parse_date_code(v);if(p?.y)return`${p.y}-${String(p.m).padStart(2,"0")}-${String(p.d).padStart(2,"0")}`}const a=txt(v).match(/\d+/g);if(!a||a.length<3)return"";const[y,m,d]=a.map(Number);return y>=1900?`${y}-${String(m).padStart(2,"0")}-${String(d).padStart(2,"0")}`:""}
function pTime(v){if(typeof v==="number"&&v>=0&&v<1)return clock(Math.round(v*1440));const t=txt(v).replace(/\s+/g,""),m=t.match(/^(\d{1,2})[:시](\d{1,2})?$/);if(m)return valid(+m[1],+(m[2]||0));const n=t.match(/^(\d{3,4})$/);if(n){const p=n[1].padStart(4,"0");return valid(+p.slice(0,2),+p.slice(2))}return""}
function pRange(v){const t=txt(v).replace(/[～〜–—]/g,"~").replace(/\s+/g,""),a=[...t.matchAll(/(\d{1,2})[:시](\d{1,2})?/g)].map(m=>valid(+m[1],+(m[2]||0))).filter(Boolean);return{start:a[0]||"",end:a[1]||""}}
function valid(h,m){return h>=0&&h<24&&m>=0&&m<60?`${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`:""}
function duration(a,b){let n=mins(b)-mins(a);if(n<0)n+=1440;return n}function mins(t){const[h,m]=t.split(":").map(Number);return h*60+m}function clock(n){n=((n%1440)+1440)%1440;return`${String(Math.floor(n/60)).padStart(2,"0")}:${String(n%60).padStart(2,"0")}`}
function weekday(d){const[y,m,dd]=d.split("-").map(Number);return["일","월","화","수","목","금","토"][new Date(y,m-1,dd).getDay()]}
function cName(v){return txt(v).replace(/\([^)]*\)/g,"").replace(/^(수급자|수급자명|고객명|성명|대상자)\s*[:：]?/g,"").replace(/[^\p{L}\s]/gu,"").replace(/\s+/g,"").trim()}function validName(v){return /^[가-힣]{2,5}$/.test(v)&&!/수급자|서비스|급여|센터/.test(v)}function nName(v){return cName(v).toLowerCase()}function txt(v){return v==null?"":String(v).replace(/\u00a0/g," ").trim()}function unique(a,f){const s=new Set;return a.filter(x=>{const k=f(x);if(s.has(k))return false;s.add(k);return true})}function esc(v){return String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")}
