const API_URL = "https://script.google.com/macros/s/AKfycbwPzdlpnsyEX4nr1nliw_8JQX6J2Fgcv0B6t0dGKxuUtCCVrTjLnnHAreWBErgrUs2a_A/exec";

// HTML 내부 변수와 부딪히지 않도록 스크립트 전용 고유 이름으로 안전하게 요소를 매칭합니다.
const elPlanFileSelector = document.getElementById("planFile");
const elPlanDateSelector = document.getElementById("planWrittenDate");
const elPlanUploadTrigger = document.getElementById("uploadPlanBtn");
const elPlanDeleteTrigger = document.getElementById("deleteSelectedPlanBtn");
const elPlanSelectAllTrigger = document.getElementById("selectAllPlanCheckbox");
const elPlanTableBodyContainer = document.getElementById("planLibraryTableBody");

// 브라우저 하드 대신 메모리에만 안전하게 들고 있도록 전역 변수로 관리합니다.
let carePlanLibrary = [];

if (elPlanDateSelector) {
  elPlanDateSelector.setAttribute("max", "9999-12-31");

  elPlanDateSelector.addEventListener("input", () => {
    const value = elPlanDateSelector.value;
    if (value && value.length > 10) {
      elPlanDateSelector.value = value.slice(0, 10);
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
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  if (text.includes("T")) return text.split("T")[0];
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
      checked: false
    }));

    // [핵심 해결 포인트]: QuotaExceededError를 유발하던 localStorage.setItem("carePlanLibrary", ...) 코드를 완벽히 삭제했습니다!
    // 이제 용량 한계에 제한을 받지 않고 무제한으로 어르신 데이터를 불러올 수 있습니다.

    if (elPlanSelectAllTrigger) elPlanSelectAllTrigger.checked = false;
    renderLibrary();
  } catch (error) {
    console.error("구글시트 불러오기 오류:", error);
    alert("구글시트 데이터를 불러오지 못했습니다.");
  }
}

async function addPlanToSheet(plan) {
  const loginUser = sessionStorage.getItem("loginUser") || localStorage.getItem("loginUser") || "알 수 없음";

  await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain;charset=utf-8"
    },
    body: JSON.stringify({
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
      ids: ids.map(String)
    })
  });
}

function renderLibrary() {
  if (!elPlanTableBodyContainer) return;
  elPlanTableBodyContainer.innerHTML = "";

  if (carePlanLibrary.length === 0) {
    elPlanTableBodyContainer.innerHTML = `
      <tr class="empty-row">
        <td></td>
        <td colspan="7" style="text-align:center; padding: 25px 0;">
          등록된 급여제공계획서가 없습니다.
        </td>
      </tr>
    `;
    if (elPlanSelectAllTrigger) elPlanSelectAllTrigger.checked = false;
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

    elPlanTableBodyContainer.appendChild(row);
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

      if (elPlanSelectAllTrigger && !event.target.checked) {
        elPlanSelectAllTrigger.checked = false;
      }
    });
  });
}

if (elPlanUploadTrigger) {
  elPlanUploadTrigger.addEventListener("click", () => {
    if (!elPlanFileSelector || !elPlanDateSelector) return;
    const file = elPlanFileSelector.files[0];
    const writtenDate = normalizeDateString(elPlanDateSelector.value);

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

        alert("구글 시트에 데이터를 등록하는 중입니다. 잠시만 대기해 주세요...");
        await addPlanToSheet(newPlan);

        elPlanFileSelector.value = "";
        elPlanDateSelector.value = "";

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
}

if (elPlanSelectAllTrigger) {
  elPlanSelectAllTrigger.addEventListener("change", (event) => {
    carePlanLibrary = carePlanLibrary.map((plan) => ({
      ...plan,
      checked: event.target.checked
    }));

    renderLibrary();
  });
}

if (elPlanDeleteTrigger) {
  elPlanDeleteTrigger.addEventListener("click", async () => {
    const selectedPlans = carePlanLibrary.filter((plan) => plan.checked);

    if (selectedPlans.length === 0) {
      alert("삭제할 계획서를 선택해주세요.");
      return;
    }

    const ok = confirm(`선택한 ${selectedPlans.length}개의 계획서를 삭제하시겠습니까?`);
    if (!ok) return;

    try {
      const ids = selectedPlans.map((plan) => plan.id);
      alert("구글 시트에서 데이터를 삭제 중입니다...");

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
}

// 라이브러리 목록 최초 실행
loadLibrary();
