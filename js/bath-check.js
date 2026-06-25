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

function makeNameGradeKey(name, grade = "") {
  return `${normalizeText(name)}__${normalizeGrade(grade)}`;
}

function makePersonKey(name, gender = "", grade = "") {
  return `${normalizeText(name)}__${normalizeText(gender)}__${normalizeGrade(grade)}`;
}

function makePlanPersonKey(name, longTermNumber = "") {
  return `${normalizeText(name)}__${normalizeText(longTermNumber)}`;
}

function getLongTermNumberFromItem(item) {
  if (!item) return "";
  return normalizeText(
    item.longTermNumber ||
    item.longTermNo ||
    item.certNumber ||
    item.recipientNo ||
    item.recipientNumber ||
    item.ltcNumber ||
    item.LNumber ||
    ""
  );
}

function getAttendanceGrade(item) {
  if (!item) return "";
  return normalizeGrade(
    item.grade ||
    item.level ||
    item.recipientGrade ||
    item.longTermGrade ||
    item.careGrade ||
    item["등급"] ||
    ""
  );
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
      gender: item.gender || item.sex || item["성별"] || "",
      grade: getAttendanceGrade(item),
      longTermNumber: getLongTermNumberFromItem(item),
      dates: Array.isArray(item.attendanceDates)
        ? item.attendanceDates
        : Array.isArray(item.dates)
          ? item.dates
          : []
    }))
    .filter((item) => String(item.name || "").trim());
}

function cloneWeeks(weeks) {
  const source = weeks || {};
  return {
    week1: { hasBathRecord: false, isGreyBlock: false, recordText: "-", ...(source.week1 || {}) },
    week2: { hasBathRecord: false, isGreyBlock: false, recordText: "-", ...(source.week2 || {}) },
    week3: { hasBathRecord: false, isGreyBlock: false, recordText: "-", ...(source.week3 || {}) },
    week4: { hasBathRecord: false, isGreyBlock: false, recordText: "-", ...(source.week4 || {}) },
    week5: { hasBathRecord: false, isGreyBlock: false, recordText: "-", ...(source.week5 || {}) }
  };
}

function getAttendanceDateList(attendance) {
  if (!attendance) return [];

  const rawDates = Array.isArray(attendance.dates)
    ? attendance.dates
    : Array.isArray(attendance.attendanceDates)
      ? attendance.attendanceDates
      : [];

  return rawDates
    .map((date) => normalizeDateText(date))
    .filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date));
}

function hasAttendanceBetween(attendance, startDate, endDate) {
  const start = normalizeDateText(startDate);
  const end = normalizeDateText(endDate);
  if (!start || !end) return true;

  return getAttendanceDateList(attendance).some((date) => date >= start && date <= end);
}

function applyAbsenceByAttendance(weeks, attendance, weekStartDates, weekEndDates) {
  const result = cloneWeeks(weeks);

  // 출석 데이터가 매칭되지 않은 사람은 결석 여부를 확정할 수 없으므로 기존 판정을 유지합니다.
  if (!attendance) return result;

  ["week1", "week2", "week3", "week4", "week5"].forEach((weekKey) => {
    const week = result[weekKey];
    if (!week || week.hasBathRecord || week.isGreyBlock) return;

    const attendedThisWeek = hasAttendanceBetween(attendance, weekStartDates[weekKey], weekEndDates[weekKey]);
    if (!attendedThisWeek) {
      result[weekKey] = {
        ...week,
        hasBathRecord: false,
        isGreyBlock: true,
        recordText: "결석"
      };
    }
  });

  return result;
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


function formatWeekRangeDate(dateText) {
  const normalized = normalizeDateText(dateText);
  if (!normalized || normalized.length < 10) return "-";
  const [, month, day] = normalized.split("-");
  return `${month}.${day}`;
}

function buildWeekHeaderHtml(weekNumber, startDate, endDate) {
  return `
    <div style="font-weight: 800; color: #0f3a8a;">${weekNumber}주차</div>
    <div style="font-size: 11px; color: #64748b; font-weight: 600; margin-top: 4px; line-height: 1.2;">
      ${formatWeekRangeDate(startDate)} ~ ${formatWeekRangeDate(endDate)}
    </div>
  `;
}

function updateWeekHeaders(monthValue) {
  if (!monthValue || !bathResultBody) return;

  const table = bathResultBody.closest("table");
  if (!table) return;

  const weekStartDates = getWeekStartDates(monthValue);
  const weekEndDates = getWeekEndDates(monthValue);

  for (let i = 1; i <= 5; i++) {
    const weekKey = `week${i}`;
    const headerCell = Array.from(table.querySelectorAll("thead th, tr th")).find((th) => {
      const text = normalizeText(th.textContent || "");
      return text === `${i}주차` || text.includes(`${i}주차`);
    });

    if (headerCell) {
      headerCell.innerHTML = buildWeekHeaderHtml(i, weekStartDates[weekKey], weekEndDates[weekKey]);
    }
  }
}

function extractFirstDateFromBathWeek(weekData) {
  if (!weekData || !weekData.recordText) return "";
  const text = String(weekData.recordText || "");

  const match = text.match(/(\d{4})[.\-/년\s]*(\d{1,2})[.\-/월\s]*(\d{1,2})/);
  if (!match) return "";

  return `${match[1]}-${String(match[2]).padStart(2, "0")}-${String(match[3]).padStart(2, "0")}`;
}

function getWeekJudgeDate(monthValue, weekKey, weekData, weekStartDates, weekEndDates) {
  const recordDate = extractFirstDateFromBathWeek(weekData);

  // 실제 목욕 기록이 있는 주차는 기록일 기준으로 계획서/상담일지를 비교합니다.
  // 예: 2024-01-01 목욕 기록은 2024-01-18 계획서보다 앞이므로 상담일지 기준이 적용되어야 합니다.
  if (recordDate) return recordDate;

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

function getLatestPlanForRecipientAtDate(name, targetDate, grade = "", longTermNumber = "") {
  const targetDateText = normalizeDateText(targetDate);
  const targetName = normalizeText(name);
  const targetGrade = normalizeGrade(grade);
  const targetLongTermNumber = normalizeText(longTermNumber);

  const validPlans = carePlanLibraryCache
    .filter((plan) => {
      const writtenDate = normalizeDateText(plan.writtenDate);
      if (!writtenDate || writtenDate > targetDateText) return false;

      const planName = normalizeText(plan.recipientName || "");
      const planLongTermNumber = getLongTermNumberFromItem(plan);

      // 출석관리에서 인정번호를 가져올 수 있으면 인정번호로 먼저 정확히 구분합니다.
      if (targetLongTermNumber && planLongTermNumber) {
        return planLongTermNumber === targetLongTermNumber;
      }

      return planName === targetName;
    })
    .sort((a, b) => normalizeDateText(b.writtenDate).localeCompare(normalizeDateText(a.writtenDate)));

  if (targetLongTermNumber) {
    const numberMatched = validPlans.find((plan) => getLongTermNumberFromItem(plan) === targetLongTermNumber);
    if (numberMatched) return numberMatched;
  }

  if (targetGrade) {
    const gradeMatched = validPlans.find((plan) => {
      const planGrade = getPlanGrade(plan);
      return !planGrade || planGrade === targetGrade;
    });
    if (gradeMatched) return gradeMatched;
  }

  return validPlans[0] || null;
}

function hasBathPlan(plan) {
  if (!plan || !plan.rows) return false;
  const text = normalizeText(JSON.stringify(plan.rows));
  return text.includes("몸씻기도움") || text.includes("몸씻기") || text.includes("목욕") || text.includes("B52");
}

function getCounselDate(counsel) {
  if (!counsel) return "";

  // 상담 작성일이 아니라 실제 반영일을 우선 적용합니다.
  return normalizeDateText(
    counsel.reflectionDate ||
    counsel.reflection ||
    counsel.applyDate ||
    counsel.changeDate ||
    counsel.effectiveDate ||
    counsel.startDate ||
    counsel.consultDate ||
    counsel.date ||
    counsel.counselDate ||
    counsel.writtenDate ||
    ""
  );
}

function isPureBathCounsel(item) {
  const categoryText = normalizeText(item.category || "");
  const contentText = normalizeText(item.careContent || "");
  const reasonText = normalizeText(item.reason || "");
  const changeText = normalizeText(item.changeType || "");
  const totalContent = categoryText + changeText + contentText + reasonText;

  // 옷입기/기저귀 등 다른 급여가 목욕으로 오인되지 않도록 제외
  if (totalContent.includes("기저귀")) return false;
  if (totalContent.includes("옷입기") || totalContent.includes("의복")) return false;

  return (
    totalContent.includes("목욕") ||
    totalContent.includes("몸씻기") ||
    totalContent.includes("몸씻기도움") ||
    totalContent.includes("세신") ||
    totalContent.includes("샤워")
  );
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

function getBathBenefitAtDate(plan, name, targetDate, grade = "", longTermNumber = "") {
  const targetDateText = normalizeDateText(targetDate);

  let latestPlan = plan || getLatestPlanForRecipientAtDate(name, targetDateText, grade, longTermNumber);
  let planDate = latestPlan ? normalizeDateText(latestPlan.writtenDate) : "";

  // 방어 로직: 혹시 미래 계획서가 들어오면 해당 날짜 판정에서 제외
  if (planDate && targetDateText && planDate > targetDateText) {
    latestPlan = getLatestPlanForRecipientAtDate(name, targetDateText, grade, longTermNumber);
    planDate = latestPlan ? normalizeDateText(latestPlan.writtenDate) : "";
  }

  const planRequired = hasBathPlan(latestPlan);
  const counsel = getLatestBathCounsel(name, targetDateText);
  const counselDate = counsel ? getCounselDate(counsel) : "";

  if (!counsel || (counselDate && targetDateText && counselDate > targetDateText)) {
    return {
      required: planRequired,
      source: "계획서"
    };
  }

  // 핵심 기준:
  // 상담일지 반영일이 해당 날짜 기준 최신 계획서보다 같거나 최신이면 상담 기준
  // 해당 날짜보다 뒤에 작성된 계획서는 과거 주차에 소급 적용하지 않습니다.
  const counselIsLatest = !planDate || counselDate >= planDate;

  if (counselIsLatest) {
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
  }

  return {
    required: planRequired,
    source: "계획서"
  };
}

function isBathRequiredAtDate(plan, name, targetDate, grade = "", longTermNumber = "") {
  return getBathBenefitAtDate(plan, name, targetDate, grade, longTermNumber).required;
}

function getBathBenefitForWeek(plan, name, targetDate, grade = "", monthPlan = null, longTermNumber = "") {
  const targetDateText = normalizeDateText(targetDate);
  const monthPlanDate = monthPlan ? normalizeDateText(monthPlan.writtenDate) : "";

  const counsel = getLatestBathCounsel(name, targetDateText);
  const counselDate = counsel ? getCounselDate(counsel) : "";

  /*
    핵심 보정:
    확인월 최종 계획서가 상담일지보다 나중에 작성된 경우,
    상담일지 반영일 ~ 그 계획서 작성일 전날까지는 상담일지 기준으로 봅니다.

    예)
    2023-12-11 상담일지 [추가]
    2024-01-27 계획서 작성

    2023-12-11 ~ 2024-01-26 : 상담 기준
    2024-01-27부터 : 계획서 기준
  */
  if (
    counsel &&
    counselDate &&
    targetDateText &&
    targetDateText >= counselDate &&
    monthPlanDate &&
    monthPlanDate > counselDate &&
    targetDateText < monthPlanDate
  ) {
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
  }

  return getBathBenefitAtDate(plan, name, targetDateText, grade, longTermNumber);
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

  // 일정없음, 급여개시전, 급여개시, 퇴소, 결석은 누락/오류가 아니라 사유가 있는 주차로 처리합니다.
  if (
    cleanText.includes("일정없음") ||
    cleanText.includes("급여개시전") ||
    cleanText.includes("급여개시") ||
    cleanText.includes("퇴소") ||
    cleanText.includes("결석")
  ) {
    const isAbsent = cleanText.includes("결석");
    let formattedLabel = text;
    
    if (isAbsent) {
      formattedLabel = "결석";
    } else if (text.includes("급여개시 전") && text.replace("급여개시 전", "").trim().length > 0) {
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
      isAbsent,
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
      const hasAbsentTag = records.some(item => item.isAbsent === true);

      weeks[weekKey] = {
        hasBathRecord: hasRealBath,
        isGreyBlock: hasGreyBlockTag,
        isAbsent: hasAbsentTag,
        recordText: records.length > 0 ? records.map((item) => item.label).join("<br/>") : "-"
      };
    });

    result.push({ name, gender, grade, personKey: makePersonKey(name, gender, grade), weeks });
  }
  return result;
}

function getWeekResult(required, weekData) {
  // 결석은 누락/오류가 아니라 결석으로 표시하고, 종합 결과에서는 정상 흐름으로 봅니다.
  if (weekData && weekData.isAbsent) return "결석";

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
  const isAbsent = weekData ? weekData.isAbsent : false;

  if (isAbsent) {
    return `
      <td style="background-color: #f8fafc; color: #f59e0b; font-weight: 800; text-align: center; vertical-align: middle; padding: 12px 6px; font-size: 14px; line-height: 1.4; border: 1px solid #e2e8f0;">
        결석
      </td>
    `;
  }

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

  const emptyWeeks = {
    week1: { hasBathRecord: false, isGreyBlock: false, isAbsent: false, recordText: "-" },
    week2: { hasBathRecord: false, isGreyBlock: false, isAbsent: false, recordText: "-" },
    week3: { hasBathRecord: false, isGreyBlock: false, isAbsent: false, recordText: "-" },
    week4: { hasBathRecord: false, isGreyBlock: false, isAbsent: false, recordText: "-" },
    week5: { hasBathRecord: false, isGreyBlock: false, isAbsent: false, recordText: "-" }
  };

  const bathMapByPersonKey = {};
  const bathMapByNameGrade = {};
  const bathNameCount = {};

  bathRows.forEach((row) => {
    const name = String(row.name || "").trim();
    if (!name) return;

    const personKey = row.personKey || makePersonKey(row.name, row.gender, row.grade);
    const nameGradeKey = makeNameGradeKey(row.name, row.grade);

    bathMapByPersonKey[personKey] = row;
    if (normalizeGrade(row.grade)) {
      bathMapByNameGrade[nameGradeKey] = row;
    }

    const cleanName = normalizeText(name);
    bathNameCount[cleanName] = (bathNameCount[cleanName] || 0) + 1;
  });

  const attendanceMapByNameGrade = {};
  const attendanceNameCount = {};

  attendanceRows.forEach((attendance) => {
    const name = String(attendance.name || "").trim();
    if (!name) return;

    const grade = normalizeGrade(attendance.grade);
    const nameGradeKey = makeNameGradeKey(name, grade);
    attendanceMapByNameGrade[nameGradeKey] = attendance;

    const cleanName = normalizeText(name);
    attendanceNameCount[cleanName] = (attendanceNameCount[cleanName] || 0) + 1;
  });

  const personMap = {};

  // 1) 출석관리 명단을 우선 기준으로 사용합니다.
  // 출석관리에는 등급이 있으므로 동명이인 구분용 기준이 됩니다.
  attendanceRows.forEach((attendance) => {
    const name = String(attendance.name || "").trim();
    if (!name) return;

    const grade = normalizeGrade(attendance.grade);
    const longTermNumber = getLongTermNumberFromItem(attendance);
    const key = grade ? makeNameGradeKey(name, grade) : makePlanPersonKey(name, longTermNumber || "attendance");

    personMap[key] = {
      key,
      name,
      gender: attendance.gender || "",
      grade,
      longTermNumber
    };
  });

  // 2) 목욕 리포트에만 있는 명단도 빠지지 않게 추가합니다.
  bathRows.forEach((row) => {
    const name = String(row.name || "").trim();
    if (!name) return;

    const grade = normalizeGrade(row.grade);
    const matchedAttendance = grade ? attendanceMapByNameGrade[makeNameGradeKey(name, grade)] : null;
    const longTermNumber = matchedAttendance ? getLongTermNumberFromItem(matchedAttendance) : "";
    const key = grade ? makeNameGradeKey(name, grade) : (row.personKey || makePersonKey(row.name, row.gender, row.grade));

    if (!personMap[key]) {
      personMap[key] = {
        key,
        name,
        gender: row.gender || "",
        grade,
        longTermNumber
      };
    }
  });

  const results = [];

  Object.values(personMap).forEach((person) => {
    const name = person.name;
    const grade = normalizeGrade(person.grade);
    const longTermNumber = normalizeText(person.longTermNumber);
    const cleanName = normalizeText(name);

    let bath = null;
    const matchedAttendance = grade ? attendanceMapByNameGrade[makeNameGradeKey(name, grade)] || null : null;

    // 목욕 리포트에 등급이 있으면 이름+등급으로 매칭합니다.
    if (grade) {
      bath = bathMapByNameGrade[makeNameGradeKey(name, grade)] || null;
    }

    // 등급이 없는 경우에만 기존 personKey로 찾습니다.
    if (!bath) {
      bath = bathMapByPersonKey[person.key] || null;
    }

    // 동명이인이 아닌 경우에만 이름 단독 매칭을 허용합니다.
    // 같은 이름이 여러 명이면 이름만으로 목욕 기록을 붙이지 않습니다.
    if (!bath && (bathNameCount[cleanName] || 0) === 1 && (attendanceNameCount[cleanName] || 0) <= 1) {
      bath = bathRows.find((item) => isSameRecipientExact(item.name, name)) || null;
    }

    const rawWeeks = bath ? bath.weeks : emptyWeeks;
    const attendanceForAbsence = matchedAttendance || attendanceRows.find((item) => {
      if (!isSameRecipientExact(item.name, name)) return false;
      const itemGrade = normalizeGrade(item.grade);
      return !grade || !itemGrade || itemGrade === grade;
    }) || null;
    const weeks = applyAbsenceByAttendance(rawWeeks, attendanceForAbsence, weekStartDates, weekEndDates);

    const weekJudgeDates = {
      week1: getWeekJudgeDate(monthValue, "week1", weeks.week1, weekStartDates, weekEndDates),
      week2: getWeekJudgeDate(monthValue, "week2", weeks.week2, weekStartDates, weekEndDates),
      week3: getWeekJudgeDate(monthValue, "week3", weeks.week3, weekStartDates, weekEndDates),
      week4: getWeekJudgeDate(monthValue, "week4", weeks.week4, weekStartDates, weekEndDates),
      week5: getWeekJudgeDate(monthValue, "week5", weeks.week5, weekStartDates, weekEndDates)
    };

    const monthPlan = getLatestPlanForRecipientAtDate(name, monthEndDate, grade, longTermNumber);

    const weekBenefit = {
      week1: getBathBenefitForWeek(getLatestPlanForRecipientAtDate(name, weekJudgeDates.week1, grade, longTermNumber), name, weekJudgeDates.week1, grade, monthPlan, longTermNumber),
      week2: getBathBenefitForWeek(getLatestPlanForRecipientAtDate(name, weekJudgeDates.week2, grade, longTermNumber), name, weekJudgeDates.week2, grade, monthPlan, longTermNumber),
      week3: getBathBenefitForWeek(getLatestPlanForRecipientAtDate(name, weekJudgeDates.week3, grade, longTermNumber), name, weekJudgeDates.week3, grade, monthPlan, longTermNumber),
      week4: getBathBenefitForWeek(getLatestPlanForRecipientAtDate(name, weekJudgeDates.week4, grade, longTermNumber), name, weekJudgeDates.week4, grade, monthPlan, longTermNumber),
      week5: getBathBenefitForWeek(getLatestPlanForRecipientAtDate(name, weekJudgeDates.week5, grade, longTermNumber), name, weekJudgeDates.week5, grade, monthPlan, longTermNumber)
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

    const monthBathBenefit = getBathBenefitAtDate(monthPlan, name, monthEndDate, grade, longTermNumber);
    const displayCounselDate = Object.values(weekJudgeDates)
      .filter(Boolean)
      .sort()
      .slice(-1)[0] || monthEndDate;

    const duplicateNameNeedsCheck = !grade && ((bathNameCount[cleanName] || 0) > 1 || (attendanceNameCount[cleanName] || 0) > 1);
    const overallResult = duplicateNameNeedsCheck ? "확인 필요" : buildOverallResult(weekResults);

    results.push({
      name,
      gender: person.gender || "",
      grade,
      longTermNumber,
      planDate: monthPlan ? monthPlan.writtenDate : "-",
      counselText: getCounselTextForMonth(name, displayCounselDate),
      requiredText: monthBathBenefit.required ? "있음" : "없음",
      bathBenefit: monthBathBenefit,
      weekBenefit,
      weekJudgeDates,
      weekRequired,
      weeks,
      duplicateNameNeedsCheck,
      overallResult
    });
  });

  return results.sort((a, b) => {
    const nameCompare = a.name.localeCompare(b.name, "ko");
    if (nameCompare !== 0) return nameCompare;
    return normalizeGrade(a.grade).localeCompare(normalizeGrade(b.grade), "ko");
  });
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
      <td style="font-weight: 600; color: #1e293b; vertical-align: middle; border: 1px solid #e2e8f0; text-align: center;">
        <div>${item.name}</div>
        ${item.grade ? `<div style="font-size:11px; color:#64748b; margin-top:3px;">${item.grade}</div>` : ""}
        ${item.duplicateNameNeedsCheck ? `<div style="font-size:11px; color:#e11d48; margin-top:3px;">동명이인 확인</div>` : ""}
      </td>
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
    updateWeekHeaders(checkMonth);
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
