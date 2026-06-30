(() => {
  const $ = (id) => document.getElementById(id);

  const excelFile = $("excelFile");
  const checkBtn = $("checkBtn");
  const resetBtn = $("resetBtn");
  const progressArea = $("progressArea");
  const progressText = $("progressText");
  const progressFill = $("progressFill");
  const errorText = $("errorText");
  const sheetCount = $("sheetCount");
  const mealErrorCount = $("mealErrorCount");
  const bathErrorCount = $("bathErrorCount");
  const totalErrorCount = $("totalErrorCount");
  const emptyBox = $("emptyBox");
  const visualSection = $("visualSection");
  const matrixHead = $("matrixHead");
  const matrixBody = $("matrixBody");
  const resultSection = $("resultSection");
  const resultBody = $("resultBody");
  const downloadBtn = $("downloadBtn");

  let allErrors = [];
  let visualRows = [];
  let currentFilter = "all";

  function normalize(v) {
    return String(v ?? "")
      .replace(/\r?\n/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function compact(v) {
    return normalize(v).replace(/\s+/g, "");
  }

  function setProgress(done, total) {
    const pct = total ? Math.round((done / total) * 100) : 0;
    progressArea.style.display = "block";
    progressText.textContent = `검사 완료 ${done} / ${total}`;
    progressFill.style.width = `${pct}%`;
  }

  function showError(msg) {
    errorText.textContent = msg;
    errorText.style.display = "block";
  }

  function hideError() {
    errorText.textContent = "";
    errorText.style.display = "none";
  }

  function resetResult() {
    allErrors = [];
    visualRows = [];
    currentFilter = "all";
    sheetCount.textContent = "0";
    mealErrorCount.textContent = "0";
    bathErrorCount.textContent = "0";
    totalErrorCount.textContent = "0";
    progressArea.style.display = "none";
    progressFill.style.width = "0%";
    emptyBox.style.display = "none";
    visualSection.style.display = "none";
    resultSection.style.display = "none";
    matrixHead.innerHTML = "";
    matrixBody.innerHTML = "";
    resultBody.innerHTML = "";
    hideError();

    document.querySelectorAll(".filter-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.filter === "all");
    });
  }

  function getCell(rows, r, c) {
    if (!rows[r]) return "";
    return normalize(rows[r][c]);
  }

  function findRecipientName(rows) {
    for (let r = 0; r < Math.min(rows.length, 12); r++) {
      for (let c = 0; c < (rows[r] || []).length; c++) {
        const value = compact(rows[r][c]);
        if (value.includes("수급자명")) {
          for (let k = c + 1; k <= c + 4; k++) {
            const candidate = normalize(rows[r][k]);
            if (candidate && !candidate.includes("생년") && !candidate.includes("장기")) return candidate;
          }
        }
      }
    }

    for (let r = 0; r < Math.min(rows.length, 8); r++) {
      for (let c = 0; c < Math.min((rows[r] || []).length, 8); c++) {
        const value = normalize(rows[r][c]);
        if (/^[가-힣]{2,5}$/.test(value) && !["수급자명", "장기요양"].includes(value)) return value;
      }
    }

    return "";
  }

  function findDateColumns(rows) {
    const results = [];
    const seen = new Set();

    for (let r = 0; r < Math.min(rows.length, 14); r++) {
      for (let c = 0; c < (rows[r] || []).length; c++) {
        const text = normalize(rows[r][c]);
        const match = text.match(/(\d{1,2})\s*\/\s*(\d{1,2})/);
        if (!match) continue;

        const date = `${String(Number(match[1])).padStart(2, "0")}/${String(Number(match[2])).padStart(2, "0")}`;
        const key = `${date}_${c}`;
        if (seen.has(key)) continue;

        seen.add(key);
        results.push({ row: r, col: c, date });
      }
    }

    return results.sort((a, b) => a.col - b.col);
  }

  function findLabelRow(rows, keywords) {
    for (let r = 0; r < rows.length; r++) {
      const rowText = compact((rows[r] || []).join(" "));
      if (keywords.every((keyword) => rowText.includes(keyword))) return r;
    }
    return -1;
  }

  function findExactLabelRow(rows, label) {
    for (let r = 0; r < rows.length; r++) {
      for (let c = 0; c < (rows[r] || []).length; c++) {
        if (compact(rows[r][c]) === compact(label)) return r;
      }
    }
    return -1;
  }

  function getMergedLikeValue(rows, row, col) {
    let value = getCell(rows, row, col);
    if (value) return value;

    for (let offset = 1; offset <= 2; offset++) {
      value = getCell(rows, row, col + offset);
      if (value) return value;
    }

    for (let offset = 1; offset <= 2; offset++) {
      value = getCell(rows, row, col - offset);
      if (value) return value;
    }

    return "";
  }

  function isMealValue(value) {
    const text = compact(value);
    if (!text) return false;
    if (!/(일반식|죽식|다진식|경관식|미음|밥|식)/.test(text)) return false;
    return true;
  }

  function isMealError(value) {
    const text = compact(value);
    if (!isMealValue(text)) return false;
    return !text.includes("정량");
  }

  function hasBathTime(value) {
    const text = compact(value);
    return /\d+\s*분/.test(text) || text.includes("목욕");
  }

  function hasBathMethod(value) {
    const text = compact(value);
    return text.includes("목욕") || text.includes("샤워") || text.includes("침상");
  }

  function isBathMethodNormal(value) {
    return compact(value) === "목욕의자(샤워식)";
  }

  function analyzeSheet(workbook, sheetName) {
    const worksheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false, defval: "" });
    const recipientName = findRecipientName(rows) || sheetName;
    const dateColumns = findDateColumns(rows);

    const lunchRow = findExactLabelRow(rows, "점심");
    const dinnerRow = findExactLabelRow(rows, "저녁");
    const bathTimeRow = findLabelRow(rows, ["목욕", "소요시간"]);
    const bathMethodRow = findExactLabelRow(rows, "방법");

    const errors = [];
    const dayMap = {};

    dateColumns.forEach(({ col, date }) => {
      const day = dayMap[date] || { date, meal: 0, bath: 0, details: [] };

      [
        { row: lunchRow, label: "점심" },
        { row: dinnerRow, label: "저녁" },
      ].forEach(({ row, label }) => {
        if (row < 0) return;
        const value = getMergedLikeValue(rows, row, col);
        if (!isMealValue(value)) return;

        if (isMealError(value)) {
          day.meal += 1;
          const item = {
            sheetName,
            recipientName,
            date,
            type: "식사",
            typeKey: "meal",
            currentValue: value,
            normalValue: "정량 포함",
            message: `${label} 식사량이 정량이 아닙니다.`,
          };
          errors.push(item);
          day.details.push(item);
        }
      });

      const bathTime = bathTimeRow >= 0 ? getMergedLikeValue(rows, bathTimeRow, col) : "";
      const bathMethod = bathMethodRow >= 0 ? getMergedLikeValue(rows, bathMethodRow, col) : "";

      if (hasBathTime(bathTime) || hasBathMethod(bathMethod)) {
        if (!bathMethod || !isBathMethodNormal(bathMethod)) {
          day.bath += 1;
          const item = {
            sheetName,
            recipientName,
            date,
            type: "목욕",
            typeKey: "bath",
            currentValue: bathMethod ? `${bathTime ? bathTime + " / " : ""}${bathMethod}` : bathTime,
            normalValue: "목욕의자(샤워식)",
            message: bathMethod ? "목욕 방법이 기준과 다릅니다." : "목욕 시간이 있으나 목욕 방법이 비어 있습니다.",
          };
          errors.push(item);
          day.details.push(item);
        }
      }

      if (day.meal || day.bath) {
        dayMap[date] = day;
      }
    });

    return {
      sheetName,
      recipientName,
      errors,
      days: Object.values(dayMap).sort((a, b) => a.date.localeCompare(b.date)),
    };
  }


  function mergeVisualRowsByRecipient(rows) {
    const recipientMap = new Map();

    rows.forEach((row) => {
      const key = row.recipientName || "이름 없음";

      if (!recipientMap.has(key)) {
        recipientMap.set(key, {
          recipientName: key,
          daysMap: new Map(),
        });
      }

      const merged = recipientMap.get(key);

      row.days.forEach((day) => {
        if (!merged.daysMap.has(day.date)) {
          merged.daysMap.set(day.date, {
            date: day.date,
            meal: 0,
            bath: 0,
            details: [],
          });
        }

        const targetDay = merged.daysMap.get(day.date);
        targetDay.meal += day.meal || 0;
        targetDay.bath += day.bath || 0;
        targetDay.details.push(...(day.details || []));
      });
    });

    return Array.from(recipientMap.values())
      .map((item) => ({
        recipientName: item.recipientName,
        days: Array.from(item.daysMap.values()).sort((a, b) => a.date.localeCompare(b.date)),
      }))
      .sort((a, b) => a.recipientName.localeCompare(b.recipientName, "ko"));
  }

  async function runCheck() {
    resetResult();

    const file = excelFile.files && excelFile.files[0];
    if (!file) {
      showError("검사할 엑셀 파일을 선택해주세요.");
      return;
    }

    if (typeof XLSX === "undefined") {
      showError("엑셀 처리 라이브러리를 불러오지 못했습니다. 인터넷 연결 또는 CDN 주소를 확인해주세요.");
      return;
    }

    checkBtn.disabled = true;
    hideError();

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const sheetNames = workbook.SheetNames || [];

      const errors = [];
      const rowsForVisual = [];

      for (let i = 0; i < sheetNames.length; i++) {
        const analyzed = analyzeSheet(workbook, sheetNames[i]);
        if (analyzed.errors.length) {
          errors.push(...analyzed.errors);
          rowsForVisual.push(analyzed);
        }

        if (i % 10 === 0 || i === sheetNames.length - 1) {
          setProgress(i + 1, sheetNames.length);
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
      }

      allErrors = errors;
      visualRows = mergeVisualRowsByRecipient(rowsForVisual);

      const mealCount = errors.filter((e) => e.typeKey === "meal").length;
      const bathCount = errors.filter((e) => e.typeKey === "bath").length;

      sheetCount.textContent = String(sheetNames.length);
      mealErrorCount.textContent = String(mealCount);
      bathErrorCount.textContent = String(bathCount);
      totalErrorCount.textContent = String(errors.length);

      renderResults();
      renderMatrix();

      if (errors.length === 0) {
        emptyBox.style.display = "block";
      } else {
        visualSection.style.display = "block";
        resultSection.style.display = "block";
      }
    } catch (err) {
      console.error(err);
      showError("검사 중 오류가 발생했습니다. 엑셀 파일 형식이나 시트 구조를 확인해주세요.");
    } finally {
      checkBtn.disabled = false;
    }
  }

  function renderResults() {
    resultBody.innerHTML = "";

    allErrors.forEach((item) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(item.recipientName)}</td>
        <td>${escapeHtml(item.date)}</td>
        <td><span class="badge ${item.typeKey}">${escapeHtml(item.type)}</span></td>
        <td>${escapeHtml(item.currentValue || "비어 있음")}</td>
        <td>${escapeHtml(item.normalValue)}</td>
        <td>${escapeHtml(item.message)}</td>
      `;
      resultBody.appendChild(tr);
    });
  }

  function renderMatrix() {
    matrixHead.innerHTML = "";
    matrixBody.innerHTML = "";

    const dateSet = new Set();
    visualRows.forEach((row) => {
      row.days.forEach((day) => dateSet.add(day.date));
    });
    const dates = Array.from(dateSet).sort((a, b) => a.localeCompare(b));

    const headTr = document.createElement("tr");
    headTr.innerHTML = `
      <th class="name-col">수급자명</th>
      ${dates.map((date) => `<th>${escapeHtml(date)}</th>`).join("")}
    `;
    matrixHead.appendChild(headTr);

    const filteredRows = visualRows.filter((row) => {
      if (currentFilter === "all") return true;
      return row.days.some((day) => {
        if (currentFilter === "meal") return day.meal > 0;
        if (currentFilter === "bath") return day.bath > 0;
        if (currentFilter === "both") return day.meal > 0 && day.bath > 0;
        return true;
      });
    });

    filteredRows.forEach((row) => {
      const tr = document.createElement("tr");

      const cells = dates.map((date) => {
        const day = row.days.find((d) => d.date === date);
        if (!day) return `<td class="ok">-</td>`;

        let cls = "ok";
        let main = "정상";
        let sub = "";

        if (day.meal > 0 && day.bath > 0) {
          cls = "error-both";
          main = "식사·목욕";
          sub = `${day.meal + day.bath}건`;
        } else if (day.meal > 0) {
          cls = "error-meal";
          main = "식사";
          sub = `${day.meal}건`;
        } else if (day.bath > 0) {
          cls = "error-bath";
          main = "목욕";
          sub = `${day.bath}건`;
        }

        const title = day.details.map((d) => `${d.type}: ${d.message} (${d.currentValue || "비어 있음"})`).join("\n");
        return `<td class="${cls}" title="${escapeAttr(title)}"><span class="cell-main">${main}</span><span class="cell-sub">${sub}</span></td>`;
      }).join("");

      tr.innerHTML = `
        <td class="name-col">${escapeHtml(row.recipientName)}</td>
        ${cells}
      `;
      matrixBody.appendChild(tr);
    });
  }

  function downloadCsv() {
    if (!allErrors.length) return;

    const headers = ["수급자명", "날짜", "항목", "현재값", "정상값", "오류 내용"];
    const lines = [
      headers.join(","),
      ...allErrors.map((e) => [
        e.recipientName,
        e.date,
        e.type,
        e.currentValue || "비어 있음",
        e.normalValue,
        e.message,
      ].map(csvCell).join(",")),
    ];

    const blob = new Blob(["\ufeff" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "식사_목욕_오류목록.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function csvCell(value) {
    const text = String(value ?? "");
    return `"${text.replace(/"/g, '""')}"`;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function escapeAttr(value) {
    return escapeHtml(value).replace(/\n/g, "&#10;");
  }

  checkBtn?.addEventListener("click", runCheck);
  resetBtn?.addEventListener("click", () => {
    if (excelFile) excelFile.value = "";
    resetResult();
  });
  downloadBtn?.addEventListener("click", downloadCsv);

  document.querySelectorAll(".filter-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      currentFilter = btn.dataset.filter;
      document.querySelectorAll(".filter-btn").forEach((b) => b.classList.toggle("active", b === btn));
      renderMatrix();
    });
  });

  resetResult();
})();
