const CARE_PLAN_API_URL = "https://script.google.com/macros/s/AKfycbxFaEN0MkkWd_NnDif5LXlCVbIxqgllvGLoJturv0FlXtgX1FG0QTVQNArI5DyR5RTZaA/exec";

let carePlanLibraryCache = [];
let attendanceLibraryCache = [];

function makePayloadUrl(payload) {
  return `${CARE_PLAN_API_URL}?payload=${encodeURIComponent(JSON.stringify(payload))}`;
}

// 💡 [영구 조치]: 브라우저 저장 한도를 터트리던 localStorage.setItem 구문을 원천 삭제하고 안전한 메모리 변수 수신 방식으로 리모델링했습니다.
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
    .map((item) => ({
      name: String(item.name || item.recipientName || "").trim(),
      grade: item.grade || "",
      dates: item.dates || item.attendanceDates || []
    }))
    .filter
