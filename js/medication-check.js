const CARE_PLAN_API_URL = "https://script.google.com/macros/s/AKfycbxFaEN0MkkWd_NnDif5LXlCVbIxqgllvGLoJturv0FlXtgX1FG0QTVQNArI5DyR5RTZaA/exec";

async function syncCarePlanLibraryFromGoogleSheet() {
  try {
    const response = await fetch(CARE_PLAN_API_URL, { method: "GET", redirect: "follow" });
    const text = await response.text();
    const plans = JSON.parse(text);
    localStorage.setItem("carePlanLibrary", JSON.stringify(plans));
    return plans;
  } catch (error) {
    console.error("급여제공계획서 동기화 오류:", error);
    return JSON.parse(localStorage.getItem("carePlanLibrary") || "[]");
  }
}

syncCarePlanLibraryFromGoogleSheet();

function normalizeText(value) {
  return String(value || "").replace(/\s/g, "").trim();
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

  const text = String(value);
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

function getLatestPlansByRecipient(checkDate) {
  const library = JSON.parse(localStorage.getItem("carePlanLibrary") || "[]");
  const validPlans = library.filter((plan) => new Date(plan.writtenDate) <= new Date(checkDate));
  const latestByName = {};

  validPlans.forEach((plan) => {
    const name = plan.recipientName;
    const current = latestByName[name];

    if (!current || new Date(plan.writtenDate) > new Date(current.writtenDate)) {
      latestByName[name] = plan;
    }
  });

  return latestByName;
}

function getMedicationCountFromPlan(plan) {
  if (!plan || !plan.rows) return 0;

  let result = 0;

  (plan.rows || []).forEach((row) => {
    const text = normalizeText(JSON.stringify(row));

    if (
      text.includes("정확한복약도움") ||
      text.includes("복약도움") ||
      text.includes("약복용")
    ) {
      const countValue = row["횟수"] || row["12"] || row[12];
      const parsed = Number(String(countValue || "").replace(/[^0-9]/g, ""));

      if (parsed > result) result = parsed;
    }
  });

  return Math.min(result, 3);
}

function getCounselMedicationCount(name, targetDate, fallbackCount) {
  const counselLibrary = JSON.parse(localStorage.getItem("counselLibrary") || "[]");
  const target = new Date(targetDate);

  const counsels = counselLibrary
    .filter((item) => {
      const sameName = item.recipientName === name;
      const reflectionDate = new Date(item.reflectionDate);
      const text = normalizeText(`${item.category} ${item.changeType} ${item.careContent} ${item.reason}`);

      return (
        sameName &&
        reflectionDate <= target &&
        (
          text.includes("복약") ||
          text.includes("투약") ||
          text.includes("정확한복약도움") ||
          text.includes("건강관리")
        )
      );
    })
    .sort((a, b) => new Date(b.reflectionDate) - new Date(a.reflectionDate));

  if (counsels.length === 0) return fallbackCount;

  const text = normalizeText(`${counsels[0].changeType} ${counsels[0].careContent} ${counsels[0].reason}`);

  if (text.includes("제외") || text.includes("중단") || text.includes("미제공") || text.includes("삭제")) return 0;
  if (text.match(/3\s*회/) || text.includes("아침점심저녁")) return 3;
  if (text.match(/2\s*회/) || text.includes("아침저녁") || text.includes("점심저녁")) return 2;
  if (text.match(/1\s*회/) || text.includes("아침") || text.includes("점심") || text.includes("저녁")) return 1;

  return fallbackCount;
}

function getMedicationCounselTextForMonth(name, monthEndDate) {
  const counselLibrary = JSON.parse(localStorage.getItem("counselLibrary") || "[]");
  const target = new Date(monthEndDate);

  const counsels = counselLibrary
    .filter((item) => {
      const sameName = item.recipientName === name;
      const reflectionDate = new Date(item.reflectionDate);
      const text = normalizeText(`${item.category} ${item.changeType} ${item.careContent} ${item.reason}`);

      return (
        sameName &&
        reflectionDate <= target &&
        (
          text.includes("복약") ||
          text.includes("투약") ||
          text.includes("정확한복약도움") ||
          text.includes("건강관리")
        )
      );
    })
    .sort((a, b) => new Date(b.reflectionDate) - new Date(a.reflectionDate));

  if (counsels.length === 0) return "없음";

  const counsel = counsels[0];
  return `${counsel.reflectionDate}<br>${counsel.changeType || "-"}<br>${counsel.careContent || "-"}`;
}

function getRequiredHealthMinutes(medicationCount) {
  if (medicationCount <= 0) return 20;
  if (medicationCount === 1) return 30;
  if (medicationCount === 2) return 40;
  return 50;
}

function getAttendanceMonth(monthValue) {
  const library = JSON.parse(localStorage.getItem("attendanceLibrary") || "[]");
  return library
    .filter((item) => item.month === monthValue)
    .sort((a, b) => a.name.localeCompare(b.name, "ko"));
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

function applySplitCheckStyle() {
  if (document.getElementById("splitCheckStyle")) return;

  const style = document.createElement("style");
  style.id = "splitCheckStyle";
  style.textContent = `
    .split-check-table {
      min-width: 2200px;
      table-layout: fixed;
    }

    .split-check-table th,
    .split-check-table td {
      vertical-align: middle;
      white-space: normal;
      text-align: center;
      padding: 10px 8px;
      border: 1px solid #e2e8f0;
    }

    .split-check-table th:nth-child(1),
    .split-check-table td:nth-child(1) {
      min-width: 100px;
      width: 100px;
      text-align: center;
      position: sticky;
      left: 0;
      z-index: 4;
    }

    .split-check-table th:nth-child(1) {
      background-color: #eaf0fb;
      z-index: 6;
    }

    .split-check-table th:nth-child(2),
    .split-check-table td:nth-child(2) {
      min-width: 115px;
      width: 115px;
    }

    .split-check-table th:nth-child(3),
    .split-check-table td:nth-child(3) {
      min-width: 160px;
      width: 160px;
      text-align: left;
    }

    .split-check-table th:nth-child(4),
    .split-check-table td:nth-child(4) {
      min-width: 100px;
      width: 100px;
    }

    .split-day-head,
    .split-day-cell {
      min-width: 115px;
      width: 115px;
    }

    .split-check-table th:last-child,
    .split-check-table td:last-child {
      min-width: 115px;
      width: 115px;
      word-break: keep-all;
      line-height: 1.5;
    }

    .small-cell-text {
      font-size: 11px;
      color: #555;
      margin-top: 4px;
      line-height: 1.4;
      word-break: keep-all;
    }

    .empty-day {
      color: #999;
      background-color: #f8fafc;
      font-weight: 700;
    }

    .status-ok { color: #2563eb; font-weight: 800; }
    .status-danger { color: #e11d48; font-weight: 800; }

    .split-day-blue {
      color: #2563eb !important;
    }

    .split-day-red {
      color: #dc2626 !important;
    }
  `;

  document.head.appendChild(style);
}

const checkMonthInput = document.getElementById("checkMonth");
const medicationFileInput = document.getElementById("medicationFile");
const checkMedicationBtn = document.getElementById("checkMedicationBtn");
const clearMedicationBtn = document.getElementById("clearMedicationBtn");
const medicationTableHead = document.getElementById("medicationTableHead");
const medicationResultBody = document.getElementById("medicationResultBody");

function parseMedicationReport(workbook, monthValue) {
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = sheetToRowsWithMerges(sheet);

  const headerIndex = rows.findIndex((row) => {
    const text = normalizeText(row.join(" "));
    return text.includes("투약일자") && text.includes("수급자명") && text.includes("시간");
  });

  if (headerIndex === -1) {
    alert("투약 제공 현황에서 표 머리글을 찾지 못했습니다.");
    return [];
  }

  const header = rows[headerIndex] || [];
  const dateCol = findColumn(header, ["투약일자"]);
  const nameCol = findColumn(header, ["수급자명"]);

  const timeCols = header
    .map((cell, index) => normalizeText(cell).includes("시간") ? index : -1)
    .filter((index) => index >= 0);

  const resultMap = {};
  let currentDate = "";
  let currentName = "";

  for (let i = headerIndex + 1; i < rows.length; i++) {
    const row = rows[i] || [];

    const parsedDate = parseDate(row[dateCol]);
    if (parsedDate) currentDate = parsedDate;

    const rawName = String(row[nameCol] || "").trim();
    if (rawName) currentName = rawName;

    if (!currentDate || !currentDate.startsWith(monthValue)) continue;
    if (!currentName || currentName === "수급자명") continue;

    const key = `${currentName}_${currentDate}`;
    if (!resultMap[key]) {
      resultMap[key] = {
        name: currentName,
        date: currentDate,
        times: new Set()
      };
    }

    timeCols.forEach((col) => {
      const text = String(row[col] || "");
      const matches = text.match(/\d{1,2}:\d{2}/g) || [];
      matches.forEach((time) => resultMap[key].times.add(time));
    });
  }

  return Object.values(resultMap).map((item) => ({
    name: item.name,
    date: item.date,
    count: item.times.size
  }));
}

function checkMedicationDay(requiredCount, realCount) {
  if (requiredCount <= 0) {
    if (realCount > 0) {
      return {
        result: "오류",
        details: [`복약도움 없음`, `실제 ${realCount}회`]
      };
    }

    return {
      result: "정상",
      details: ["복약도움 없음"]
    };
  }

  if (realCount !== requiredCount) {
    return {
      result: "오류",
      details: [`${requiredCount}회 필요`, `실제 ${realCount}회`]
    };
  }

  return {
    result: "정상",
    details: [`${realCount}회`]
  };
}

// [일자별 셀 디자인]: 오류 일자 칸 자체에도 연한 분홍 배경 스타일 기입
function buildDayCell(isAttendanceDay, requiredCount, realCount) {
  if (!isAttendanceDay) {
    return `<td class="split-day-cell empty-day">결석</td>`;
  }

  const checked = checkMedicationDay(requiredCount, realCount);
  const resultClass = checked.result === "정상" ? "status-ok" : "status-danger";
  const errorCellBg = checked.result !== "정상" ? "background-color: #fff5f5;" : "";

  return `
    <td class="split-day-cell" style="${errorCellBg}">
      <div class="${resultClass}">${checked.result}</div>
      <div class="small-cell-text">${checked.details.join("<br>")}</div>
    </td>
  `;
}

function buildResults(monthValue, medicationRows) {
  const monthEndDate = getMonthEndDate(monthValue);
  const latestPlans = getLatestPlansByRecipient(monthEndDate);
  const attendanceRows = getAttendanceMonth(monthValue);

  const medicationMap = {};
  medicationRows.forEach((row) => {
    medicationMap[`${row.name}_${row.date}`] = row.count;
  });

  let names = [];
  if (attendanceRows.length > 0) {
    names = attendanceRows.map((item) => item.name);
  } else {
    names = Array.from(new Set([...Object.keys(latestPlans), ...medicationRows.map((item) => item.name)]));
  }

  return names.map((name) => {
    const plan = latestPlans[name];
    const attendance = attendanceRows.find((item) => item.name === name);
    const baseMedicationCount = getMedicationCountFromPlan(plan);

    return {
      name,
      planDate: plan ? plan.writtenDate : "-",
      baseMedicationCount,
      attendanceDates: attendance ? attendance.dates : [],
      medicationMap
    };
  }).sort((a, b) => a.name.localeCompare(b.name, "ko"));
}

function renderHeader(monthValue) {
  const days = getDaysInMonth(monthValue);

  medicationTableHead.innerHTML = `
    <tr>
      <th>수급자명</th>
      <th>계획서 작성일</th>
      <th>상담일지 반영</th>
      <th>복약도움</th>
      ${days.map((day) => {
        const dayNum = Number(day.split("-")[2]);
        const colorClass = getDayColorClass(day);
        return `<th class="split-day-head ${colorClass}">${dayNum}</th>`;
      }).join("")}
      <th>종합 결과</th>
    </tr>
  `;
}

function renderResults(monthValue, results) {
  renderHeader(monthValue);
  medicationResultBody.innerHTML = "";

  const days = getDaysInMonth(monthValue);

  if (!results || results.length === 0) {
    medicationResultBody.innerHTML = `
      <tr class="empty-row">
        <td colspan="${4 + days.length}">확인할 투약 대상자가 없습니다.</td>
      </tr>
    `;
    return;
  }

  results.forEach((item) => {
    const row = document.createElement("tr");
    const attendanceSet = new Set(item.attendanceDates || []);
    const monthEndMedicationCount = getCounselMedicationCount(item.name, getMonthEndDate(monthValue), item.baseMedicationCount);

    let problemCount = 0;

    const dayCells = days.map((day) => {
      const isAttendanceDay = attendanceSet.has(day);
      const requiredCount = getCounselMedicationCount(item.name, day, item.baseMedicationCount);
      const realCount = item.medicationMap[`${item.name}_${day}`] || 0;

      if (isAttendanceDay) {
        const checked = checkMedicationDay(requiredCount, realCount);
        if (checked.result !== "정상") problemCount += 1;
      }

      return buildDayCell(isAttendanceDay, requiredCount, realCount);
    }).join("");

    const overallText = problemCount > 0 ? `확인 필요<br>${problemCount}일` : "정상";
    const overallClass = problemCount > 0 ? "status-danger" : "status-ok";
    
    // 💡 [행 전체 연동 조치]: 확인 필요 상태일 때 줄 전체 구성품에 연한 분홍 배경 스타일 적용
    const errorCellBg = problemCount > 0 ? "background-color: #fff5f5;" : "";

    row.innerHTML = `
      <td style="font-weight:600; text-align:center; ${errorCellBg}">${item.name || "-"}</td>
      <td style="text-align:center; ${errorCellBg}">${item.planDate ? String(item.planDate).substring(0,10) : "-"}</td>
      <td style="text-align:left; font-size:12px; line-height:1.4; padding:6px; ${errorCellBg}">${getMedicationCounselTextForMonth(item.name, getMonthEndDate(monthValue))}</td>
      <td style="text-align:center; ${errorCellBg}">${monthEndMedicationCount}회</td>
      ${dayCells}
      <td class="${overallClass}" style="text-align:center; font-weight:800; vertical-align:middle; ${errorCellBg}">${overallText}</td>
    `;

    medicationResultBody.appendChild(row);
  });
}

checkMedicationBtn.addEventListener("click", async () => {
  await syncCarePlanLibraryFromGoogleSheet();
  applySplitCheckStyle();

  const checkMonth = checkMonthInput.value;
  const medicationFile = medicationFileInput.files[0];

  if (!checkMonth) {
    alert("확인 월을 선택해주세요.");
    return;
  }

  if (!file) { // 💡 기존 소스의 오타 수정 (file -> medicationFile)
    alert("투약 제공 현황 파일을 업로드해주세요.");
    return;
  }

  const attendanceRows = getAttendanceMonth(checkMonth);
  if (attendanceRows.length === 0) {
    alert("출석관리 저장 내역이 없습니다. 먼저 출석관리에서 해당 월 출석을 등록해주세요.");
  }

  const medicationWorkbook = await readWorkbook(medicationFile);
  const medicationRows = parseMedicationReport(medicationWorkbook, checkMonth);
  const results = buildResults(checkMonth, medicationRows);

  renderResults(checkMonth, results);
});

clearMedicationBtn.addEventListener("click", () => {
  checkMonthInput.value = "";
  medicationFileInput.value = "";

  medicationTableHead.innerHTML = `
    <tr>
      <th>수급자명</th>
      <th>계획서 작성일</th>
      <th>상담일지 반영</th>
      <th>복약도움</th>
    </tr>
  `;

  medicationResultBody.innerHTML = `
    <tr class="empty-row">
      <td colspan="4">확인 월과 투약 제공 현황 파일을 선택해주세요.</td>
    </tr>
  `;
});
