let carePlanLibraryCache = [];
let counselLibraryCache = [];
let attendanceLibraryCache = [];

async function loadCarePlanLibraryFromFirestore(monthValue) {
  try {
    carePlanLibraryCache = await window.HanmaumFirestore.carePlans(monthValue);
    return carePlanLibraryCache;
  } catch (error) {
    console.error("Firebase 급여제공계획서 조회 오류:", error);
    carePlanLibraryCache = [];
    return [];
  }
}


function expandTherapyCounselDocuments(documents) {
  const result = [];
  const fields = ['rows', 'rowsJson', 'records', 'items', 'data'];
  const parseRows = value => {
    if (typeof value === 'string') {
      try { value = JSON.parse(value); } catch (_) { return []; }
    }
    if (Array.isArray(value)) return value;
    if (value && typeof value === 'object') return Object.values(value).filter(x => x && typeof x === 'object');
    return [];
  };
  for (const doc of Array.isArray(documents) ? documents : []) {
    if (!doc || typeof doc !== 'object') continue;
    result.push(doc);
    for (const field of fields) {
      for (const row of parseRows(doc[field])) {
        if (row && typeof row === 'object' && !Array.isArray(row)) {
          result.push({ ...doc, ...row });
        }
      }
    }
  }
  return result;
}

async function loadCounselLibraryFromFirestore(monthValue) {
  try {
    const documents = await window.HanmaumFirestore.counsels();
    counselLibraryCache = expandTherapyCounselDocuments(documents);
    console.info('[물리치료] 상담일지 문서/확장행:', documents.length, counselLibraryCache.length);
    console.info('[물리치료] 손성임 관련 상담일지:', counselLibraryCache.filter(x =>
      normalizeText(getTherapyCounselName(x)) === normalizeText('손성임')));
    return counselLibraryCache;
  } catch (error) {
    console.error('Firebase 상담일지 조회 오류:', error);
    counselLibraryCache = [];
    throw error;
  }
}

async function loadAttendanceMonthFromFirestore(monthValue) {
  try {
    const [y, m] = monthValue.split('-').map(Number);
    const previous = new Date(y, m - 2, 1);
    const next = new Date(y, m, 1);
    const monthString = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    const months = [...new Set([monthString(previous), monthValue, monthString(next)])];
    const batches = await Promise.all(months.map(month => window.HanmaumFirestore.attendance(month)));
    attendanceLibraryCache = batches.flat();
    return attendanceLibraryCache;
  } catch (error) {
    console.error("Firebase 출석관리 조회 오류:", error);
    attendanceLibraryCache = [];
    return [];
  }
}


// 초기 Firebase 데이터 불러오기

const checkMonthInput = document.getElementById("checkMonth");
const therapyFileInput = document.getElementById("therapyFile");
const checkTherapyBtn = document.getElementById("checkTherapyBtn");
const clearTherapyBtn = document.getElementById("clearTherapyBtn");
const therapyResultBody = document.getElementById("therapyResultBody");

let therapyLatestResults = [];
let therapyResultFilterMode = "all";


function normalizeText(value) {
  return String(value || "").replace(/[^a-zA-Z0-9가-힣]/g, "").trim();
}

function normalizeDateText(value) {
  const parsed = parseDate(value);
  return parsed || String(value || "").substring(0, 10);
}

function isSameRecipient(nameA, nameB) {
  const cleanA = normalizeText(nameA);
  const cleanB = normalizeText(nameB);
  if (!cleanA || !cleanB) return false;
  return cleanA === cleanB;
}

function safeCompare(a, b) {
  const nameA = String(a || "").trim();
  const nameB = String(b || "").trim();
  return nameA.localeCompare(nameB, "ko");
}

function excelDateToJSDate(serial) {
  const utcDays = Math.floor(serial - 25569);
  const utcValue = utcDays * 86400;
  const dateInfo = new Date(utcValue * 1000);
  return `${dateInfo.getFullYear()}-${String(dateInfo.getMonth() + 1).padStart(2, "0")}-${String(dateInfo.getDate()).padStart(2, "0")}`;
}

function parseDate(value) {
  if (!value) return "";
  if (value instanceof Date) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
  }
  if (typeof value === "number") return excelDateToJSDate(value);

  const text = String(value).replace(/\s/g, "").replace(/^'/, "");
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  if (/^\d{4}\.\d{2}\.\d{2}$/.test(text)) return text.replace(/\./g, "-");

  const match = text.match(/(\d{4})[.\-/년\s]*(\d{1,2})[.\-/월\s]*(\d{1,2})/);
  if (!match) return "";
  return `${match[1]}-${String(match[2]).padStart(2, "0")}-${String(match[3]).padStart(2, "0")}`;
}

function getMonthEndDate(monthValue) {
  const [year, month] = monthValue.split("-").map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  return `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
}

function getWeekEndDates(monthValue) {
  const [year, month] = monthValue.split("-").map(Number);
  const monthStart = new Date(year, month - 1, 1);
  const daysFromMonday = (monthStart.getDay() + 6) % 7;
  const anchorMonday = new Date(monthStart);
  anchorMonday.setDate(monthStart.getDate() - daysFromMonday);

  const ranges = {};
  for (let i = 0; i < 5; i++) {
    const weekFriday = new Date(anchorMonday);
    weekFriday.setDate(anchorMonday.getDate() + i * 7 + 4);
    ranges[`week${i + 1}`] =
      `${weekFriday.getFullYear()}-${String(weekFriday.getMonth()+1).padStart(2,"0")}-${String(weekFriday.getDate()).padStart(2,"0")}`;
  }
  return ranges;
}

function getDaysInWeekRange(monthValue, weekKey) {
  const [year, month] = monthValue.split("-").map(Number);
  const monthStart = new Date(year, month - 1, 1);
  const daysFromMonday = (monthStart.getDay() + 6) % 7;
  const anchorMonday = new Date(monthStart);
  anchorMonday.setDate(monthStart.getDate() - daysFromMonday);

  const weekIdx = parseInt(weekKey.replace("week", ""), 10) - 1;
  const weekStart = new Date(anchorMonday);
  weekStart.setDate(anchorMonday.getDate() + weekIdx * 7);

  const days = [];
  for (let i = 0; i < 7; i++) {
    const current = new Date(weekStart);
    current.setDate(weekStart.getDate() + i);
    days.push(`${current.getFullYear()}-${String(current.getMonth()+1).padStart(2,"0")}-${String(current.getDate()).padStart(2,"0")}`);
  }
  return days;
}

function getWeekKeyForMonth(dateText, monthValue) {
  const [year, month] = monthValue.split("-").map(Number);
  const monthStart = new Date(year, month - 1, 1);
  const daysFromMonday = (monthStart.getDay() + 6) % 7;
  const anchorMonday = new Date(monthStart);
  anchorMonday.setDate(monthStart.getDate() - daysFromMonday);

  const [dy, dm, dd] = dateText.split("-").map(Number);
  const targetDate = new Date(dy, dm - 1, dd);
  const diffDays = Math.floor((targetDate - anchorMonday) / 86400000);
  const weekNumber = Math.floor(diffDays / 7) + 1;
  if (weekNumber < 1 || weekNumber > 5) return "";
  return `week${weekNumber}`;
}

function isDateInDisplayedWeeks(dateText, monthValue) {
  return !!getWeekKeyForMonth(dateText, monthValue);
}

function readPlanRows(plan) {
  if (!plan) return [];

  if (Array.isArray(plan.rows)) return plan.rows;

  if (typeof plan.rows === "string") {
    try {
      const parsed = JSON.parse(plan.rows);
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch (error) {
      return [plan.rows];
    }
  }

  if (plan.rowsJson) {
    try {
      const parsed = typeof plan.rowsJson === "string" ? JSON.parse(plan.rowsJson) : plan.rowsJson;
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch (error) {
      return [plan.rowsJson];
    }
  }

  return [];
}

let therapyLookupIndex = null;
function prepareTherapyLookupIndex() {
  const plans = new Map(), counsels = new Map();
  for (const plan of carePlanLibraryCache || []) {
    const key = normalizeText(plan.recipientName || plan.name);
    if (!key) continue;
    if (!plans.has(key)) plans.set(key, []);
    plans.get(key).push(plan);
  }
  for (const counsel of counselLibraryCache || []) {
    const key = normalizeText(getTherapyCounselName(counsel));
    if (!key) continue;
    const content = normalizeText(getTherapyCounselContent(counsel));
    if (!["물리치료","물이치료","기능회복","재활훈련","운동치료","작업치료"].some(term => content.includes(term))) continue;
    if (!counsels.has(key)) counsels.set(key, []);
    counsels.get(key).push(counsel);
  }
  for (const arr of plans.values()) arr.sort((a,b) => (parseDate(b.writtenDate) || "").localeCompare(parseDate(a.writtenDate) || ""));
  for (const arr of counsels.values()) arr.sort((a,b) => getTherapyCounselDate(b).localeCompare(getTherapyCounselDate(a)));
  therapyLookupIndex = { plans, counsels };
}

function getLatestPlansByRecipient(name, checkDate) {
  if (!therapyLookupIndex) prepareTherapyLookupIndex();
  const list = therapyLookupIndex.plans.get(normalizeText(name)) || [];
  const date = normalizeDateText(checkDate);
  return list.find(plan => {
    const written = parseDate(plan.writtenDate);
    return written && written <= date;
  }) || null;
}

function hasTherapyPlan(plan) {
  if (!plan) return false;
  const rows = readPlanRows(plan);
  const therapyNames = ["물리치료", "작업치료", "운동치료", "재활치료"];
  const normalize = value => normalizeText(value);
  const excludedKeys = ["종합의견", "목표", "제공내용", "세부제공내용", "판단근거", "사유", "비고", "설명"];
  const serviceKeys = ["장기요양필요내용", "필요내용", "급여항목", "서비스명", "급여명", "항목명", "필요서비스"];

  function inspect(row) {
    if (!row || typeof row !== "object") return false;
    if (Array.isArray(row)) return row.some(inspect);
    return Object.entries(row).some(([key, value]) => {
      const k = normalize(key);
      if (excludedKeys.some(x => k.includes(x))) return false;
      if (serviceKeys.some(x => k.includes(x))) {
        // Only service titles count, not descriptions or whole serialized objects.
        if (typeof value === "string" &&
            therapyNames.some(x => normalize(value) === normalize(x))) return true;
      }
      return value && typeof value === "object" ? inspect(value) : false;
    });
  }
  return rows.some(inspect);
}

// 상담일지 보관함의 구형/신형 필드 및 엑셀 이관 필드 통합
function getTherapyCounselName(item) {
  return item?.recipientName || item?.name || item?.recipient || item?.수급자명 || item?.성명 || '';
}
function getTherapyCounselDate(item) {
  return parseDate(item?.reflectionDate || item?.reflection || item?.reflectedDate ||
    item?.applyDate || item?.effectiveDate || item?.counselDate || item?.counselingDate ||
    item?.consultDate || item?.writtenDate || item?.date || item?.상담일자 || item?.상담일 || item?.반영일);
}
function getTherapyCounselContent(item) {
  return [item?.category, item?.classification, item?.type, item?.분류,
    item?.careContent, item?.benefitContent, item?.serviceContent,
    item?.changeContent, item?.benefit, item?.급여내용, item?.급여제공반영,
    item?.reason, item?.memo, item?.조치내용, item?.changeType,
    item?.changeKind, item?.변경유형].filter(Boolean).join(' ');
}
function isTherapyRelatedCounsel(item) {
  const text = normalizeText(getTherapyCounselContent(item));
  return ['물리치료', '물이치료', '기능회복', '재활훈련', '운동치료', '작업치료'].some(x => text.includes(x));
}
function getLatestTherapyCounsel(name, targetDate) {
  if (!therapyLookupIndex) prepareTherapyLookupIndex();
  const list = therapyLookupIndex.counsels.get(normalizeText(name)) || [];
  const date = normalizeDateText(targetDate);
  return list.find(item => {
    const reflected = getTherapyCounselDate(item);
    return reflected && reflected <= date;
  }) || null;
}
function isRemoveCounsel(counsel) {
  if (!counsel || !isTherapyRelatedCounsel(counsel)) return false;
  const kind = normalizeText(counsel.changeType || counsel.changeKind || counsel.변경유형 || '');
  const content = normalizeText(getTherapyCounselContent(counsel));
  // 변경유형이 명시된 경우 원문 사유의 '제외' 단어보다 변경유형을 우선합니다.
  if (['제외','삭제','중단'].some(x => kind.includes(x))) return true;
  if (['추가','변경','유지'].some(x => kind.includes(x))) return false;
  return ['제외','중단','삭제','미제공','미실시','하지않','제공하지않'].some(x => content.includes(x));
}
function isAddCounsel(counsel) {
  if (!counsel || !isTherapyRelatedCounsel(counsel) || isRemoveCounsel(counsel)) return false;
  const kind = normalizeText(counsel.changeType || counsel.changeKind || counsel.변경유형 || '');
  const text = normalizeText(getTherapyCounselContent(counsel));
  return kind.includes('추가') || ['추가','시작','제공','반영','실시'].some(x => text.includes(x));
}

function getTherapyRuleAtDate(plan, name, targetDate) {
  const planDate = plan ? normalizeDateText(plan.writtenDate) : "";
  const counsel = getLatestTherapyCounsel(name, targetDate);
  const counselDate = counsel
    ? getTherapyCounselDate(counsel)
    : "";

  let required = hasTherapyPlan(plan);
  let source = "계획서";

  const shouldApplyCounsel =
    counsel && (!planDate || (counselDate && counselDate >= planDate));

  if (shouldApplyCounsel) {
    if (isRemoveCounsel(counsel)) required = false;
    else if (isAddCounsel(counsel)) required = true;
    source = "상담";
  }

  return { required, source };
}

function isTherapyRequiredAtDate(plan, name, targetDate) {
  return getTherapyRuleAtDate(plan, name, targetDate).required;
}

function buildTherapySourceHtml(hasTarget, source) {
  return `
    <div style="font-weight:800;color:${hasTarget ? "#2563eb" : "#64748b"};">
      ${hasTarget ? "있음" : "없음"}
    </div>
    <div style="font-size:11px;color:#64748b;margin-top:3px;">
      [${source || "계획서"}]
    </div>
  `;
}

function getCounselTextForMonth(name, monthEndDate) {
  const counsel = getLatestTherapyCounsel(name, monthEndDate);
  if (!counsel) return "없음";

  const rawDate = getTherapyCounselDate(counsel) || "-";
  const changeType = counsel.changeType || counsel.changeKind || counsel.변경유형 || "-";
  let content = counsel.careContent || counsel.benefitContent || counsel.changeContent || counsel.급여내용 || counsel.reason || "-";

  if (content.includes("물리치료") && content.includes("작업치료")) {
    content = content.replace(", 작업치료", "<br>작업치료").replace("), 작업치료", ")<br>작업치료");
  }

  return `<span style="font-weight: 700; color: #1e293b;">${rawDate} [${changeType}]</span><br>${content}`;
}

function getAttendanceMonth(monthValue) {
  const relevantWeeks = new Set(["week1", "week2", "week3", "week4", "week5"]
    .flatMap(wk => getDaysInWeekRange(monthValue, wk)));
  const merged = new Map();
  (attendanceLibraryCache || []).forEach(item => {
    const name = String(item.name || item.recipientName || "").trim();
    const key = normalizeText(name).toLowerCase();
    if (!key) return;
    const dates = Array.isArray(item.dates) ? item.dates :
      (Array.isArray(item.attendanceDates) ? item.attendanceDates : []);
    const validDates = dates.map(date => parseDate(date)).filter(date => relevantWeeks.has(date));
    if (!validDates.length && item.month !== monthValue) return;
    if (!merged.has(key)) merged.set(key, {name, dates: []});
    merged.get(key).dates.push(...validDates);
  });
  return [...merged.values()].map(item => ({...item, dates: [...new Set(item.dates)]}));
}

function sheetToRowsWithMerges(sheet) {
  if (!sheet || !sheet["!ref"]) return [];
  const range = XLSX.utils.decode_range(sheet["!ref"]);
  const rows = [];

  for (let r = range.s.r; r <= range.e.r; r++) {
    const row = [];
    for (let c = range.s.c; c <= range.e.c; c++) {
      const address = XLSX.utils.encode_cell({ r, c });
      const cell = sheet[address];
      row[c] = cell ? cell.v : "";
    }
    rows.push(row);
  }

  const merges = sheet["!merges"] || [];
  merges.forEach((merge) => {
    const startAddress = XLSX.utils.encode_cell({ r: merge.s.r, c: merge.s.c });
    const startCell = sheet[startAddress];
    const value = startCell ? startCell.v : "";

    for (let r = merge.s.r; r <= merge.e.r; r++) {
      for (let c = merge.s.c; c <= merge.e.c; c++) {
        rows[r - range.s.r][c] = value;
      }
    }
  });

  return rows;
}

function findHeaderIndex(rows) {
  return rows.findIndex((row) => {
    const text = normalizeText(row.join(" "));
    return text.includes("연번") && text.includes("수급자명") && text.includes("제공일") && text.includes("제공시간");
  });
}

function parseTherapyReport(workbook, monthValue) {
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = sheetToRowsWithMerges(sheet);
  const headerIndex = findHeaderIndex(rows);

  if (headerIndex === -1) {
    alert("물리치료 기록에서 표 머리글을 찾지 못했습니다.");
    return [];
  }

  const header = rows[headerIndex];
  const nameCol = header.findIndex((cell) => normalizeText(cell).includes("수급자명"));
  const dateCol = header.findIndex((cell) => normalizeText(cell).includes("제공일"));
  const timeCol = header.findIndex((cell) => normalizeText(cell).includes("제공시간"));
  const noteCol = header.findIndex((cell) => normalizeText(cell).includes("특이사항"));

  const therapyMap = {};

  for (let i = headerIndex + 1; i < rows.length; i++) {
    const row = rows[i] || [];
    const name = String(row[nameCol] || "").trim();
    if (!name || name === "수급자명") continue;

    const dateText = parseDate(row[dateCol]);
    if (!dateText || !isDateInDisplayedWeeks(dateText, monthValue)) continue;

    const weekKey = getWeekKeyForMonth(dateText, monthValue);
    if (!weekKey) continue;
    const timeText = String(row[timeCol] || "").trim();
    const noteText = noteCol >= 0 ? String(row[noteCol] || "").trim() : "";

    if (!therapyMap[name]) {
      therapyMap[name] = {
        name,
        weeks: {
          week1: { hasRecord: false, recordText: "-" },
          week2: { hasRecord: false, recordText: "-" },
          week3: { hasRecord: false, recordText: "-" },
          week4: { hasRecord: false, recordText: "-" },
          week5: { hasRecord: false, recordText: "-" }
        }
      };
    }

    const label = `${dateText} ${timeText}${noteText ? " / " + noteText : ""}`;
    const oldText = therapyMap[name].weeks[weekKey].recordText;

    therapyMap[name].weeks[weekKey] = {
      hasRecord: true,
      recordText: oldText && oldText !== "-" ? `${oldText} / ${label}` : label
    };
  }

  return Object.values(therapyMap);
}

function getWeekResult(required, weekData, hasAttendanceInWeek) {
  if (!hasAttendanceInWeek) return "결석";

  const hasRecord = weekData && weekData.hasRecord;
  if (required && hasRecord) return "정상";
  if (required && !hasRecord) return "누락";
  if (!required && hasRecord) return "오류";
  return "정상";
}

// 주중 급여 변경 시 주차 말일이 아닌 실제 제공일을 기준으로 검증합니다.
function getTherapyRecordDates(weekData) {
  if (!weekData || !weekData.hasRecord) return [];
  const text = String(weekData.recordText || "");
  return [...new Set((text.match(/\b\d{4}-\d{2}-\d{2}\b/g) || []))];
}

// 상담일지의 물리치료 제외 반영일이 포함된 주차는 기록 의무를 면제합니다.
// 날짜 비교는 월~일 전체를 기준으로 하며, 월 경계 주차도 처리합니다.
function hasTherapyExclusionInWeek(name, weekDays) {
  if (!weekDays || !weekDays.length) return false;
  const monday = weekDays[0];
  const sundayDate = new Date(`${monday}T12:00:00`);
  sundayDate.setDate(sundayDate.getDate() + 6);
  const sunday = `${sundayDate.getFullYear()}-${String(sundayDate.getMonth() + 1).padStart(2, '0')}-${String(sundayDate.getDate()).padStart(2, '0')}`;
  return (counselLibraryCache || []).some(item => {
    if (!isSameRecipient(getTherapyCounselName(item), name)) return false;
    const date = getTherapyCounselDate(item);
    if (!date || date < monday || date > sunday || !isRemoveCounsel(item)) return false;
    const text = normalizeText(getTherapyCounselContent(item));
    return ['물리치료', '물이치료', '기능회복', '재활훈련', '운동치료', '작업치료'].some(word => text.includes(word));
  });
}

function getDateAwareWeekResult(name, weekDays, attendDatesSet, weekData) {
  const attended = weekDays.filter(day => attendDatesSet.has(day));
  if (!attended.length) return "결석";

  const requiredDays = attended.filter(day => {
    const plan = getLatestPlansByRecipient(name, day);
    return getTherapyRuleAtDate(plan, name, day).required;
  });
  const recordDates = getTherapyRecordDates(weekData);

  // 기록이 있는 날은 해당 날짜의 계획서 및 상담일지 적용 여부를 각각 확인합니다.
  if (weekData && weekData.hasRecord) {
    // 제공일을 읽지 못한 기록을 정상으로 처리하지 않습니다.
    if (!recordDates.length) return "오류";
    const invalidRecord = recordDates.some(day => {
      const plan = getLatestPlansByRecipient(name, day);
      return !getTherapyRuleAtDate(plan, name, day).required;
    });
    return invalidRecord ? "오류" : "정상";
  }
  // 제외 반영일이 속한 주차부터 기록이 없어도 정상입니다.
  if (hasTherapyExclusionInWeek(name, weekDays)) return "정상";
  return requiredDays.length ? "누락" : "정상";
}

function makeResultClass(result) {
  if (result === "정상") return "status-ok";
  if (result === "결석") return "status-absent";
  return "status-danger";
}

function buildWeekCell(result, weekData) {
  const resultClass = makeResultClass(result);

  let recordText = "";
  if (weekData && weekData.recordText && result !== "결석") {
    recordText = weekData.recordText.replaceAll(" / ", "<br>").replaceAll("~", " ~ ");
  }

  return `
    <div class="${resultClass}">${result}</div>
    ${recordText ? `<div style="font-size:10.5px; color:#555; margin-top:4px; white-space:normal; word-break:keep-all; line-height:1.45;">${recordText}</div>` : ""}
  `;
}

function buildOverallResult(weekResults) {
  const hasRealError = weekResults.some((r) => r === "누락" || r === "오류");
  return hasRealError ? "확인 필요" : "정상";
}

function addRecipientName(map, name) {
  const cleanName = String(name || "").trim();
  const key = normalizeText(cleanName);
  if (key && !map[key]) map[key] = cleanName;
}

function collectTherapyTargetNames(monthEndDate) {
  const names = {};
  (carePlanLibraryCache || []).forEach(plan => addRecipientName(names, plan.recipientName || plan.name));
  (counselLibraryCache || []).forEach(counsel => addRecipientName(names, getTherapyCounselName(counsel)));
  return Object.values(names).filter(name => {
    const plan = getLatestPlansByRecipient(name, monthEndDate);
    return getTherapyRuleAtDate(plan, name, monthEndDate).required;
  });
}

function buildResults(monthValue, therapyRows) {
  therapyLookupIndex = null;
  prepareTherapyLookupIndex();
  const monthEndDate = getMonthEndDate(monthValue);
  const weekEndDates = getWeekEndDates(monthValue);
  const attendanceRows = getAttendanceMonth(monthValue);

  const attendanceMap = {};
  attendanceRows.forEach((attendance) => {
    const key = normalizeText(attendance.name);
    if (key) attendanceMap[key] = attendance;
  });

  const recipientMap = {};

  // 1) 해당 월 출석자
  attendanceRows.forEach((attendance) => addRecipientName(recipientMap, attendance.name));

  // 2) 물리치료 기록 파일에 실제 기록이 있는 사람
  therapyRows.forEach((therapy) => addRecipientName(recipientMap, therapy.name));

  // 3) 급여제공계획서 또는 상담일지상 물리치료 대상자
  collectTherapyTargetNames(monthEndDate).forEach((name) => addRecipientName(recipientMap, name));

  const defaultWeeks = {
    week1: { hasRecord: false, recordText: "-" },
    week2: { hasRecord: false, recordText: "-" },
    week3: { hasRecord: false, recordText: "-" },
    week4: { hasRecord: false, recordText: "-" },
    week5: { hasRecord: false, recordText: "-" }
  };

  const weekKeys = ["week1", "week2", "week3", "week4", "week5"];

  const results = Object.values(recipientMap).map((name) => {
    const plan = getLatestPlansByRecipient(name, monthEndDate);
    const attendance = attendanceRows.find((item) => isSameRecipient(item.name, name));
    const attendDatesSet = new Set(attendance && Array.isArray(attendance.dates) ? attendance.dates : []);

    const therapy = therapyRows.find((item) => isSameRecipient(item.name, name));
    const weeks = therapy && therapy.weeks ? therapy.weeks : defaultWeeks;

    const weekRequired = {};
    const weekResultsMap = {};

    weekKeys.forEach((wk) => {
      if (!weekEndDates[wk]) {
        weekRequired[wk] = false;
        weekResultsMap[wk] = "정상";
        return;
      }

      const weekDays = getDaysInWeekRange(monthValue, wk);
      const req = weekDays.some(day => {
        if (!attendDatesSet.has(day)) return false;
        const dayPlan = getLatestPlansByRecipient(name, day);
        return getTherapyRuleAtDate(dayPlan, name, day).required;
      });

      weekRequired[wk] = req;
      weekResultsMap[wk] = getDateAwareWeekResult(name, weekDays, attendDatesSet, weeks[wk]);
    });

    const weekResultsArray = weekKeys.map((wk) => weekResultsMap[wk]);

    return {
      name,
      planDate: plan ? normalizeDateText(plan.writtenDate) : "-",
      counselText: getCounselTextForMonth(name, monthEndDate),
      weekRequired,
      weeks,
      weekResultsMap,
      therapyRule: getTherapyRuleAtDate(
        getLatestPlansByRecipient(name, monthEndDate),
        name,
        monthEndDate
      ),
      overallResult: buildOverallResult(weekResultsArray)
    };
  });

  return results.sort((a, b) => safeCompare(a.name, b.name));
}

function applyTherapyReadableStyle() {
  if (document.getElementById("therapyReadableStyle")) return;

  const style = document.createElement("style");
  style.id = "therapyReadableStyle";
  style.textContent = `
    .therapy-check-table th, .therapy-check-table td,
    .info-table th, .info-table td {
      vertical-align: top;
      white-space: normal;
      border: 1px solid #e2e8f0 !important;
      padding: 10px 6px;
      word-break: keep-all;
      line-height: 1.42;
      font-size: 12px;
    }

    .therapy-check-table th,
    .info-table th {
      font-size: 13px;
      font-weight: 800;
    }

    .therapy-check-table th:nth-child(1), .therapy-check-table td:nth-child(1),
    .info-table th:nth-child(1), .info-table td:nth-child(1) { min-width: 76px; width: 76px; text-align: center; }

    .therapy-check-table th:nth-child(2), .therapy-check-table td:nth-child(2),
    .info-table th:nth-child(2), .info-table td:nth-child(2) { min-width: 98px; width: 98px; text-align: center; }

    .therapy-check-table th:nth-child(3), .therapy-check-table td:nth-child(3),
    .info-table th:nth-child(3), .info-table td:nth-child(3) { min-width: 150px; width: 150px; text-align: left; }

    .therapy-check-table th:nth-child(4), .therapy-check-table td:nth-child(4),
    .info-table th:nth-child(4), .info-table td:nth-child(4) { min-width: 74px; width: 74px; text-align: center; vertical-align: middle; }

    .therapy-check-table th:nth-child(n+5):nth-child(-n+9), .therapy-check-table td:nth-child(n+5):nth-child(-n+9),
    .info-table th:nth-child(n+5):nth-child(-n+9), .info-table td:nth-child(n+5):nth-child(-n+9) {
      min-width: 168px;
      width: 168px;
      text-align: center;
    }

    .therapy-check-table th:nth-child(10), .therapy-check-table td:nth-child(10),
    .info-table th:nth-child(10), .info-table td:nth-child(10) {
      min-width: 82px;
      width: 82px;
      text-align: center;
      vertical-align: middle;
    }

    .therapy-check-table tr:nth-child(even) td,
    .info-table tr:nth-child(even) td { background-color: #ffffff !important; }

    .therapy-target-ok { color: #2563eb; font-weight: 800; }
    .therapy-target-no { color: #64748b; font-weight: 700; }
    .status-ok { color: #2563eb; font-weight: 800; }
    .status-absent { color: #64748b; font-weight: 700; }
    .status-danger { color: #e11d48; font-weight: 900; }
  `;

  document.head.appendChild(style);
}

function ensureTherapyResultFilterButtons() {
  if (!therapyResultBody) return;

  const table = therapyResultBody.closest("table");
  if (!table || document.getElementById("therapyResultFilterBar")) return;

  const bar = document.createElement("div");
  bar.id = "therapyResultFilterBar";
  bar.style.cssText = "display:flex;justify-content:flex-end;gap:8px;margin:0 0 10px 0;";

  bar.innerHTML = `
    <button type="button" id="therapyFilterAllBtn"
      style="border:1px solid #1e40af;background:#1e40af;color:#fff;border-radius:8px;padding:8px 14px;font-weight:700;cursor:pointer;">
      전체
    </button>
    <button type="button" id="therapyFilterCheckBtn"
      style="border:1px solid #fecaca;background:#fff;color:#dc2626;border-radius:8px;padding:8px 14px;font-weight:700;cursor:pointer;">
      확인 필요만
    </button>
  `;

  const scrollContainer = table.closest("#therapyTableScroller");
  const reference = scrollContainer || table;
  reference.parentNode.insertBefore(bar, reference);

  document.getElementById("therapyFilterAllBtn").addEventListener("click", () => {
    therapyResultFilterMode = "all";
    updateTherapyFilterButtonStyle();
    renderResults(checkMonthInput.value, therapyLatestResults, true);
  });

  document.getElementById("therapyFilterCheckBtn").addEventListener("click", () => {
    therapyResultFilterMode = "check";
    updateTherapyFilterButtonStyle();
    renderResults(checkMonthInput.value, therapyLatestResults, true);
  });
}

function updateTherapyFilterButtonStyle() {
  const allBtn = document.getElementById("therapyFilterAllBtn");
  const checkBtn = document.getElementById("therapyFilterCheckBtn");
  if (!allBtn || !checkBtn) return;

  const allActive = therapyResultFilterMode === "all";

  allBtn.style.background = allActive ? "#1e40af" : "#fff";
  allBtn.style.color = allActive ? "#fff" : "#1e40af";

  checkBtn.style.background = allActive ? "#fff" : "#dc2626";
  checkBtn.style.color = allActive ? "#dc2626" : "#fff";
}


// 선택한 확인 월을 기준으로 주차별 날짜를 표 머리글에 표시합니다.
function updateTherapyWeekHeaders(monthValue) {
  if (!monthValue || !therapyResultBody) return;
  const table = therapyResultBody.closest("table");
  if (!table) return;
  const [year, month] = monthValue.split("-").map(Number);
  const first = new Date(year, month - 1, 1);
  const monday = new Date(year, month - 1, 1 - ((first.getDay() + 6) % 7));
  const fmt = d => `${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
  const headerCells = Array.from(table.querySelectorAll("thead th, thead td"));
  for (let i = 1; i <= 5; i++) {
    const start = new Date(monday);
    start.setDate(monday.getDate() + (i - 1) * 7);
    const end = new Date(start);
    end.setDate(start.getDate() + 6); // 월~일, 월 경계 주차 포함
    const cell = headerCells.find(el => new RegExp(`^${i}주차`).test(el.textContent.trim().replace(/\s/g, "")));
    if (!cell) continue;
    cell.innerHTML = `<div style="font-weight:800">${i}주차</div><div style="font-size:11px;color:#64748b;font-weight:600;margin-top:4px;white-space:nowrap">${fmt(start)} ~ ${fmt(end)}</div>`;
  }
}

function ensureTherapyTableScroller() {
  if (!therapyResultBody) return;
  const table = therapyResultBody.closest("table");
  if (!table) return;
  let scroller = document.getElementById("therapyTableScroller");
  if (!scroller) {
    scroller = document.createElement("div");
    scroller.id = "therapyTableScroller";
    table.parentNode.insertBefore(scroller, table);
    scroller.appendChild(table);
  }
  scroller.style.cssText = "height: min(78vh, 900px);min-height:700px;overflow:auto;max-width:100%;position:relative;border:1px solid #e2e8f0;border-radius:8px;";
  table.style.width = "100%";
  table.style.borderCollapse = "separate";
  table.style.borderSpacing = "0";
  const styleId = "therapyStickyHeaderStyle";
  if (!document.getElementById(styleId)) {
    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = "#therapyTableScroller thead th,#therapyTableScroller thead td{position:sticky;top:0;z-index:3;background:#edf2ff;}";
    document.head.appendChild(style);
  }
}

function renderResults(monthValue, results, fromFilter = false) {
  applyTherapyReadableStyle();
  ensureTherapyTableScroller();
  updateTherapyWeekHeaders(monthValue);

  if (!fromFilter) {
    therapyLatestResults = Array.isArray(results) ? results : [];
  }

  ensureTherapyResultFilterButtons();
  updateTherapyFilterButtonStyle();

  const sourceResults = Array.isArray(results) ? results : [];
  const visibleResults = therapyResultFilterMode === "check"
    ? sourceResults.filter((item) => item.overallResult === "확인 필요")
    : sourceResults;

  therapyResultBody.innerHTML = "";

  if (visibleResults.length === 0) {
    const emptyText = therapyResultFilterMode === "check"
      ? "확인 필요한 대상자가 없습니다."
      : "확인할 데이터가 없습니다.";

    therapyResultBody.innerHTML = `<tr><td colspan="10">${emptyText}</td></tr>`;
    return;
  }

  visibleResults.forEach((item) => {
    const row = document.createElement("tr");
    const overallClass = item.overallResult === "정상" ? "status-ok" : "status-danger";

    const errorCellBg = item.overallResult !== "정상"
      ? "background-color: #fff5f5 !important;"
      : "background-color: #ffffff !important;";

    const getCellBgColor = (result) => {
      if (result === "결석") return "background-color: #f8fafc !important;";
      if (result !== "정상") return "background-color: #fff5f5 !important;";
      return "background-color: #ffffff !important;";
    };

    row.innerHTML = `
      <td style="font-weight:600; text-align:center; ${errorCellBg}">${item.name}</td>
      <td style="text-align:center; ${errorCellBg}">${item.planDate || "-"}</td>
      <td style="font-size:12px; line-height:1.4; ${errorCellBg}">${item.counselText}</td>
      <td style="text-align:center; vertical-align:middle; ${errorCellBg}">
        ${buildTherapySourceHtml(
          Object.values(item.weekRequired || {}).some(Boolean),
          item.therapyRule?.source
        )}
      </td>

      <td style="${getCellBgColor(item.weekResultsMap.week1)}">${buildWeekCell(item.weekResultsMap.week1, item.weeks.week1)}</td>
      <td style="${getCellBgColor(item.weekResultsMap.week2)}">${buildWeekCell(item.weekResultsMap.week2, item.weeks.week2)}</td>
      <td style="${getCellBgColor(item.weekResultsMap.week3)}">${buildWeekCell(item.weekResultsMap.week3, item.weeks.week3)}</td>
      <td style="${getCellBgColor(item.weekResultsMap.week4)}">${buildWeekCell(item.weekResultsMap.week4, item.weeks.week4)}</td>
      <td style="${getCellBgColor(item.weekResultsMap.week5)}">${buildWeekCell(item.weekResultsMap.week5, item.weeks.week5)}</td>

      <td class="${overallClass}" style="text-align:center; font-weight:800; vertical-align:middle; ${errorCellBg}">
        ${item.overallResult}
      </td>
    `;

    therapyResultBody.appendChild(row);
  });
}

checkTherapyBtn.addEventListener("click", async () => {
  const checkMonth = checkMonthInput.value;
  const file = therapyFileInput.files[0];

  if (!checkMonth) {
    alert("확인 월을 선택해주세요.");
    return;
  }

  if (!file) {
    alert("물리치료 기록 파일을 업로드해주세요.");
    return;
  }

  checkTherapyBtn.disabled = true;
  const previousButtonText = checkTherapyBtn.textContent;
  checkTherapyBtn.textContent = "자료 불러오는 중...";
  try {
    await Promise.all([
      loadCarePlanLibraryFromFirestore(checkMonth),
      loadCounselLibraryFromFirestore(checkMonth),
      loadAttendanceMonthFromFirestore(checkMonth)
    ]);
  } catch (error) {
    console.error("물리치료 확인 자료 조회 실패:", error);
    alert("자료를 불러오지 못했습니다. 다시 시도해주세요.");
    return;
  } finally {
    checkTherapyBtn.disabled = false;
    checkTherapyBtn.textContent = previousButtonText;
  }
  applyTherapyReadableStyle();

  const attendanceRows = getAttendanceMonth(checkMonth);
  if (attendanceRows.length === 0) {
    alert("출석관리 저장 내역이 없습니다. 먼저 출석관리에서 해당 월 출석을 등록해주세요.");
  }

  const reader = new FileReader();

  reader.onload = (event) => {
    const data = new Uint8Array(event.target.result);
    const workbook = XLSX.read(data, { type: "array", cellDates: true });
    const therapyRows = parseTherapyReport(workbook, checkMonth);
    const results = buildResults(checkMonth, therapyRows);
    renderResults(checkMonth, results);
  };

  reader.readAsArrayBuffer(file);
});

clearTherapyBtn.addEventListener("click", () => {
  checkMonthInput.value = "";
  therapyFileInput.value = "";
  therapyLatestResults = [];
  therapyResultFilterMode = "all";
  updateTherapyFilterButtonStyle();
  therapyResultBody.innerHTML = `<tr><td colspan="10">확인 월과 물리치료 기록 파일을 선택해주세요.</td></tr>`;
});
