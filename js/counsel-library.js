const API_URL = "https://script.google.com/macros/s/AKfycbwA3IK8YYQ7DKPcSvCM4RDVIzf8YqwDVmFAY4WFWO1Pc4wnE_UQCmr3XLolYPuWh6I7lA/exec";

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

  if (typeof value === "number") {
    const date = XLSX.SSF.parse_date_code(value);

    if (date) {
      const yyyy = String(date.y).padStart(4, "0");
      const mm = String(date.m).padStart(2, "0");
      const dd = String(date.d).padStart(2, "0");
      return `${yyyy}-${mm}-${dd}`;
    }
  }

  const text = String(value).trim().replace(/^'/, "");

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  if (/^\d{4}\.\d{2}\.\d{2}$/.test(text)) return text.replace(/\./g, "-");
  if (/^\d{4}\/\d{2}\/\d{2}$/.test(text)) return text.replace(/\//g, "-");

  const match = text.match(/(\d{4})[.\-/년\s]+(\d{1,2})[.\-/월\s]+(\d{1,2})/);

  if (match) {
    const yyyy = match[1];
    const mm = String(match[2]).padStart(2, "0");
    const dd = String(match[3]).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  if (text.includes("T")) return text.split("T")[0];

  return text;
}

function getCellByKeywords(row, keywords) {
  const entries = Object.entries(row || {});

  for (const [key, value] of entries) {
    const keyText = normalizeText(key);

    if (keywords.some((word) => keyText.includes(normalizeText(word)))) {
      return value;
    }
  }

  return "";
}

function getRecipientName(row) {
  return getCellByKeywords(row, ["수급자명", "대상자명", "성명", "이름", "어르신"]) || "";
}

function getConsultDate(row) {
  return normalizeDateText(
    getCellByKeywords(row, ["상담일자", "상담일", "일자", "작성일자", "날짜"]) || ""
  );
}

function getCategory(row) {
  return getCellByKeywords(row, ["분류", "구분", "상담구분", "상담분류"]) || "";
}

function getChangeType(row) {
  return getCellByKeywords(row, ["변경유형", "변경", "유형", "급여변경"]) || "";
}

function getCareContent(row) {
  return (
    getCellByKeywords(row, [
      "급여내용",
      "급여 내용",
      "서비스내용",
      "서비스 내용",
      "제공내용",
      "변경내용",
      "내용"
    ]) || ""
  );
}

function getReason(row) {
  return getCellByKeywords(row, ["반영사유", "사유", "상담내용", "상담 내용", "비고"]) || "";
}

function isBenefitReflectCounsel(row) {
  const allText = normalizeText(JSON.stringify(row));

  if (!allText) return false;

  const hasBenefit = allText.includes("급여");
  const hasReflect = allText.includes("반영");
  const hasChange =
    allText.includes("변경") ||
    allText.includes("추가") ||
    allText.includes("제외") ||
    allText.includes("중지");

  return hasBenefit && (hasReflect || hasChange);
}

function formatDateValue(value) {
  return normalizeDateText(value) || "-";
}

function makePayloadUrl(payload) {
  return `${API_URL}?payload=${encodeURIComponent(JSON.stringify(payload))}`;
}

async function loadCounselLibrary() {
  try {
    if (!counselLibraryTableBody) {
      alert("상담일지 표 영역을 찾지 못했습니다. tbody id를 확인해주세요.");
      return;
    }

    const response = await fetch(makePayloadUrl({ action: "listCounsel" }), {
      method: "GET",
      redirect: "follow"
    });

    const text = await response.text();

    console.log("상담일지 응답:", text);

    try {
      counselLibrary = JSON.parse(text);
    } catch (e) {
      console.error("JSON 파싱 실패:", e);
      console.error("응답 원본:", text);

      alert(
        "상담일지 데이터를 읽는 중 오류가 발생했습니다.\n\n" +
          text.substring(0, 300)
      );
      return;
    }

    if (!Array.isArray(counselLibrary)) {
      console.error("상담일지 응답이 배열이 아닙니다:", counselLibrary);
      alert("상담일지 데이터 형식이 올바르지 않습니다.");
      return;
    }

    counselLibrary = counselLibrary.map((item) => ({
      ...item,
      consultDate: normalizeDateText(item.consultDate),
      checked: false
    }));

    renderCounselLibrary();
  } catch (error) {
    console.error("상담일지 불러오기 오류:", error);

    alert(
      "상담일지 데이터를 불러오지 못했습니다.\n\n" +
        (error.message || error)
    );
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

    if (selectAllCounselCheckbox) {
      selectAllCounselCheckbox.checked = false;
    }

    return;
  }

  const sortedList = [...counselLibrary].sort((a, b) => {
    const nameA = String(a.recipientName || "");
    const nameB = String(b.recipientName || "");

    if (nameA === nameB) {
      return String(b.consultDate || "").localeCompare(String(a.consultDate || ""));
    }

    return nameA.localeCompare(nameB, "ko");
  });

  sortedList.forEach((item) => {
    const row = document.createElement("tr");

    row.innerHTML = `
      <td class="checkbox-col">
        <input
          type="checkbox"
          class="counsel-checkbox"
          data-id="${item.id}"
          ${item.checked ? "checked" : ""}
        />
      </td>
      <td>${item.recipientName || "-"}</td>
      <td>${formatDateValue(item.consultDate)}</td>
      <td>${item.category || "-"}</td>
      <td>${item.changeType || "-"}</td>
      <td>${item.careContent || "-"}</td>
      <td>${item.reason || "-"}</td>
      <td>${item.sheetName || "-"}</td>
      <td>${item.fileName || "-"}</td>
      <td>${item.uploadedAt || "-"}</td>
    `;

    counselLibraryTableBody.appendChild(row);
  });

  bindCounselCheckboxEvents();
}

function bindCounselCheckboxEvents() {
  const checkboxes = document.querySelectorAll(".counsel-checkbox");

  checkboxes.forEach((checkbox) => {
    checkbox.addEventListener("change", (event) => {
      const id = String(event.target.dataset.id);

      counselLibrary = counselLibrary.map((item) => {
        if (String(item.id) === id) {
          return {
            ...item,
            checked: event.target.checked
          };
        }

        return item;
      });
    });
  });
}

if (uploadCounselBtn) {
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
        const workbook = XLSX.read(data, {
          type: "array",
          cellDates: false
        });

        const loginUser =
          sessionStorage.getItem("loginUser") ||
          localStorage.getItem("loginUser") ||
          "알 수 없음";

        const uploadedAt = new Date().toLocaleString("ko-KR");
        const items = [];

        workbook.SheetNames.forEach((sheetName) => {
          const worksheet = workbook.Sheets[sheetName];

          const rows = XLSX.utils.sheet_to_json(worksheet, {
            defval: "",
            raw: false
          });

          rows.forEach((row, index) => {
            if (!isBenefitReflectCounsel(row)) return;

            const recipientName = getRecipientName(row);
            const consultDate = getConsultDate(row);
            const category = getCategory(row);
            const changeType = getChangeType(row);
            const careContent = getCareContent(row);
            const reason = getReason(row);

            if (!recipientName && !consultDate && !careContent && !reason) return;

            items.push({
              id: `${Date.now()}_${sheetName}_${index}_${Math.random()
                .toString(36)
                .slice(2, 8)}`,
              recipientName,
              consultDate,
              category,
              changeType,
              careContent,
              reason,
              sheetName,
              fileName: file.name,
              uploadedAt,
              uploadedBy: loginUser,
              row
            });
          });
        });

        if (items.length === 0) {
          alert("급여제공반영 정보가 있는 상담일지를 찾지 못했습니다.");
          return;
        }

        await addCounselToSheet(items);

        counselFileInput.value = "";

        alert(`${items.length}건의 상담일지가 구글시트에 등록되었습니다.`);

        setTimeout(() => {
          loadCounselLibrary();
        }, 1500);
      } catch (error) {
        console.error("상담일지 등록 오류:", error);
        alert("상담일지 등록 중 오류가 발생했습니다.\n\n" + (error.message || error));
      }
    };

    reader.readAsArrayBuffer(file);
  });
}

if (selectAllCounselCheckbox) {
  selectAllCounselCheckbox.addEventListener("change", (event) => {
    counselLibrary = counselLibrary.map((item) => ({
      ...item,
      checked: event.target.checked
    }));

    renderCounselLibrary();
  });
}

if (deleteSelectedCounselBtn) {
  deleteSelectedCounselBtn.addEventListener("click", async () => {
    const selectedItems = counselLibrary.filter((item) => item.checked);

    if (selectedItems.length === 0) {
      alert("삭제할 상담일지를 선택해주세요.");
      return;
    }

    const ok = confirm(`선택한 ${selectedItems.length}개의 상담일지를 삭제하시겠습니까?`);

    if (!ok) return;

    try {
      const ids = selectedItems.map((item) => item.id);

      await deleteCounselsFromSheet(ids);

      alert("삭제되었습니다.");

      setTimeout(() => {
        loadCounselLibrary();
      }, 1500);
    } catch (error) {
      console.error("상담일지 삭제 오류:", error);
      alert("삭제 중 오류가 발생했습니다.\n\n" + (error.message || error));
    }
  });
}

loadCounselLibrary();
