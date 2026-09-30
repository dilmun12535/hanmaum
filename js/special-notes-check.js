let counselLibraryCache = [];
let parsedSpecialNotes = [];
let verificationResults = [];
let currentFilter = "all";

const recordFile = document.getElementById("recordFile");
const recordFileStatus = document.getElementById("recordFileStatus");
const counselLibraryStatus = document.getElementById("counselLibraryStatus");
const detectedMonthText = document.getElementById("detectedMonthText");
const checkBtn = document.getElementById("checkBtn");
const resetBtn = document.getElementById("resetBtn");
const reloadBtn = document.getElementById("reloadBtn");
const downloadBtn = document.getElementById("downloadBtn");
const resultBody = document.getElementById("resultBody");
const totalCount = document.getElementById("totalCount");
const okCount = document.getElementById("okCount");
const warnCount = document.getElementById("warnCount");
const uploadedCount = document.getElementById("uploadedCount");

function normalize(v) {
  return String(v ?? "").replace(/[\u200e\u200f\ufeff]/g, "").replace(/\s+/g, " ").trim();
}
function compact(v) { return normalize(v).replace(/[^0-9a-zA-Z가-힣]/g, "").toLowerCase(); }
function sameName(a,b) { return compact(a) && compact(a) === compact(b); }
function pad(n){ return String(n).padStart(2,"0"); }
function dateText(v){
  if (!v) return "";
  if (v instanceof Date && !Number.isNaN(v.getTime())) return `${v.getFullYear()}-${pad(v.getMonth()+1)}-${pad(v.getDate())}`;
  if (typeof v === "number") {
    const d = XLSX.SSF.parse_date_code(v);
    if (d) return `${d.y}-${pad(d.m)}-${pad(d.d)}`;
  }
  const s=normalize(v);
  let m=s.match(/(20\d{2})[^0-9]?(\d{1,2})[^0-9]?(\d{1,2})/);
  return m ? `${m[1]}-${pad(m[2])}-${pad(m[3])}` : "";
}
function addDays(d,n){ const x=new Date(`${d}T00:00:00`); x.setDate(x.getDate()+n); return `${x.getFullYear()}-${pad(x.getMonth()+1)}-${pad(x.getDate())}`; }
function escapeHtml(v){ return String(v??"").replace(/[&<>"']/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }

const DOMAIN_GROUPS = [
  ["식사","식단","점심","중식","저녁","석식","반찬","섭취","다진식","죽식","일반식","연식","음식","수분"],
  ["목욕","몸씻기","샤워","세신","목욕의자"],
  ["화장실","배변","배뇨","기저귀","변기","대소변","요실금"],
  ["보행","걷기","이동","부축","휠체어","지팡이","워커","보행기"],
  ["투약","복약","약","약물","약복용"],
  ["간호","혈압","혈당","활력","체온","맥박","건강관리","상처","피부"],
  ["인지","치매","기억","회상","프로그램","의사소통"],
  ["물리치료","재활","운동치료","기능회복","안마","자전거","근력"],
  ["세면","양치","구강","틀니","옷입기","의복","위생","머리감기"],
  ["정서","불안","우울","격려","대화","말벗","안정"],
  ["등원","하원","송영","이용시간","외출"]
];
const STOP = new Set(["급여","제공","도움","지원","관련","변경","추가","제외","요청","필요","수급자","보호자","어르신","하도록","하기","하여","하고","있음","없음","실시","반영","서비스","관리","상태"]);
function keywords(text){
  const s=normalize(text);
  const words=(s.match(/[가-힣]{2,}|[a-zA-Z]{3,}/g)||[]).map(x=>x.toLowerCase()).filter(x=>!STOP.has(x));
  return [...new Set(words)].filter(x=>x.length>=2);
}
function domains(text){
  const c=compact(text);
  return DOMAIN_GROUPS.filter(g=>g.some(k=>c.includes(compact(k))));
}
function relatedScore(counselText, noteText){
  const nc=compact(noteText); if(!nc) return {score:0, reasons:[]};
  const ks=keywords(counselText);
  const direct=ks.filter(k=>nc.includes(compact(k)));
  const dg=domains(counselText);
  const domainHits=dg.filter(g=>g.some(k=>nc.includes(compact(k))));
  let score=direct.length*2 + domainHits.length*3;
  const reasons=[];
  if(domainHits.length) reasons.push(`관련 영역 ${domainHits.length}개`);
  if(direct.length) reasons.push(`핵심어 ${direct.slice(0,5).join(", ")}`);
  return {score,reasons};
}
function isRelated(counselText,noteText){
  const r=relatedScore(counselText,noteText);
  return {...r, related:r.score>=3};
}

function sheetRows(sheet){ return XLSX.utils.sheet_to_json(sheet,{header:1,defval:"",raw:true}); }
function parseSpecialNotes(workbook){
  const out=[];
  workbook.SheetNames.forEach(sheetName=>{
    const rows=sheetRows(workbook.Sheets[sheetName]);
    const hi=rows.findIndex(r=>compact(r.join(" ")).includes("수급자명") && compact(r.join(" ")).includes("작성일") && compact(r.join(" ")).includes("특이사항"));
    if(hi<0) return;
    const h=rows[hi].map(normalize);
    const nameCol=h.findIndex(x=>compact(x).includes("수급자명"));
    const dateCol=h.findIndex(x=>compact(x).includes("작성일"));
    const noteCols=h.map((x,i)=>compact(x).includes("특이사항")?i:-1).filter(i=>i>=0);
    let lastName="";
    for(let i=hi+1;i<rows.length;i++){
      const row=rows[i]||[];
      const nm=normalize(row[nameCol]); if(nm) lastName=nm;
      const dt=dateText(row[dateCol]); if(!lastName||!dt) continue;
      noteCols.forEach(ci=>{
        const note=normalize(row[ci]);
        if(note) out.push({name:lastName,date:dt,category:h[ci].replace(/\s*특이사항\s*/g,"").trim()||"특이사항",note,sheetName});
      });
    }
  });
  return out;
}
function detectedRange(rows){
  const dates=rows.map(x=>x.date).filter(Boolean).sort();
  return dates.length ? {start:dates[0],end:dates[dates.length-1],month:dates[0].slice(0,7)} : null;
}
function counselDate(c){ return dateText(c.reflectionDate||c.reflection||c.changeDate||c.date||c.writtenDate||c.counselDate); }
function counselName(c){ return normalize(c.recipientName||c.name||c.recipient||c.clientName); }
function counselContent(c){
  return normalize([c.changeType,c.category,c.careContent,c.reason,c.content,c.counselContent,c.note,c.details].filter(Boolean).join(" "));
}
async function loadCounsels(month){
  if(!window.HanmaumFirestore) throw new Error("Firestore 연결 모듈을 찾지 못했습니다.");
  counselLibraryStatus.textContent="상담일지 불러오는 중...";
  counselLibraryCache=await window.HanmaumFirestore.counsels(month);
  counselLibraryStatus.textContent=`상담일지 ${counselLibraryCache.length}건 불러옴`;
  counselLibraryStatus.className="upload-help status-ok-text";
}
function buildResults(){
  const range=detectedRange(parsedSpecialNotes); if(!range) return [];
  // 업로드 월과 겹치는 1개월 검증기간을 가진 상담일지를 모두 검사
  const relevant=(counselLibraryCache||[]).map(c=>({raw:c,name:counselName(c),date:counselDate(c),content:counselContent(c)}))
    .filter(c=>c.name&&c.date&&c.content)
    .filter(c=>c.date<=range.end && addDays(c.date,30)>=range.start);
  return relevant.map(c=>{
    const end=addDays(c.date,30);
    const notes=parsedSpecialNotes.filter(n=>sameName(n.name,c.name)&&n.date>=c.date&&n.date<=end);
    const matches=notes.map(n=>({...n,...isRelated(c.content,n.note)})).filter(n=>n.related).sort((a,b)=>a.date.localeCompare(b.date));
    const unrelated=notes.filter(n=>!matches.some(m=>m===n));
    return {name:c.name,counselDate:c.date,endDate:end,counselContent:c.content,matches,unrelated,status:matches.length?"ok":"warn"};
  }).sort((a,b)=>a.counselDate.localeCompare(b.counselDate)||a.name.localeCompare(b.name,"ko"));
}
function render(){
  const rows=currentFilter==="warn"?verificationResults.filter(x=>x.status==="warn"):verificationResults;
  totalCount.textContent=verificationResults.length;
  okCount.textContent=verificationResults.filter(x=>x.status==="ok").length;
  warnCount.textContent=verificationResults.filter(x=>x.status==="warn").length;
  uploadedCount.textContent=parsedSpecialNotes.length;
  if(!rows.length){ resultBody.innerHTML=`<tr><td class="empty" colspan="8">${currentFilter==="warn"?"확인 필요한 상담일지가 없습니다.":"검증할 상담일지가 없습니다."}</td></tr>`; return; }
  resultBody.innerHTML=rows.map(r=>{
    const matchHtml=r.matches.length?r.matches.map(m=>`<div class="match-note"><b>${escapeHtml(m.date)}</b> <span>${escapeHtml(m.category)}</span><br>${escapeHtml(m.note)}<div class="match-reason">${escapeHtml(m.reasons.join(" · "))}</div></div>`).join(""):`<span class="no-match">관련 특이사항을 찾지 못함</span>`;
    const allCount=r.matches.length+r.unrelated.length;
    return `<tr>
      <td><span class="badge ${r.status==="ok"?"badge-ok":"badge-warn"}">${r.status==="ok"?"관련 기록 있음":"내용 확인 필요"}</span></td>
      <td><b>${escapeHtml(r.name)}</b></td>
      <td class="date-cell">${escapeHtml(r.counselDate)}<br><span class="small">~ ${escapeHtml(r.endDate)}</span></td>
      <td class="note-text">${escapeHtml(r.counselContent)}</td>
      <td style="text-align:center"><b>${r.matches.length}</b> / ${allCount}</td>
      <td class="note-text">${matchHtml}</td>
      <td>${r.status==="ok"?`상담 내용과 관련된 특이사항 ${r.matches.length}건 발견`:`검증기간 내 특이사항 ${allCount}건을 확인했으나 상담 내용과 관련된 기록을 자동으로 찾지 못했습니다.`}</td>
      <td><button class="copy-btn" data-copy="${escapeHtml(r.counselContent)}">상담내용 복사</button></td>
    </tr>`;
  }).join("");
  resultBody.querySelectorAll(".copy-btn").forEach(btn=>btn.addEventListener("click",async()=>{await navigator.clipboard.writeText(btn.dataset.copy||"");btn.textContent="복사됨";btn.classList.add("copied");setTimeout(()=>{btn.textContent="상담내용 복사";btn.classList.remove("copied")},1200);}));
}
function exportExcel(){
  if(!verificationResults.length){ alert("먼저 검증을 실행해주세요."); return; }
  const rows=[];
  verificationResults.forEach(r=>{
    if(r.matches.length){ r.matches.forEach(m=>rows.push({수급자:r.name,상담반영일:r.counselDate,검증종료일:r.endDate,상담내용:r.counselContent,판정:"관련 기록 있음",특이사항일:m.date,특이사항구분:m.category,특이사항내용:m.note,자동판정근거:m.reasons.join(" / ")})); }
    else rows.push({수급자:r.name,상담반영일:r.counselDate,검증종료일:r.endDate,상담내용:r.counselContent,판정:"내용 확인 필요",특이사항일:"",특이사항구분:"",특이사항내용:"",자동판정근거:"관련 내용 자동 발견 없음"});
  });
  const ws=XLSX.utils.json_to_sheet(rows); ws["!cols"]=[12,14,14,55,16,14,22,70,35].map(w=>({wch:w}));
  const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,ws,"상담-특이사항 검증"); XLSX.writeFile(wb,"상담일지_특이사항_검증결과.xlsx");
}

recordFile.addEventListener("change",async()=>{
  const f=recordFile.files[0]; if(!f) return;
  try{
    recordFileStatus.textContent="파일 읽는 중...";
    const data=await f.arrayBuffer(); const wb=XLSX.read(data,{type:"array",cellDates:true});
    parsedSpecialNotes=parseSpecialNotes(wb); const range=detectedRange(parsedSpecialNotes);
    if(!range) throw new Error("수급자명/작성일/특이사항 머리글을 찾지 못했습니다.");
    detectedMonthText.textContent=`${range.start} ~ ${range.end}`;
    recordFileStatus.textContent=`특이사항 ${parsedSpecialNotes.length}건 인식`;
    recordFileStatus.className="upload-help status-ok-text";
    await loadCounsels(range.month);
  }catch(e){ console.error(e); recordFileStatus.textContent=`오류: ${e.message}`; recordFileStatus.className="upload-help status-error-text"; }
});
checkBtn.addEventListener("click",async()=>{
  if(!parsedSpecialNotes.length){ alert("급여제공기록지 특이사항 엑셀을 먼저 업로드해주세요."); return; }
  const range=detectedRange(parsedSpecialNotes);
  if(!counselLibraryCache.length) await loadCounsels(range.month);
  verificationResults=buildResults(); currentFilter="all"; document.querySelectorAll("#resultTabs button").forEach(x=>x.classList.toggle("active",x.dataset.filter==="all")); render();
});
reloadBtn.addEventListener("click",async()=>{ const r=detectedRange(parsedSpecialNotes); if(!r){alert("먼저 특이사항 파일을 업로드해주세요.");return;} window.HanmaumFirestore?.clearCache?.(); await loadCounsels(r.month); alert("상담일지를 다시 불러왔습니다."); });
resetBtn.addEventListener("click",()=>{ recordFile.value=""; parsedSpecialNotes=[]; counselLibraryCache=[]; verificationResults=[]; detectedMonthText.textContent="업로드 파일 자동 인식"; recordFileStatus.textContent="급여제공기록지 특이사항 엑셀 파일을 업로드하세요."; counselLibraryStatus.textContent="상담일지 보관함에서 자동으로 불러옵니다."; totalCount.textContent=okCount.textContent=warnCount.textContent=uploadedCount.textContent="0"; resultBody.innerHTML='<tr><td class="empty" colspan="8">특이사항 엑셀을 업로드한 뒤 검증하기를 눌러주세요.</td></tr>'; });
downloadBtn.addEventListener("click",exportExcel);
document.querySelectorAll("#resultTabs button").forEach(btn=>btn.addEventListener("click",()=>{currentFilter=btn.dataset.filter;document.querySelectorAll("#resultTabs button").forEach(x=>x.classList.toggle("active",x===btn));render();}));
