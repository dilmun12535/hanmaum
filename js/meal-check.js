const CARE_PLAN_API_URL = "https://script.google.com/macros/s/AKfycbxFaEN0MkkWd_NnDif5LXlCVbIxqgllvGLoJturv0FlXtgX1FG0QTVQNArI5DyR5RTZaA/exec";

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
const mealFileInput = document.getElementById("mealFile");
const checkMealBtn = document.getElementById("checkMealBtn");
const clearMealBtn = document.getElementById("clearMealBtn");
const mealTableHead = document.getElementById("mealTableHead");
const mealResultBody = document.getElementById("mealResultBody");

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
  if (weekday === 0 || holidayList.includes(dateText)) return "meal-day-red";
  if (weekday === 6) return "meal-day-blue";
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
      totalText.includes("식사") && totalText.includes("점심") && totalText.includes("저녁")
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

function parseMealType(value) {
  const text = normalizeText(value);
  if (!text || text.includes("일정없음") || text.includes("미이용") || text.includes("급여개시전")) return "";
  if (text.includes("다진")) return "다진식";
  if (text.includes("죽")) return "죽식";
  if (text.includes("일반")) return "일반식";
  if (text.includes("미음")) return "죽식";
  return String(value || "").trim();
}

function parseMealReport(workbook, monthValue) {
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = sheetToRowsWithMerges(sheet);
  const headerIndex = findHeaderIndex(rows);

  if (headerIndex === -1) {
    alert("식사/화장실 기록에서 표 머리글을 찾지 못했습니다.");
    return [];
  }

  const header = makeCombinedHeader(rows, headerIndex);
  const nameCol = findColumn(header, ["수급자명"]);
  const dateCol = findColumn(header, ["작성일"]);
  const lunchCol = findColumn(header, ["식사", "점심"]);
  const dinnerCol = findColumn(header, ["식사", "저녁"]);

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

    if (!resultMap[name]) {
      resultMap[name] = { name, days: {} };
    }
    resultMap[name].days[dateText] = {
      lunch: parseMealType(row[lunchCol]),
      dinner: parseMealType(row[dinnerCol])
    };
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

// 💡 [지표 기준점 개조완료]: 단어 가공 형식을 완전히 파괴하고 계획서 전체에서 개별적으로 글자를 색출하여 2회 대상자를 오차 없이 판정합니다!
function getMealCountFromPlan(plan) {
  if (!plan) return 1;
  
  const rawRowsText = planToFullText(plan);
  const extraText = normalizeText(`${plan.opinion || ""} ${plan.content || ""} ${plan.mealType || ""}`);
  
  // 특수 기호나 대괄호를 완전히 소멸시킨 완전 순수 문자열 정제
  const cleanFinalText = (rawRowsText + " " + extraText).replace(/[^a-zA-Z0-9가-힣]/g, "");

  const hasLunch = cleanFinalText.includes("중식") || cleanFinalText.includes("점심");
  const hasDinner = cleanFinalText.includes("석식") || cleanFinalText.includes("저녁");
  const hasTwoTimes = cleanFinalText.includes("2회") || cleanFinalText.includes("1일2회") || cleanFinalText.includes("이회");

  // 점심과 저녁이 둘 다 들어있거나, 2회 단어가 포착되면 어떤 연동망이든 무조건 2회 확정!
  if ((hasLunch && hasDinner) || hasTwoTimes) {
    return 2;
  }
  return 1;
}

function hasFoodPrepPlan(plan) {
  if (!plan) return false;
  let combinedText = "";
  if (plan.rows) {
    if (typeof plan.rows === "object") combinedText = normalizeText(JSON.stringify(plan.rows));
    else combinedText = normalizeText(plan.rows);
  }
  const finalText = (combinedText + " " + normalizeText(`${plan.opinion || ""} ${plan.content || ""}`)).replace(/[^a-zA-Z0-9가-힣]/g, "");
  return finalText.includes("음식준비") || finalText.includes("다진식") || finalText.includes("죽식") || finalText.includes("미음");
}

function getLatestMealCounsel(name, targetDate) {
  const targetDateText = normalizeDateText(targetDate);
  const counsels = counselLibraryCache.filter((item) => {
    if (!isSameRecipient(item.recipientName || item.name, name)) return false;
    const refDate = normalizeDateText(item.reflection || item.reflectionDate || item.consultDate || item.date || "");
    if (!refDate || refDate > targetDateText) return false;

    const category = item.category || "";
    const text = normalizeText(`${item.careContent || ""} ${item.reason || ""} ${item.changeType || ""}`).replace(/[^a-zA-Z0-9가-힣]/g, "");
    return category === "식사" || text.includes("식단") || text.includes("식사") || text.includes("음식준비") || text.includes("다진식") || text.includes("죽식");
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
  return text.includes("제외") || text.includes("중단") || text.includes("삭제") || text.includes("미제공") || text.includes("하지않");
}

function isAddCounsel(counsel) {
  if (!counsel) return false;
  const text = normalizeText(`${counsel.changeType} ${counsel.careContent} ${counsel.reason}`);
  return text.includes("추가") || text.includes("시작") || text.includes("제공") || text.includes("반영");
}

function getMealCountFromText(text, fallback) {
  const clean = normalizeText(text);
  if (clean.match(/2\s*회/) || clean.match(/2\s*일/) || clean.includes("점심저녁") || clean.includes("석식추가") || clean.includes("저녁추가")) return 2;
  if (clean.match(/1\s*회/) || clean.match(/1\s*일/) || clean.includes("점심") || clean.includes("저녁제외") || clean.includes("석식제외")) return 1;
  return fallback;
}

function getMealRuleAtDate(plan, name, targetDate) {
  let mealCount = getMealCountFromPlan(plan);
  let specialFood = hasFoodPrepPlan(plan);
  const counsel = getLatestMealCounsel(name, targetDate);

  if (counsel) {
    const text = normalizeText(`${counsel.changeType || ""} ${counsel.careContent || ""} ${counsel.reason || ""}`);
    if (text.includes("식단") || text.includes("식사") || text.includes("석식") || text.includes("중식")) {
      if (isRemoveCounsel(counsel)) mealCount = 0;
      else if (isAddCounsel(counsel)) mealCount = Math.max(1, mealCount);
      mealCount = getMealCountFromText(text, mealCount);
    }
    if (text.includes("음식준비") || text.includes("다진식") || text.includes("죽식")) {
      if (isRemoveCounsel(counsel)) specialFood = false;
      if (isAddCounsel(counsel)) specialFood = true;
    }
  }
  return { mealCount, specialFood };
}

function getCounselTextForMonth(name, monthEndDate) {
  const counsel = getLatestMealCounsel(name, monthEndDate);
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

function getFoodTypeResult(mealValue, specialFood) {
  if (!mealValue) return "누락";
  if (specialFood) {
    if (mealValue === "다진식" || mealValue === "죽식") return "정상";
    return "식사형태 오류";
  }
  if (mealValue === "일반식") return "정상";
  return "식사형태 오류";
}

function getDayResult(dayData, rule) {
  if (!rule) return "정상";
  const mealCount = rule.mealCount;
  const specialFood = rule.specialFood;

  if (mealCount <= 0) {
    if (dayData && (dayData.lunch || dayData.dinner)) return "오류";
    return "정상";
  }
  if (!dayData || (!dayData.lunch && !dayData.dinner)) return "기록 없음";

  const lunchResult = getFoodTypeResult(dayData.lunch, specialFood);
  const dinnerResult = mealCount >= 2 ? getFoodTypeResult(dayData.dinner, specialFood) : "정상";

  if (lunchResult === "누락" || dinnerResult === "누락") return "누락";
  if (lunchResult === "식사형태 오류" || dinnerResult === "식사형태 오류") return "식사형태 오류";
  if (mealCount === 1 && dayData.dinner) return "저녁 확인";
  return "정상";
}

function makeResultClass(result) {
  if (result === "정상") return "status-ok";
  if (result === "저녁 확인") return "status-warn";
  return "status-danger";
}

function buildDayCell(isAttendanceDay, dayData, rule) {
  if (!isAttendanceDay) return `<td class="meal-day-cell empty-day">결석</td>`;
  const result = getDayResult(dayData, rule);
  const resultClass = makeResultClass(result);
  
  let cellBgStyle = "background-color: #ffffff !important;";
  if (result !== "정상" && result !== "저녁 확인") cellBgStyle = "background-color: #fff5f5 !important;";

  const lunch = dayData ? (dayData.lunch || "-") : "-";
  const dinner = dayData ? (dayData.dinner || "-") : "-";

  return `
    <td class="meal-day-cell" style="${cellBgStyle}">
      <div class="${resultClass}">${result}</div>
      <div class="small-cell-text">점 ${lunch}<br>저 ${dinner}</div>
    </td>
  `;
}

function buildResults(monthValue, mealRows) {
  const monthEndDate = getMonthEndDate(monthValue);
  const attendanceRows = getAttendanceMonth(monthValue);

  return attendanceRows.map((attendance) => {
    const name = attendance.name;
    const plan = getLatestPlansByRecipient(name, monthEndDate);
    const meal = mealRows.find((item) => isSameRecipient(item.name, name));

    return {
      name,
      planDate: plan ? plan.writtenDate : "-",
      counselText: getCounselTextForMonth(name, monthEndDate),
      attendanceDates: attendance.dates || [],
      plan,
      mealDays: meal ? meal.days : {}
    };
  }).sort((a, b) => safeCompare(a.name, b.name));
}

function renderHeader(monthValue) {
  const days = getDaysInMonth(monthValue);
  mealTableHead.innerHTML = `
    <tr>
      <th>수급자명</th>
      <th>계획서 작성일</th>
      <th>상담일지 반영</th>
      <th>식사 횟수</th>
      <th>음식 준비</th>
      ${days.map((day) => {
        const dayNum = Number(day.split("-")[2]);
        const colorClass = getDayColorClass(day);
        return `<th class="meal-day-head ${colorClass}">${dayNum}</th>`;
      }).join("")}
      <th>종합 결과</th>
    </tr>
  `;
}

function renderResults(monthValue, results) {
  renderHeader(monthValue);
  mealResultBody.innerHTML = "";
  const days = getDaysInMonth(monthValue);

  if (!results || results.length === 0) {
    mealResultBody.innerHTML = `<tr><td colspan="${6 + days.length}">확인할 식사 대상자가 없습니다.</td></tr>`;
    return;
  }

  results.forEach((item) => {
    const row = document.createElement("tr");
    const attendanceSet = new Set(item.attendanceDates || []);
    const monthEndRule = getMealRuleAtDate(item.plan, item.name, getMonthEndDate(monthValue));

    let problemCount = 0;
    const dayCells = days.map((day) => {
      const isAttendanceDay = attendanceSet.has(day);
      const rule = getMealRuleAtDate(item.plan, item.name, day);
      const result = isAttendanceDay ? getDayResult(item.mealDays[day], rule) : "정상";
      if (isAttendanceDay && result !== "정상" && result !== "저녁 확인") problemCount += 1;
      return buildDayCell(isAttendanceDay, item.mealDays[day], rule);
    }).join("");

    const overallText = problemCount > 0 ? `확인 필요<br>${problemCount}일` : "정상";
    const overallClass = problemCount > 0 ? "status-danger" : "status-ok";
    const errorCellBg = problemCount > 0 ? 'background-color: #fff5f5 !important;' : 'background-color: #ffffff !important;';

    row.innerHTML = `
      <td style="font-weight:600; text-align:center; ${errorCellBg}">${item.name || "-"}</td>
      <td style="text-align:center; ${errorCellBg}">${item.planDate ? String(item.planDate).substring(0,10) : "-"}</td>
      <td style="text-align:left; font-size:12px; line-height:1.4; padding:6px; ${errorCellBg}">${item.counselText || "없음"}</td>
      <td style="text-align:center; font-weight:700; ${errorCellBg}">${monthEndRule.mealCount || 0}회</td>
      <td style="text-align:center; ${errorCellBg}">${monthEndRule.specialFood ? "기능상태" : "일반식"}</td>
      ${dayCells}
      <td class="${overallClass}" style="text-align:center; font-weight:800; vertical-align:middle; ${errorCellBg}">${overallText}</td>
    `;
    mealResultBody.appendChild(row);
  });
}

function applyMealStyle() {
  if (document.getElementById("mealStyle")) return;
  const style = document.createElement("style");
  style.id = "mealStyle";
  style.textContent = `
    .meal-table { min-width: 2200px; table-layout: fixed; }
    .meal-table th, .meal-table td { vertical-align: middle; white-space: normal; text-align: center; padding: 10px 8px; border: 1px solid #e2e8f0; }
    .meal-table th:nth-child(1), .meal-table td:nth-child(1) { min-width: 100px; width: 100px; text-align: center; position: sticky; left: 0; z-index: 4; }
    .meal-table th:nth-child(1) { background-color: #eaf0fb; z-index: 6; }
    .meal-table th:nth-child(2), .meal-table td:nth-child(2) { min-width: 115px; width: 115px; }
    .meal-table th:nth-child(3), .meal-table td:nth-child(3) { min-width: 160px; width: 160px; text-align: left; }
    .meal-table th:nth-child(4), .meal-table td:nth-child(4) { min-width: 80px; width: 80px; }
    .meal-table th:nth-child(5), .meal-table td:nth-child(5) { min-width: 100px; width: 100px; }
    .meal-day-head, .meal-day-cell { min-width: 95px; width: 95px; }
    .meal-table th:last-child, .meal-table td:last-child { min-width: 115px; width: 115px; word-break: keep-all; line-height: 1.5; text-align: center; }
    .small-cell-text { font-size: 11px; color: #555; margin-top: 4px; line-height: 1.4; word-break: keep-all; }
    .empty-day { color: #64748b; background-color: #f8fafc !important; font-weight: 600; }
    
    .status-ok { color: #1e293b; font-weight: 700; }
    .status-warn { color: #ea580c; font-weight: 800; }
    .status-danger { color: #e11d48; font-weight: 800; }
    .meal-day-blue { color: #2563eb !important; }
    .meal-day-red { color: #dc2626 !important; }
    
    .meal-table tr:nth-child(even) td { background-color: #ffffff !important; }
  `;
  document.head.appendChild(style);
}

checkMealBtn.addEventListener("click", async () => {
  const checkMonth = checkMonthInput.value;
  const file = mealFileInput.files[0];

  if (!checkMonth) { alert("확인 월을 선택해주세요."); return; }
  if (!file) { alert("식사/화장실 기록 파일을 업로드해주세요."); return; }

  alert("구글 시트에서 계획서, 상담일지, 출석 데이터를 원격 동기화 중입니다...");
  await syncCarePlanLibraryFromGoogleSheet();
  await syncCounselLibraryFromGoogleSheet();
  await syncAttendanceMonthFromGoogleSheet(checkMonth);
  applyMealStyle();

  const reader = new FileReader();
  reader.onload = (event) => {
    const data = new Uint8Array(event.target.result);
    const workbook = XLSX.read(data, { type: "array", cellDates: true });
    const mealRows = parseMealReport(workbook, checkMonth);
    const results = buildResults(checkMonth, mealRows);
    renderResults(checkMonth, results);
  };
  reader.readAsArrayBuffer(file);
});

clearMealBtn.addEventListener("click", () => {
  checkMonthInput.value = "";
  file = mealFileInput.value = "";
  mealTableHead.innerHTML = `<tr><th>수급자명</th><th>계획서 작성일</th><th>상담일지 반영</th><th>식사 횟수</th><th>음식 준비</th></tr>`;
  mealResultBody.innerHTML = `<tr><td colspan="5">확인 월과 식사/화장실 기록 파일을 선택해주세요.</td></tr>`;
});
