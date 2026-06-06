const counselFileInput = document.getElementById("counselFile");
const uploadCounselBtn = document.getElementById("uploadCounselBtn");
const deleteSelectedCounselBtn = document.getElementById("deleteSelectedCounselBtn");
const selectAllCounselCheckbox = document.getElementById("selectAllCounselCheckbox");
const counselTableBody = document.getElementById("counselTableBody");

let counselLibrary = JSON.parse(localStorage.getItem("counselLibrary") || "[]");

function saveCounselLibrary() {
  localStorage.setItem("counselLibrary", JSON.stringify(counselLibrary));
}

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

function parseDateFromText(value) {
  if (!value) return "";

  if (typeof value === "number") {
    return excelDateToJSDate(value);
  }

  const text = String(value);

  const match = text.match(/(\d{4})[.\-/년\s]*(\d{1,2})[.\-/월\s]*(\d{1,2})/);

  if (!match) return "";

  const year = match[1];
  const month = String(match[2]).padStart(2, "0");
  const day = String(match[3]).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getCellValueByLabel(rows, labelText) {
  const target = normalizeText(labelText);

  for (let r = 0; r < rows.length; r++) {
    const row = rows[r] || [];

    for (let c = 0; c < row.length; c++) {
      const cellText = normalizeText(row[c]);

      if (cellText.includes(target)) {
        for (let next = c + 1; next <= c + 5; next++) {
          if (row[next]) {
            return row[next];
          }
        }
      }
    }
  }

  return "";
}

function detectCareCategory(text) {
  const clean = normalizeText(text);

  if (clean.includes("목욕") || clean.includes("몸씻기")) {
    return "목욕";
  }

  if (clean.includes("물리치료")) {
    return "물리치료";
  }

  if (clean.includes("균형잡힌식단관리") || clean.includes("식사")) {
    return "식사";
  }

  if (clean.includes("기저귀")) {
    return "기저귀";
  }

  if (clean.includes("정확한복약도움") || clean.includes("복약") || clean.includes("건강관리")) {
    return "간호";
  }

  if (clean.includes("인지활동") || clean.includes("인지지원") || clean.includes("인지")) {
    return "인지활동";
  }

  if (clean.includes("화장실") || clean.includes("대변") || clean.includes("소변") || clean.includes("배설")) {
    return "화장실";
  }

  return "";
}

function detectChangeType(text) {
  const clean = normalizeText(text);

  if (
    clean.includes("제외") ||
    clean.includes("중단") ||
    clean.includes("삭제") ||
    clean.includes("미제공") ||
    clean.includes("하지않")
  ) {
    return "제외";
  }

  if (
    clean.includes("추가") ||
    clean.includes("시작") ||
    clean.includes("제공") ||
    clean.includes("반영")
  ) {
    return "추가";
  }

  return "기타";
}

function findBenefitReflectionStartRow(rows) {
  for (let r = 0; r < rows.length; r++) {
    const rowText = normalizeText((rows[r] || []).join(" "));

    if (rowText.includes("급여제공반영정보")) {
      return r;
    }
  }

  return -1;
}

function findReflectionHeaderRow(rows, startRow) {
  for (let r = startRow; r < Math.min(rows.length, startRow + 8); r++) {
    const rowText = normalizeText((rows[r] || []).join(" "));

    if (
      rowText.includes("반영일") &&
      rowText.includes("급여구분") &&
      rowText.includes("급여내용")
    ) {
      return r;
    }
  }

  return -1;
}

function parseReflectionRows(rows) {
  const startRow = findBenefitReflectionStartRow(rows);

  if (startRow === -1) {
    return [];
  }

  const headerRowIndex = findReflectionHeaderRow(rows, startRow);
  const result = [];

  if (headerRowIndex !== -1) {
    const header = rows[headerRowIndex] || [];

    const dateCol = header.findIndex((cell) => normalizeText(cell).includes("반영일"));
    const typeCol = header.findIndex((cell) => normalizeText(cell).includes("급여구분"));
    const contentCol = header.findIndex((cell) => normalizeText(cell).includes("급여내용"));
    const reasonCol = header.findIndex((cell) => normalizeText(cell).includes("반영사유"));

    for (let r = headerRowIndex + 1; r < rows.length; r++) {
      const row = rows[r] || [];
      const rowText = normalizeText(row.join(" "));

      if (!rowText) continue;

      if (
        rowText.includes("상담일지") ||
        rowText.includes("상담내용") ||
        rowText.includes("조치내용")
      ) {
        break;
      }

      const dateValue = dateCol >= 0 ? row[dateCol] : "";
      const typeValue = typeCol >= 0 ? row[typeCol] : "";
      const contentValue = contentCol >= 0 ? row[contentCol] : "";
      const reasonValue = reasonCol >= 0 ? row[reasonCol] : "";

      const joined = [dateValue, typeValue, contentValue, reasonValue].join(" ");
      const category = detectCareCategory(joined);

      if (!category) continue;

      result.push({
        reflectionDateRaw: dateValue,
        careType: String(typeValue || "").trim(),
        careContent: String(contentValue || "").trim(),
        reason: String(reasonValue || "").trim(),
        joined
      });
    }

    return result;
  }

  for (let r = startRow + 1; r < Math.min(rows.length, startRow + 12); r++) {
    const row = rows[r] || [];
    const rowText = normalizeText(row.join(" "));

    if (!rowText) continue;

    if (
      rowText.includes("반영일") ||
      rowText.includes("급여구분") ||
      rowText.includes("급여내용") ||
      rowText.includes("반영사유")
    ) {
      continue;
    }

    const category = detectCareCategory(rowText);

    if (!category) continue;

    const cells = row.map((cell) => String(cell || "").trim()).filter(Boolean);

    result.push({
      reflectionDateRaw: cells[0] || "",
      careType: cells[1] || category,
      careContent: cells[2] || cells.join(" "),
      reason: cells.slice(3).join(" "),
      joined: cells.join(" ")
    });
  }

  return result;
}

function parseCounselSheet(rows, fileName, sheetName) {
  const recipientName = String(getCellValueByLabel(rows, "수급자") || "").trim();
  const counselDateRaw = getCellValueByLabel(rows, "상담일시");
  const counselDate = parseDateFromText(counselDateRaw);

  const reflectionRows = parseReflectionRows(rows);
  const parsed = [];

  reflectionRows.forEach((item) => {
    const joined = item.joined || "";
    const category = detectCareCategory(joined);
    const changeType = detectChangeType(joined);
    const reflectionDate = parseDateFromText(item.reflectionDateRaw) || counselDate;

    if (!recipientName || !reflectionDate || !category) return;

    parsed.push({
      id: Date.now() + Math.random(),
      recipientName,
      reflectionDate,
      category,
      changeType,
      careType: item.careType || category,
      careContent: item.careContent || joined,
      reason: item.reason || "",
      sheetName,
      fileName,
      uploadedAt: new Date().toLocaleString("ko-KR"),
      checked: false
    });
  });

  return parsed;
}

function parseCounselWorkbook(workbook, fileName) {
  let allParsed = [];

  workbook.SheetNames.forEach((sheetName) => {
    const sheet = workbook.Sheets[sheetName];

    const rows = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      defval: ""
    });

    const parsed = parseCounselSheet(rows, fileName, sheetName);

    allParsed = allParsed.concat(parsed);
  });

  return allParsed;
}

function renderCounselLibrary() {
  counselTableBody.innerHTML = "";

  if (counselLibrary.length === 0) {
    counselTableBody.innerHTML = `
      <tr class="empty-row">
        <td colspan="10">등록된 급여제공반영 상담일지가 없습니다.</td>
      </tr>
    `;
    selectAllCounselCheckbox.checked = false;
    return;
  }

  const sorted = [...counselLibrary].sort((a, b) => {
    if (a.recipientName === b.recipientName) {
      return new Date(b.reflectionDate) - new Date(a.reflectionDate);
    }

    return a.recipientName.localeCompare(b.recipientName, "ko");
  });

  sorted.forEach((item) => {
    const row = document.createElement("tr");

    row.innerHTML = `
      <td class="checkbox-col">
        <input type="checkbox" class="counsel-checkbox" data-id="${item.id}" ${item.checked ? "checked" : ""} />
      </td>
      <td>${item.recipientName || "-"}</td>
      <td>${item.reflectionDate || "-"}</td>
      <td>${item.category || "-"}</td>
      <td>${item.changeType || "-"}</td>
      <td>${item.careContent || "-"}</td>
      <td>${item.reason || "-"}</td>
      <td>${item.sheetName || "-"}</td>
      <td>${item.fileName || "-"}</td>
      <td>${item.uploadedAt || "-"}</td>
    `;

    counselTableBody.appendChild(row);
  });

  bindCounselCheckboxEvents();
}

function bindCounselCheckboxEvents() {
  const checkboxes = document.querySelectorAll(".counsel-checkbox");

  checkboxes.forEach((checkbox) => {
    checkbox.addEventListener("change", (event) => {
      const id = Number(event.target.dataset.id);

      counselLibrary = counselLibrary.map((item) => {
        if (Number(item.id) === id) {
          return {
            ...item,
            checked: event.target.checked
          };
        }

        return item;
      });

      saveCounselLibrary();
    });
  });
}

uploadCounselBtn.addEventListener("click", () => {
  const file = counselFileInput.files[0];

  if (!file) {
    alert("상담일지 파일을 선택해주세요.");
    return;
  }

  const reader = new FileReader();

  reader.onload = (event) => {
    const data = new Uint8Array(event.target.result);
    const workbook = XLSX.read(data, { type: "array" });

    const parsed = parseCounselWorkbook(workbook, file.name);

    if (parsed.length === 0) {
      alert("모든 시트를 확인했지만 급여제공반영 정보를 찾지 못했습니다.");
      return;
    }

    counselLibrary.push(...parsed);
    saveCounselLibrary();

    counselFileInput.value = "";
    renderCounselLibrary();

    alert(`${parsed.length}건의 급여제공반영 정보가 등록되었습니다.`);
  };

  reader.readAsArrayBuffer(file);
});

selectAllCounselCheckbox.addEventListener("change", (event) => {
  counselLibrary = counselLibrary.map((item) => ({
    ...item,
    checked: event.target.checked
  }));

  saveCounselLibrary();
  renderCounselLibrary();
});

deleteSelectedCounselBtn.addEventListener("click", () => {
  const selectedCount = counselLibrary.filter((item) => item.checked).length;

  if (selectedCount === 0) {
    alert("삭제할 상담일지를 선택해주세요.");
    return;
  }

  const ok = confirm(`선택한 ${selectedCount}건을 삭제하시겠습니까?`);
  if (!ok) return;

  counselLibrary = counselLibrary.filter((item) => !item.checked);
  saveCounselLibrary();
  renderCounselLibrary();
});

renderCounselLibrary();