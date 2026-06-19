const CARE_PLAN_API_URL = "https://script.google.com/macros/s/AKfycbxFfVUr6hOEpYJbPxJxCW_TOMR144lqoz7Gir9kDZMTFOCy-ygrfrQ0YLzPxfx5aEzZbQ/exec";

let carePlanLibraryCache = [];
let counselLibraryCache = [];
let attendanceLibraryCache = [];

function makePayloadUrl(payload) {
  return `${CARE_PLAN_API_URL}?payload=${encodeURIComponent(JSON.stringify(payload))}`;
}

async function syncCarePlanLibraryFromGoogleSheet() {
  try {
    const response = await fetch(CARE_PLAN_API_URL, { method: "GET", redirect: "follow" });
    const text = await response.text();
    carePlanLibraryCache = JSON.parse(text);
    return carePlanLibraryCache;
  } catch (error) {
    console.error("급여제공계획서 동기화 오류:", error);
    return [];
  }
}

async function syncCounselLibraryFromGoogleSheet() {
  try {
    const response = await fetch(
      makePayloadUrl({ action: "listCounsel" }),
      { method: "GET", redirect: "follow" }
    );
    const text = await response.text();
    counselLibraryCache = JSON.parse(text);
    return counselLibraryCache;
  } catch (error) {
    console.error("상담일지 동기화 오류:", error);
    return [];
  }
}

async function syncAttendanceMonthFromGoogleSheet(monthValue) {
  try {
    const response = await fetch(
      makePayloadUrl({
        action: "listAttendance",
        month: monthValue
      }),
      { method: "GET", redirect: "follow" }
    );
    const text = await response.text();
    const attendance = JSON.parse(text);
    attendanceLibraryCache = Array.isArray(attendance) ? attendance : [];
    return attendanceLibraryCache;
  } catch (error) {
    console.error("출석관리 동기화 오류:", error);
    return attendanceLibraryCache;
  }
}

// 초기 기본 동기화 가동
syncCarePlanLibraryFromGoogleSheet();
syncCounselLibraryFromGoogleSheet();

const checkMonthInput = document.getElementById("checkMonth");
const therapyFileInput = document.getElementById("therapyFile");
const checkTherapyBtn = document.getElementById("checkTherapyBtn");
const clearTherapyBtn = document.getElementById("clearTherapyBtn");
const therapyResultBody = document.getElementById("therapyResultBody");

function normalizeText(value) {
  return String(value || "").replace(/[^a-zA-Z0-9가-힣]/g, "").trim();
}

function isSameRecipient(nameA, nameB) {
  const cleanA = normalizeText(nameA);
  const cleanB = normalizeText(nameB);
  if (!cleanA || !cleanB) return false;
  return cleanA.includes(cleanB) || cleanB.includes(cleanA);
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

function getDaysInMonth(monthValue) {
  if (!monthValue || typeof monthValue !== "string") return [];
  const [year, month] = monthValue.split("-").map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  const days = [];
  for (let day = 1; day <= lastDay; day++) {
    days.push(`${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`);
  }
  return days;
}

function getWeekEndDates(monthValue) {
  const [year, month] = monthValue.split("-").map(Number);
  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month, 0);

  const dayOfWeek = monthStart.getDay();
  const daysFromMonday = (dayOfWeek + 6) % 7;
  const anchorMonday = new Date(monthStart);
  anchorMonday.setDate(monthStart.getDate() - daysFromMonday);

  const ranges = {};
  for (let i = 0; i < 6; i++) {
    const weekStart = new Date(anchorMonday);
    weekStart.setDate(anchorMonday.getDate() + i * 7);
    const weekFriday = new Date(weekStart);
    weekFriday.setDate(weekStart.getDate() + 4);

    const currentStart = new Date(Math.max(weekStart.getTime(), monthStart.getTime()));
    const currentEnd = new Date(Math.min(weekFriday.getTime(), monthEnd.getTime()));

    if (currentStart.getTime() > currentEnd.getTime()) {
      ranges[`week${i + 1}`] = null;
    } else {
      ranges[`week${i + 1}`] = `${currentEnd.getFullYear()}-${String(currentEnd.getMonth() + 1).padStart(2, "0")}-${String(currentEnd.getDate()).padStart(2, "0")}`;
    }
  }
  return ranges;
}

function getDaysInWeekRange(monthValue, weekKey) {
  const [year, month] = monthValue.split("-").map(Number);
  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month, 0);

  const dayOfWeek = monthStart.getDay();
  const daysFromMonday = (dayOfWeek + 6) % 7;
  const anchorMonday = new Date(monthStart);
  anchorMonday.setDate(monthStart.getDate() - daysFromMonday);

  const weekIdx = parseInt(weekKey.replace("week", "")) - 1;
  const weekStart = new Date(anchorMonday);
  weekStart.setDate(anchorMonday.getDate() + weekIdx * 7);

  const days = [];
  for (let i = 0; i < 5; i++) {
    const current = new Date(weekStart);
    current.setDate(weekStart.getDate() + i);
    if (current >= monthStart && current <= monthEnd) {
      days.push(`${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, "0")}-${String(current.getDate()).padStart(2, "0")}`);
    }
  }
  return days;
}

function getWeekKey(dateText) {
  const [year, month, day] = dateText.split("-").map(Number);
  const targetDate = new Date(year, month - 1, day);
  const monthStart = new Date(year, month - 1, 1);

  const dayOfWeek = monthStart.getDay();
  const daysFromMonday = (dayOfWeek + 6) % 7;
  const anchorMonday = new Date(monthStart);
  anchorMonday.setDate(monthStart.getDate() - daysFromMonday);

  const diffDays = Math.floor((targetDate - anchorMonday) / 86400000);
  const weekNumber = Math.floor(diffDays / 7) + 1;

  if (weekNumber <= 1) return "week1";
  if (weekNumber === 2) return "week2";
  if (weekNumber === 3) return "week3";
  if (weekNumber === 4) return "week4";
  if (weekNumber === 5) return "week5";
  return "week6";
}

function getLatestPlansByRecipient(name, checkDate) {
  const library = carePlanLibraryCache || [];
  const validPlans = library.filter((plan) => {
    return new Date(plan.writtenDate) <= new Date(checkDate) && isSameRecipient(plan.recipientName, name);
  });
  validPlans.sort((a, b) => new Date(b.writtenDate) - new Date(a.writtenDate));
  return validPlans[0] || null;
}

function hasTherapyPlan(plan) {
  if (!plan || !plan.rows) return false;
  const text = normalizeText(JSON.stringify(plan.rows));
  return text.includes("물리치료") || text.includes("M10") || text.includes("기능회복훈련");
}

function getLatestTherapyCounsel(name, targetDate) {
  const counselLibrary = counselLibraryCache || [];
  const target = new Date(targetDate);

  const counsels = counselLibrary
    .filter((item) => {
      const sameName = isSameRecipient(item.recipientName || item.name, name);
      const reflectionDate = new Date(item.reflectionDate);
      const text = normalizeText(`${item.careContent} ${item.reason} ${item.changeType}`);
      return sameName && (item.category === "물리치료" || text.includes("물리치료")) && reflectionDate <= target;
    })
    .sort((a, b) => new Date(b.reflectionDate) - new Date(a.reflectionDate));

  return counsels[0] || null;
}

function isRemoveCounsel(counsel) {
  if (!counsel) return false;
  const text = normalizeText(`${counsel.changeType} ${counsel.careContent} ${counsel.reason}`);
  return text.includes("제외") || text.includes("중단") || text.includes("삭제") || text.includes("미제공") || text.includes("하지않");
}

function isAddCounsel(counsel) {
  if (!counsel) return false;
  const text = normalizeText(`${counsel.changeType} ${counsel.careContent} ${counsel.reason}`);
  return text.includes("추가") || text.includes("시작") || text.includes("제공") || text.includes("반영");
}

function isTherapyRequiredAtDate(plan, name, targetDate) {
  let required = hasTherapyPlan(plan);
  const counsel = getLatestTherapyCounsel(name, targetDate);
  if (counsel) {
    if (isRemoveCounsel(counsel)) required = false;
    if (isAddCounsel(counsel)) required = true;
  }
  return required;
}

function getCounselTextForMonth(name, monthEndDate) {
  const counsel = getLatestTherapyCounsel(name, monthEndDate);
  if (!counsel) return "없음";

  const rawDate = counsel.reflectionDate ? String(counsel.reflectionDate).substring(0, 10) : "-";
  const changeType = counsel.changeType || "-";
  let content = counsel.careContent || "-";

  if (content.includes("물리치료") && content.includes("작업치료")) {
    content = content.replace(", 작업치료", "<br>작업치료").replace("), 작업치료", ")<br>작업치료");
  }
  return `<span style="font-weight: 700; color: #1e293b;">${rawDate} [${changeType}]</span><br>${content}`;
}

function getAttendanceMonth(monthValue) {
  return attendanceLibraryCache
    .filter((item) => item.month === monthValue)
    .map((item) => ({
      name: String(item.name || item.recipientName || "").trim(),
      dates: item.dates || item.attendanceDates || []
    }))
    .filter((item) => item.name !== "");
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
    if (!dateText || !dateText.startsWith(monthValue)) continue;

    const weekKey = getWeekKey(dateText);
    const timeText = String(row[timeCol] || "").trim();
    const noteText = String(row[noteCol] || "").trim();

    if (!therapyMap[name]) {
      therapyMap[name] = {
        name,
        weeks: {
          week1: { hasRecord: false, recordText: "-" },
          week2: { hasRecord: false, recordText: "-" },
          week3: { hasRecord: false, recordText: "-" },
          week4: { hasRecord: false, recordText: "-" },
          week5: { hasRecord: false, recordText: "-" },
          week6: { hasRecord: false, recordText: "-" }
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
    ${recordText ? `<div style="font-size:11px; color:#555; margin-top:4px; white-space:normal; word-break:keep-all; line-height:1.5;">${recordText}</div>` : ""}
  `;
}

function buildOverallResult(weekResults) {
  const hasRealError = weekResults.some((r) => r === "누락" || r === "오류");
  return hasRealError ? "확인 필요" : "정상";
}

function buildResults(monthValue, therapyRows) {
  const monthEndDate = getMonthEndDate(monthValue);
  const weekEndDates = getWeekEndDates(monthValue);
  const attendanceRows = getAttendanceMonth(monthValue);

  const results = therapyRows.map((therapy) => {
    const name = therapy.name;
    const plan = getLatestPlansByRecipient(name, monthEndDate);
    const myAttendance = attendanceRows.find((item) => isSameRecipient(item.name, name));
    const attendDatesSet = new Set(myAttendance ? myAttendance.dates : []);

    const weeks = therapy.weeks;
    const weekKeys = ["week1", "week2", "week3", "week4", "week5", "week6"];
    
    const weekRequired = {};
    const weekResultsMap = {};

    weekKeys.forEach((wk) => {
      if (!weekEndDates[wk]) {
        weekResultsMap[wk] = "정상";
        return;
      }
      const weekDays = getDaysInWeekRange(monthValue, wk);
      const hasAttend = weekDays.some((d) => attendDatesSet.has(d));
      
      const req = isTherapyRequiredAtDate(plan, name, weekEndDates[wk]);
      weekRequired[wk] = req;
      weekResultsMap[wk] = getWeekResult(req, weeks[wk], hasAttend);
    });

    const weekResultsArray = weekEndDates.week5 ? 
      [weekResultsMap.week1, weekResultsMap.week2, weekResultsMap.week3, weekResultsMap.week4, weekResultsMap.week5] : 
      [weekResultsMap.week1, weekResultsMap.week2, weekResultsMap.week3, weekResultsMap.week4];

    return {
      name,
      planDate: plan ? plan.writtenDate : "-",
      counselText: getCounselTextForMonth(name, monthEndDate),
      weekRequired,
      weeks,
      weekResultsMap,
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
    .therapy-check-table th, .therapy-check-table td { vertical-align: top; white-space: normal; border: 1px solid #e2e8f0; padding: 12px 8px; }
    .therapy-check-table th:nth-child(1), .therapy-check-table td:nth-child(1) { min-width: 90px; width: 90px; text-align: center; }
    .therapy-check-table th:nth-child(2), .therapy-check-table td:nth-child(2) { min-width: 115px; width: 115px; text-align: center; }
    .therapy-check-table th:nth-child(3), .therapy-check-table td:nth-child(3) { min-width: 180px; width: 180px; text-align: left; }
    .therapy-check-table th:nth-child(n+4):nth-child(-n+9), .therapy-check-table td:nth-child(n+4):nth-child(-n+9) { min-width: 210px; width: 210px; text-align: center; }
    .therapy-check-table th:nth-child(10), .therapy-check-table td:nth-child(10) { min-width: 90px; width: 90px; text-align: center; vertical-align: middle; }
    
    /* 💡 [긴급 긴급 조치]: 전산 메인 테이블에서 짝수 행을 푸르스름하게 강제 변조하던 css 속성을 !important 백색으로 덮어써서 원천 제거했습니다. */
    .therapy-check-table tr:nth-child(even) td { background-color: #ffffff !important; }

    .status-ok { color: #1e293b; font-weight: 700; }
    .status-absent { color: #64748b; font-weight: 600; }
    .status-danger { color: #e11d48; font-weight: 800; }
  `;
  document.head.appendChild(style);
}

function renderResults(monthValue, results) {
  applyTherapyReadableStyle();
  therapyResultBody.innerHTML = "";
  const days = getDaysInMonth(monthValue);

  if (!results || results.length === 0) {
    therapyResultBody.innerHTML = `<tr><td colspan="10">확인할 데이터가 없습니다.</td></tr>`;
    return;
  }

  results.forEach((item) => {
    const row = document.createElement("tr");
    const overallClass = item.overallResult === "정상" ? "status-ok" : "status-danger";
    
    // 종합 결과가 정상이 아닐 때만 분홍색을 주고, 정상이면 강제 흰색 지정
    const errorCellBg = item.overallResult !== "정상" ? "background-color: #fff5f5 !important;" : "background-color: #ffffff !important;";

    // 💡 [배경 락 주입]: !important를 붙여 외부 테마의 파란색 짝수행 얼룩 습격을 완벽 차단했습니다.
    const getCellBgColor = (result) => {
      if (result === "결석") return "background-color: #f8fafc !important;";
      if (result !== "정상") return "background-color: #fff5f5 !important;";
      return "background-color: #ffffff !important;";
    };

    row.innerHTML = `
      <td style="font-weight:600; text-align:center; ${errorCellBg}">${item.name}</td>
      <td style="text-align:center; ${errorCellBg}">${item.planDate ? String(item.planDate).substring(0,10) : "-"}</td>
      <td style="font-size:12px; line-height:1.4; ${errorCellBg}">${item.counselText}</td>
      
      <td style="${getCellBgColor(item.weekResultsMap.week1)}">${buildWeekCell(item.weekResultsMap.week1, item.weeks.week1)}</td>
      <td style="${getCellBgColor(item.weekResultsMap.week2)}">${buildWeekCell(item.weekResultsMap.week2, item.weeks.week2)}</td>
      <td style="${getCellBgColor(item.weekResultsMap.week3)}">${buildWeekCell(item.weekResultsMap.week3, item.weeks.week3)}</td>
      <td style="${getCellBgColor(item.weekResultsMap.week4)}">${buildWeekCell(item.weekResultsMap.week4, item.weeks.week4)}</td>
      <td style="${getCellBgColor(item.weekResultsMap.week5)}">${buildWeekCell(item.weekResultsMap.week5, item.weeks.week5)}</td>
      
      <td class="${overallClass}" style="text-align:center; font-weight:800; vertical-align:middle; ${errorCellBg}">${item.overallResult}</td>
    `;
    therapyResultBody.appendChild(row);
  });
}

checkTherapyBtn.addEventListener("click", async () => {
  const checkMonth = checkMonthInput.value;
  const file = therapyFileInput.files[0];

  if (!checkMonth) { alert("확인 월을 선택해주세요."); return; }
  if (!file) { alert("물리치료 기록 파일을 업로드해주세요."); return; }

  alert("구글 시트에서 계획서, 상담일지 및 출석 데이터 보관함을 동기화 중입니다...");
  await syncCarePlanLibraryFromGoogleSheet();
  await syncCounselLibraryFromGoogleSheet(); 
  await syncAttendanceMonthFromGoogleSheet(checkMonth);
  applyTherapyReadableStyle();

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
  therapyResultBody.innerHTML = `<tr><td colspan="10">확인 월과 물리치료 기록 파일을 선택해주세요.</td></tr>`;
});
