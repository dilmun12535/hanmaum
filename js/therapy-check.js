const CARE_PLAN_API_URL = "https://script.google.com/macros/s/AKfycbxFaEN0MkkWd_NnDif5LXlCVbIxqgllvGLoJturv0FlXtgX1FG0QTVQNArI5DyR5RTZaA/exec";

let carePlanLibraryCache = [];
let counselLibraryCache = [];
let attendanceLibraryCache = [];

function makePayloadUrl(payload) {
  return `${CARE_PLAN_API_URL}?payload=${encodeURIComponent(JSON.stringify(payload))}`;
}

// 💡 [영구 조치]: 브라우저 저장 한도를 터트리던 localStorage 구문을 원천 배제하고 실시간 원격 메모리 연동망으로 리모델링했습니다.
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

  const year = dateInfo.getFullYear();
  const month = String(dateInfo.getMonth() + 1).padStart(2, "0");
  const day = String(dateInfo.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function parseDate(value) {
  if (!value) return "";

  if (value instanceof Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  if (typeof value === "number") {
    return excelDateToJSDate(value);
  }

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
      const y = currentEnd.getFullYear();
      const m = String(currentEnd.getMonth() + 1).padStart(2, "0");
      const d = String(currentEnd.getDate()).padStart(2, "0");
      ranges[`week${i + 1}`] = `${y}-${m}-${d}`;
    }
  }

  return ranges;
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

function getLatestPlansByRecipient(checkDate) {
  // 💡 [수정 완료]: 셧다운을 유발하던 로컬스토리지를 배제하고 실시간 캐시 배열 변수에서 직접 필터링을 집행합니다.
  const library = carePlanLibraryCache || [];

  const validPlans = library.filter((plan) => {
    return new Date(plan.writtenDate) <= new Date(checkDate);
  });

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

function hasTherapyPlan(plan) {
  if (!plan || !plan.rows) return false;

  const text = normalizeText(JSON.stringify(plan.rows));

  return text.includes("물리치료") || text.includes("M10");
}

function getLatestTherapyCounsel(name, targetDate) {
  // 💡 [수정 완료]: 셧다운을 유발하던 로컬스토리지를 배제하고 실시간 캐시 배열 변수에서 직접 필터링을 집행합니다.
  const counselLibrary = counselLibraryCache || [];
  const target = new Date(targetDate);

  const counsels = counselLibrary
    .filter((item) => {
      const sameName = item.recipientName === name;
      const reflectionDate = new Date(item.reflectionDate);
      const category = item.category || "";
      const text = normalizeText(`${item.careContent} ${item.reason} ${item.changeType}`);

      const isTherapy = category === "물리치료" || text.includes("물리치료");

      return sameName && isTherapy && reflectionDate <= target;
    })
    .sort((a, b) => new Date(b.reflectionDate) - new Date(a.reflectionDate));

  return counsels[0] || null;
}

function isRemoveCounsel(counsel) {
  if (!counsel) return false;

  const text = normalizeText(`${counsel.changeType} ${counsel.careContent} ${counsel.reason}`);

  return (
    text.includes("제외") ||
    text.includes("중단") ||
    text.includes("삭제") ||
    text.includes("미제공") ||
    text.includes("하지않")
  );
}

function isAddCounsel(counsel) {
  if (!counsel) return false;

  const text = normalizeText(`${counsel.changeType} ${counsel.careContent} ${counsel.reason}`);

  return (
    text.includes("추가") ||
    text.includes("시작") ||
    text.includes("제공") ||
    text.includes("반영")
  );
}

function isTherapyRequiredAtDate(plan, name, targetDate) {
  let required = hasTherapyPlan(plan);
  const counsel = getLatestTherapyCounsel(name, targetDate);

  if (counsel) {
    if (isRemoveCounsel(counsel)) {
      required = false;
    }

    if (isAddCounsel(counsel)) {
      required = true;
    }
  }

  return required;
}

function getCounselTextForMonth(name, monthEndDate) {
  const counsel = getLatestTherapyCounsel(name, monthEndDate);

  if (!counsel) {
    return "없음";
  }

  return `${counsel.reflectionDate}<br>${counsel.changeType || "-"}<br>${counsel.careContent || "-"}`;
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

    return (
      text.includes("연번") &&
      text.includes("수급자명") &&
      text.includes("제공일") &&
      text.includes("제공시간")
    );
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
    if (!dateText) continue;

    if (!dateText.startsWith(monthValue)) continue;

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

function getWeekResult(required, weekData) {
  const hasRecord = weekData && weekData.hasRecord;

  if (required && hasRecord) return "정상";
  if (required && !hasRecord) return "누락";
  if (!required && hasRecord) return "오류";
  return "정상";
}

function makeResultClass(result) {
  if (result === "정상") return "status-ok";
  if (result === "누락") return "status-danger";
  if (result === "오류") return "status-danger";
  return "";
}

function buildWeekCell(required, weekData) {
  const result = getWeekResult(required, weekData);
  const resultClass = makeResultClass(result);

  let recordText = "-";

  if (weekData && weekData.recordText) {
    recordText = weekData.recordText
      .replaceAll(" / ", "<br>")
      .replaceAll("~", " ~ ");
  }

  const errorCellBg = result !== "정상" ? "background-color: #fff5f5;" : "";

  return `
    <div style="width: 100%; height: 100%; padding: 4px; ${errorCellBg}">
      <div class="${resultClass}" style="font-weight:700;">
        ${result}
      </div>
      <div style="font-size:11px;color:#555;margin-top:4px;white-space:normal;word-break:keep-all;line-height:1.5;">
        ${recordText}
      </div>
    </div>
  `;
}

function buildOverallResult(weekResults) {
  const hasError = weekResults.some((result) => result !== "정상");

  return hasError ? "확인 필요" : "정상";
}

function buildResults(monthValue, therapyRows) {
  const monthEndDate = getMonthEndDate(monthValue);
  const weekEndDates = getWeekEndDates(monthValue);
  const latestPlans = getLatestPlansByRecipient(monthEndDate);

  const therapyMap = {};
  therapyRows.forEach((row) => {
    therapyMap[row.name] = row;
  });

  const allNames = new Set([
    ...Object.keys(latestPlans),
    ...Object.keys(therapyMap)
  ]);

  const results = [];

  allNames.forEach((name) => {
    const plan = latestPlans[name];
    const therapy = therapyMap[name];

    const weeks = therapy
      ? therapy.weeks
      : {
          week1: { hasRecord: false, recordText: "-" },
          week2: { hasRecord: false, recordText: "-" },
          week3: { hasRecord: false, recordText: "-" },
          week4: { hasRecord: false, recordText: "-" },
          week5: { hasRecord: false, recordText: "-" },
          week6: { hasRecord: false, recordText: "-" }
        };

    const weekRequired = {
      week1: weekEndDates.week1 ? isTherapyRequiredAtDate(plan, name, weekEndDates.week1) : false,
      week2: weekEndDates.week2 ? isTherapyRequiredAtDate(plan, name, weekEndDates.week2) : false,
      week3: weekEndDates.week3 ? isTherapyRequiredAtDate(plan, name, weekEndDates.week3) : false,
      week4: weekEndDates.week4 ? isTherapyRequiredAtDate(plan, name, weekEndDates.week4) : false,
      week5: weekEndDates.week5 ? isTherapyRequiredAtDate(plan, name, weekEndDates.week5) : false,
      week6: weekEndDates.week6 ? isTherapyRequiredAtDate(plan, name, weekEndDates.week6) : false
    };

    const weekResults = [
      getWeekResult(weekRequired.week1, weeks.week1),
      getWeekResult(weekRequired.week2, weeks.week2),
      getWeekResult(weekRequired.week3, weeks.week3),
      getWeekResult(weekRequired.week4, weeks.week4),
      getWeekResult(weekRequired.week5, weeks.week5),
      getWeekResult(weekRequired.week6, weeks.week6)
    ];

    results.push({
      name,
      planDate: plan ? plan.writtenDate : "-",
      counselText: getCounselTextForMonth(name, monthEndDate),
      weekRequired,
      weeks,
      overallResult: buildOverallResult(weekResults)
    });
  });

  return results.sort((a, b) => safeCompare(a.name, b.name));
}

function applyTherapyReadableStyle() {
  if (document.getElementById("therapyReadableStyle")) {
    return;
  }

  const style = document.createElement("style");
  style.id = "therapyReadableStyle";
  style.textContent = `
    .therapy-check-table th,
    .therapy-check-table td {
      vertical-align: top;
      white-space: normal;
      border: 1px solid #e2e8f0;
      padding: 10px 8px;
    }

    .therapy-check-table th:nth-child(1),
    .therapy-check-table td:nth-child(1) {
      min-width: 90px;
      width: 90px;
      text-align: center;
    }

    .therapy-check-table th:nth-child(2),
    .therapy-check-table td:nth-child(2) {
      min-width: 115px;
      width: 115px;
      text-align: center;
    }

    .therapy-check-table th:nth-child(3),
    .therapy-check-table td:nth-child(3) {
      min-width: 150px;
      width: 150px;
      text-align: left;
    }

    .therapy-check-table th:nth-child(n+4):nth-child(-n+9),
    .therapy-check-table td:nth-child(n+4):nth-child(-n+9) {
      min-width: 210px;
      width: 210px;
      text-align: center;
      padding: 0px !important;
    }

    .therapy-check-table th:nth-child(10),
    .therapy-check-table td:nth-child(10) {
      min-width: 90px;
      width: 90px;
      text-align: center;
      vertical-align: middle;
    }
    
    .status-ok { color: #2563eb; font-weight: 800; }
    .status-danger { color: #e11d48; font-weight: 800; }
  `;
  document.head.appendChild(style);
}

function renderResults(results) {
  applyTherapyReadableStyle();
  therapyResultBody.innerHTML = "";

  if (!results || results.length === 0) {
    therapyResultBody.innerHTML = `
      <tr class="empty-row">
        <td colspan="10">확인할 데이터가 없습니다.</td>
      </tr>
    `;
    return;
  }

  results.forEach((item) => {
    const row = document.createElement("tr");
    const overallClass = item.overallResult === "정상" ? "status-ok" : "status-danger";
    
    const errorCellBg = item.overallResult !== "정상" ? "background-color: #fff5f5;" : "";

    row.innerHTML = `
      <td style="font-weight:600; text-align:center; ${errorCellBg}">${item.name}</td>
      <td style="text-align:center; ${errorCellBg}">${item.planDate ? String(item.planDate).substring(0,10) : "-"}</td>
      <td style="font-size:12px; line-height:1.4; ${errorCellBg}">${item.counselText}</td>
      <td>${buildWeekCell(item.weekRequired.week1, item.weeks.week1)}</td>
      <td>${buildWeekCell(item.weekRequired.week2, item.weeks.week2)}</td>
      <td>${buildWeekCell(item.weekRequired.week3, item.weeks.week3)}</td>
      <td>${buildWeekCell(item.weekRequired.week4, item.weeks.week4)}</td>
      <td>${buildWeekCell(item.weekRequired.week5, item.weeks.week5)}</td>
      <td class="${overallClass}" style="text-align:center; font-weight:800; vertical-align:middle; ${errorCellBg}">${item.overallResult}</td>
    `;

    therapyResultBody.appendChild(row);
  });
}

checkTherapyBtn.addEventListener("click", async () => {
  alert("구글 시트에서 계획서 및 상담일지 데이터 보관함을 동기화 중입니다...");
  await syncCarePlanLibraryFromGoogleSheet();
  await syncCounselLibraryFromGoogleSheet(); // 💡 상담일지 실시간 연동라인 배선 완료!
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

  const reader = new FileReader();

  reader.onload = (event) => {
    const data = new Uint8Array(event.target.result);
    const workbook = XLSX.read(data, { type: "array", cellDates: true });

    const therapyRows = parseTherapyReport(workbook, checkMonth);
    const results = buildResults(checkMonth, therapyRows);

    renderResults(results);
  };

  reader.readAsArrayBuffer(file);
});

clearTherapyBtn.addEventListener("click", () => {
  checkMonthInput.value = "";
  therapyFileInput.value = "";

  therapyResultBody.innerHTML = `
    <tr class="empty-row">
      <td colspan="10">확인 월과 물리치료 기록 파일을 선택해주세요.</td>
    </tr>
  `;
});
