const API_URL = "https://script.google.com/macros/s/AKfycbyNMzHSr7ITPwJbJJXef3v1W4YYyRCiJ8zwGqykx96aszNy_QleOD2DDUyzEimjZ4FHYQ/exec";

const planFileInput = document.getElementById("planFile");
const planWrittenDateInput = document.getElementById("planWrittenDate");
const uploadPlanBtn = document.getElementById("uploadPlanBtn");
const deleteSelectedPlanBtn = document.getElementById("deleteSelectedPlanBtn");
const selectAllPlanCheckbox = document.getElementById("selectAllPlanCheckbox");
const planLibraryTableBody = document.getElementById("planLibraryTableBody");

let carePlanLibrary = [];

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

function formatDateValue(value) {
  if (!value) return "-";

  const text = String(value);
  return text.includes("T") ? text.split("T")[0] : text;
}

async function loadLibrary() {
  try {
    const response = await fetch(API_URL, {
      method: "GET",
      redirect: "follow"
    });

    const text = await response.text();
    carePlanLibrary = JSON.parse(text);

    localStorage.setItem("carePlanLibrary", JSON.stringify(carePlanLibrary));

    renderLibrary();
  } catch (error) {
    console.error("구글시트 불러오기 오류:", error);
    alert("구글시트 데이터를 불러오지 못했습니다.");
  }
}

async function addPlanToSheet(plan) {
  alert("업로드자 확인: " + plan.uploadedBy);

  await fetch(API_URL, {
    method: "POST",
    mode: "no-cors",
    headers: {
      "Content-Type": "text/plain;charset=utf-8"
    },
    body: JSON.stringify({
      action: "add",
      id: plan.id,
      longTermNumber: plan.longTermNumber,
      recipientName: plan.recipientName,
      writtenDate: plan.writtenDate,
      fileName: plan.fileName,
      itemCount: plan.itemCount,
      uploadedAt: plan.uploadedAt,
      uploadedBy: plan.uploadedBy,
      rows: plan.rows || []
    })
  });
}

async function deletePlansFromSheet(ids) {
  await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain;charset=utf-8"
    },
    body: JSON.stringify({
      action: "delete",
      ids
    })
  });
}

function renderLibrary() {
  planLibraryTableBody.innerHTML = "";

  if (carePlanLibrary.length === 0) {
    planLibraryTableBody.innerHTML = `
      <tr class="empty-row">
        <td colspan="8">등록된 급여제공계획서가 없습니다.</td>
      </tr>
    `;
    selectAllPlanCheckbox.checked = false;
    return;
  }

  const sortedList = [...carePlanLibrary].sort((a, b) => {
    if (a.recipientName === b.recipientName) {
      return new Date(b.writtenDate) - new Date(a.writtenDate);
    }

    return String(a.recipientName || "").localeCompare(String(b.recipientName || ""), "ko");
  });

  sortedList.forEach((plan) => {
    const row = document.createElement("tr");

    row.innerHTML = `
      <td class="checkbox-col">
        <input type="checkbox" class="plan-checkbox" data-id="${plan.id}" ${plan.checked ? "checked" : ""} />
      </td>
      <td>${plan.longTermNumber || "-"}</td>
      <td>${plan.recipientName || "-"}</td>
      <td>${formatDateValue(plan.writtenDate)}</td>
      <td>${plan.fileName || "-"}</td>
      <td>${plan.itemCount || 0}개</td>
      <td>${plan.uploadedAt || "-"}</td>
      <td>${plan.uploadedBy || "알 수 없음"}</td>
    `;

    planLibraryTableBody.appendChild(row);
  });

  bindCheckboxEvents();
}

function bindCheckboxEvents() {
  const checkboxes = document.querySelectorAll(".plan-checkbox");

  checkboxes.forEach((checkbox) => {
    checkbox.addEventListener("change", (event) => {
      const id = String(event.target.dataset.id);

      carePlanLibrary = carePlanLibrary.map((plan) => {
        if (String(plan.id) === id) {
          return {
            ...plan,
            checked: event.target.checked
          };
        }

        return plan;
      });

      localStorage.setItem("carePlanLibrary", JSON.stringify(carePlanLibrary));
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

  reader.onload = async (event) => {
    try {
      const data = new Uint8Array(event.target.result);
      const workbook = XLSX.read(data, { type: "array" });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];

      const rows = XLSX.utils.sheet_to_json(worksheet, { defval: "" });

      const loginUser =
       sessionStorage.getItem("loginUser") ||
       localStorage.getItem("loginUser") ||
       "알 수 없음";

      const newPlan = {
        id: Date.now(),
        longTermNumber: fileInfo.longTermNumber,
        recipientName: fileInfo.recipientName,
        writtenDate,
        fileName: file.name,
        uploadedAt: new Date().toLocaleString("ko-KR"),
        uploadedBy: loginUser,
        itemCount: getCareItemCount(rows),
        rows,
        checked: false
      };

      await addPlanToSheet(newPlan);

      planFileInput.value = "";
      planWrittenDateInput.value = "";

      alert("급여제공계획서가 구글시트에 등록되었습니다.");

      setTimeout(() => {
        loadLibrary();
      }, 1500);
    } catch (error) {
      console.error("등록 오류:", error);
      alert("등록 중 오류가 발생했습니다.");
    }
  };

  reader.readAsArrayBuffer(file);
});

selectAllPlanCheckbox.addEventListener("change", (event) => {
  carePlanLibrary = carePlanLibrary.map((plan) => ({
    ...plan,
    checked: event.target.checked
  }));

  localStorage.setItem("carePlanLibrary", JSON.stringify(carePlanLibrary));
  renderLibrary();
});

deleteSelectedPlanBtn.addEventListener("click", async () => {
  const selectedPlans = carePlanLibrary.filter((plan) => plan.checked);

  if (selectedPlans.length === 0) {
    alert("삭제할 계획서를 선택해주세요.");
    return;
  }

  const ok = confirm(`선택한 ${selectedPlans.length}개의 계획서를 삭제하시겠습니까?`);

  if (!ok) return;

  try {
    const ids = selectedPlans.map((plan) => plan.id);

    await deletePlansFromSheet(ids);

    alert("삭제되었습니다.");

    setTimeout(() => {
      loadLibrary();
    }, 1500);
  } catch (error) {
    console.error("삭제 오류:", error);
    alert("삭제 중 오류가 발생했습니다.");
  }
});

loadLibrary();
