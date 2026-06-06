
function getAttendanceMonth(monthValue) {
  const library = JSON.parse(localStorage.getItem("attendanceLibrary") || "[]");
  return library.filter(item => item.month === monthValue);
}

const checkMonthInput = document.getElementById("checkMonth");
const toiletFileInput = document.getElementById("toiletFile");
const checkToiletBtn = document.getElementById("checkToiletBtn");
const clearToiletBtn = document.getElementById("clearToiletBtn");
const toiletResultBody = document.getElementById("toiletResultBody");
const toiletTableHead = document.getElementById("toiletTableHead");

function normalizeText(value) {
  return String(value || "").replace(/\s/g, "").trim();
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

function getDaysInMonth(monthValue) {
  const [year, month] = monthValue.split("-").map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  const days = [];

  for (let day = 1; day <= lastDay; day++) {
    days.push(`${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`);
  }

  return days;
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

function hasDiaperPlan(plan) {
  if (!plan || !plan.rows) return false;

  const text = normalizeText(JSON.stringify(plan.rows));
  return (
    text.includes("기저귀교환도움") ||
    text.includes("기저귀교환") ||
    text.includes("기저귀") ||
    text.includes("B63")
  );
}

function getLatestDiaperCounsel(name, targetDate) {
  const counselLibrary = JSON.parse(localStorage.getItem("counselLibrary") || "[]");
  const target = new Date(targetDate);

  const counsels = counselLibrary
    .filter((item) => {
      const sameName = item.recipientName === name;
      const reflectionDate = new Date(item.reflectionDate);
      const category = item.category || "";
      const text = normalizeText(`${item.careContent} ${item.reason} ${item.changeType}`);

      const isDiaper =
        category === "기저귀" ||
        text.includes("기저귀") ||
        text.includes("기저귀교환도움") ||
        text.includes("기저귀교환");

      return sameName && isDiaper && reflectionDate <= target;
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

function isDiaperAllowedAtDate(plan, name, targetDate) {
  let allowed = hasDiaperPlan(plan);
  const counsel = getLatestDiaperCounsel(name, targetDate);

  if (counsel) {
    if (isRemoveCounsel(counsel)) allowed = false;
    if (isAddCounsel(counsel)) allowed = true;
  }

  return allowed;
}

function getCounselTextForMonth(name, monthEndDate) {
  const counsel = getLatestDiaperCounsel(name, monthEndDate);

  if (!counsel) {
    return "없음";
  }

  return `${counsel.reflectionDate} / ${counsel.changeType || "-"}<br>${counsel.careContent || "-"}`;
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

function findHeaderIndex(rows) {
  return rows.findIndex((row, index) => {
    const currentText = normalizeText(row.join(" "));
    const nextText = normalizeText((rows[index + 1] || []).join(" "));
    const totalText = currentText + nextText;

    return (
      totalText.includes("수급자명") &&
      totalText.includes("작성일") &&
      totalText.includes("대변") &&
      totalText.includes("소변")
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
    return keywords.some((keyword) => text.includes(normalizeText(keyword)));
  });
}

function parseCount(value) {
  if (value === null || value === undefined || value === "") return 0;

  const text = String(value).trim();

  if (text === "○" || text === "O" || text === "o") {
    return 1;
  }

  const match = text.match(/\d+/);
  if (!match) return 0;

  return Number(match[0]);
}

function parseToiletReport(workbook, monthValue) {
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
  const stoolCol = findColumn(header, ["대변"]);
  const urineCol = findColumn(header, ["소변"]);
  const diaperCol = findColumn(header, ["기저귀교체", "기저귀 교체", "기저귀"]);

  const resultMap = {};

  for (let i = headerIndex + 2; i < rows.length; i++) {
    const row = rows[i] || [];

    const name = String(row[nameCol] || "").trim();
    if (!name || name === "수급자명") continue;

    const dateText = parseDate(row[dateCol]);
    if (!dateText) continue;
    if (!dateText.startsWith(monthValue)) continue;

    const stoolCount = parseCount(row[stoolCol]);
    const urineCount = parseCount(row[urineCol]);
    const diaperCount = diaperCol >= 0 ? parseCount(row[diaperCol]) : 0;

    const key = `${name}_${dateText}`;

    if (!resultMap[key]) {
      resultMap[key] = {
        name,
        date: dateText,
        stoolCount: 0,
        urineCount: 0,
        diaperCount: 0
      };
    }

    resultMap[key].stoolCount += stoolCount;
    resultMap[key].urineCount += urineCount;
    resultMap[key].diaperCount += diaperCount;
  }

  return Object.values(resultMap);
}

function getResultText(totalCount, diaperCount, hasDiaperBenefit) {
  if (diaperCount > 0 && !hasDiaperBenefit) {
    return "기저귀 오류";
  }

  if (totalCount < 5) {
    return "횟수 부족";
  }

  return "정상";
}

function makeResultClass(result) {
  if (result === "정상") return "status-ok";
  if (result === "횟수 부족") return "status-danger";
  if (result === "기저귀 오류") return "status-danger";
  return "";
}

function buildResults(monthValue, toiletRows) {
  const monthEndDate = getMonthEndDate(monthValue);
  const latestPlans = getLatestPlansByRecipient(monthEndDate);
  const attendanceRows = getAttendanceMonth(monthValue);
  const days = getDaysInMonth(monthValue);
  const nameMap = {};

  toiletRows.forEach((row) => {
    if (!nameMap[row.name]) {
      const plan = latestPlans[row.name];

      nameMap[row.name] = {
        name: row.name,
        planDate: plan ? plan.writtenDate : "-",
        counselText: getCounselTextForMonth(row.name, monthEndDate),
        days: {}
      };
    }

    nameMap[row.name].days[row.date] = {
      stoolCount: row.stoolCount,
      urineCount: row.urineCount,
      diaperCount: row.diaperCount
    };
  });

  Object.keys(latestPlans).forEach((name) => {
    if (!nameMap[name]) {
      const plan = latestPlans[name];

      nameMap[name] = {
        name,
        planDate: plan ? plan.writtenDate : "-",
        counselText: getCounselTextForMonth(name, monthEndDate),
        days: {}
      };
    }
  });

  Object.values(nameMap).forEach((item) => {
    const plan = latestPlans[item.name];
    const attendance = attendanceRows.find(a => a.name === item.name);
    item.attendanceDates = attendance ? attendance.dates : [];
    item.daysDiaperAllowed = {};

    days.forEach((day) => {
      item.daysDiaperAllowed[day] = isDiaperAllowedAtDate(plan, item.name, day);
    });
  });

  return {
    days,
    rows: Object.values(nameMap).sort((a, b) => a.name.localeCompare(b.name, "ko"))
  };
}

function buildDayCell(dayData, hasDiaperBenefit, isAttendanceDay=true) {
  if (!isAttendanceDay) {
    return '<div style="color:#999;">결석</div>';
  }
  if (!dayData) {
    return `
      <div class="status-danger">기록 없음</div>
      <div style="font-size:12px; color:#555; margin-top:4px;">-</div>
    `;
  }

  const totalCount = dayData.stoolCount + dayData.urineCount + dayData.diaperCount;
  const resultText = getResultText(totalCount, dayData.diaperCount, hasDiaperBenefit);
  const resultClass = makeResultClass(resultText);

  return `
    <div class="${resultClass}">${resultText}</div>
    <div style="font-size:12px; color:#555; margin-top:4px;">
      총 ${totalCount}회<br>
      대 ${dayData.stoolCount} / 소 ${dayData.urineCount} / 기 ${dayData.diaperCount}
    </div>
  `;
}


function getHolidayList(year) {
  return [
    `${year}-01-01`,
    `${year}-03-01`,
    `${year}-05-05`,
    `${year}-06-06`,
    `${year}-08-15`,
    `${year}-10-03`,
    `${year}-10-09`,
    `${year}-12-25`
  ];
}

function getDayHeaderHtml(dayText) {
  const date = new Date(dayText);
  const dayNum = Number(dayText.split("-")[2]);
  const weekday = date.getDay();

  let color = "#1f2937";

  if (weekday === 6) {
    color = "#2563eb";
  }

  if (weekday === 0 || getHolidayList(date.getFullYear()).includes(dayText)) {
    color = "#dc2626";
  }

  return `<th style="color:${color};">${dayNum}일</th>`;
}

function renderResults(data) {
  const days = data.days || [];
  const rows = data.rows || [];

  toiletTableHead.innerHTML = `
    <tr>
      <th>수급자명</th>
      <th>계획서 작성일</th>
      <th>상담일지 반영</th>
      <th>기저귀 급여</th>
      ${days.map((day) => getDayHeaderHtml(day)).join("")}
    </tr>
  `;

  toiletResultBody.innerHTML = "";

  if (rows.length === 0) {
    toiletResultBody.innerHTML = `
      <tr class="empty-row">
        <td colspan="${4 + days.length}">확인할 데이터가 없습니다.</td>
      </tr>
    `;
    return;
  }

  rows.forEach((item) => {
    const row = document.createElement("tr");

    row.innerHTML = `
      <td>${item.name}</td>
      <td>${item.planDate}</td>
      <td>${item.counselText}</td>
      <td>${Object.values(item.daysDiaperAllowed).some(Boolean) ? "있음" : "없음"}</td>
      ${days.map((day) => {
        const isAttendanceDay = (item.attendanceDates || []).includes(day);
        return `<td>${buildDayCell(item.days[day], item.daysDiaperAllowed[day], isAttendanceDay)}</td>`;
      }).join("")}
    `;

    toiletResultBody.appendChild(row);
  });
}

checkToiletBtn.addEventListener("click", () => {
  const checkMonth = checkMonthInput.value;
  const file = toiletFileInput.files[0];

  if (!checkMonth) {
    alert("확인 월을 선택해주세요.");
    return;
  }

  if (!file) {
    alert("식사/화장실 기록 파일을 업로드해주세요.");
    return;
  }

  const reader = new FileReader();

  reader.onload = (event) => {
    const data = new Uint8Array(event.target.result);
    const workbook = XLSX.read(data, { type: "array", cellDates: true });

    const toiletRows = parseToiletReport(workbook, checkMonth);
    const results = buildResults(checkMonth, toiletRows);

    renderResults(results);
  };

  reader.readAsArrayBuffer(file);
});

clearToiletBtn.addEventListener("click", () => {
  checkMonthInput.value = "";
  toiletFileInput.value = "";

  toiletTableHead.innerHTML = `
    <tr>
      <th>수급자명</th>
      <th>계획서 작성일</th>
      <th>상담일지 반영</th>
      <th>기저귀 급여</th>
    </tr>
  `;

  toiletResultBody.innerHTML = `
    <tr class="empty-row">
      <td colspan="4">확인 월과 식사/화장실 기록 파일을 선택해주세요.</td>
    </tr>
  `;
});
