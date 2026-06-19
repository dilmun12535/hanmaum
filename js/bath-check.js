const CARE_PLAN_API_URL = "https://script.google.com/macros/s/AKfycbySI7LOKA-dS3reMpJsGhscD9e2TK_gtTs6BwWYBiN88GGyNFnDvjXK91ldsUbPhFox/exec";

let carePlanLibraryCache = [];
let counselLibraryCache = [];

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

function isBathRequiredAtDate(plan, name, targetDate) {
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
      const hasGreyBlockTag = records.some(item => item.isGreyBlock === true);

      weeks[weekKey] = {
        hasBathRecord: hasRealBath,
        isGreyBlock: hasGreyBlockTag,
        recordText: records.length > 0 ? records.map((item) => item.label).join("<br/>") : "-"
      };
    });

    result.push({ name, weeks });
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
      week1: { hasBathRecord: false, isGreyBlock: false, recordText: "-" },
      week2: { hasBathRecord: false, isGreyBlock: false, recordText: "-" },
      week3: { hasBathRecord: false, isGreyBlock: false, recordText: "-" },
      week4: { hasBathRecord: false, isGreyBlock: false, recordText: "-" },
      week5: { hasBathRecord: false, isGreyBlock: false, recordText: "-" }
    };

    const weekRequired = {
      week1: isBathRequiredAtDate(plan, name, weekEndDates.week1),
      week2: isBathRequiredAtDate(plan, name, weekEndDates.week2),
      week3: isBathRequiredAtDate(plan, name, weekEndDates.week3),
      week4: isBathRequiredAtDate(plan, name, weekEndDates.week4),
      week5: isBathRequiredAtDate(plan, name, weekEndDates.week5)
    };

    const weekResults = [
      getWeekResult(weekRequired.week1, weeks.week1),
      getWeekResult(weekRequired.week2, weeks.week2),
      getWeekResult(weekRequired.week3, weeks.week3),
      getWeekResult(weekRequired.week4, weeks.week4),
      getWeekResult(weekRequired.week5, weeks.week5)
    ];

    const anyRequired = Object.values(weekRequired).some(Boolean);

    results.push({
      name,
      planDate: plan ? plan.writtenDate : "-",
      counselText: getCounselTextForMonth(name, monthEndDate),
      requiredText: anyRequired ? "있음" : "없음",
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
      <td style="font-weight: 500; vertical-align: middle; border: 1px solid #e2e8f0; text-align: center;">${item.requiredText || "없음"}</td>
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

  await syncCarePlanLibraryFromGoogleSheet();
  await syncCounselLibraryFromGoogleSheet();

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
