const CARE_PLAN_API_URL = "https://script.google.com/macros/s/AKfycbxFaEN0MkkWd_NnDif5LXlCVbIxqgllvGLoJturv0FlXtgX1FG0QTVQNArI5DyR5RTZaA/exec";

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
    const response = await fetch(`${CARE_PLAN_API_URL}?action=listCounsel`, {
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

async function syncAttendanceLibraryFromGoogleSheet(monthValue) {
  try {
    const response = await fetch(`${CARE_PLAN_API_URL}?action=listAttendance&month=${monthValue}`, {
      method: "GET",
      redirect: "follow"
    });
    const text = await response.text();
    const records = JSON.parse(text);
    attendanceLibraryCache = Array.isArray(records) ? records : [];
    return attendanceLibraryCache;
  } catch (error) {
    console.error("출석 데이터 동기화 오류:", error);
    return attendanceLibraryCache;
  }
}

const checkMonthInput = document.getElementById("checkMonth");
const bathFileInput = document.getElementById("bathFile");
const checkBathBtn = document.getElementById("checkBathBtn");
const clearBathBtn = document.getElementById("clearBathBtn");
const bathResultBody = document.getElementById("bathResultBody");

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

function getMonthEndDate(monthValue) {
  const [year, month] = monthValue.split("-").map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  return `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
}

function getWeekRanges(monthValue) {
  const [year, month] = monthValue.split("-").map(Number);
  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month, 0);

  const firstDay = monthStart.getDay();
  const mondayOffset = (firstDay + 6) % 7;

  const firstMonday = new Date(monthStart);
  firstMonday.setDate(monthStart.getDate() - mondayOffset);

  const result = {};
  for (let i = 0; i < 5; i++) {
    const weekStart = new Date(firstMonday);
    weekStart.setDate(firstMonday.getDate() + i * 7);

    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 5);

    const finalStart = new Date(Math.max(weekStart.getTime(), monthStart.getTime()));
    const finalEnd = new Date(Math.min(weekEnd.getTime(), monthEnd.getTime()));

    result[`week${i + 1}`] = {
      start: `${finalStart.getFullYear()}-${String(finalStart.getMonth() + 1).padStart(2, "0")}-${String(finalStart.getDate()).padStart(2, "0")}`,
      end: `${finalEnd.getFullYear()}-${String(finalEnd.getMonth() + 1).padStart(2, "0")}-${String(finalEnd.getDate()).padStart(2, "0")}`
    };
  }
  return result;
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

function hasBathPlan(plan) {
  if (!plan || !plan.rows) return false;
  const text = normalizeText(JSON.stringify(plan.rows));
  return text.includes("몸씻기도움") || text.includes("몸씻기") || text.includes("목욕") || text.includes("B52");
}

function getCounselDate(counsel) {
  return normalizeDateText(
    counsel.reflectionDate || counsel.consultDate || counsel.date || counsel.counselDate || counsel.writtenDate || ""
  );
}

function isPureBathCounsel(item) {
  const categoryText = normalizeText(item.category || "");
  const contentText = normalizeText(item.careContent || "");
  const reasonText = normalizeText(item.reason || "");
  const totalContent = contentText + reasonText;

  if (categoryText.includes("목욕")) {
    if (totalContent.includes("옷") || totalContent.includes("입기") || totalContent.includes("기저귀")) {
      return false;
    }
    return true;
  }
  return false;
}

function hasBathAction(item) {
  const actionText = normalizeText(`${item.changeType || ""} ${item.careContent || ""} ${item.reason || ""}`);
  return (
    actionText.includes("추가") || actionText.includes("제외") || actionText.includes("중단") ||
    actionText.includes("삭제") || actionText.includes("미제공") || actionText.includes("반영") ||
    actionText.includes("시작") || actionText.includes("제공")
  );
}

function getLatestBathCounsel(name, targetDate) {
  const targetDateText = normalizeDateText(targetDate);
  const targetName = normalizeText(name);

  const bathCounsels = counselLibraryCache
    .filter((item) => {
      const itemName = normalizeText(item.recipientName || "");
      const sameName = itemName === targetName || itemName.includes(targetName) || targetName.includes(itemName);
      if (!sameName) return false;

      const counselDate = getCounselDate(item);
      if (counselDate && targetDateText && counselDate > targetDateText) return false;

      return isPureBathCounsel(item);
    })
    .sort((a, b) => {
      const dateA = getCounselDate(a) || "0000-00-00";
      const dateB = getCounselDate(b) || "0000-00-00";
      return dateB.localeCompare(dateA);
    });

  return bathCounsels[0] || null;
}

function isRemoveCounsel(counsel) {
  if (!counsel) return false;
  const text = normalizeText(`${counsel.changeType || ""} ${counsel.careContent || ""} ${counsel.reason || ""}`);
  return text.includes("제외") || text.includes("중단") || text.includes("삭제") || text.includes("미제공");
}

function isAddCounsel(counsel) {
  if (!counsel) return false;
  const text = normalizeText(`${counsel.changeType || ""} ${counsel.careContent || ""} ${counsel.reason || ""}`);
  return text.includes("추가") || text.includes("시작") || text.includes("제공") || text.includes("반영");
}

function hasAttendanceInWeek(name, startDate, endDate) {
  const targetName = normalizeText(name);
  const attendanceRow = attendanceLibraryCache.find((rec) => {
    const recName = normalizeText(rec.recipientName || "");
    return recName === targetName || recName.includes(targetName) || targetName.includes(recName);
  });

  if (!attendanceRow || !attendanceRow.attendanceDates) return false;

  const dates = Array.isArray(attendanceRow.attendanceDates) 
    ? attendanceRow.attendanceDates 
    : String(attendanceRow.attendanceDates).split(",").map(d => d.trim()).filter(Boolean);

  return dates.some((date) => {
    const normalizedDate = normalizeDateText(date);
    return normalizedDate >= startDate && normalizedDate <= endDate;
  });
}

function isBathRequiredAtDate(plan, name, targetDate, weekRange) {
  let required = hasBathPlan(plan);
  const counsel = getLatestBathCounsel(name, targetDate);

  if (counsel) {
    if (isRemoveCounsel(counsel)) required = false;
    if (isAddCounsel(counsel)) required = true;
  }

  return required;
}

function getCounselTextForMonth(name, monthEndDate) {
  const counsel = getLatestBathCounsel(name, monthEndDate);
  if (!counsel) return "없음";

  const counselDate = getCounselDate(counsel);
  let content = counsel.careContent || counsel.reason || "-";
  if (content.length > 15) {
    content = content.substring(0, 15) + "...";
  }
  return `${counselDate || "-"} / [${counsel.changeType || "-"}] <br/> ${content}`;
}

function parseBathCell(value) {
  const text = String(value || "").trim();
  if (!text) return null;

  const cleanText = normalizeText(text);
  if (cleanText.includes("일정없음")) return null;

  if (cleanText.includes("급여개시") || cleanText.includes("퇴소")) {
    return {
      hasRecord: false,
      isNotice: true,
      label: text
    };
  }

  if (cleanText.includes("목욕거부")) {
    return {
      hasRecord: true,
      label: "목욕거부"
    };
  }

  const hasTime = /\d{1,2}:\d{2}\s*~\s*\d{1,2}:\d{2}/.test(text);
  const hasDate = /\d{4}[.-]\d{2}[.-]\d{2}/.test(text);

  if (hasTime || hasDate) {
    return {
      hasRecord: true,
      label: text.replace(/\n/g, " ")
    };
  }
  return null;
}

function findWeekColumns(rows, headerIndex, weekNumber) {
  const targetTexts = [`${weekNumber}주`, `${weekNumber}주차`];
  const columns = [];

  for (let r = Math.max(0, headerIndex - 5); r <= headerIndex + 5; r++) {
    const row = rows[r] || [];
    row.forEach((cell, colIndex) => {
      const text = normalizeText(cell);
      if (targetTexts.some((target) => text.includes(target))) {
        columns.push(colIndex);
      }
    });
  }

  if (columns.length > 0) {
    return { start: Math.min(...columns), end: Math.max(...columns) };
  }
  const fallbackCol = 6 + (weekNumber - 1);
  return { start: fallbackCol, end: fallbackCol };
}

function parseBathReport(workbook) {
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];

  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  const headerIndex = rows.findIndex((row) => {
    return row.some((cell) => normalizeText(cell).includes("수급자명"));
  });

  if (headerIndex === -1) {
    alert("목욕 리포트에서 수급자명 열을 찾지 못했습니다.");
    return [];
  }

  const header = rows[headerIndex];
  const nameCol = header.findIndex((cell) => normalizeText(cell).includes("수급자명"));

  const weekRanges = {
    week1: findWeekColumns(rows, headerIndex, 1),
    week2: findWeekColumns(rows, headerIndex, 2),
    week3: findWeekColumns(rows, headerIndex, 3),
    week4: findWeekColumns(rows, headerIndex, 4),
    week5: findWeekColumns(rows, headerIndex, 5)
  };

  const result = [];
  for (let i = headerIndex + 1; i < rows.length; i++) {
    const row = rows[i];
    const name = String(row[nameCol] || "").trim();
    if (!name || name === "수급자명") continue;

    const weeks = {};
    Object.entries(weekRanges).forEach(([weekKey, range]) => {
      const cells = row.slice(range.start, range.end + 1);
      const records = cells.map(parseBathCell).filter((item) => item !== null);

      const hasRealBath = records.some(item => item.hasRecord === true);
      const hasNoticeTag = records.some(item => item.isNotice === true);

      weeks[weekKey] = {
        hasBathRecord: hasRealBath,
        isNotice: hasNoticeTag,
        recordText: records.length > 0 ? records.map((item) => item.label).join("<br/>") : "-"
      };
    });

    result.push({ name, weeks });
  }
  return result;
}

function getWeekResult(required, weekData, attended) {
  const hasRecord = weekData && weekData.hasBathRecord;
  
  // [결석 판정 추가]: 목욕이 원래 필요하고 기록이 없는데, 출석까지 아예 안 하셨다면 최종 '결석' 상태를 반환합니다.
  if (required && !hasRecord && !attended) {
    return "결석";
  }

  if (required && hasRecord) return "정상";
  if (required && !hasRecord) return "누락";
  if (!required && hasRecord) return "오류";
  return "정상";
}

// [결석 전용 디자인 설계]: 판정 결과가 '결석'일 때 연한 회색 배경 위에 [결석]이라는 글자가 나오도록 다듬습니다.
function buildWeekTdHtml(required, weekData, attended) {
  const result = getWeekResult(required, weekData, attended);
  const recordText = weekData ? weekData.recordText : "-";
  const isNotice = weekData ? weekData.isNotice : false;

  // 1단계: '급여개시'나 '퇴소' 공지사항 문구 연한 회색 처리
  if (isNotice) {
    return `
      <td style="background-color: #f3f4f6; color: #4b5563; font-weight: 500; text-align: center; vertical-align: middle; padding: 10px 5px; font-size: 13px;">
        ${recordText}
      </td>
    `;
  }

  // 2단계: 등원하지 않은 [결석] 주차 연한 회색 및 글자 가운데 정렬 처리
  if (result === "결석") {
    return `
      <td style="background-color: #f3f4f6; color: #6b7280; font-weight: 700; text-align: center; vertical-align: middle; padding: 10px 5px; font-size: 14px;">
        결석
      </td>
    `;
  }

  // 3단계: 일반 데이터 상태별 색상 처리
  let color = "#111";
  if (result === "정상") color = "#2563eb";
  if (result === "누락" || result === "오류") color = "#dc2626";

  return `
    <td style="text-align: center; vertical-align: middle; padding: 10px 5px;">
      <div style="color:${color}; font-weight:700;">${result}</div>
      <div style="font-size:12px; color:#555; margin-top:4px;">${recordText}</div>
    </td>
  `;
}

function buildOverallResult(weekResults) {
  // '결석'은 업무 과실(오류/누락)이 아니므로 종합 결과 판정할 때 정상 상태로 통과시킵니다.
  const hasError = weekResults.some((result) => result === "누락" || result === "오류");
  return hasError ? "확인 필요" : "정상";
}

function buildResults(monthValue, bathRows) {
  const monthEndDate = getMonthEndDate(monthValue);
  const weekRanges = getWeekRanges(monthValue); 
  const latestPlans = getLatestPlansByRecipient(monthEndDate);

  const bathMap = {};
  bathRows.forEach((row) => {
    bathMap[row.name] = row;
  });

  const allNames = new Set([...Object.keys(latestPlans), ...Object.keys(bathMap)]);
  const results = [];

  allNames.forEach((name) => {
    const plan = latestPlans[name];
    const bath = bathMap[name];

    const weeks = bath ? bath.weeks : {
      week1: { hasBathRecord: false, isNotice: false, recordText: "-" },
      week2: { hasBathRecord: false, isNotice: false, recordText: "-" },
      week3: { hasBathRecord: false, isNotice: false, recordText: "-" },
      week4: { hasBathRecord: false, isNotice: false, recordText: "-" },
      week5: { hasBathRecord: false, isNotice: false, recordText: "-" }
    };

    const weekRequired = {
      week1: isBathRequiredAtDate(plan, name, weekRanges.week1.end, weekRanges.week1),
      week2: isBathRequiredAtDate(plan, name, weekRanges.week2.end, weekRanges.week2),
      week3: isBathRequiredAtDate(plan, name, weekRanges.week3.end, weekRanges.week3),
      week4: isBathRequiredAtDate(plan, name, weekRanges.week4.end, weekRanges.week4),
      week5: isBathRequiredAtDate(plan, name, weekRanges.week5.end, weekRanges.week5)
    };

    // 주차별 출석 정보 사전에 수집
    const weekAttended = {
      week1: hasAttendanceInWeek(name, weekRanges.week1.start, weekRanges.week1.end),
      week2: hasAttendanceInWeek(name, weekRanges.week2.start, weekRanges.week2.end),
      week3: hasAttendanceInWeek(name, weekRanges.week3.start, weekRanges.week3.end),
      week4: hasAttendanceInWeek(name, weekRanges.week4.start, weekRanges.week4.end),
      week5: hasAttendanceInWeek(name, weekRanges.week5.start, weekRanges.week5.end)
    };

    const weekResults = [
      getWeekResult(weekRequired.week1, weeks.week1, weekAttended.week1),
      getWeekResult(weekRequired.week2, weeks.week2, weekAttended.week2),
      getWeekResult(weekRequired.week3, weeks.week3, weekAttended.week3),
      getWeekResult(weekRequired.week4, weeks.week4, weekAttended.week4),
      getWeekResult(weekRequired.week5, weeks.week5, weekAttended.week5)
    ];

    const anyRequired = Object.values(weekRequired).some(Boolean);

    results.push({
      name,
      planDate: plan ? plan.writtenDate : "-",
      counselText: getCounselTextForMonth(name, monthEndDate),
      requiredText: anyRequired ? "있음" : "없음",
      weekRequired,
      weekAttended, // 객체 바인딩 전달
      weeks,
      overallResult: buildOverallResult(weekResults)
    });
  });

  return results.sort((a, b) => a.name.localeCompare(b.name, "ko"));
}

function renderResults(results) {
  bathResultBody.innerHTML = "";
  if (!results || results.length === 0) {
    bathResultBody.innerHTML = `<tr class="empty-row"><td colspan="10">확인할 데이터가 없습니다.</td></tr>`;
    return;
  }
  results.forEach((item) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${item.name}</td>
      <td>${item.planDate ? String(item.planDate).substring(0, 10) : "-"}</td>
      <td>${item.counselText || "없음"}</td>
      <td>${item.requiredText || "없음"}</td>
      ${buildWeekTdHtml(item.weekRequired.week1, item.weeks.week1, item.weekAttended.week1)}
      ${buildWeekTdHtml(item.weekRequired.week2, item.weeks.week2, item.weekAttended.week2)}
      ${buildWeekTdHtml(item.weekRequired.week3, item.weeks.week3, item.weekAttended.week3)}
      ${buildWeekTdHtml(item.weekRequired.week4, item.weeks.week4, item.weekAttended.week4)}
      ${buildWeekTdHtml(item.weekRequired.week5, item.weeks.week5, item.weekAttended.week5)}
      <td style="color:${item.overallResult === "정상" ? "#2563eb" : "#dc2626"}; font-weight:700; vertical-align: middle;">${item.overallResult}</td>
    `;
    bathResultBody.appendChild(row);
  });
}

checkBathBtn.addEventListener("click", async () => {
  const checkMonth = checkMonthInput.value;
  const file = bathFileInput.files[0];

  if (!checkMonth) {
    alert("확인 월을 선택해주세요.");
    return;
  }
  if (!file) {
    alert("목욕 리포트 파일을 업로드해주세요.");
    return;
  }

  alert("구글 시트에서 계획서, 상담일지, 출석 데이터를 동기화 중입니다...");
  await syncCarePlanLibraryFromGoogleSheet();
  await syncCounselLibraryFromGoogleSheet();
  await syncAttendanceLibraryFromGoogleSheet(checkMonth);

  const reader = new FileReader();
  reader.onload = (event) => {
    const data = new Uint8Array(event.target.result);
    const workbook = XLSX.read(data, { type: "array" });

    const bathRows = parseBathReport(workbook);
    const results = buildResults(checkMonth, bathRows);
    renderResults(results);
  };
  reader.readAsArrayBuffer(file);
});

clearBathBtn.addEventListener("click", () => {
  checkMonthInput.value = "";
  bathFileInput.value = "";
  bathResultBody.innerHTML = `<tr class="empty-row"><td colspan="10">확인 월과 목욕 리포트 파일을 선택해주세요.</td></tr>`;
});

localStorage.removeItem("counselLibrary");
localStorage.removeItem("carePlanLibrary");

syncCarePlanLibraryFromGoogleSheet();
syncCounselLibraryFromGoogleSheet();
