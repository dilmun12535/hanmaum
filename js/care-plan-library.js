const planFileInput = document.getElementById("planFile");
const planWrittenDateInput = document.getElementById("planWrittenDate");
const uploadPlanBtn = document.getElementById("uploadPlanBtn");
const deleteSelectedPlanBtn = document.getElementById("deleteSelectedPlanBtn");
const selectAllPlanCheckbox = document.getElementById("selectAllPlanCheckbox");
const planLibraryTableBody = document.getElementById("planLibraryTableBody");

let carePlanLibrary = JSON.parse(localStorage.getItem("carePlanLibrary") || "[]");

function saveLibrary() {
  localStorage.setItem("carePlanLibrary", JSON.stringify(carePlanLibrary));
}

function normalizeText(value) {
  return String(value || "").replace(/\s/g, "").trim();
}

function extractInfoFromFileName(fileName) {
  const nameOnly = fileName.replace(/\.(xlsx|xls)$/i, "").trim();

  const match = nameOnly.match(/^(L\d+)\s+(.+?)\s+수급자\s+급여제공계획/i);

  if (match) {
    return {
      longTermNumber: match[1],
      recipientName: match[2].trim()
    };
  }

  const parts = nameOnly.split(/\s+/);

  return {
    longTermNumber: parts[0] || "",
    recipientName: parts[1] || ""
  };
}

function getCareItemCount(rows) {
  return rows.filter((row) => {
    const text = normalizeText(JSON.stringify(row));
    return text.length > 0;
  }).length;
}

function renderLibrary() {
  planLibraryTableBody.innerHTML = "";

  if (carePlanLibrary.length === 0) {
    planLibraryTableBody.innerHTML = `
      <tr class="empty-row">
        <td colspan="7">등록된 급여제공계획서가 없습니다.</td>
      </tr>
    `;
    selectAllPlanCheckbox.checked = false;
    return;
  }

  const sortedList = [...carePlanLibrary].sort((a, b) => {
    if (a.recipientName === b.recipientName) {
      return new Date(b.writtenDate) - new Date(a.writtenDate);
    }
    return a.recipientName.localeCompare(b.recipientName, "ko");
  });

  sortedList.forEach((plan) => {
    const row = document.createElement("tr");

    row.innerHTML = `
      <td class="checkbox-col">
        <input type="checkbox" class="plan-checkbox" data-id="${plan.id}" ${plan.checked ? "checked" : ""} />
      </td>
      <td>${plan.longTermNumber || "-"}</td>
      <td>${plan.recipientName || "-"}</td>
      <td>${plan.writtenDate || "-"}</td>
      <td>${plan.fileName || "-"}</td>
      <td>${plan.itemCount || 0}개</td>
      <td>${plan.uploadedAt || "-"}</td>
    `;

    planLibraryTableBody.appendChild(row);
  });

  bindCheckboxEvents();
}

function bindCheckboxEvents() {
  const checkboxes = document.querySelectorAll(".plan-checkbox");

  checkboxes.forEach((checkbox) => {
    checkbox.addEventListener("change", (event) => {
      const id = Number(event.target.dataset.id);

      carePlanLibrary = carePlanLibrary.map((plan) => {
        if (plan.id === id) {
          return {
            ...plan,
            checked: event.target.checked
          };
        }

        return plan;
      });

      saveLibrary();
    });
  });
}

uploadPlanBtn.addEventListener("click", () => {
  const file = planFileInput.files[0];
  const writtenDate = planWrittenDateInput.value;

  if (!file) {
    alert("급여제공계획서 파일을 선택해주세요.");
    return;
  }

  if (!writtenDate) {
    alert("급여제공계획서 작성일자를 선택해주세요.");
    return;
  }

  const fileInfo = extractInfoFromFileName(file.name);

  if (!fileInfo.longTermNumber || !fileInfo.recipientName) {
    alert("파일명에서 장기요양번호와 수급자명을 확인하지 못했습니다. 파일명을 확인해주세요.");
    return;
  }

  const reader = new FileReader();

  reader.onload = (event) => {
    const data = new Uint8Array(event.target.result);
    const workbook = XLSX.read(data, { type: "array" });
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];

    const rows = XLSX.utils.sheet_to_json(worksheet, { defval: "" });

    const newPlan = {
      id: Date.now(),
      longTermNumber: fileInfo.longTermNumber,
      recipientName: fileInfo.recipientName,
      writtenDate,
      fileName: file.name,
      uploadedAt: new Date().toLocaleString("ko-KR"),
      itemCount: getCareItemCount(rows),
      rows,
      checked: false
    };

    carePlanLibrary.push(newPlan);
    saveLibrary();

    planFileInput.value = "";
    planWrittenDateInput.value = "";

    renderLibrary();
    alert("급여제공계획서가 보관함에 등록되었습니다.");
  };

  reader.readAsArrayBuffer(file);
});

selectAllPlanCheckbox.addEventListener("change", (event) => {
  carePlanLibrary = carePlanLibrary.map((plan) => ({
    ...plan,
    checked: event.target.checked
  }));

  saveLibrary();
  renderLibrary();
});

deleteSelectedPlanBtn.addEventListener("click", () => {
  const selectedCount = carePlanLibrary.filter((plan) => plan.checked).length;

  if (selectedCount === 0) {
    alert("삭제할 계획서를 선택해주세요.");
    return;
  }

  const ok = confirm(`선택한 ${selectedCount}개의 계획서를 삭제하시겠습니까?`);

  if (!ok) return;

  carePlanLibrary = carePlanLibrary.filter((plan) => !plan.checked);
  saveLibrary();
  renderLibrary();
});

renderLibrary();s