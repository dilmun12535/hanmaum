const CARE_PLAN_API_URL = "https://script.google.com/macros/s/AKfycbyxbQ7GeDm7pq9SkYDSgGkt7GiKic878En8-niDDFuRg7-lyxo5F3E7LE5qYpqi2_Z14g/exec";

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

const checkMonthInput = document.getElementById("checkMonth");
const bathFileInput = document.getElementById("bathFile");
const checkBathBtn = document.getElementById("checkBathBtn");
const clearBathBtn = document.getElementById("clearBathBtn");
const bathResultBody = document.getElementById("bathResultBody");

function normalizeText(value) {
  return String(value || "").replace(/\s/g, "").trim();
}

function normalizeGrade(value) {
  const text = normalizeText(value);
  const match = text.match(/(인지지원등급|\d등급)/);
  return match ? match[1] : "";
}

function isSameRecipientExact(nameA, nameB) {
  const cleanA = normalizeText(nameA);
  const cleanB = normalizeText(nameB);
  if (!cleanA || !cleanB) return false;

  // 김계순 / 김계순A처럼 이름이 포함되는 경우를 서로 같은 사람으로 보지 않기 위해
  // includes 매칭을 사용하지 않고 완전 일치만 사용합니다.
  return cleanA === cleanB;
}

function makePersonKey(name, gender = "", grade = "") {
  return `${normalizeText(name)}__${normalizeText(gender)}__${normalizeGrade(grade)}`;
}

function getPlanGrade(plan) {
  if (!plan) return "";
  const directGrade = normalizeGrade(plan.grade || plan.level || plan.recipientGrade || plan.longTermGrade || "");
  if (directGrade) return directGrade;

  const text = normalizeText(JSON.stringify(plan.rows || plan.rowsJson || ""));
  const match = text.match(/(인지지원등급|\d등급)/);
  return match ? match[1] : "";
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
    }))
    .filter((item) => String(item.name || "").trim());
}

function getWeekEndDates(monthValue) {
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

    const targetDate = new Date(Math.min(weekEnd.getTime(), monthEnd.getTime()));
    result[`week${i + 1}`] =
      `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, "0")}-${String(targetDate.getDate()).padStart(2, "0")}`;
  }
  return result;
}

function getWeekStartDates(monthValue) {
  const [year, month] = monthValue.split("-").map(Number);
  const monthStart = new Date(year, month - 1, 1);

  const firstDay = monthStart.getDay();
  const mondayOffset = (firstDay + 6) % 7;

  const firstMonday = new Date(monthStart);
  firstMonday.setDate(monthStart.getDate() - mondayOffset);

  const result = {};
  for (let i = 0; i < 5; i++) {
    const weekStart = new Date(firstMonday);
    weekStart.setDate(firstMonday.getDate() + i * 7);

    const targetDate = new Date(Math.max(weekStart.getTime(), monthStart.getTime()));
    result[`week${i + 1}`] =
      `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, "0")}-${String(targetDate.getDate()).padStart(2, "0")}`;
  }
  return result;
}

function extractFirstDateFromBathWeek(weekData) {
  if (!weekData || !weekData.recordText) return "";
  const text = String(weekData.recordText || "");

  const match = text.match(/(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/);
  if (!match) return "";

  return `${match[1]}-${String(match[2]).padStart(2, "0")}-${String(match[3]).padStart(2, "0")}`;
}

function getWeekJudgeDate(monthValue, weekKey, weekData, weekStartDates, weekEndDates) {
  const recordDate = extractFirstDateFromBathWeek(weekData);

  // 실제 목욕 기록이 있는 주차는 기록일 기준으로 계획서/상담일지를 비교합니다.
  // 예: 2024-01-01 목욕 기록은 2024-01-18 계획서보다 앞이므로 상담일지 기준이 적용되어야 합니다.
  if (recordDate && recordDate.startsWith(monthValue)) return recordDate;

  // 기록이 없는 경우에는 해당 주차 종료일 기준으로 누락 여부를 판단합니다.
  // 단, 이 날짜는 월말이 아니라 주차별 날짜라서 새 계획서가 월 전체에 소급 적용되지 않습니다.
  return weekEndDates[weekKey] || weekStartDates[weekKey] || getMonthEndDate(monthValue);
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

function getLatestPlanForRecipientAtDate(name, targetDate, grade = "") {
  const targetDateText = normalizeDateText(targetDate);
  const targetName = normalizeText(name);
  const targetGrade = normalizeGrade(grade);

  const exactNamePlans = carePlanLibraryCache
    .filter((plan) => {
      const planName = normalizeText(plan.recipientName || "");
      const writtenDate = normalizeDateText(plan.writtenDate);
      return planName === targetName && writtenDate && writtenDate <= targetDateText;
    })
    .sort((a, b) => normalizeDateText(b.writtenDate).localeCompare(normalizeDateText(a.writtenDate)));

  if (targetGrade) {
    const gradeMatched = exactNamePlans.find((plan) => {
      const planGrade = getPlanGrade(plan);
      return !planGrade || planGrade === targetGrade;
    });
    if (gradeMatched) return gradeMatched;
  }

  return exactNamePlans[0] || null;
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
      const sameName = itemName === targetName;
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

function getBathBenefitAtDate(plan, name, targetDate, grade = "") {
  const latestPlan = plan || getLatestPlanForRecipientAtDate(name, targetDate, grade);
  const planDate = latestPlan ? normalizeDateText(latestPlan.writtenDate) : "";
  const planRequired = hasBathPlan(latestPlan);

  const counsel = getLatestBathCounsel(name, targetDate);
  const counselDate = counsel ? getCounselDate(counsel) : "";

  // 상담일지가 없으면 계획서 기준
  if (!counsel) {
    return {
      required: planRequired,
      source: "계획서"
    };
  }

  // 계획서 작성일이 상담일지 반영일과 같거나 더 최신이면 계획서 기준
  // 예: 상담일지 2024-04-30 추가 → 계획서 2024-05-30 작성이면 계획서가 최종 기준
  if (planDate && counselDate && planDate >= counselDate) {
    return {
      required: planRequired,
      source: "계획서"
    };
  }

  // 상담일지가 더 최신이면 상담일지 기준
  if (isRemoveCounsel(counsel)) {
    return {
      required: false,
      source: "상담"
    };
  }

  if (isAddCounsel(counsel)) {
    return {
      required: true,
      source: "상담"
    };
  }

  // 상담 내용이 애매하면 계획서 기준으로 안전 처리
  return {
    required: planRequired,
    source: "계획서"
  };
}

function isBathRequiredAtDate(plan, name, targetDate, grade = "") {
  return getBathBenefitAtDate(plan, name, targetDate, grade).required;
}

function buildBenefitSourceHtml(benefit) {
  const requiredText = benefit && benefit.required ? "있음" : "없음";
  const sourceText = benefit && benefit.source ? benefit.source : "계획서";
  const mainColor = benefit && benefit.required ? "#2563eb" : "#64748b";

  return `
    <div style="font-weight: 800; color: ${mainColor};">${requiredText}</div>
    <div style="font-size: 11px; color: #64748b; margin-top: 3px;">[${sourceText}]</div>
  `;
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

  // [개선 핵심]: 일정없음, 급여개시전, 급여개시, 퇴소 텍스트가 확인되면 누락 없이 명확하게 isGreyBlock 처리를 내려줍니다.
  if (cleanText.includes("일정없음") || cleanText.includes("급여개시전") || cleanText.includes("급여개시") || cleanText.includes("퇴소")) {
    let formattedLabel = text;
    
    if (text.includes("급여개시 전") && text.replace("급여개시 전", "").trim().length > 0) {
      formattedLabel = "급여개시 전<br/>" + text.replace("급여개시 전", "").trim();
    } else if (text.includes("급여개시") && !text.includes("전") && text.replace("급여개시", "").trim().length > 0) {
      formattedLabel = "급여개시<br/>" + text.replace("급여개시", "").trim();
    } else if (text.includes("퇴소") && text.replace("퇴소", "").trim().length > 0) {
      formattedLabel = "퇴소<br/>" + text.replace("퇴소", "").trim();
    } else if (text.includes("일정없음") && text.replace("일정없음", "").trim().length > 0) {
      formattedLabel = "일정없음<br/>" + text.replace("일정없음", "").trim();
    }

    return {
      hasRecord: false,
      isGreyBlock: true,
      label: formattedLabel
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
  const genderCol = header.findIndex((cell) => normalizeText(cell).includes("성별"));
  const gradeCol = header.findIndex((cell) => normalizeText(cell).includes("등급"));

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

    const gender = genderCol >= 0 ? String(row[genderCol] || "").trim() : "";
    const grade = gradeCol >= 0 ? String(row[gradeCol] || "").trim() : "";

    const weeks = {};
    Object.entries(weekRanges).forEach(([weekKey, range]) => {
      const cells = row.slice(range.start, range.end + 1);
      const records = cells.map(parseBathCell).filter((item) => item !== null);

      const hasRealBath = records.some(item => item.hasRecord === true);
      const hasGreyBlockTag = records.some(item => item.isGreyBlock === true);

      weeks[weekKey] = {
        hasBathRecord: hasRealBath,
        isGreyBlock: hasGreyBlockTag,
        recordText: records.length > 0 ? records.map((item) => item.label).join("<br/>") : "-"
      };
    });

    result.push({ name, gender, grade, personKey: makePersonKey(name, gender, grade), weeks });
  }
  return result;
}

function getWeekResult(required, weekData) {
  // 회색 블록 처리된 주차(일정없음, 급여개시전 등)는 무조건 '정상'으로 반환해 오류 및 누락에서 제외합니다.
  if (weekData && weekData.isGreyBlock) return "정상";
  
  const hasRecord = weekData && weekData.hasBathRecord;
  if (required && hasRecord) return "정상";
  if (required && !hasRecord) return "누락";
  if (!required && hasRecord) return "오류";
  return "정상";
}

function buildWeekTdHtml(required, weekData) {
  const result = getWeekResult(required, weekData);
  const recordText = weekData ? weekData.recordText : "-";
  const isGreyBlock = weekData ? weekData.isGreyBlock : false;

  if (isGreyBlock) {
    return `
      <td style="background-color: #f8fafc; color: #334155; font-weight: 600; text-align: center; vertical-align: middle; padding: 12px 6px; font-size: 13px; line-height: 1.4; border: 1px solid #e2e8f0;">
        ${recordText}
      </td>
    `;
  }

  let color = "#1e293b";
  if (result === "정상") color = "#2563eb";
  if (result === "누락" || result === "오류") color = "#e11d48";

  return `
    <td style="text-align: center; vertical-align: middle; padding: 12px 6px; border: 1px solid #e2e8f0;">
      <div style="color:${color}; font-weight:800; font-size:14px; margin-bottom: 4px;">${result}</div>
      <div style="font-size:12px; color:#64748b; line-height: 1.3;">${recordText}</div>
    </td>
  `;
}

function buildOverallResult(weekResults) {
  const hasError = weekResults.some((result) => result === "누락" || result === "오류");
  return hasError ? "확인 필요" : "정상";
}

function buildResults(monthValue, bathRows) {
  const monthEndDate = getMonthEndDate(monthValue);
  const weekEndDates = getWeekEndDates(monthValue);
  const weekStartDates = getWeekStartDates(monthValue);
  const attendanceRows = getAttendanceMonth(monthValue);

  const bathMap = {};
  bathRows.forEach((row) => {
    const name = String(row.name || "").trim();
    if (!name) return;
    const key = row.personKey || makePersonKey(row.name, row.gender, row.grade);
    bathMap[key] = row;
  });

  const personMap = {};

  // 목욕 파일 명단: 수급자명 + 성별 + 등급을 함께 보관
  bathRows.forEach((row) => {
    const key = row.personKey || makePersonKey(row.name, row.gender, row.grade);
    if (!key.startsWith("__")) {
      personMap[key] = {
        key,
        name: row.name,
        gender: row.gender || "",
        grade: row.grade || ""
      };
    }
  });

  // 출석부 명단: 출석부에는 성별/등급이 없을 수 있어 이름만 보관
  attendanceRows.forEach((attendance) => {
    const name = String(attendance.name || "").trim();
    if (!name) return;

    const alreadyExists = Object.values(personMap).some((person) => isSameRecipientExact(person.name, name));
    if (!alreadyExists) {
      const key = makePersonKey(name);
      personMap[key] = {
        key,
        name,
        gender: "",
        grade: ""
      };
    }
  });

  const results = [];

  Object.values(personMap).forEach((person) => {
    const name = person.name;
    const grade = person.grade || "";
    const bath = bathMap[person.key] || Object.values(bathMap).find((item) => isSameRecipientExact(item.name, name));

    const weeks = bath ? bath.weeks : {
      week1: { hasBathRecord: false, isGreyBlock: false, recordText: "-" },
      week2: { hasBathRecord: false, isGreyBlock: false, recordText: "-" },
      week3: { hasBathRecord: false, isGreyBlock: false, recordText: "-" },
      week4: { hasBathRecord: false, isGreyBlock: false, recordText: "-" },
      week5: { hasBathRecord: false, isGreyBlock: false, recordText: "-" }
    };

    const weekJudgeDates = {
      week1: getWeekJudgeDate(monthValue, "week1", weeks.week1, weekStartDates, weekEndDates),
      week2: getWeekJudgeDate(monthValue, "week2", weeks.week2, weekStartDates, weekEndDates),
      week3: getWeekJudgeDate(monthValue, "week3", weeks.week3, weekStartDates, weekEndDates),
      week4: getWeekJudgeDate(monthValue, "week4", weeks.week4, weekStartDates, weekEndDates),
      week5: getWeekJudgeDate(monthValue, "week5", weeks.week5, weekStartDates, weekEndDates)
    };

    const weekBenefit = {
      week1: getBathBenefitAtDate(getLatestPlanForRecipientAtDate(name, weekJudgeDates.week1, grade), name, weekJudgeDates.week1, grade),
      week2: getBathBenefitAtDate(getLatestPlanForRecipientAtDate(name, weekJudgeDates.week2, grade), name, weekJudgeDates.week2, grade),
      week3: getBathBenefitAtDate(getLatestPlanForRecipientAtDate(name, weekJudgeDates.week3, grade), name, weekJudgeDates.week3, grade),
      week4: getBathBenefitAtDate(getLatestPlanForRecipientAtDate(name, weekJudgeDates.week4, grade), name, weekJudgeDates.week4, grade),
      week5: getBathBenefitAtDate(getLatestPlanForRecipientAtDate(name, weekJudgeDates.week5, grade), name, weekJudgeDates.week5, grade)
    };

    const weekRequired = {
      week1: weekBenefit.week1.required,
      week2: weekBenefit.week2.required,
      week3: weekBenefit.week3.required,
      week4: weekBenefit.week4.required,
      week5: weekBenefit.week5.required
    };

    const weekResults = [
      getWeekResult(weekRequired.week1, weeks.week1),
      getWeekResult(weekRequired.week2, weeks.week2),
      getWeekResult(weekRequired.week3, weeks.week3),
      getWeekResult(weekRequired.week4, weeks.week4),
      getWeekResult(weekRequired.week5, weeks.week5)
    ];

    const monthPlan = getLatestPlanForRecipientAtDate(name, monthEndDate, grade);
    const monthBathBenefit = getBathBenefitAtDate(monthPlan, name, monthEndDate, grade);

    results.push({
      name,
      gender: person.gender || "",
      grade,
      planDate: monthPlan ? monthPlan.writtenDate : "-",
      counselText: getCounselTextForMonth(name, monthEndDate),
      requiredText: monthBathBenefit.required ? "있음" : "없음",
      bathBenefit: monthBathBenefit,
      weekBenefit,
      weekJudgeDates,
      weekRequired,
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
    
    if (item.overallResult === "확인 필요") {
      row.style.backgroundColor = "#fff5f5"; 
    } else {
      row.style.backgroundColor = "#ffffff";
    }

    row.innerHTML = `
      <td style="font-weight: 600; color: #1e293b; vertical-align: middle; border: 1px solid #e2e8f0; text-align: center;">${item.name}</td>
      <td style="vertical-align: middle; border: 1px solid #e2e8f0; text-align: center;">${item.planDate ? String(item.planDate).substring(0, 10) : "-"}</td>
      <td style="text-align: left; line-height: 1.4; padding: 8px; vertical-align: middle; border: 1px solid #e2e8f0;">${item.counselText || "없음"}</td>
      <td style="font-weight: 500; vertical-align: middle; border: 1px solid #e2e8f0; text-align: center;">${buildBenefitSourceHtml(item.bathBenefit)}</td>
      ${buildWeekTdHtml(item.weekRequired.week1, item.weeks.week1)}
      ${buildWeekTdHtml(item.weekRequired.week2, item.weeks.week2)}
      ${buildWeekTdHtml(item.weekRequired.week3, item.weeks.week3)}
      ${buildWeekTdHtml(item.weekRequired.week4, item.weeks.week4)}
      ${buildWeekTdHtml(item.weekRequired.week5, item.weeks.week5)}
      <td style="color:${item.overallResult === "정상" ? "#2563eb" : "#e11d48"}; font-weight:800; vertical-align: middle; border: 1px solid #e2e8f0; text-align: center;">${item.overallResult}</td>
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
  await syncAttendanceMonthFromGoogleSheet(checkMonth);

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
