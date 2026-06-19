const API_URL = "https://script.google.com/macros/s/AKfycbwPzdlpnsyEX4nr1nliw_8JQX6J2Fgcv0B6t0dGKxuUtCCVrTjLnnHAreWBErgrUs2a_A/exec";

const counselFileInput = document.getElementById("counselFile");
const uploadCounselBtn = document.getElementById("uploadCounselBtn");
const deleteSelectedCounselBtn = document.getElementById("deleteSelectedCounselBtn");
const selectAllCounselCheckbox = document.getElementById("selectAllCounselCheckbox");

const counselLibraryTableBody =
  document.getElementById("counselLibraryTableBody") ||
  document.getElementById("counselTableBody");

let counselLibrary = [];

function normalizeText(value) {
  return String(value || "").replace(/\s/g, "").trim();
}

function normalizeDateText(value) {
  if (!value) return "";

  const text = String(value).trim().replace(/^'/, "");

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  if (/^\d{4}\.\d{2}\.\d{2}$/.test(text)) return text.replace(/\./g, "-");
  if (/^\d{4}\/\d{2}\/\d{2}$/.test(text)) return text.replace(/\//g, "-");

  const match = text.match(/(\d{4})[.\-/년\s]+(\d{1,2})[.\-/월\s]+(\d{1,2})/);

  if (match) {
    return `${match[1]}-${String(match[2]).padStart(2, "0")}-${String(match[3]).padStart(2, "0")}`;
  }

  if (text.includes("T")) return text.split("T")[0];

  return text;
}

function getCellValueByLabel(rows, labelText) {
  const target = normalizeText(labelText);

  for (let r = 0; r < rows.length; r++) {
    const row = rows[r] || [];

    for (let c = 0; c < row.length; c++) {
      const cellText = normalizeText(row[c]);

    if (cellText.includes(target)) {
        for (let next = c + 1; next <= c + 8; next++) {
          if (row[next]) return row[next];
        }
      }
    }
  }

  return "";
}

function detectCareCategory(text) {
  const clean = normalizeText(text);

  if (clean.includes("목욕") || clean.includes("몸씻기") || clean.includes("옷갈아입기")) return "목욕";
  if (clean.includes("물리치료")) return "물리치료";
  if (clean.includes("균형잡힌식단관리") || clean.includes("식사")) return "식사";
  if (clean.includes("기저귀")) return "기저귀";
  if (clean.includes("정확한복약도움") || clean.includes("복약") || clean.includes("건강관리")) return "간호";
  if (clean.includes("인지활동") || clean.includes("인지지원") || clean.includes("인지")) return "인지활동";
  if (clean.includes("화장실") || clean.includes("대변") || clean.includes("소변") || clean.includes("배설")) return "화장실";

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
  for (let r = startRow; r < Math.min(rows.length, startRow + 10); r++) {
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

  if (startRow === -1) return [];

  const headerRowIndex = findReflectionHeaderRow(rows, startRow);
  const result = [];

  if (headerRowIndex === -1) return result;

  const header = rows[headerRowIndex] || [];

  const dateCol = header.findIndex((cell) => normalizeText(cell).includes("반영일"));
  const typeCol = header.findIndex((cell) => normalizeText(cell).includes("급여구분"));
  const contentCol = header.findIndex((cell) => normalizeText(cell).includes("급여내용"));
  const reasonCol = header.findIndex((cell) => normalizeText(cell).includes("반영사유"));

  for (let r = headerRowIndex + 1; r < rows.length; r++) {
    const row = rows[r] || [];
    const rowText = normalizeText(row.join(" "));

    if (!rowText) continue;

    const dateValue = dateCol >= 0 ? row[dateCol] : "";
    const typeValue = typeCol >= 0 ? row[typeCol] : "";
    const contentValue = contentCol >= 0 ? row[contentCol] : "";
    const reasonValue = reasonCol >= 0 ? row[reasonCol] : "";

    const joined = [dateValue, typeValue, contentValue, reasonValue].join(" ");
    const category = detectCareCategory(joined);

    if (!category) continue;

    result.push({
      reflectionDateRaw: dateValue,
      category,
      changeType: detectChangeType(joined),
      careType: String(typeValue || "").trim(),
      careContent: String(contentValue || "").trim(),
      reason: String(reasonValue || "").trim(),
      joined
    });
  }

  return result;
}

function parseCounselSheet(rows, fileName, sheetName) {
  const recipientName = String(
    getCellValueByLabel(rows, "수급자") ||
    getCellValueByLabel(rows, "성명") ||
    getCellValueByLabel(rows, "어르신")
  ).trim();

  const counselDate = normalizeDateText(
    getCellValueByLabel(rows, "상담일시") ||
    getCellValueByLabel(rows, "상담일자") ||
    getCellValueByLabel(rows, "상담일")
  );

  const reflectionRows = parseReflectionRows(rows);
  const uploadedAt = new Date().toLocaleString("ko-KR");

  return reflectionRows
    .map((item, index) => {
      const reflectionDate = normalizeDateText(item.reflectionDateRaw) || counselDate;

      if (!recipientName || !reflectionDate || !item.category) return null;

      // [줄바꿈 핵심 개선 구역]: 엑셀 내 엔터 개행을 보존하고, 엔터가 없더라도 여러 문장일 경우 줄바꿈을 주입합니다.
      let formattedContent = item.careContent || item.joined;
      if (formattedContent) {
        // 기존 개행 문자 처리
        formattedContent = formattedContent.replace(/\r?\n/g, "<br />");
        // 두 문장 이상이 공백 하나로 이어져 있을 때 (예: ") 위") 한 줄 내리도록 매칭 교정
        formattedContent = formattedContent.replace(/\)\s(?=[가-힣\w])/g, ")<br />");
      }

      return {
        id: `${Date.now()}_${sheetName}_${index}_${Math.random().toString(36).slice(2, 8)}`,
        recipientName,
        consultDate: reflectionDate,
        category: item.category,
        changeType: item.changeType,
        careContent: formattedContent,
        reason: item.reason || "",
        sheetName,
        fileName,
        uploadedAt,
        row: {
          recipientName,
          counselDate,
          reflectionDate,
          careType: item.careType,
          careContent: formattedContent,
          reason: item.reason,
          joined: item.joined
        },
        checked: false
      };
    })
    .filter(Boolean);
}

function parseCounselWorkbook(workbook, fileName) {
  let allParsed = [];

  workbook.SheetNames.forEach((sheetName) => {
    const sheet = workbook.Sheets[sheetName];

    const rows = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      defval: "",
      raw: false
    });

    allParsed = allParsed.concat(parseCounselSheet(rows, fileName, sheetName));
  });

  return allParsed;
}

function makePayloadUrl(payload) {
  return `${API_URL}?payload=${encodeURIComponent(JSON.stringify(payload))}`;
}

async function loadCounselLibrary() {
  try {
    const response = await fetch(makePayloadUrl({ action: "listCounsel" }), {
      method: "GET",
      redirect: "follow"
    });

    const text = await response.text();
    counselLibrary = JSON.parse(text);

    counselLibrary = counselLibrary.map((item) => ({
      ...item,
      consultDate: normalizeDateText(item.consultDate),
      checked: false
    }));

    renderCounselLibrary();
  } catch (error) {
    console.error("상담일지 불러오기 오류:", error);
    alert("상담일지 데이터를 불러오지 못했습니다.");
  }
}

async function addCounselToSheet(items) {
  const loginUser =
    sessionStorage.getItem("loginUser") ||
    localStorage.getItem("loginUser") ||
    "알 수 없음";

  await fetch(API_URL, {
    method: "POST",
    mode: "no-cors",
    headers: {
      "Content-Type": "text/plain;charset=utf-8"
    },
    body: JSON.stringify({
      action: "addCounsel",
      uploadedBy: loginUser,
      loginUser,
      items
    })
  });
}

async function deleteCounselsFromSheet(ids) {
  await fetch(API_URL, {
    method: "POST",
    mode: "no-cors",
    headers: {
      "Content-Type": "text/plain;charset=utf-8"
    },
    body: JSON.stringify({
      action: "deleteCounsel",
      ids
    })
  });
}

function renderCounselLibrary() {
  counselLibraryTableBody.innerHTML = "";

  if (counselLibrary.length === 0) {
    counselLibraryTableBody.innerHTML = `
      <tr class="empty-row">
        <td colspan="10" style="text-align:center;">
          등록된 급여제공반영 상담일지가 없습니다.
        </td>
      </tr>
    `;
    selectAllCounselCheckbox.checked = false;
    return;
  }

  const sortedList = [...counselLibrary].sort((a, b) => {
    if (String(a.recipientName || "") === String(b.recipientName || "")) {
      return String(b.consultDate || "").localeCompare(String(a.consultDate || ""));
    }

    return String(a.recipientName || "").localeCompare(String(b.recipientName || ""), "ko");
  });

  sortedList.forEach((item) => {
    const row = document.createElement("tr");

    // HTML 태그(<br />)가 깨지지 않고 줄바꿈으로 정상 반영되도록 innerHTML 핏을 최적화하여 렌더링합니다.
    row.innerHTML = `
      <td class="checkbox-col">
        <input type="checkbox" class="counsel-checkbox" data-id="${item.id}" ${item.checked ? "checked" : ""} />
      </td>
      <td style="vertical-align: middle;">${item.recipientName || "-"}</td>
      <td style="vertical-align: middle;">${item.consultDate || "-"}</td>
      <td style="vertical-align: middle;">${item.category || "-"}</td>
      <td style="vertical-align: middle;">${item.changeType || "-"}</td>
      <td style="text-align: left; padding: 10px; vertical-align: middle; line-height: 1.4;">${item.careContent || "-"}</td>
      <td style="text-align: left; padding: 10px; vertical-align: middle;">${item.reason || "-"}</td>
      <td style="vertical-align: middle;">${item.sheetName || "-"}</td>
      <td style="vertical-align: middle;">${item.fileName || "-"}</td>
      <td style="vertical-align: middle;">${item.uploadedAt || "-"}</td>
    `;

    counselLibraryTableBody.appendChild(row);
  });

  bindCounselCheckboxEvents();
}

function bindCounselCheckboxEvents() {
  document.querySelectorAll(".counsel-checkbox").forEach((checkbox) => {
    checkbox.addEventListener("change", (event) => {
      const id = String(event.target.dataset.id);

      counselLibrary = counselLibrary.map((item) =>
        String(item.id) === id
          ? { ...item, checked: event.target.checked }
          : item
      );
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

  reader.onload = async (event) => {
    try {
      const data = new Uint8Array(event.target.result);
      const workbook = XLSX.read(data, { type: "array" });

      const parsed = parseCounselWorkbook(workbook, file.name);

      if (parsed.length === 0) {
        alert("모든 시트를 확인했지만 급여제공반영 정보를 찾지 못했습니다.");
        return;
      }

      await addCounselToSheet(parsed);

      counselFileInput.value = "";

      alert(`${parsed.length}건의 급여제공반영 정보가 구글시트에 등록되었습니다.`);

      setTimeout(() => {
        loadCounselLibrary();
      }, 1500);
    } catch (error) {
      console.error("상담일지 등록 오류:", error);
      alert("상담일지 등록 중 오류가 발생했습니다.");
    }
  };

  reader.readAsArrayBuffer(file);
});

selectAllCounselCheckbox.addEventListener("change", (event) => {
  counselLibrary = counselLibrary.map((item) => ({
    ...item,
    checked: event.target.checked
  }));

  renderCounselLibrary();
});

deleteSelectedCounselBtn.addEventListener("click", async () => {
  const selectedItems = counselLibrary.filter((item) => item.checked);

  if (selectedItems.length === 0) {
    alert("삭제할 상담일지를 선택해주세요.");
    return;
  }

  const ok = confirm(`선택한 ${selectedItems.length}개의 상담일지를 삭제하시겠습니까?`);

  if (!ok) return;

  const ids = selectedItems.map((item) => item.id);

  await deleteCounselsFromSheet(ids);

  alert("삭제되었습니다.");

  setTimeout(() => {
    loadCounselLibrary();
  }, 1500);
});

loadCounselLibrary();
