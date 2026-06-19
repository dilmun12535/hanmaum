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
    const response = await fetch(`${CARE_PLAN_API_URL}?action=listCounsel`, { method: "GET", redirect: "follow" });
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

// 초기 동기화 가동
syncCarePlanLibraryFromGoogleSheet();
syncCounselLibraryFromGoogleSheet();

const checkMonthInput = document.getElementById("checkMonth");
const mediFileInput = document.getElementById("mediFile");
const checkMediBtn = document.getElementById("checkMediBtn");
const clearMediBtn = document.getElementById("clearMediBtn");
const mediTableHead = document.getElementById("mediTableHead");
const mediResultBody = document.getElementById("mediResultBody");

function normalizeText(value) {
  return String(value || "").replace(/\s/g, "").trim();
}

function normalizeRecipientName(value) {
  return String(value || "").replace(/[^a-zA-Z0-9가-힣]/g, "").trim();
}

function isSameRecipient(nameA, nameB) {
  const cleanA = normalizeRecipientName(nameA);
  const cleanB = normalizeRecipientName(nameB);
  if (!cleanA || !cleanB) return false;
  return cleanA.includes(cleanB) || cleanB.includes(cleanA);
}

function safeCompare(a, b) {
  const nameA = String(a || "").trim();
  const nameB = String(b || "").trim();
  return nameA.localeCompare(nameB, "ko");
}

function normalizeDateText(value) {
  if (!value) return "";
  const text = String(value).replace(/\s/g, "").replace(/^'/, "");
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  if (/^\d{4}\.\d{2}\.\d{2}$/.test(text)) return text.replace(/\./g, "-");
  if (/^\d{4}\/\d{2}\/\d{2}$/.test(text)) return text.replace(/\//g, "-");
  if (text.includes("T")) return text.split("T")[0];

  const match = text.match(/(\d{4})[.\-/년*](\d{1,2})[.\-/월*](\d{1,2})/);
  if (match) {
    return `${match[1]}-${String(match[2]).padStart(2, "0")}-${String(match[3]).padStart(2, "0")}`;
  }
  return text;
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
  return normalizeDateText(value);
}

function getMonthEndDate(monthValue) {
  if (!monthValue || typeof monthValue !== "string") return "";
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

function getHolidayList(year) {
  const holidays = {
    2024: [
      "2024-01-01", "2024-02-09", "2024-02-10", "2024-02-11", "2024-02-12",
      "2024-03-01", "2024-04-10", "2024-05-05", "2024-05-06", "2024-05-15",
      "2024-06-06", "2024-08-15", "2024-09-16", "2024-09-17", "2024-09-18",
      "2024-10-03", "2024-10-09", "2024-12-25"
    ],
    2025: [
      "2025-01-01", "2025-01-28", "2025-01-29", "2025-01-30",
      "2025-03-01", "2025-03-03", "2025-05-05", "2025-05-06",
      "2025-06-06", "2025-08-15", "2025-10-03", "2025-10-05", "2025-10-06",
      "2025-10-07", "2025-10-08", "2025-10-09", "2025-12-25"
    ],
    2026: [
      "2026-01-01", "2026-02-16", "2026-02-17", "2026-02-18",
      "2026-03-01", "2026-03-02", "2026-05-05", "2026-05-24", "2026-05-25",
      "2026-06-03", "2026-06-06", "2026-08-15", "2026-08-17",
      "2026-09-24", "2026-09-25", "2026-09-26", "2026-10-03",
      "2026-10-05", "2026-10-09", "2026-12-25"
    ]
  };
  return holidays[year] || [];
}

function getDayColorClass(dateText) {
  const date = new Date(dateText);
  const weekday = date.getDay();
  const holidayList = getHolidayList(date.getFullYear());
  if (weekday === 0 || holidayList.includes(dateText)) return "medi-day-red";
  if (weekday === 6) return "medi-day-blue";
  return "";
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
  return rows.findIndex((row, index) => {
    const currentText = normalizeText(row.join(" "));
    const nextText = normalizeText((rows[index + 1] || []).join(" "));
    const totalText = currentText + nextText;
    return (
      totalText.includes("수급자명") && totalText.includes("작성일") &&
      totalText.includes("간호") && totalText.includes("복약확인")
    );
  });
}

function makeCombinedHeader(rows, headerIndex) {
  const row1 = rows[headerIndex] || [];
  const row2 = rows[headerIndex + 1] || [];
  const maxLength = Math.max(row1.length, row2.length);
  const header = [];
  for (let i = 0; i < maxLength; i++) {
    header[i] = `${row1[i] || ""} ${row2[i] || ""}`.trim();
  }
  return header;
}

function findColumn(header, keywords) {
  return header.findIndex((cell) => {
    const text = normalizeText(cell);
    return keywords.every((keyword) => text.includes(normalizeText(keyword)));
  });
}

function parseMediReport(workbook, monthValue) {
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = sheetToRowsWithMerges(sheet);
  const headerIndex = findHeaderIndex(rows);

  if (headerIndex === -1) {
    alert("간호일지/복약기록에서 표 머리글을 찾지 못했습니다.");
    return [];
  }

  const header = makeCombinedHeader(rows, headerIndex);
  const nameCol = findColumn(header, ["수급자명"]);
  const dateCol = findColumn(header, ["작성일"]);
  const mediCol = findColumn(header, ["간호", "복약확인"]);

  const resultMap = {};
  let currentName = "";

  for (let i = headerIndex + 2; i < rows.length; i++) {
    const row = rows[i] || [];
    const rawName = String(row[nameCol] || "").trim();
    if (rawName && rawName !== "수급자명") currentName = rawName;
    const name = currentName;
    if (!name) continue;

    const dateText = parseDate(row[dateCol]);
    if (!dateText || !dateText.startsWith(monthValue)) continue;

    const rawMediValue = normalizeText(row[mediCol]);
    let status = "미제공"; 
    if (rawMediValue.includes("제공") || rawMediValue.includes("완료") || rawMediValue === "o" || rawMediValue === "○") {
      status = "제공";
    }

    if (!resultMap[name]) {
      resultMap[name] = { name, days: {} };
    }
    resultMap[name].days[dateText] = status;
  }
  return Object.values(resultMap);
}

function getLatestPlansByRecipient(name, checkDate) {
  const checkDateText = normalizeDateText(checkDate);
  const library = carePlanLibraryCache || [];
  const validPlans = library.filter((plan) => {
    const writtenDate = normalizeDateText(plan.writtenDate);
    return writtenDate && writtenDate <= checkDateText && isSameRecipient(plan.recipientName, name);
  });

  validPlans.sort((a, b) => normalizeDateText(b.writtenDate).localeCompare(normalizeDateText(a.writtenDate)));
  return validPlans[0] || null;
}

function planToFullText(plan) {
  if (!plan) return "";
  if (typeof plan.rows === "string") return normalizeText(plan.rows);
  return normalizeText(JSON.stringify(plan.rows || ""));
}

function getMediRequirementFromPlan(plan) {
  if (!plan) return false;
  const rawRowsText = planToFullText(plan);
  const extraText = normalizeText(`${plan.opinion || ""} ${plan.content || ""} ${plan.mediType || ""}`);
  const cleanFinalText = (rawRowsText + " " + extraText).replace(/[^a-zA-Z0-9가-힣]/g, "");

  // 간호관리, 복약돕기, 복약지도, 투약 등의 키워드가 포함되면 복약 필요 대상자로 지정
  return cleanFinalText.includes("복약") || cleanFinalText.includes("투약") || cleanFinalText.includes("약챙겨") || cleanFinalText.includes("간호관리");
}

function getLatestMediCounsel(name, targetDate) {
  const targetDateText = normalizeDateText(targetDate);
  const counsels = counselLibraryCache.filter((item) => {
    if (!isSameRecipient(item.recipientName || item.name, name)) return false;
    const refDate = normalizeDateText(item.reflection || item.reflectionDate || item.consultDate || item.date || "");
    if (!refDate || refDate > targetDateText) return false;

    const category = item.category || "";
    const text = normalizeText(`${item.careContent || ""} ${item.reason || ""} ${item.changeType || ""}`).replace(/[^a-zA-Z0-9가-힣]/g, "");
    return category === "간호" || category === "복약" || text.includes("복약") || text.includes("투약") || text.includes("처방");
  }).sort((a, b) => {
    const dateA = normalizeDateText(a.reflection || a.reflectionDate || a.consultDate || a.date || "");
    const dateB = normalizeDateText(b.reflection || b.reflectionDate || b.consultDate || b.date || "");
    return dateB.localeCompare(dateA);
  });
  return counsels[0] || null;
}

function isRemoveCounsel(counsel) {
  if (!counsel) return false;
  const text = normalizeText(`${counsel.changeType} ${counsel.careContent} ${counsel.reason}`);
  return text.includes("제외") || text.includes("중단") || text.includes("삭제") || text.includes("미제공") || text.includes("하지않") || text.includes("종료");
}

function isAddCounsel(counsel) {
  if (!counsel) return false;
  const text = normalizeText(`${counsel.changeType} ${counsel.careContent} ${counsel.reason}`);
  return text.includes("추가") || text.includes("시작") || text.includes("제공") || text.includes("반영");
}

function getMediRuleAtDate(plan, name, targetDate) {
  let needMedi = getMediRequirementFromPlan(plan);
  const counsel = getLatestMediCounsel(name, targetDate);

  if (counsel) {
    if (isRemoveCounsel(counsel)) needMedi = false;
    else if (isAddCounsel(counsel)) needMedi = true;
  }
  return { needMedi };
}

function getCounselTextForMonth(name, monthEndDate) {
  const counsel = getLatestMediCounsel(name, monthEndDate);
  if (!counsel) return "없음";
  const refDate = counsel.reflection || counsel.reflectionDate || counsel.consultDate || counsel.date || "-";
  return `${String(refDate).substring(0,10)}<br>[${counsel.changeType || "-"}]<br>${counsel.careContent || "-"}`;
}

function getAttendanceMonth(monthValue) {
  return attendanceLibraryCache
    .filter((item) => item.month === monthValue)
    .map((item) => ({
      name: String(item.recipientName || item.name || "").trim(),
      dates: item.dates || item.attendanceDates || []
    }))
    .filter((item) => item.name !== "")
    .sort((a, b) => safeCompare(a.name, b.name));
}

function getDayResult(dayData, rule) {
  if (!rule) return "정상";
  const needMedi = rule.needMedi;
  const record = dayData || "미제공";

  if (needMedi) {
    if (record === "제공") return "정상";
    return "누락";
  } else {
    if (record === "제공") return "오류 기록";
    return "정상";
  }
}

function makeResultClass(result) {
  if (result === "정상") return "status-ok";
  return "status-danger";
}

function buildDayCell(isAttendanceDay, dayData, rule) {
  if (!isAttendanceDay) return `<td class="medi-day-cell empty-day">결석</td>`;
  const result = getDayResult(dayData, rule);
  const resultClass = makeResultClass(result);
  
  let cellBgStyle = "background-color: #ffffff !important;";
  if (result !== "정상") cellBgStyle = "background-color: #fff5f5 !important;";

  const displayRecord = dayData === "제공" ? "○ 제공" : "X 미제공";

  return `
    <td class="medi-day-cell" style="${cellBgStyle}">
      <div class="${resultClass}">${result}</div>
      <div class="small-cell-text">${displayRecord}</div>
    </td>
  `;
}

function buildResults(monthValue, mediRows) {
  const monthEndDate = getMonthEndDate(monthValue);
  const attendanceRows = getAttendanceMonth(monthValue);

  return attendanceRows.map((attendance) => {
    const name = attendance.name;
    const plan = getLatestPlansByRecipient(name, monthEndDate);
    const medi = mediRows.find((item) => isSameRecipient(item.name, name));

    return {
      name,
      planDate: plan ? plan.writtenDate : "-",
      counselText: getCounselTextForMonth(name, monthEndDate),
      attendanceDates: attendance.dates || [],
      plan,
      mediDays: medi ? medi.days : {}
    };
  }).sort((a, b) => safeCompare(a.name, b.name));
}

function renderHeader(monthValue) {
  const days = getDaysInMonth(monthValue);
  mediTableHead.innerHTML = `
    <tr>
      <th>수급자명</th>
      <th>계획서 작성일</th>
      <th>상담일지 반영</th>
      <th>복약 대상</th>
      ${days.map((day) => {
        const dayNum = Number(day.split("-")[2]);
        const colorClass = getDayColorClass(day);
        return `<th class="medi-day-head ${colorClass}">${dayNum}</th>`;
      }).join("")}
      <th>종합 결과</th>
    </tr>
  `;
}

function renderResults(monthValue, results) {
  renderHeader(monthValue);
  mediResultBody.innerHTML = "";
  const days = getDaysInMonth(monthValue);

  if (!results || results.length === 0) {
    mediResultBody.innerHTML = `<tr><td colspan="${5 + days.length}">확인할 복약 대상자가 없습니다.</td></tr>`;
    return;
  }

  results.forEach((item) => {
    const row = document.createElement("tr");
    const attendanceSet = new Set(item.attendanceDates || []);
    const monthEndRule = getMediRuleAtDate(item.plan, item.name, getMonthEndDate(monthValue));

    let problemCount = 0;
    const dayCells = days.map((day) => {
      const isAttendanceDay = attendanceSet.has(day);
      const rule = getMediRuleAtDate(item.plan, item.name, day);
      const result = isAttendanceDay ? getDayResult(item.mediDays[day], rule) : "정상";
      if (isAttendanceDay && result !== "정상") problemCount += 1;
      return buildDayCell(isAttendanceDay, item.mediDays[day], rule);
    }).join("");

    const overallText = problemCount > 0 ? `확인 필요<br>${problemCount}일` : "정상";
    const overallClass = problemCount > 0 ? "status-danger" : "status-ok";
    const errorCellBg = problemCount > 0 ? 'background-color: #fff5f5 !important;' : 'background-color: #ffffff !important;';

    row.innerHTML = `
      <td style="font-weight:600; text-align:center; ${errorCellBg}">${item.name || "-"}</td>
      <td style="text-align:center; ${errorCellBg}">${item.planDate ? String(item.planDate).substring(0,10) : "-"}</td>
      <td style="text-align:left; font-size:12px; line-height:1.4; padding:6px; ${errorCellBg}">${item.counselText || "없음"}</td>
      <td style="text-align:center; font-weight:700; ${errorCellBg}">${monthEndRule.needMedi ? "대상자" : "비대상"}</td>
      ${dayCells}
      <td class="${overallClass}" style="text-align:center; font-weight:800; vertical-align:middle; ${errorCellBg}">${overallText}</td>
    `;
    mediResultBody.appendChild(row);
  });
}

function applyMediStyle() {
  if (document.getElementById("mediStyle")) return;
  const style = document.createElement("style");
  style.id = "mediStyle";
  style.textContent = `
    .medi-table { min-width: 2200px; table-layout: fixed; }
    .medi-table th, .medi-table td { vertical-align: middle; white-space: normal; text-align: center; padding: 10px 8px; border: 1px solid #e2e8f0; }
    .medi-table th:nth-child(1), .medi-table td:nth-child(1) { min-width: 100px; width: 100px; text-align: center; position: sticky; left: 0; z-index: 4; }
    .medi-table th:nth-child(1) { background-color: #fef3c7; z-index: 6; }
    .medi-table th:nth-child(2), .medi-table td:nth-child(2) { min-width: 115px; width: 115px; }
    .medi-table th:nth-child(3), .medi-table td:nth-child(3) { min-width: 160px; width: 160px; text-align: left; }
    .medi-table th:nth-child(4), .medi-table td:nth-child(4) { min-width: 90px; width: 90px; }
    .medi-day-head, .medi-day-cell { min-width: 95px; width: 95px; }
    .medi-table th:last-child, .medi-table td:last-child { min-width: 115px; width: 115px; word-break: keep-all; line-height: 1.5; text-align: center; }
    .small-cell-text { font-size: 11px; color: #555; margin-top: 4px; line-height: 1.4; word-break: keep-all; }
    .empty-day { color: #64748b; background-color: #f8fafc !important; font-weight: 600; }
    
    .status-ok { color: #1e293b; font-weight: 700; }
    .status-danger { color: #e11d48; font-weight: 800; }
    .medi-day-blue { color: #2563eb !important; }
    .medi-day-red { color: #dc2626 !important; }
    
    .medi-table tr:nth-child(even) td { background-color: #ffffff !important; }
  `;
  document.head.appendChild(style);
}

if (checkMediBtn) {
  checkMediBtn.addEventListener("click", async () => {
    const checkMonth = checkMonthInput.value;
    const file = mediFileInput.files[0];

    if (!checkMonth) {
      alert("확인 월을 선택해주세요.");
      return;
    }

    if (!file) {
      alert("간호일지/복약기록 파일을 업로드해주세요.");
      return;
    }

    alert("구글 시트에서 계획서, 상담일지, 출석 데이터를 원격 동기화 중입니다...");

    await syncCarePlanLibraryFromGoogleSheet();
    await syncCounselLibraryFromGoogleSheet();
    await syncAttendanceMonthFromGoogleSheet(checkMonth);

    applyMediStyle();

    const reader = new FileReader();
    reader.onload = (event) => {
      const data = new Uint8Array(event.target.result);
      const workbook = XLSX.read(data, { type: "array", cellDates: true });
      const mediRows = parseMediReport(workbook, checkMonth);
      const results = buildResults(checkMonth, mediRows);
      renderResults(checkMonth, results);
    };

    reader.readAsArrayBuffer(file);
  });
}

if (clearMediBtn) {
  clearMediBtn.addEventListener("click", () => {
    checkMonthInput.value = "";
    mediFileInput.value = "";
    mediTableHead.innerHTML =
      `<tr><th>수급자명</th><th>계획서 작성일</th><th>상담일지 반영</th><th>복약 대상</th></tr>`;
    mediResultBody.innerHTML =
      `<tr><td colspan="4">확인 월과 간호일지/복약기록 파일을 선택해주세요.</td></tr>`;
  });
}
