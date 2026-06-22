const CARE_PLAN_API_URL = "https://script.google.com/macros/s/AKfycbyxbQ7GeDm7pq9SkYDSgGkt7GiKic878En8-niDDFuRg7-lyxo5F3E7LE5qYpqi2_Z14g/exec";

let carePlanLibraryCache = [];
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

const checkMonthInput = document.getElementById("checkMonth");
const cognitiveFileInput = document.getElementById("cognitiveFile");
const checkCognitiveBtn = document.getElementById("checkCognitiveBtn");
const clearCognitiveBtn = document.getElementById("clearCognitiveBtn");
const cognitiveTableHead = document.getElementById("cognitiveTableHead");
const cognitiveResultBody = document.getElementById("cognitiveResultBody");

function normalizeText(value) {
  return String(value || "").replace(/\s/g, "").trim();
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
  if (typeof value === "number") {
    return excelDateToJSDate(value);
  }
  const text = String(value);
  const match = text.match(/(\d{4})[.\-/년\s]*(\d{1,2})[.\-/월\s]*(\d{1,2})/);
  if (!match) return "";
  return `${match[1]}-${String(match[2]).padStart(2, "0")}-${String(match[3]).padStart(2, "0")}`;
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
  if (weekday === 0 || holidayList.includes(dateText)) return "cognitive-day-red";
  if (weekday === 6) return "cognitive-day-blue";
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
        rows[r - range.s.r][c] = value;
      }
    }
  });
  return rows;
}

function findHeaderIndex(rows) {
  return rows.findIndex((row) => {
    const text = normalizeText(row.join(" "));
    return text.includes("수급자명") && text.includes("제공일시") && text.includes("프로그램") && text.includes("참여도");
  });
}

function findColumn(header, keywords) {
  return header.findIndex((cell) => {
    const text = normalizeText(cell);
    return keywords.some((keyword) => text.includes(normalizeText(keyword)));
  });
}

function isCognitiveRecord(rowText) {
  const text = normalizeText(rowText);
  return text.includes("인지기능") || text.includes("인지활동") || text.includes("인지프로그램") || text.includes("인지");
}

function parseCognitiveReport(workbook, monthValue) {
  const resultMap = {};
  workbook.SheetNames.forEach((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    const rows = sheetToRowsWithMerges(sheet);
    const headerIndex = findHeaderIndex(rows);
    if (headerIndex === -1) return;

    const header = rows[headerIndex] || [];
    const nameCol = findColumn(header, ["수급자명"]);
    const gradeCol = findColumn(header, ["등급"]);
    const dateCol = findColumn(header, ["제공일시", "제공일"]);
    const typeCol = findColumn(header, ["유형구분"]);
    const programTypeCol = findColumn(header, ["프로그램유형"]);
    const programCol = findColumn(header, ["프로그램"]);

    for (let i = headerIndex + 1; i < rows.length; i++) {
      const row = rows[i] || [];
      const name = String(row[nameCol] || "").trim();
      if (!name || name === "수급자명") continue;

      const dateText = parseDate(row[dateCol]);
      if (!dateText || !dateText.startsWith(monthValue)) continue;

      const grade = gradeCol >= 0 ? String(row[gradeCol] || "").trim() : "";
      const checkText = [
        typeCol >= 0 ? row[typeCol] : "",
        programTypeCol >= 0 ? row[programTypeCol] : "",
        programCol >= 0 ? row[programCol] : ""
      ].join(" ");

      if (!isCognitiveRecord(checkText)) continue;

      if (!resultMap[name]) {
        resultMap[name] = { name, grade, days: {} };
      }
      if (!resultMap[name].grade && grade) resultMap[name].grade = grade;
      if (!resultMap[name].days[dateText]) {
        resultMap[name].days[dateText] = { count: 0, programs: [] };
      }
      resultMap[name].days[dateText].count += 1;

      const programName = programCol >= 0 ? String(row[programCol] || "").trim() : "";
      if (programName && !resultMap[name].days[dateText].programs.includes(programName)) {
        resultMap[name].days[dateText].programs.push(programName);
      }
    }
  });
  return Object.values(resultMap);
}

function getAttendanceMonth(monthValue) {
  return attendanceLibraryCache
    .filter((item) => item.month === monthValue)
    .map((item) => {
      const rawDates = Array.isArray(item.dates)
        ? item.dates
        : Array.isArray(item.attendanceDates)
          ? item.attendanceDates
          : [];

      return {
        name: String(item.name || item.recipientName || "").trim(),
        grade: item.grade || item.longTermCareGrade || item.careGrade || "",
        dates: rawDates.map((date) => parseDate(date)).filter((date) => date && date.startsWith(monthValue))
      };
    })
    .filter((item) => item.name !== "")
    .sort((a, b) => safeCompare(a.name, b.name));
}

function isCognitiveTargetGrade(grade) {
  const text = normalizeText(grade);
  return text.includes("5등급") || text.includes("인지지원");
}

function buildResults(monthValue, cognitiveRows) {
  const attendanceRows = getAttendanceMonth(monthValue);

  // [수정 핵심]
  // 화면 표시 기준을 계획서/누적 데이터가 아닌 "선택한 월의 출석관리 데이터"로 고정합니다.
  // 그래서 4월을 확인하면 4월 출석부에 있는 5등급/인지지원 어르신만 표시됩니다.
  const cognitiveMap = {};
  cognitiveRows.forEach((row) => {
    const key = normalizeText(row.name);
    if (!key) return;
    cognitiveMap[key] = row;
  });

  if (attendanceRows.length === 0) {
    return [];
  }

  return attendanceRows
    .filter((item) => isCognitiveTargetGrade(item.grade))
    .map((attendance) => {
      const cognitive = cognitiveMap[normalizeText(attendance.name)];
      return {
        name: attendance.name,
        grade: attendance.grade || (cognitive ? cognitive.grade : "-"),
        attendanceDates: attendance.dates || [],
        cognitiveDays: cognitive ? cognitive.days : {}
      };
    })
    .sort((a, b) => safeCompare(a.name, b.name));
}

function renderHeader(monthValue) {
  const days = getDaysInMonth(monthValue);
  cognitiveTableHead.innerHTML = `
    <tr>
      <th>수급자명</th>
      <th>등급</th>
      <th>출석일수</th>
      ${days.map((day) => {
        const dayNum = Number(day.split("-")[2]);
        const colorClass = getDayColorClass(day);
        return `<th class="cognitive-day-head ${colorClass}">${dayNum}</th>`;
      }).join("")}
      <th>종합 결과</th>
    </tr>
  `;
}

function buildDayCell(isAttendanceDay, cognitiveDay) {
  if (!isAttendanceDay) return `<td class="cognitive-day-cell empty-day">결석</td>`;
  if (cognitiveDay && cognitiveDay.count > 0) {
    const programText = cognitiveDay.programs && cognitiveDay.programs.length > 0 ? cognitiveDay.programs.join("<br>") : `${cognitiveDay.count}회`;
    return `
      <td class="cognitive-day-cell" style="background-color: #ffffff !important;">
        <div class="status-ok">정상</div>
        <div class="small-cell-text">${programText}</div>
      </td>
    `;
  }
  return `
    <td class="cognitive-day-cell" style="background-color: #fff5f5 !important; border: 1px solid #fda4af !important;">
      <div class="status-danger">누락</div>
      <div class="small-cell-text">출석</div>
    </td>
  `;
}

function renderResults(monthValue, results) {
  renderHeader(monthValue);
  cognitiveResultBody.innerHTML = "";
  const days = getDaysInMonth(monthValue);

  if (!results || results.length === 0) {
    cognitiveResultBody.innerHTML = `<tr><td colspan="${4 + days.length}">선택한 월의 출석관리 데이터에 5등급 또는 인지지원등급 대상자가 없습니다. 출석관리 저장 여부를 확인해주세요.</td></tr>`;
    return;
  }

  results.forEach((item) => {
    const row = document.createElement("tr");
    const attendanceSet = new Set(item.attendanceDates || []);
    let missingCount = 0;
    let attendCount = 0;

    const dayCells = days.map((day) => {
      const isAttendanceDay = attendanceSet.has(day);
      if (isAttendanceDay) attendCount += 1;
      const cognitiveDay = item.cognitiveDays ? item.cognitiveDays[day] : null;
      if (isAttendanceDay && (!cognitiveDay || cognitiveDay.count <= 0)) missingCount += 1;
      return buildDayCell(isAttendanceDay, cognitiveDay);
    }).join("");

    const overallText = missingCount > 0 ? `확인 필요<br>${missingCount}일 누락` : "정상";
    const overallClass = missingCount > 0 ? "status-danger" : "status-ok";
    const errorCellBg = missingCount > 0 ? 'background-color: #fff5f5 !important;' : 'background-color: #ffffff !important;';

    row.innerHTML = `
      <td style="font-weight:600; text-align:center; ${errorCellBg}">${item.name || "-"}</td>
      <td style="text-align:center; ${errorCellBg}">${item.grade || "-"}</td>
      <td class="status-info" style="text-align:center; ${errorCellBg}">${attendCount}일</td>
      ${dayCells}
      <td class="${overallClass}" style="text-align:center; font-weight:800; vertical-align:middle; ${errorCellBg}">${overallText}</td>
    `;
    cognitiveResultBody.appendChild(row);
  });
}

function applyCognitiveStyle() {
  if (document.getElementById("cognitiveStyle")) return;
  const style = document.createElement("style");
  style.id = "cognitiveStyle";
  style.textContent = `
    .cognitive-table { min-width: 1800px; table-layout: fixed; }
    .cognitive-table th, .cognitive-table td { vertical-align: middle; white-space: normal; text-align: center; padding: 10px 8px; border: 1px solid #e2e8f0; }
    .cognitive-table th:nth-child(1), .cognitive-table td:nth-child(1) { min-width: 100px; width: 100px; text-align: center; position: sticky; left: 0; z-index: 4; }
    .cognitive-table th:nth-child(1) { background-color: #eaf0fb; z-index: 6; }
    .cognitive-table th:nth-child(2), .cognitive-table td:nth-child(2) { min-width: 120px; width: 120px; position: sticky; left: 100px; z-index: 4; }
    .cognitive-table th:nth-child(2) { background-color: #eaf0fb; z-index: 6; }
    .cognitive-table th:nth-child(3), .cognitive-table td:nth-child(3) { min-width: 80px; width: 80px; }
    .cognitive-day-head, .cognitive-day-cell { min-width: 90px; width: 90px; }
    .small-cell-text { font-size: 11px; color: #555; margin-top: 4px; line-height: 1.4; word-break: keep-all; }
    .empty-day { color: #999; background-color: #f8fafc !important; font-weight: 700; }
    .cognitive-day-blue { color: #2563eb !important; }
    .cognitive-day-red { color: #dc2626 !important; }
    .status-ok { color: #1e293b; font-weight: 700; }
    .status-danger { color: #e11d48; font-weight: 800; }
    .cognitive-table th:last-child, .cognitive-table td:last-child { min-width: 120px; width: 120px; white-space: normal; word-break: keep-all; line-height: 1.5; text-align: center; }
    
    /* 💡 [얼룩 전면 제거]: 짝수행 강제 푸른 배경 템플릿 CSS 속성을 차단하여 완벽한 백색으로 변환합니다. */
    .cognitive-table tr:nth-child(even) td { background-color: #ffffff !important; }
  `;
  document.head.appendChild(style);
}

checkCognitiveBtn.addEventListener("click", async () => {
  const checkMonth = checkMonthInput.value;
  const file = cognitiveFileInput.files[0];

  if (!checkMonth) { alert("확인 월을 선택해주세요."); return; }
  if (!file) { alert("프로그램 참여 기록 파일을 업로드해주세요."); return; }

  alert("구글 시트에서 계획서 및 월 출석 데이터 보관함을 동기화 중입니다...");
  await syncCarePlanLibraryFromGoogleSheet();
  await syncAttendanceMonthFromGoogleSheet(checkMonth);
  applyCognitiveStyle();

  const reader = new FileReader();
  reader.onload = (event) => {
    const data = new Uint8Array(event.target.result);
    const workbook = XLSX.read(data, { type: "array", cellDates: true });
    const cognitiveRows = parseCognitiveReport(workbook, checkMonth);
    const results = buildResults(checkMonth, cognitiveRows);
    renderResults(checkMonth, results);
  };
  reader.readAsArrayBuffer(file);
});

clearCognitiveBtn.addEventListener("click", () => {
  checkMonthInput.value = "";
  cognitiveFileInput.value = "";
  cognitiveTableHead.innerHTML = `<tr><th>수급자명</th><th>등급</th><th>출석일수</th></tr>`;
  cognitiveResultBody.innerHTML = `<tr class="empty-row"><td colspan="3">확인 월과 프로그램 참여 기록 파일을 선택해주세요.</td></tr>`;
});
