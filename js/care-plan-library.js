import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import {
  collection, getDocs, doc, setDoc, deleteDoc
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

const elPlanFileSelector = document.getElementById("planFile");
const elPlanDateSelector = document.getElementById("planWrittenDate");
const elPlanUploadTrigger = document.getElementById("uploadPlanBtn");
const elPlanFileCount = document.getElementById("planFileCount");
const elPlanUploadProgress = document.getElementById("planUploadProgress");
const elPlanDeleteTrigger = document.getElementById("deleteSelectedPlanBtn");
const elPlanSelectAllTrigger = document.getElementById("selectAllPlanCheckbox");
const elPlanTableBodyContainer = document.getElementById("planLibraryTableBody");
const elPlanExportTrigger = document.getElementById("exportPlanExcelBtn");
const elPlanCountText = document.getElementById("planCountText");
const elPlanFilterButtons = [...document.querySelectorAll(".filter-btn[data-filter]")];
const elMigrationFile = document.getElementById("legacyDbFile");
const elMigrationBtn = document.getElementById("migratePlanBtn");
const elMigrationStatus = document.getElementById("migrationStatus");

let carePlanLibrary = [];
let currentUser = null;
let currentFilter = "all";

if (elPlanDateSelector) {
  elPlanDateSelector.setAttribute("max", "9999-12-31");
  elPlanDateSelector.addEventListener("input", () => {
    const value = elPlanDateSelector.value;
    if (value && value.length > 10) elPlanDateSelector.value = value.slice(0, 10);
  });
}

function normalizeText(value) { return String(value || "").replace(/\s/g, "").trim(); }
function normalizeDateString(value) {
  if (!value) return "";
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const y = value.getFullYear(); const m = String(value.getMonth()+1).padStart(2,"0"); const d = String(value.getDate()).padStart(2,"0");
    return `${y}-${m}-${d}`;
  }
  const text = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  if (text.includes("T")) return text.split("T")[0];
  return text;
}
function formatDateValue(value) { return normalizeDateString(value) || "-"; }
function extractInfoFromFileName(fileName) {
  const nameOnly = fileName.replace(/\.(xlsx|xls)$/i, "").trim();
  // 구버전: L240... 홍길동 수급자 급여제공계획 / 신버전: 장기요양급여 제공 계획서_홍길동_20250224
  const legacy = nameOnly.match(/^(L\d+)\s+(.+?)\s+수급자\s+급여제공계획/i);
  if (legacy) return { longTermNumber: legacy[1], recipientName: legacy[2].trim() };
  const newer = nameOnly.match(/장기요양급여\s*제공\s*계획서[_\s-]+([가-힣]{2,5})(?:[_\s-]+\d{8})?$/i);
  if (newer) return { longTermNumber: "", recipientName: newer[1].trim() };
  const cert = nameOnly.match(/L\d{8,}/i)?.[0] || "";
  const korean = nameOnly.match(/(?:^|[_\s-])([가-힣]{2,5})(?=[_\s-]|$)/)?.[1] || "";
  return { longTermNumber: cert, recipientName: korean };
}
function getCareItemCount(rows) {
  return rows.filter(row => normalizeText(JSON.stringify(row)).length > 0).length;
}

function cellText(v) { return String(v ?? "").replace(/\r/g, "").trim(); }
function sheetRows(ws) {
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", raw: false });

  // 엑셀 병합셀은 SheetJS에서 좌상단 셀에만 값이 남습니다.
  // 예: N31:O32가 "일 2회"로 병합되어 있으면 32행(균형잡힌 식단 관리)의
  // 횟수 칸은 빈칸처럼 읽힙니다. 병합 범위 전체에 좌상단 값을 복원하여
  // 각 급여 행이 실제 화면에 보이는 횟수를 그대로 갖도록 합니다.
  const merges = Array.isArray(ws?.["!merges"]) ? ws["!merges"] : [];
  for (const merge of merges) {
    const sr = merge.s.r, sc = merge.s.c, er = merge.e.r, ec = merge.e.c;
    const topValue = rows?.[sr]?.[sc];
    if (topValue === undefined || topValue === null || String(topValue).trim() === "") continue;
    for (let r = sr; r <= er; r++) {
      if (!rows[r]) rows[r] = [];
      for (let c = sc; c <= ec; c++) {
        if (rows[r][c] === undefined || rows[r][c] === null || String(rows[r][c]).trim() === "") {
          rows[r][c] = topValue;
        }
      }
    }
  }
  return rows;
}
function firstNonEmpty(row, start=0) {
  for (let i=start;i<row.length;i++) if (cellText(row[i])) return cellText(row[i]);
  return "";
}
function parseDateRange(text) {
  const dates = cellText(text).match(/\d{4}[.\/-]\d{1,2}[.\/-]\d{1,2}/g) || [];
  const norm = x => x ? x.replace(/[.\/]/g,"-").split("-").map((v,i)=>i?String(Number(v)).padStart(2,"0"):v).join("-") : "";
  return { start: norm(dates[0]), end: norm(dates[1]) };
}
function findValueNearLabel(rows, label) {
  const needle=normalizeText(label);
  for (const row of rows) for (let c=0;c<row.length;c++) {
    if (normalizeText(row[c]).includes(needle)) {
      for (let k=c+1;k<Math.min(row.length,c+8);k++) if (cellText(row[k])) return cellText(row[k]);
    }
  }
  return "";
}

const CARE_PLAN_HEADER_WORDS = new Set([
  "성명", "장기요양등급", "장기요양인정번호", "생년월일", "수급자와의관계", "작성일", "종합의견"
]);
function isHeaderLikeValue(value) {
  const t=normalizeText(value);
  return !t || CARE_PLAN_HEADER_WORDS.has(t) || /^(①수급자|②동의자)$/.test(t);
}
function findValidatedValueRight(rows, r, c, validator, maxCols=12) {
  const row=rows[r] || [];
  const label=normalizeText(row[c]);
  for (let k=c+1; k<Math.min(row.length, c+maxCols+1); k++) {
    const value=cellText(row[k]);
    // 병합셀 복원으로 '성명 성명 성명 권선기'처럼 라벨이 반복될 수 있으므로 건너뜁니다.
    if (!value || normalizeText(value)===label || isHeaderLikeValue(value)) continue;
    if (!validator || validator(value)) return value;
  }
  return "";
}
function isRecipientNameValue(value) {
  return /^[가-힣]{2,5}$/.test(cellText(value)) && !/^(성명|수급자|동의자)$/.test(cellText(value));
}
function isLongTermNumberValue(value) { return /^L\d{8,}$/i.test(cellText(value).replace(/\s/g,"")); }
function isGradeValue(value) { return /^(?:[1-5]등급|인지지원등급)$/i.test(cellText(value).replace(/\s/g,"")); }
const FEE_RANGE_PATTERN = "(3\\s*시간\\s*미만|3\\s*시간\\s*이상\\s*6\\s*시간\\s*미만|6\\s*시간\\s*이상\\s*8\\s*시간\\s*미만|8\\s*시간\\s*이상\\s*10\\s*시간\\s*미만|10\\s*시간\\s*이상\\s*13\\s*시간\\s*미만|13\\s*시간\\s*이상)";
const FEE_RANGE_RE = new RegExp(FEE_RANGE_PATTERN, "g");
function cleanFeeRange(value) { return cellText(value).replace(/\s+/g, " ").trim(); }
function cleanWeeklyCount(value) {
  const n=String(value ?? "").match(/\d+/)?.[0];
  return n ? `주 ${n}회` : "";
}
function extractWeeklyFeePairs(text) {
  const source = cellText(text).replace(/\r?\n/g, " ").replace(/\s+/g, " ").trim();
  const pairs = [];

  // 1) 주 N회 → 수가구간
  const forward = new RegExp(
    `주\\s*(\\d+)\\s*회(?:(?!주\\s*\\d+\\s*회)[\\s\\S]){0,180}?${FEE_RANGE_PATTERN}`,
    "g"
  );
  let m;
  while ((m = forward.exec(source)) !== null) {
    pairs.push({
      count: cleanWeeklyCount(m[1]),
      fee: cleanFeeRange(m[2]),
      index: m.index
    });
  }

  // 2) 수가구간 → 주 N회 형태도 지원
  const reverse = new RegExp(
    `${FEE_RANGE_PATTERN}(?:(?!${FEE_RANGE_PATTERN})[\\s\\S]){0,100}?주\\s*(\\d+)\\s*회`,
    "g"
  );
  while ((m = reverse.exec(source)) !== null) {
    pairs.push({
      count: cleanWeeklyCount(m[2]),
      fee: cleanFeeRange(m[1]),
      index: m.index
    });
  }

  // 같은 문구가 양쪽 정규식에 동시에 잡히는 경우 제거
  return pairs
    .sort((a,b) => a.index - b.index)
    .filter((p,i,arr) => !arr.slice(0,i).some(x =>
      x.count === p.count && x.fee === p.fee && Math.abs(x.index-p.index) < 120
    ));
}

function extractFeeInfo(opinion) {
  const text = cellText(opinion)
    .replace(/\u200e|\u200f|\ufeff/g, "")
    .replace(/\r/g, " ")
    .replace(/\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const result = {
    planFee:"", planWeeklyCount:"",
    weekdayFee:"", weekdayWeeklyCount:"",
    weekendFee:"", weekendWeeklyCount:"",
    feeText:""
  };
  if (!text) return result;

  /*
   * 핵심 규칙
   * - "개인별장기요양이용계획서에는 ... 명시되어있으나" 앞쪽 값은
   *   공단의 장기요양이용계획 값이므로 요양급여제공계획서 수가로 사용하지 않는다.
   * - 반드시 "수급자 및 보호자 욕구 반영하여" 이후의 실제 제공 문구만 읽는다.
   *
   * 예) 윤선이
   *   장기요양이용계획: 주 5회 / 8~10시간  ← 버림
   *   실제 제공계획:     주 6회 / 10~13시간 ← 사용
   */
  let actualText = text;
  const desireMatch = text.match(/수급자\s*및\s*보호자\s*욕구\s*반영하여|보호자\s*욕구\s*반영하여|욕구\s*반영하여/);
  if (desireMatch && desireMatch.index != null) {
    actualText = text.slice(desireMatch.index + desireMatch[0].length);
  } else {
    // 욕구반영 문구가 없는 경우에도 '있으나' 뒤쪽을 실제 제공계획으로 본다.
    const however = text.match(/(?:명시|계획)(?:되어)?\s*있으나|되어\s*있으나/);
    if (however && however.index != null) {
      actualText = text.slice(however.index + however[0].length);
    }
  }

  const actualPairs = extractWeeklyFeePairs(actualText);
  const actualRanges = actualText.match(new RegExp(FEE_RANGE_PATTERN, "g")) || [];

  if (actualPairs.length === 1) {
    // 실제 제공 수가가 하나뿐인 계획서: '계획서 횟수/수가'에 저장
    result.planWeeklyCount = actualPairs[0].count;
    result.planFee = actualPairs[0].fee;
  } else if (actualPairs.length >= 2) {
    // 실제 제공 수가가 둘 이상이면 첫 번째를 평일, 두 번째를 주말로 저장
    // (현재 센터 계획서 작성 방식: 평일 주5회 + 주말 주1회 형태)
    result.weekdayWeeklyCount = actualPairs[0].count;
    result.weekdayFee = actualPairs[0].fee;
    result.weekendWeeklyCount = actualPairs[1].count;
    result.weekendFee = actualPairs[1].fee;
  } else if (actualRanges.length === 1) {
    result.planFee = cleanFeeRange(actualRanges[0]);
  }

  result.feeText = [
    result.planFee ? `계획서 수가: ${result.planFee}${result.planWeeklyCount ? ` (${result.planWeeklyCount})` : ""}` : "",
    result.weekdayFee ? `평일 수가: ${result.weekdayFee}${result.weekdayWeeklyCount ? ` (${result.weekdayWeeklyCount})` : ""}` : "",
    result.weekendFee ? `주말 수가: ${result.weekendFee}${result.weekendWeeklyCount ? ` (${result.weekendWeeklyCount})` : ""}` : ""
  ].filter(Boolean).join("\n");

  return result;
}

function parseNewCarePlanSheet(ws, fileName) {
  const a=sheetRows(ws);
  let recipientName="", longTermNumber="", grade="", applicationPeriod="", writtenDate="", summaryOpinion="";
  for (let r=0;r<a.length;r++) {
    const row=a[r]||[];
    for (let c=0;c<row.length;c++) {
      const t=normalizeText(row[c]);
      // 신양식의 제목 셀 자체가 병합되어 있어 sheetRows() 복원 후
      // '성명' 등이 오른쪽 칸에도 반복됩니다. 실제 값 형태를 검증해 찾아갑니다.
      if (t==="성명" && !recipientName) recipientName=findValidatedValueRight(a,r,c,isRecipientNameValue,10);
      if (t.includes("장기요양등급") && !grade) grade=findValidatedValueRight(a,r,c,isGradeValue,10);
      if (t.includes("장기요양인정번호") && !longTermNumber) longTermNumber=findValidatedValueRight(a,r,c,isLongTermNumberValue,10).replace(/\s/g,"");
      if (t.includes("장기요양급여제공계획서적용기간") && !applicationPeriod) applicationPeriod=firstNonEmpty(a[r+1]||[],c);
      if (t==="작성일" && !writtenDate) writtenDate=firstNonEmpty(a[r+1]||[],c);
      if (t==="종합의견" && !summaryOpinion) {
        // 종합의견은 한 셀에만 있지 않고 아래 행/병합셀에 이어지는 양식이 있습니다.
        // "종합의견" 위치부터 "종합확인자"/서명 영역 직전까지의 모든 텍스트를 모읍니다.
        const opinionParts=[];
        for (let rr=r; rr<a.length; rr++) {
          const opinionRow=a[rr] || [];
          const rowText=opinionRow.map(cellText).filter(Boolean).join(" ");
          if (rr>r && /종합\s*확인자|확인자\s*서명/.test(rowText)) break;
          for (let cc=(rr===r ? c+1 : 0); cc<opinionRow.length; cc++) {
            const value=cellText(opinionRow[cc]);
            if (value && normalizeText(value)!=="종합의견") opinionParts.push(value);
          }
        }
        summaryOpinion=[...new Set(opinionParts)].join("\n").trim();
      }
    }
  }
  const fileInfo=extractInfoFromFileName(fileName);
  // 헤더 문자열이 실제 값으로 들어가는 것을 마지막 단계에서도 차단합니다.
  if (!isRecipientNameValue(recipientName)) recipientName="";
  if (!isLongTermNumberValue(longTermNumber)) longTermNumber="";
  if (!isGradeValue(grade)) grade="";
  recipientName ||= fileInfo.recipientName;
  longTermNumber ||= fileInfo.longTermNumber;
  const period=parseDateRange(applicationPeriod);
  writtenDate=normalizeDateString(writtenDate) || period.start;

  // 기존 제공확인 페이지가 읽는 급여목록 구조를 유지합니다.
  const careRows=[];
  let currentArea="", currentGoal="";
  for (let r=0;r<a.length;r++) {
    const row=a[r]||[];
    const need=cellText(row[7]);
    const detail=cellText(row[9]);
    if (!need || /장기요양.*필요내용/.test(need.replace(/\s/g,""))) continue;
    const area=cellText(row[1]); if (area && !/장기요양.*필요영역/.test(area.replace(/\s/g,""))) currentArea=area;
    const goal=cellText(row[2]); if (goal && goal!=="장기요양\n세부목표") currentGoal=goal;
    careRows.push({
      "장기요양필요영역": currentArea,
      "장기요양세부목표": currentGoal,
      "장기요양필요내용": need,
      "필요내용": need,
      "세부제공내용": detail,
      "세부 제공내용": detail,
      "횟수": cellText(row[13]),
      "시간(분)": cellText(row[15]),
      "작성자": cellText(row[17])
    });
  }
  const feeInfo=extractFeeInfo(summaryOpinion);
  return { recipientName,longTermNumber,grade,writtenDate,applicationStartDate:period.start,applicationEndDate:period.end,applicationPeriod,summaryOpinion,...feeInfo,rows:careRows };
}

function getLoginName() {
  return sessionStorage.getItem("loginUser") || localStorage.getItem("loginUser") || currentUser?.email || "알 수 없음";
}
function safeRows(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  try { const parsed = JSON.parse(String(value)); return Array.isArray(parsed) ? parsed : []; }
  catch { return []; }
}
function setMigrationStatus(text, isError=false) {
  if (!elMigrationStatus) return;
  elMigrationStatus.textContent = text;
  elMigrationStatus.style.color = isError ? "#b91c1c" : "#334155";
}

function getPlanVersion(plan) {
  if (plan.sourceType === "new" || plan.schemaVersion === "new-2026") return "new";
  if (plan.sourceType === "legacy" || plan.migratedFrom === "googleSheets") return "legacy";
  // 기존 이전 자료에는 새 양식의 적용기간/등급/수가 필드가 없었습니다.
  if (!plan.applicationStartDate && !plan.applicationEndDate && !plan.grade && !plan.feeText) return "legacy";
  return "new";
}
function getVisiblePlans() {
  return carePlanLibrary.filter(plan => currentFilter === "all" || getPlanVersion(plan) === currentFilter);
}
function escapeHtml(value) {
  return String(value ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}
function updateCountText() {
  if (!elPlanCountText) return;
  const legacy = carePlanLibrary.filter(p => getPlanVersion(p) === "legacy").length;
  const newer = carePlanLibrary.filter(p => getPlanVersion(p) === "new").length;
  elPlanCountText.textContent = `전체 ${carePlanLibrary.length}건 · 구버전 ${legacy}건 · 신버전 ${newer}건`;
}
function exportPlansToExcel() {
  const plans = getVisiblePlans();
  if (!plans.length) return alert("엑셀로 받을 계획서가 없습니다.");
  const summary = plans.map(plan => ({
    "구분": getPlanVersion(plan) === "legacy" ? "구버전" : "신버전",
    "장기요양번호": plan.longTermNumber || "",
    "수급자명": plan.recipientName || "",
    "등급": plan.grade || "",
    "적용 시작일": normalizeDateString(plan.applicationStartDate || plan.writtenDate),
    "적용 종료일": normalizeDateString(plan.applicationEndDate),
    "작성일": normalizeDateString(plan.writtenDate),
    "계획서 주 횟수": plan.planWeeklyCount || "",
    "계획서 수가": plan.planFee || "",
    "평일 주 횟수": plan.weekdayWeeklyCount || "",
    "평일 수가": plan.weekdayFee || "",
    "주말 주 횟수": plan.weekendWeeklyCount || "",
    "주말 수가": plan.weekendFee || "",
    "종합의견": plan.summaryOpinion || "",
    "파일명": plan.fileName || "",
    "급여 항목 수": Number(plan.itemCount || (plan.rows || []).length || 0),
    "업로드일시": plan.uploadedAt || "",
    "업로드자": plan.uploadedBy || ""
  }));
  const details = [];
  plans.forEach(plan => (plan.rows || []).forEach((row, index) => {
    details.push({
      "구분": getPlanVersion(plan) === "legacy" ? "구버전" : "신버전",
      "장기요양번호": plan.longTermNumber || "",
      "수급자명": plan.recipientName || "",
      "적용 시작일": normalizeDateString(plan.applicationStartDate || plan.writtenDate),
      "급여항목 순번": index + 1,
      ...row
    });
  }));
  const wb = XLSX.utils.book_new();
  const ws1 = XLSX.utils.json_to_sheet(summary);
  XLSX.utils.book_append_sheet(wb, ws1, "계획서목록");
  if (details.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(details), "급여목록상세");
  const label = currentFilter === "legacy" ? "구버전" : currentFilter === "new" ? "신버전" : "전체";
  XLSX.writeFile(wb, `요양급여제공계획서_${label}_${new Date().toISOString().slice(0,10)}.xlsx`);
}

async function loadLibrary() {
  try {
    if (!currentUser) return;
    const snap = await getDocs(collection(db, "carePlans"));
    carePlanLibrary = snap.docs.map(s => {
      const data = s.data();
      return {
        ...data,
        firestoreId: s.id,
        id: data.id ?? s.id,
        writtenDate: normalizeDateString(data.writtenDate),
        applicationStartDate: normalizeDateString(data.applicationStartDate),
        applicationEndDate: normalizeDateString(data.applicationEndDate),
        rows: Array.isArray(data.rows) ? data.rows : safeRows(data.rowsJson),
        checked: false
      };
    });
    if (elPlanSelectAllTrigger) elPlanSelectAllTrigger.checked = false;
    renderLibrary();
  } catch (error) {
    console.error("Firestore 불러오기 오류:", error);
    alert("Firebase에서 급여제공계획서 데이터를 불러오지 못했습니다. Firestore 규칙을 확인해주세요.");
  }
}

async function addPlanToFirestore(plan) {
  if (!currentUser) throw new Error("로그인 정보가 없습니다.");
  const id = String(plan.id || Date.now());
  const rows = plan.rows || [];
  await setDoc(doc(db, "carePlans", id), {
    id,
    longTermNumber: plan.longTermNumber || "",
    recipientName: plan.recipientName || "",
    grade: plan.grade || "",
    applicationStartDate: normalizeDateString(plan.applicationStartDate),
    applicationEndDate: normalizeDateString(plan.applicationEndDate),
    applicationPeriod: plan.applicationPeriod || "",
    summaryOpinion: plan.summaryOpinion || "",
    feeText: plan.feeText || "",
    planFee: plan.planFee || "",
    planWeeklyCount: plan.planWeeklyCount || "",
    weekdayFee: plan.weekdayFee || "",
    weekdayWeeklyCount: plan.weekdayWeeklyCount || "",
    weekendFee: plan.weekendFee || "",
    weekendWeeklyCount: plan.weekendWeeklyCount || "",
    writtenDate: normalizeDateString(plan.writtenDate),
    fileName: plan.fileName || "",
    itemCount: Number(plan.itemCount || 0),
    uploadedAt: plan.uploadedAt || new Date().toLocaleString("ko-KR"),
    uploadedBy: plan.uploadedBy || getLoginName(),
    ownerUid: currentUser.uid,
    sourceType: "new",
    schemaVersion: "new-2026",
    rows
  });
}

async function deleteSelectedFromFirestore(plans) {
  for (const plan of plans) {
    await deleteDoc(doc(db, "carePlans", String(plan.firestoreId || plan.id)));
  }
}

function renderLibrary() {
  if (!elPlanTableBodyContainer) return;
  elPlanTableBodyContainer.innerHTML = "";
  updateCountText();
  const visiblePlans = getVisiblePlans();
  if (visiblePlans.length === 0) {
    elPlanTableBodyContainer.innerHTML = `<tr class="empty-row"><td colspan="17" style="text-align:center;padding:25px 0;">해당 구분에 등록된 급여제공계획서가 없습니다.</td></tr>`;
    if (elPlanSelectAllTrigger) elPlanSelectAllTrigger.checked = false;
    return;
  }
  const sortedList = [...visiblePlans].sort((a,b) => {
    const na=String(a.recipientName||""), nb=String(b.recipientName||"");
    if (na===nb) return normalizeDateString(b.applicationStartDate || b.writtenDate).localeCompare(normalizeDateString(a.applicationStartDate || a.writtenDate));
    return na.localeCompare(nb,"ko");
  });
  for (const plan of sortedList) {
    const row=document.createElement("tr");
    const version=getPlanVersion(plan);
    const versionLabel=version === "legacy" ? "구버전" : "신버전";
    row.innerHTML=`<td class="checkbox-col" style="text-align:center;"><input type="checkbox" class="plan-checkbox" data-id="${escapeHtml(plan.firestoreId || plan.id)}" ${plan.checked?"checked":""}/></td><td><span class="version-badge ${version}">${versionLabel}</span></td><td>${escapeHtml(plan.longTermNumber||"-")}</td><td>${escapeHtml(plan.recipientName||"-")}</td><td>${escapeHtml(plan.grade||"-")}</td><td>${escapeHtml(formatDateValue(plan.applicationStartDate || plan.writtenDate))}</td><td>${escapeHtml(formatDateValue(plan.applicationEndDate))}</td><td>${escapeHtml(plan.planWeeklyCount||"-")}</td><td>${escapeHtml(plan.planFee||"-")}</td><td>${escapeHtml(plan.weekdayWeeklyCount||"-")}</td><td>${escapeHtml(plan.weekdayFee||"-")}</td><td>${escapeHtml(plan.weekendWeeklyCount||"-")}</td><td>${escapeHtml(plan.weekendFee||"-")}</td><td style="text-align:left;">${escapeHtml(plan.fileName||"-")}</td><td>${Number(plan.itemCount||0)}개</td><td>${escapeHtml(plan.uploadedAt||"-")}</td><td>${escapeHtml(plan.uploadedBy||"알 수 없음")}</td>`;
    elPlanTableBodyContainer.appendChild(row);
  }
  bindCheckboxEvents();
}
function bindCheckboxEvents() {
  document.querySelectorAll(".plan-checkbox").forEach(cb => cb.addEventListener("change", e => {
    const id=String(e.target.dataset.id);
    carePlanLibrary=carePlanLibrary.map(p => String(p.firestoreId||p.id)===id ? {...p,checked:e.target.checked}:p);
    if (elPlanSelectAllTrigger && !e.target.checked) elPlanSelectAllTrigger.checked=false;
  }));
}

if (elPlanFileSelector) elPlanFileSelector.addEventListener("change", () => {
  const count = elPlanFileSelector.files?.length || 0;
  if (elPlanFileCount) elPlanFileCount.textContent = count ? `${count}개 파일 선택됨` : "여러 파일을 한 번에 선택할 수 있습니다.";
});

function readWorkbookFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = event => {
      try { resolve(XLSX.read(new Uint8Array(event.target.result), {type:"array", cellDates:true})); }
      catch (e) { reject(e); }
    };
    reader.onerror = () => reject(reader.error || new Error("파일을 읽지 못했습니다."));
    reader.readAsArrayBuffer(file);
  });
}
function findExistingPlan(parsed, fileName="") {
  const no=String(parsed.longTermNumber||"").trim();
  const start=normalizeDateString(parsed.applicationStartDate);
  const fn=String(fileName||"").trim();
  return carePlanLibrary.find(p =>
    (fn && String(p.fileName||"").trim()===fn) ||
    (no && String(p.longTermNumber||"").trim()===no && normalizeDateString(p.applicationStartDate || p.writtenDate)===start)
  );
}

if (elPlanUploadTrigger) elPlanUploadTrigger.addEventListener("click", async () => {
  if (!elPlanFileSelector) return;
  const files=[...(elPlanFileSelector.files || [])];
  if (!files.length) return alert("급여제공계획서 파일을 선택해주세요.");

  elPlanUploadTrigger.disabled=true;
  const originalText=elPlanUploadTrigger.textContent;
  if (elPlanUploadProgress) { elPlanUploadProgress.style.display="block"; elPlanUploadProgress.textContent=`총 ${files.length}개 파일 등록을 시작합니다...`; }
  let success=0, skipped=0;
  const failed=[];
  try {
    for (let i=0;i<files.length;i++) {
      const file=files[i];
      elPlanUploadTrigger.textContent=`등록 중 ${i+1}/${files.length}`;
      if (elPlanUploadProgress) elPlanUploadProgress.textContent=`총 ${files.length}개 중 ${i+1}개 처리 중 · ${file.name}`;
      try {
        const workbook=await readWorkbookFile(file);
        const worksheet=workbook.Sheets[workbook.SheetNames[0]];
        const parsed=parseNewCarePlanSheet(worksheet,file.name);
        if (!parsed.longTermNumber || !parsed.recipientName) throw new Error("수급자 성명 또는 장기요양인정번호를 찾지 못했습니다.");
        if (!parsed.applicationStartDate) throw new Error("적용기간 시작일을 찾지 못했습니다.");
        if (!parsed.rows.length) throw new Error("급여 제공계획 목록을 찾지 못했습니다.");
        const existing=findExistingPlan(parsed,file.name);
        // 같은 파일명 또는 같은 인정번호+적용시작일 자료가 있으면 새 중복행을 만들지 않고 교체합니다.
        // 과거 파서가 '성명/장기요양인정번호/장기요양등급' 헤더를 값으로 저장한 자료도 재업로드만으로 바로잡힙니다.
        const replacementId=existing ? String(existing.firestoreId || existing.id) : "";
        const newPlan={id:replacementId || `${Date.now()}_${i}_${Math.random().toString(36).slice(2,8)}`,...parsed,fileName:file.name,uploadedAt:new Date().toLocaleString("ko-KR"),uploadedBy:getLoginName(),itemCount:getCareItemCount(parsed.rows),checked:false};
        await addPlanToFirestore(newPlan);
        carePlanLibrary.push({...newPlan, firestoreId:newPlan.id});
        success++;
      } catch(error) {
        console.error(file.name,error);
        failed.push(`${file.name} : ${error.message||error}`);
      }
    }
    elPlanFileSelector.value="";
    if (elPlanFileCount) elPlanFileCount.textContent="여러 파일을 한 번에 선택할 수 있습니다.";
    await loadLibrary();
    const summary=`일괄 등록 완료\n\n성공 ${success}건 / 중복 건너뜀 ${skipped}건 / 실패 ${failed.length}건` + (failed.length ? `\n\n실패 파일\n${failed.join("\n")}` : "");
    if (elPlanUploadProgress) elPlanUploadProgress.textContent=`완료 · 성공 ${success}건 / 중복 ${skipped}건 / 실패 ${failed.length}건`;
    alert(summary);
  } finally {
    elPlanUploadTrigger.disabled=false;
    elPlanUploadTrigger.textContent=originalText || "계획서 등록";
  }
});

if (elPlanSelectAllTrigger) elPlanSelectAllTrigger.addEventListener("change", e => { carePlanLibrary=carePlanLibrary.map(p => (currentFilter === "all" || getPlanVersion(p) === currentFilter) ? {...p,checked:e.target.checked} : p); renderLibrary(); });
elPlanFilterButtons.forEach(btn => btn.addEventListener("click", () => {
  currentFilter = btn.dataset.filter || "all";
  elPlanFilterButtons.forEach(b => b.classList.toggle("active", b === btn));
  if (elPlanSelectAllTrigger) elPlanSelectAllTrigger.checked = false;
  carePlanLibrary = carePlanLibrary.map(p => ({...p, checked:false}));
  renderLibrary();
}));
if (elPlanExportTrigger) elPlanExportTrigger.addEventListener("click", exportPlansToExcel);

if (elPlanDeleteTrigger) elPlanDeleteTrigger.addEventListener("click", async () => {
  const selected=carePlanLibrary.filter(p=>p.checked);
  if (!selected.length) return alert("삭제할 계획서를 선택해주세요.");
  if (!confirm(`선택한 ${selected.length}개의 계획서를 삭제하시겠습니까?\n본인이 등록/이전한 자료만 삭제할 수 있습니다.`)) return;
  try { elPlanDeleteTrigger.disabled=true; await deleteSelectedFromFirestore(selected); await loadLibrary(); alert("삭제되었습니다."); }
  catch(error) { console.error(error); alert("삭제 권한이 없거나 삭제 중 오류가 발생했습니다."); }
  finally { elPlanDeleteTrigger.disabled=false; }
});

if (elMigrationBtn) elMigrationBtn.addEventListener("click", async () => {
  const file=elMigrationFile?.files?.[0];
  if (!file) return alert("기존 Google Sheets에서 내려받은 DB 엑셀 파일을 선택해주세요.");
  if (!currentUser) return alert("로그인 후 이용해주세요.");
  if (!confirm("선택한 DB 엑셀의 '급여제공계획서' 시트를 Firebase로 이전합니다.\n계획서를 한 건씩 순서대로 저장하며, 기존 시트의 id가 같아도 계획서별로 별도 저장됩니다. 계속할까요?")) return;

  elMigrationBtn.disabled=true;
  let done=0;
  let failed=[];
  try {
    setMigrationStatus("엑셀 파일을 읽는 중...");
    const buf=await file.arrayBuffer();
    const wb=XLSX.read(new Uint8Array(buf),{type:"array",cellDates:true});
    const ws=wb.Sheets["급여제공계획서"];
    if (!ws) throw new Error("'급여제공계획서' 시트를 찾을 수 없습니다.");

    const rows=XLSX.utils.sheet_to_json(ws,{defval:"",raw:false});
    const valid=rows.filter(r=>r.id && (r.longTermNumber || r.recipientName));
    if (!valid.length) throw new Error("이전할 계획서 데이터가 없습니다.");

    for (let i=0; i<valid.length; i++) {
      const r=valid[i];
      const sourceId=String(r.id || '').trim();
      // 기존 시트에서 id가 중복되어도 서로 다른 계획서가 덮어써지지 않도록
      // 장기요양번호 + 작성일자 + 원본 행번호를 포함한 고유 문서 ID를 사용합니다.
      const uniqueKey = [
        sourceId || 'legacy',
        String(r.longTermNumber || '').trim(),
        normalizeDateString(r.writtenDate) || 'nodate',
        String(i + 2)
      ].join('__').replace(/[^a-zA-Z0-9가-힣_-]/g, '_');
      const id=uniqueKey;
      try {
        const parsedRows=safeRows(r.rowsJson);
        // rowsJson 문자열과 rows 배열을 동시에 저장하면 같은 데이터가 두 번 들어가
        // 문서 크기가 커지므로 Firestore에는 rows 배열만 저장합니다.
        await setDoc(doc(db,"carePlans",id),{
          id,
          longTermNumber:String(r.longTermNumber||"").trim(),
          recipientName:String(r.recipientName||"").trim(),
          writtenDate:normalizeDateString(r.writtenDate),
          fileName:String(r.fileName||""),
          itemCount:Number(r.itemCount||parsedRows.length||0),
          uploadedAt:String(r.uploadedAt||""),
          uploadedBy:String(r.uploadedBy||""),
          ownerUid:currentUser.uid,
          rows:parsedRows,
          migratedFrom:"googleSheets",
          sourceId
        },{merge:true});
        done++;
      } catch (itemError) {
        console.error(`계획서 이전 실패 (${id})`, itemError);
        failed.push({id, name:String(r.recipientName||""), error:itemError?.message||String(itemError)});
      }
      setMigrationStatus(`Firebase 이전 중... ${i+1} / ${valid.length}건 · 성공 ${done}건${failed.length ? ` · 실패 ${failed.length}건` : ""}`);
    }

    await loadLibrary();
    if (failed.length) {
      const preview=failed.slice(0,5).map(x=>`${x.name||x.id}: ${x.error}`).join("\n");
      setMigrationStatus(`이전 완료: 성공 ${done}건 / 실패 ${failed.length}건. 실패 건은 다시 확인해주세요.`,true);
      alert(`이전 작업이 끝났습니다.\n성공: ${done}건\n실패: ${failed.length}건\n\n${preview}${failed.length>5?"\n외 실패 건이 더 있습니다.":""}`);
    } else {
      setMigrationStatus(`이전 완료: ${done}건. Firestore 목록을 다시 불러왔습니다.`);
      alert(`급여제공계획서 ${done}건을 Firebase로 이전했습니다.`);
    }
  } catch(error) {
    console.error("이전 오류:",error);
    setMigrationStatus(`이전 실패: ${error.message || error}`,true);
    alert("이전 중 오류가 발생했습니다. 화면의 상태 메시지를 확인해주세요.");
  } finally {
    elMigrationBtn.disabled=false;
  }
});

onAuthStateChanged(auth, user => {
  currentUser=user;
  if (user) loadLibrary();
});
