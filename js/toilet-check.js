const CARE_PLAN_API_URL = "https://script.google.com/macros/s/AKfycbx4ZrUg65tAdpMWLdPH30LBxLehX4331VIy81-OqL45b8oA0cdi4gHtByhO9K-rViF8Mw/exec";

let carePlanLibraryCache = [];
let counselLibraryCache = [];
let attendanceLibraryCache = [];

function makePayloadUrl(payload) {
  return `${CARE_PLAN_API_URL}?payload=${encodeURIComponent(JSON.stringify(payload))}`;
}

async function syncCarePlanLibraryFromGoogleSheet() {
  try {
    const response = await fetch(CARE_PLAN_API_URL, {
      method: "GET",
      redirect: "follow"
    });
    const text = await response.text();
    carePlanLibraryCache = JSON.parse(text);
    return carePlanLibraryCache;
  } catch (error) {
    console.error("급여제공계획서 동기화 오류:", error);
    return carePlanLibraryCache;
  }
}

async function syncCounselLibraryFromGoogleSheet() {
  try {
    const response = await fetch(makePayloadUrl({ action: "listCounsel" }), {
      method: "GET",
      redirect: "follow"
    });
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
      {
        method: "GET",
        redirect: "follow"
      }
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
const toiletFileInput = document.getElementById("toiletFile");
const checkToiletBtn = document.getElementById("checkToiletBtn");
const clearToiletBtn = document.getElementById("clearToiletBtn");
const toiletResultBody = document.getElementById("toiletResultBody");
const toiletTableHead = document.getElementById("toiletTableHead");

function normalizeText(value) {
  return String(value || "").replace(/\s/g, "").trim();
}

function normalizeDateText(value) {
  if (!value) return "";
  const text = String(value).trim().replace(/^'/, "");
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  if (/^\d{4}\.\d{2}\.\d{2}$/.test(text)) return text.replace(/\./g, "-");
  if (/^\d{4}\/\d{2}\/\d{2}$/.test(text)) return text.replace(/\//g, "-");
  if (text.includes("T")) return text.split("T")[0];

  const match = text.match(/(\d{4})[.\-/년\s]*(\d{1,2})[.\-/월\s]*(\d{1,2})/);
  if (match) {
    return `${match[1]}-${String(match[2]).padStart(2, "0")}-${String(match[3]).padStart(2, "0")}`;
  }
  return text;
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

function getAttendanceMonth(monthValue) {
  return attendanceLibraryCache
    .filter((item) => item.month === monthValue)
    .map((item) => ({
      name: item.recipientName || item.name || "",
      dates: Array.isArray(item.attendanceDates)
        ? item.attendanceDates
        : Array.isArray(item.dates)
          ? item.dates
          : []
    }));
}

function getLatestPlansByRecipient(checkDate) {
  const checkDateText = normalizeDateText(checkDate);
  const validPlans = carePlanLibraryCache.filter((plan) => {
    const writtenDate = normalizeDateText(plan.writtenDate);
    return writtenDate && writtenDate <= checkDateText;
  });

  const latestByName = {};
  validPlans.forEach((plan) => {
    const name = String(plan.recipientName || "").trim();
    if (!name) return;
    const current = latestByName[name];
    const writtenDate = normalizeDateText(plan.writtenDate);
    const currentDate = current ? normalizeDateText(current.writtenDate) : "";

    if (!current || writtenDate > currentDate) {
      latestByName[name] = { ...plan, writtenDate };
    }
  });
  return latestByName;
}

function hasDiaperPlan(plan) {
  if (!plan || !plan.rows) return false;
  const text = normalizeText(JSON.stringify(plan.rows));
  return text.includes("기저귀교환도움") || text.includes("기저귀교환") || text.includes("기저귀") || text.includes("B63");
}

function getCounselDate(counsel) {
  return normalizeDateText(counsel.consultDate || counsel.reflectionDate || counsel.date || counsel.counselDate || "");
}

function getLatestDiaperCounsel(name, targetDate) {
  const targetName = String(name || "").trim();
  const targetDateText = normalizeDateText(targetDate);

  const counsels = counselLibraryCache
    .filter((item) => {
      const sameName = String(item.recipientName || "").trim() === targetName;
      const counselDate = getCounselDate(item);
      if (!sameName || !counselDate || counselDate > targetDateText) return false;

      const category = String(item.category || "");
      const text = normalizeText(`${item.category || ""} ${item.changeType || ""} ${item.careContent || ""} ${item.reason || ""}`);
      return category === "기저귀" || text.includes("기저귀") || text.includes("기저귀교환도움") || text.includes("기저귀교환");
    })
    .sort((a, b) => getCounselDate(b).localeCompare(getCounselDate(a)));
  return counsels[0] || null;
}

function isRemoveCounsel(counsel) {
  if (!counsel) return false;
  const text = normalizeText(`${counsel.changeType || ""} ${counsel.careContent || ""} ${counsel.reason || ""}`);
  return text.includes("제외") || text.includes("중단") || text.includes("삭제") || text.includes("미제공") || text.includes("하지않");
}

function isAddCounsel(counsel) {
  if (!counsel) return false;
  const text = normalizeText(`${counsel.changeType || ""} ${counsel.careContent || ""} ${counsel.reason || ""}`);
  return text.includes("추가") || text.includes("시작") || text.includes("제공") || text.includes("반영") || text.includes("기저귀교환도움") || text.includes("기저귀교환");
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
  if (!counsel) return "없음";
  const counselDate = getCounselDate(counsel);
  return `${counselDate || "-"} / [${counsel.changeType || "-"}]<br><span style="font-size:12px; color:#64748b;">${counsel.careContent || "-"}</span>`;
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
    return (currentText + nextText).includes("수급자명") && (currentText + nextText).includes("작성일") && (currentText + nextText).includes("대변") && (currentText + nextText).includes("소변");
  });
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
  if (text === "○" || text === "O" || text === "o") return 1;
  const match = text.match(/\d+/);
  return match ? Number(match[0]) : 0;
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
    if (!dateText || !dateText.startsWith(monthValue)) continue;

    const key = `${name}_${dateText}`;
    if (!resultMap[key]) {
      resultMap[key] = { name, date: dateText, stoolCount: 0, urineCount: 0, diaperCount: 0 };
    }
    resultMap[key].stoolCount += parseCount(row[stoolCol]);
    resultMap[key].urineCount += parseCount(row[urineCol]);
    resultMap[key].diaperCount += diaperCol >= 0 ? parseCount(row[diaperCol]) : 0;
  }
  return Object.values(resultMap);
}

function buildDayCell(dayData, hasDiaperBenefit, isAttendanceDay = true) {
  // [수정 핵심]: 출석부 데이터에 있더라도, 엑셀 화장실 기록 자체가 없으면 '결석(미이용)'으로 강제 분류합니다.
  if (!isAttendanceDay || !dayData) {
    return `<td style="background-color: #f8fafc; color: #64748b; font-weight: 600; text-align: center; vertical-align: middle; padding: 12px 6px; font-size: 13px; border: 1px solid #e2e8f0;">결석</td>`;
  }
  
  const totalCount = dayData.stoolCount + dayData.urineCount + dayData.diaperCount;
  const resultText = getResultText(totalCount, dayData.diaperCount, hasDiaperBenefit);

  if (resultText === "정상") {
    return `<td style="background-color: #ffffff; text-align: center; vertical-align: middle; padding: 12px 6px; border: 1px solid #e2e8f0;"><div style="color: #2563eb; font-weight: 800; font-size: 13px; margin-bottom: 4px;">정상</div><div style="font-size: 11px; color: #64748b; line-height: 1.3;">총 ${totalCount}회<br>대 ${dayData.stoolCount} / 소 ${dayData.urineCount} / 기 ${dayData.diaperCount}</div></td>`;
  } else {
    return `<td style="background-color: #fff5f5; text-align: center; vertical-align: middle; padding: 12px 6px; border: 1px solid #cbd5e1;"><div style="color: #e11d48; font-weight: 800; font-size: 13px; margin-bottom: 4px;">${resultText}</div><div style="font-size: 11px; color: #1e293b; font-weight: 500; line-height: 1.3;">총 ${totalCount}회<br>대 ${dayData.stoolCount} / 소 ${dayData.urineCount} / 기 ${dayData.diaperCount}</div></td>`;
  }
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
      nameMap[row.name] = { name: row.name, planDate: plan ? plan.writtenDate : "-", counselText: getCounselTextForMonth(row.name, monthEndDate), days: {} };
    }
    nameMap[row.name].days[row.date] = { stoolCount: row.stoolCount, urineCount: row.urineCount, diaperCount: row.diaperCount };
  });

  Object.keys(latestPlans).forEach((name) => {
    if (!nameMap[name]) {
      const plan = latestPlans[name];
      nameMap[name] = { name, planDate: plan ? plan.writtenDate : "-", counselText: getCounselTextForMonth(name, monthEndDate), days: {} };
    }
  });

  Object.values(nameMap).forEach((item) => {
    const plan = latestPlans[item.name];
    const attendance = attendanceRows.find((a) => a.name === item.name);
    item.attendanceDates = attendance ? attendance.dates : [];
    item.daysDiaperAllowed = {};
    days.forEach((day) => { item.daysDiaperAllowed[day] = isDiaperAllowedAtDate(plan, item.name, day); });
  });
  return { days, rows: Object.values(nameMap).sort((a, b) => a.name.localeCompare(b.name, "ko")) };
}

function getHolidayList(year) {
  return [`${year}-01-01`, `${year}-03-01`, `${year}-05-05`, `${year}-06-06`, `${year}-08-15`, `${year}-10-03`, `${year}-10-09`, `${year}-12-25`];
}

function getDayHeaderHtml(dayText) {
  const date = new Date(dayText);
  const dayNum = Number(dayText.split("-")[2]);
  const weekday = date.getDay();
  let color = "#1f2937";
  if (weekday === 6) color = "#2563eb";
  if (weekday === 0 || getHolidayList(date.getFullYear()).includes(dayText)) color = "#dc2626";
  return `<th style="color:${color}; text-align: center; vertical-align: middle; border: 1px solid #e2e8f0;">${dayNum}일</th>`;
}

function renderResults(data) {
  const days = data.days || [];
  const rows = data.rows || [];

  toiletTableHead.innerHTML = `
    <tr>
      <th style="border: 1px solid #e2e8f0; text-align: center; vertical-align: middle;">수급자명</th>
      <th style="border: 1px solid #e2e8f0; text-align: center; vertical-align: middle;">계획서 작성일</th>
      <th style="border: 1px solid #e2e8f0; text-align: center; vertical-align: middle;">상담일지 반영</th>
      <th style="border: 1px solid #e2e8f0; text-align: center; vertical-align: middle;">기저귀 급여</th>
      ${days.map((day) => getDayHeaderHtml(day)).join("")}
    </tr>
  `;

  toiletResultBody.innerHTML = "";
  if (rows.length === 0) {
    toiletResultBody.innerHTML = `<tr><td colspan="${4 + days.length}" style="border: 1px solid #e2e8f0; text-align: center; padding: 20px;">확인할 데이터가 없습니다.</td></tr>`;
    return;
  }

  rows.forEach((item) => {
    const row = document.createElement("tr");
    let hasRowError = false;
    
    // [행 전체 에러 색상 판정 조치]
    // 화장실 기록이 아예 없는 날은 결석 처리되므로, 행 전체를 빨갛게(hasRowError) 만드는 대상에서 제외합니다.
    days.forEach((day) => {
      const dayData = item.days[day];
      if ((item.attendanceDates || []).includes(day) && dayData) {
        if (getResultText(dayData.stoolCount + dayData.urineCount + dayData.diaperCount, dayData.diaperCount, item.daysDiaperAllowed[day]) !== "정상") {
          hasRowError = true;
        }
      }
    });

    row.style.backgroundColor = hasRowError ? "#fff5f5" : "#ffffff";
    row.innerHTML = `
      <td style="font-weight: 600; color: #1e293b; vertical-align: middle; border: 1px solid #e2e8f0; text-align: center;">${item.name}</td>
      <td style="vertical-align: middle; border: 1px solid #e2e8f0; text-align: center; font-size: 13px;">${item.planDate}</td>
      <td style="text-align: left; line-height: 1.4; padding: 8px; vertical-align: middle; border: 1px solid #e2e8f0; font-size: 13px;">${item.counselText}</td>
      <td style="font-weight: 500; vertical-align: middle; border: 1px solid #e2e8f0; text-align: center; font-size: 13px;">${Object.values(item.daysDiaperAllowed).some(Boolean) ? "있음" : "없음"}</td>
      ${days.map((day) => {
        const isAttendanceDay = (item.attendanceDates || []).includes(day);
        return buildDayCell(item.days[day], item.daysDiaperAllowed[day], isAttendanceDay);
      }).join("")}
    `;
    toiletResultBody.appendChild(row);
  });
}

checkToiletBtn.addEventListener("click", async () => {
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

  alert("구글 시트에서 계획서, 상담일지, 출석 데이터를 동기화 중입니다...");
  await syncCarePlanLibraryFromGoogleSheet();
  await syncCounselLibraryFromGoogleSheet();
  await syncAttendanceMonthFromGoogleSheet(checkMonth);

  const reader = new FileReader();
  reader.onload = (event) => {
    const data = new Uint8Array(event.target.result);
    const workbook = XLSX.read(data, { type: "array", cellDates: true });
    const toiletRows = parseToiletReport(workbook, checkMonth);
    const parsedResults = buildResults(checkMonth, toiletRows);
    renderResults(parsedResults);
  };
  reader.readAsArrayBuffer(file);
});

clearToiletBtn.addEventListener("click", () => {
  checkMonthInput.value = "";
  toiletFileInput.value = "";
  toiletTableHead.innerHTML = `<tr><th style="border: 1px solid #e2e8f0; text-align: center;">수급자명</th><th style="border: 1px solid #e2e8f0; text-align: center;">계획서 작성일</th><th style="border: 1px solid #e2e8f0; text-align: center;">상담일지 반영</th><th style="border: 1px solid #e2e8f0; text-align: center;">기저귀 급여</th></tr>`;
  toiletResultBody.innerHTML = `<tr><td colspan="4" style="border: 1px solid #e2e8f0; text-align: center; padding: 20px;">확인 월과 식사/화장실 기록 파일을 선택해주세요.</td></tr>`;
});
