const API_URL = "https://script.google.com/macros/s/AKfycbxFaEN0MkkWd_NnDif5LXlCVbIxqgllvGLoJturv0FlXtgX1FG0QTVQNArI5DyR5RTZaA/exec";

const planFileInput = document.getElementById("planFile");
const planWrittenDateInput = document.getElementById("planWrittenDate");
const uploadPlanBtn = document.getElementById("uploadPlanBtn");
const deleteSelectedPlanBtn = document.getElementById("deleteSelectedPlanBtn");
const selectAllPlanCheckbox = document.getElementById("selectAllPlanCheckbox");
const planLibraryTableBody = document.getElementById("planLibraryTableBody");

let carePlanLibrary = [];

if (planWrittenDateInput) {
  planWrittenDateInput.setAttribute("max", "9999-12-31");

  planWrittenDateInput.addEventListener("input", () => {
    const value = planWrittenDateInput.value;

    if (value && value.length > 10) {
      planWrittenDateInput.value = value.slice(0, 10);
    }
  });
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

function normalizeDateString(value) {
  if (!value) return "";

  const text = String(value).trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return text;
  }

  if (text.includes("T")) {
    return text.split("T")[0];
  }

  return text;
}

function formatDateValue(value) {
  const dateText = normalizeDateString(value);
  return dateText || "-";
}

async function loadLibrary() {
  try {
    const response = await fetch(API_URL, {
      method: "GET",
      redirect: "follow"
    });

    const text = await response.text();
    carePlanLibrary = JSON.parse(text);

    carePlanLibrary = carePlanLibrary.map((plan) => ({
      ...plan,
      writtenDate: normalizeDateString(plan.writtenDate),
      checked: false // 로드될 때는 기본적으로 체크 해제 상태로 초기화
    }));

    localStorage.setItem("carePlanLibrary", JSON.stringify(carePlanLibrary));

    if (selectAllPlanCheckbox) selectAllPlanCheckbox.checked = false;
    renderLibrary();
  } catch (error) {
    console.error("구글시트 불러오기 오류:", error);
    alert("구글시트 데이터를 불러오지 못했습니다.");
  }
}

// [버그 수정 포인트]: mode: "no-cors"를 해제하여 정상적인 전송 규격을 맞춥니다.
async function addPlanToSheet(plan) {
  const loginUser = sessionStorage.getItem("loginUser") || localStorage.getItem("loginUser") || "알 수 없음";
  
  const payload = {
    action: "add",
    id: String(plan.id),
    longTermNumber: plan.longTermNumber,
    recipientName: plan.recipientName,
    writtenDate: plan.writtenDate,
    fileName: plan.fileName,
    itemCount: plan.itemCount,
    uploadedAt: plan.uploadedAt,
    uploadedBy: loginUser,
    loginUser: loginUser,
    rows: plan.rows || []
  };

  await fetch(API_URL, {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

// [버그 수정 포인트]: mode: "no-cors" 제거
async function deletePlansFromSheet(ids) {
  await fetch(API_URL, {
    method: "POST",
    body: JSON.stringify({
      action: "delete",
      ids: ids.map(String)
    })
  });
}

function renderLibrary() {
  planLibraryTableBody.innerHTML = "";

  if (carePlanLibrary.length === 0) {
    planLibraryTableBody.innerHTML = `
      <tr class="empty-row">
        <td colspan="8" style="text-align:center; padding: 20px 0;">
          등록된 급여제공계획서가 없습니다.
        </td>
      </tr>
    `;
    if (selectAllPlanCheckbox) selectAllPlanCheckbox.checked = false;
    return;
  }

  const sortedList = [...carePlanLibrary].sort((a, b) => {
    const nameA = String(a.recipientName || "");
    const nameB = String(b.recipientName || "");

    if (nameA === nameB) {
      const dateA = normalizeDateString(a.writtenDate);
      const dateB = normalizeDateString(b.writtenDate);
      return dateB.localeCompare(dateA);
    }
    return nameA.localeCompare(nameB, "ko");
  });

  sortedList.forEach((plan) => {
    const row = document.createElement("tr");

    row.innerHTML = `
      <td class="checkbox-col" style="text-align:center;">
        <input
          type="checkbox"
          class="plan-checkbox"
          data-id="${plan.id}"
          ${plan.checked ? "checked" : ""}
        />
      </td>
      <td>${plan.longTermNumber || "-"}</td>
      <td>${plan.recipientName || "-"}</td>
      <td>${formatDateValue(plan.writtenDate)}</td>
      <td style="text-align:left;">${plan.fileName || "-"}</td>
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
      
      // 개별 체크 해제 시 전체 선택 체크박스 상태 연동 처리
      if (selectAllPlanCheckbox && !event.target.checked) {
        selectAllPlanCheckbox.checked = false;
      }
    });
  });
}

uploadPlanBtn.addEventListener("click", () => {
  const file = planFileInput.files[0];
  const writtenDate = normalizeDateString(planWrittenDateInput.value);

  if (!file) {
    alert("급여제공계획서 파일을 선택해주세요.");
    return;
  }

  if (!writtenDate) {
    alert("급여제공계획서 작성일자를 선택해주세요.");
    return;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(writtenDate)) {
    alert("작성일자는 YYYY-MM-DD 형식으로 입력해주세요.");
    return;
  }

  const year = Number(writtenDate.slice(0, 4));
  if (year < 1000 || year > 9999) {
    alert("작성일자의 연도는 4자리로 입력해주세요.");
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
      const loginUser = sessionStorage.getItem("loginUser") || localStorage.getItem("loginUser") || "알 수 없음";

      const newPlan = {
        id: Date.now(),
        longTermNumber: fileInfo.longTermNumber,
        recipientName: fileInfo.recipientName,
        writtenDate: writtenDate,
        fileName: file.name,
        uploadedAt: new Date().toLocaleString("ko-KR"),
        uploadedBy: loginUser,
        itemCount: getCareItemCount(rows),
        rows,
        checked: false
      };

      alert("구글 시트에 등록을 요청했습니다. 잠시만 기다려주세요...");
      await addPlanToSheet(newPlan);

      planFileInput.value = "";
      if (planWrittenDateInput) planWrittenDateInput.value = "";

      alert("급여제공계획서가 구글시트에 등록되었습니다.");

      setTimeout(() => {
        loadLibrary();
      }, 1000);
    } catch (error) {
      console.error("등록 오류:", error);
      alert("등록 중 오류가 발생했습니다.");
    }
  };

  reader.readAsArrayBuffer(file);
});

// 전체 선택 클릭 시 하단 요소 시각적 동기화 완전 보완
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
    alert("구글 시트에서 데이터를 삭제하는 중입니다...");
    
    await deletePlansFromSheet(ids);
    alert("삭제되었습니다.");

    setTimeout(() => {
      loadLibrary();
    }, 1000);
  } catch (error) {
    console.error("삭제 오류:", error);
    alert("삭제 중 오류가 발생했습니다.");
  }
});

// 초기 실행
loadLibrary();
