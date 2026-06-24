const CARE_PLAN_API_URL = "https://script.google.com/macros/s/AKfycbyxbQ7GeDm7pq9SkYDSgGkt7GiKic878En8-niDDFuRg7-lyxo5F3E7LE5qYpqi2_Z14g/exec";

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
    const response = await fetch(makePayloadUrl({ action: "listCounsel" }), { method: "GET", redirect: "follow" });
    const text = await response.text();
    const counsels = JSON.parse(text);
    counselLibraryCache = Array.isArray(counsels) ? counsels : [];
    return counselLibraryCache;
  } catch (error) {
    console.error("상담일지 동기화 오류:", error);
    return counselLibraryCache;
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

function normalizeText(value) {
  return String(value || "").replace(/\s/g, "").trim();
}

function normalizeDateText(value) {
  if (!value) return "";
  if (value instanceof Date) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
  }
  if (typeof value === "number") return excelDateToJSDate(value);
  const text = String(value).trim().replace(/^'/, "");
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  if (/^\d{4}\.\d{2}\.\d{2}$/.test(text)) return text.replace(/\./g, "-");
  if (/^\d{4}\/\d{2}\/\d{2}$/.test(text)) return text.replace(/\//g, "-");
  if (text.includes("T")) return text.split("T")[0];

  const match = text.match(/(\d{4})[.\-/년\s]*(\d{1,2})[.\-/월\s]*(\d{1,2})/);
  if (match) {
    return `${match[1]}-${String(match[2]).padStart(2, "0")}-${String(match[3]).padStart(2, "0")}`;
  }
  return "";
}

function normalizeRecipientName(value) {
  return String(value || "").replace(/[^a-zA-Z0-9가-힣]/g, "").trim();
}

function isSameRecipient(nameA, nameB) {
  const cleanA = normalizeRecipientName(nameA);
  const cleanB = normalizeRecipientName(nameB);
  if (!cleanA || !cleanB) return false;

  // 김계순 / 김계순A처럼 비슷한 이름이 서로 섞이지 않도록 완전 일치만 허용합니다.
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
  return normalizeDateText(value);
}

function getMonthEndDate(monthValue) {
  const [year, month] = monthValue.split("-").map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  return `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
}

function getDaysInMonth(monthValue) {
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
  if (weekday === 0 || holidayList.includes(dateText)) return "split-day-red";
  if (weekday === 6) return "split-day-blue";
  return "";
}

function sheetToRowsWithMerges(sheet) {
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
        const rowIndex = r - range.s.r;
        rows[rowIndex][c] = value;
      }
    }
  });
  return rows;
}

function findColumn(header, keywords) {
  return header.findIndex((cell) => {
    const text = normalizeText(cell);
    return keywords.some((keyword) => text.includes(normalizeText(keyword)));
  });
}

function parseMinutes(value) {
  const text = String(value || "").trim();
  const match = text.match(/\d+/);
  return match ? Number(match[0]) : 0;
}

function getLatestPlansByRecipient(name, checkDate) {
  const checkDateText = normalizeDateText(checkDate);
  const library = Array.isArray(carePlanLibraryCache) ? carePlanLibraryCache : [];
  const validPlans = library.filter((plan) => {
    const writtenDate = normalizeDateText(plan.writtenDate);
    return writtenDate && writtenDate <= checkDateText && isSameRecipient(plan.recipientName, name);
  });
  validPlans.sort((a, b) => normalizeDateText(b.writtenDate).localeCompare(normalizeDateText(a.writtenDate)));
  return validPlans[0] || null;
}

function tryParseJson(value) {
  if (typeof value !== "string") return value;
  const text = value.trim();
  if (!text) return value;
  try {
    return JSON.parse(text);
  } catch (e) {
    return value;
  }
}

function collectPlanObjects(value, result = []) {
  const parsed = tryParseJson(value);

  if (Array.isArray(parsed)) {
    parsed.forEach((item) => collectPlanObjects(item, result));
    return result;
  }

  if (parsed && typeof parsed === "object") {
    result.push(parsed);
    Object.values(parsed).forEach((item) => {
      if (Array.isArray(item) || (item && typeof item === "object")) {
        collectPlanObjects(item, result);
      }
    });
  }

  return result;
}

function getMedicationCountFromPlan(plan) {
  if (!plan) return 0;

  const sourceObjects = [
    ...collectPlanObjects(plan.rows || []),
    ...collectPlanObjects(plan.rowsJson || [])
  ];

  let result = 0;

  sourceObjects.forEach((row) => {
    const text = normalizeText(JSON.stringify(row));
    if (text.includes("정확한복약도움") || text.includes("복약도움") || text.includes("약복용")) {
      const countValue = row["횟수"] || row["회수"] || row["제공횟수"] || row["12"] || row[12] || "";
      const parsed = Number(String(countValue).replace(/[^0-9]/g, ""));

      if (parsed > result) result = parsed;

      if (result === 0) {
        if (text.includes("3회") || text.includes("아침점심저녁")) result = 3;
        else if (text.includes("2회") || text.includes("아침저녁") || text.includes("점심저녁")) result = 2;
        else if (text.includes("1회") || text.includes("아침") || text.includes("점심") || text.includes("저녁")) result = 1;
      }
    }
  });

  return Math.min(result, 3);
}

function getCounselDate(item) {
  return normalizeDateText(item.reflectionDate || item.reflection || item.consultDate || item.date || item.counselDate || item.writtenDate || "");
}

function isRemoveCounsel(counsel) {
  if (!counsel) return false;
  const text = normalizeText(`${counsel.changeType || ""} ${counsel.careContent || ""} ${counsel.reason || ""}`);
  return text.includes("제외") || text.includes("중단") || text.includes("미제공") || text.includes("삭제") || text.includes("하지않");
}

function getMedicationCountFromCounselText(text, fallbackCount) {
  const cleanText = normalizeText(text);

  if (cleanText.includes("제외") || cleanText.includes("중단") || cleanText.includes("미제공") || cleanText.includes("삭제") || cleanText.includes("하지않")) return 0;
  if (cleanText.match(/3\s*회/) || cleanText.includes("아침점심저녁")) return 3;
  if (cleanText.match(/2\s*회/) || cleanText.includes("아침저녁") || cleanText.includes("점심저녁")) return 2;
  if (cleanText.match(/1\s*회/) || cleanText.includes("아침") || cleanText.includes("점심") || cleanText.includes("저녁")) return 1;

  return fallbackCount;
}

function getLatestMedicationCounsel(name, targetDate) {
  const counselLibrary = Array.isArray(counselLibraryCache) ? counselLibraryCache : [];
  const targetDateText = normalizeDateText(targetDate);

  const counsels = counselLibrary
    .filter((item) => {
      const sameName = isSameRecipient(item.recipientName || item.name, name);
      const counselDate = getCounselDate(item);
      const text = normalizeText(`${item.category || ""} ${item.changeType || ""} ${item.careContent || ""} ${item.reason || ""}`);

      return sameName && counselDate && counselDate <= targetDateText && (
        text.includes("복약") ||
        text.includes("투약") ||
        text.includes("정확한복약도움") ||
        text.includes("건강관리")
      );
    })
    .sort((a, b) => getCounselDate(b).localeCompare(getCounselDate(a)));

  return counsels[0] || null;
}

function getMedicationRuleAtDate(plan, name, targetDate) {
  const planDate = plan ? normalizeDateText(plan.writtenDate) : "";
  const planCount = getMedicationCountFromPlan(plan);

  const counsel = getLatestMedicationCounsel(name, targetDate);
  const counselDate = counsel ? getCounselDate(counsel) : "";

  let count = planCount;
  let source = "계획서";

  // 상담일지가 있고, 상담일지가 해당 날짜 기준 최신 계획서보다 최신일 때만 상담일지를 반영합니다.
  // 예: 상담일지 2023-12-11 추가 → 계획서 2024-01-18 작성이면
  // 2024-01-17까지는 상담 기준, 2024-01-18부터는 계획서 기준입니다.
  const shouldApplyCounsel = counsel && (!planDate || !counselDate || counselDate > planDate);

  if (shouldApplyCounsel) {
    const text = normalizeText(`${counsel.changeType || ""} ${counsel.careContent || ""} ${counsel.reason || ""}`);
    count = getMedicationCountFromCounselText(text, count);
    source = "상담";
  }

  return {
    count,
    source
  };
}

function getCounselMedicationCount(name, targetDate, fallbackCount) {
  const plan = getLatestPlansByRecipient(name, targetDate);
  const rule = getMedicationRuleAtDate(plan, name, targetDate);

  if (!plan && typeof fallbackCount === "number" && rule.source === "계획서") {
    return fallbackCount;
  }

  return rule.count;
}

function buildMedicationRuleSourceHtml(rule) {
  const count = rule && typeof rule.count === "number" ? rule.count : 0;
  const source = rule && rule.source ? rule.source : "계획서";
  const mainColor = count > 0 ? "#2563eb" : "#64748b";

  return `
    <div style="font-weight: 800; color: ${mainColor};">${count}회</div>
    <div style="font-size: 11px; color: #64748b; margin-top: 3px;">[${source}]</div>
  `;
}

function buildHealthMinutesSourceHtml(minutes, source) {
  const mainColor = Number(minutes) > 20 ? "#2563eb" : "#64748b";

  return `
    <div style="font-weight: 800; color: ${mainColor};">${minutes}분</div>
    <div style="font-size: 11px; color: #64748b; margin-top: 3px;">[${source || "계획서"}]</div>
  `;
}

function getMedicationCounselTextForMonth(name, monthEndDate) {
  const counsel = getLatestMedicationCounsel(name, monthEndDate);

  if (!counsel) return "없음";
  return `${getCounselDate(counsel) || "-"}<br>${counsel.changeType || "-"}<br>${counsel.careContent || "-"}`;
}

function getRequiredHealthMinutes(medicationCount) {
  if (medicationCount <= 0) return 20;
  if (medicationCount === 1) return 30;
  if (medicationCount === 2) return 40;
  return 50;
}

function getAttendanceMonth(monthValue) {
  return attendanceLibraryCache
    .filter((item) => item.month === monthValue)
    .map((item) => ({
      name: String(item.name || item.recipientName || "").trim(),
      dates: Array.isArray(item.dates)
        ? item.dates
        : Array.isArray(item.attendanceDates)
          ? item.attendanceDates
          : []
    }))
    .filter((item) => item.name !== "")
    .sort((a, b) => safeCompare(a.name, b.name));
}

function readWorkbook(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const data = new Uint8Array(event.target.result);
      resolve(XLSX.read(data, { type: "array", cellDates: true }));
    };
    reader.readAsArrayBuffer(file);
  });
}

function renderHeader(monthValue) {
  const days = getDaysInMonth(monthValue);
  nursingVitalTableHead.innerHTML = `
    <tr>
      <th>수급자명</th>
      <th>계획서 작성일</th>
      <th>상담일지 반영</th>
      <th>복약도움</th>
      <th>건강관리 기준</th>
      ${days.map((day) => {
        const dayNum = Number(day.split("-")[2]);
        const colorClass = getDayColorClass(day);
        return `<th class="split-day-head ${colorClass}">${dayNum}</th>`;
      }).join("")}
      <th>종합 결과</th>
    </tr>
  `;
}

function applySplitCheckStyle() {
  if (document.getElementById("splitCheckStyle")) return;
  const style = document.createElement("style");
  style.id = "splitCheckStyle";
  style.textContent = `
    .split-check-table { min-width: 2200px; table-layout: fixed; }
    .split-check-table th, .split-check-table td { vertical-align: middle; white-space: normal; text-align: center; padding: 10px 8px; border: 1px solid #e2e8f0; }
    .split-check-table th:nth-child(1), .split-check-table td:nth-child(1) { min-width: 100px; width: 100px; text-align: center; position: sticky; left: 0; z-index: 4; }
    .split-check-table th:nth-child(1) { background-color: #eaf0fb; z-index: 6; }
    .split-check-table th:nth-child(2), .split-check-table td:nth-child(2) { min-width: 115px; width: 115px; }
    .split-check-table th:nth-child(3), .split-check-table td:nth-child(3) { min-width: 160px; width: 160px; text-align: left; }
    .split-check-table th:nth-child(4), .split-check-table td:nth-child(4), .split-check-table th:nth-child(5), .split-check-table td:nth-child(5) { min-width: 100px; width: 100px; }
    .split-day-head, .split-day-cell { min-width: 115px; width: 115px; }
    .split-check-table th:last-child, .split-check-table td:last-child { min-width: 115px; width: 115px; word-break: keep-all; line-height: 1.5; }
    .small-cell-text { font-size: 11px; color: #555; margin-top: 4px; line-height: 1.4; word-break: keep-all; }
    .empty-day { color: #999; background-color: #f8fafc !important; font-weight: 700; }
    
    .status-ok { color: #1e293b; font-weight: 700; }
    .status-danger { color: #e11d48; font-weight: 800; }
    .split-day-blue { color: #2563eb !important; }
    .split-day-red { color: #dc2626 !important; }
    
    .split-check-table tr:nth-child(even) td { background-color: #ffffff !important; }
  `;
  document.head.appendChild(style);
}

const checkMonthInput = document.getElementById("checkMonth");
const nursingFileInput = document.getElementById("nursingFile");
const checkNursingVitalBtn = document.getElementById("checkNursingVitalBtn");
const clearNursingVitalBtn = document.getElementById("clearNursingVitalBtn");
const nursingVitalTableHead = document.getElementById("nursingVitalTableHead");
const nursingVitalResultBody = document.getElementById("nursingVitalResultBody");

function parseNursingReport(workbook, monthValue) {
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = sheetToRowsWithMerges(sheet);
  const headerIndex = rows.findIndex((row) => {
    const text = normalizeText(row.join(" "));
    return text.includes("제공일") && text.includes("수급자명") && text.includes("혈압") && text.includes("건강관리");
  });

  if (headerIndex === -1) {
    alert("간호제공 현황에서 표 머리글을 찾지 못했습니다.");
    return [];
  }

  const header = rows[headerIndex] || [];
  const dateCol = findColumn(header, ["제공일"]);
  const nameCol = findColumn(header, ["수급자명"]);
  const bloodPressureCol = findColumn(header, ["혈압"]);
  const pulseCol = findColumn(header, ["맥박"]);
  const temperatureCol = findColumn(header, ["체온"]);
  const breathCol = findColumn(header, ["호흡"]);
  const healthCol = findColumn(header, ["건강"]);

  const resultMap = {};
  let currentDate = "";

  for (let i = headerIndex + 1; i < rows.length; i++) {
    const row = rows[i] || [];
    const parsedDate = parseDate(row[dateCol]);
    if (parsedDate) currentDate = parsedDate;
    if (!currentDate || !currentDate.startsWith(monthValue)) continue;

    const name = String(row[nameCol] || "").trim();
    if (!name || name === "수급자명") continue;

    if (!resultMap[name]) {
      resultMap[name] = { name, days: {} };
    }
    resultMap[name].days[currentDate] = {
      bloodPressure: String(row[bloodPressureCol] || "").trim(),
      pulse: String(row[pulseCol] || "").trim(),
      temperature: String(row[temperatureCol] || "").trim(),
      breath: String(row[breathCol] || "").trim(),
      healthMinutes: parseMinutes(row[healthCol])
    };
  }
  return Object.values(resultMap);
}

function checkVitalDay(nursingDay, requiredHealthMinutes) {
  if (!nursingDay) {
    return { result: "기록 없음", details: ["간호기록 없음"] };
  }
  const problems = [];
  if (!nursingDay.bloodPressure) problems.push("혈압 누락");
  if (!nursingDay.pulse) problems.push("맥박 누락");
  if (!nursingDay.temperature) problems.push("체온 누락");
  if (!nursingDay.breath) problems.push("호흡 누락");
  if (nursingDay.healthMinutes !== requiredHealthMinutes) {
    problems.push(`${requiredHealthMinutes}분 필요`);
    problems.push(`실제 ${nursingDay.healthMinutes || 0}분`);
  }
  return { result: problems.length > 0 ? "오류" : "정상", details: problems };
}

function buildDayCell(isAttendanceDay, nursingDay, requiredHealthMinutes) {
  if (!isAttendanceDay) {
    return `<td class="split-day-cell empty-day">결석</td>`;
  }
  const checked = checkVitalDay(nursingDay, requiredHealthMinutes);
  const resultClass = checked.result === "정상" ? "status-ok" : "status-danger";
  const errorCellBg = checked.result !== "정상" ? "background-color: #fff5f5 !important;" : "background-color: #ffffff !important;";

  if (checked.result === "정상") {
    return `
      <td class="split-day-cell" style="${errorCellBg}">
        <div class="${resultClass}">정상</div>
        <div class="small-cell-text">V/S O<br>${nursingDay.healthMinutes}분</div>
      </td>
    `;
  }
  return `
    <td class="split-day-cell" style="${errorCellBg}">
      <div class="${resultClass}">${checked.result}</div>
      <div class="small-cell-text">${checked.details.join("<br>")}</div>
    </td>
  `;
}

function buildResults(monthValue, nursingRows) {
  const monthEndDate = getMonthEndDate(monthValue);
  const attendanceRows = getAttendanceMonth(monthValue);

  const results = attendanceRows.map((attendance) => {
    const name = attendance.name;
    const plan = getLatestPlansByRecipient(name, monthEndDate);
    const nursing = nursingRows.find((item) => isSameRecipient(item.name, name));
    const baseMedicationCount = getMedicationCountFromPlan(plan);

    return {
      name,
      planDate: plan ? plan.writtenDate : "-",
      baseMedicationCount,
      attendanceDates: attendance.dates || [], // 💡 [안전 장치 추가] 날짜가 없거나 깨져 있어도 무조건 빈 배열 처리하여 에러 차단
      nursingDays: nursing ? nursing.days : {}
    };
  });

  return results.sort((a, b) => safeCompare(a.name, b.name));
}

function renderResults(monthValue, results) {
  renderHeader(monthValue);
  nursingVitalResultBody.innerHTML = "";
  const days = getDaysInMonth(monthValue);

  if (!results || results.length === 0) {
    nursingVitalResultBody.innerHTML = `<tr><td colspan="${6 + days.length}">확인할 간호 대상자가 없습니다.</td></tr>`;
    return;
  }

  results.forEach((item) => {
    const row = document.createElement("tr");
    
    // 💡 [핵심 교정]: item.attendanceDates가 null이나 undefined일 경우를 100% 방어하도록 Set 구성 방식 리모델링
    const validDates = Array.isArray(item.attendanceDates) ? item.attendanceDates : [];
    const attendanceSet = new Set(validDates);
    
    const monthEndDate = getMonthEndDate(monthValue);
    const monthEndPlan = getLatestPlansByRecipient(item.name, monthEndDate);
    const monthEndMedicationRule = getMedicationRuleAtDate(monthEndPlan, item.name, monthEndDate);
    const monthEndMedicationCount = monthEndMedicationRule.count;
    const monthEndHealthMinutes = getRequiredHealthMinutes(monthEndMedicationCount);

    let problemCount = 0;
    const dayCells = days.map((day) => {
      const isAttendanceDay = attendanceSet.has(day);
      const dayPlan = getLatestPlansByRecipient(item.name, day);
      const medicationRule = getMedicationRuleAtDate(dayPlan, item.name, day);
      const medicationCount = medicationRule.count;
      const requiredHealthMinutes = getRequiredHealthMinutes(medicationCount);

      if (isAttendanceDay) {
        const checked = checkVitalDay(item.nursingDays[day], requiredHealthMinutes);
        if (checked.result !== "정상") problemCount += 1;
      }
      return buildDayCell(isAttendanceDay, item.nursingDays[day], requiredHealthMinutes);
    }).join("");

    const overallText = problemCount > 0 ? `확인 필요<br>${problemCount}일` : "정상";
    const overallClass = problemCount > 0 ? "status-danger" : "status-ok";
    const errorCellBg = problemCount > 0 ? "background-color: #fff5f5 !important;" : "background-color: #ffffff !important;";

    row.innerHTML = `
      <td style="font-weight:600; text-align:center; ${errorCellBg}">${item.name || "-"}</td>
      <td style="text-align:center; ${errorCellBg}">${item.planDate ? String(item.planDate).substring(0,10) : "-"}</td>
      <td style="text-align:left; font-size:12px; line-height:1.4; padding:6px; ${errorCellBg}">${getMedicationCounselTextForMonth(item.name, getMonthEndDate(monthValue))}</td>
      <td style="text-align:center; ${errorCellBg}">${buildMedicationRuleSourceHtml(monthEndMedicationRule)}</td>
      <td style="text-align:center; ${errorCellBg}">${buildHealthMinutesSourceHtml(monthEndHealthMinutes, monthEndMedicationRule.source)}</td>
      ${dayCells}
      <td class="${overallClass}" style="text-align:center; font-weight:800; vertical-align:middle; ${errorCellBg}">${overallText}</td>
    `;
    nursingVitalResultBody.appendChild(row);
  });
}

checkNursingVitalBtn.addEventListener("click", async () => {
  const checkMonth = checkMonthInput.value;
  const nursingFile = nursingFileInput.files[0];

  if (!checkMonth) { alert("확인 월을 선택해주세요."); return; }
  if (!nursingFile) { alert("간호제공 현황 파일을 업로드해주세요."); return; }

  alert("구글 시트에서 계획서, 상담일지 및 출석 데이터 보관함을 동기화 중입니다...");
  await syncCarePlanLibraryFromGoogleSheet();
  await syncCounselLibraryFromGoogleSheet(); 
  await syncAttendanceMonthFromGoogleSheet(checkMonth);
  applySplitCheckStyle();

  const attendanceRows = getAttendanceMonth(checkMonth);
  if (attendanceRows.length === 0) {
    alert("출석관리 저장 내역이 없습니다. 먼저 출석관리에서 해당 월 출석을 등록해주세요.");
  }

  const nursingWorkbook = await readWorkbook(nursingFile);
  const nursingRows = parseNursingReport(nursingWorkbook, checkMonth);
  const results = buildResults(checkMonth, nursingRows);
  renderResults(checkMonth, results);
});

clearNursingVitalBtn.addEventListener("click", () => {
  checkMonthInput.value = "";
  nursingFileInput.value = "";
  nursingVitalTableHead.innerHTML = `<tr><th>수급자명</th><th>계획서 작성일</th><th>상담일지 반영</th><th>복약도움</th><th>건강관리 기준</th></tr>`;
  nursingVitalResultBody.innerHTML = `<tr><td colspan="5">확인 월과 간호제공 현황 파일을 선택해주세요.</td></tr>`;
});
