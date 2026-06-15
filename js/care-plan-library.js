const API_URL = "https://script.google.com/macros/s/AKfycbxFaEN0MkkWd_NnDif5LXlCVbIxqgllvGLoJturv0FlXtgX1FG0QTVQNArI5DyR5RTZaA/exec";

// HTML 파일 내부와 변수 이름 충돌을 원천 차단하기 위해 스크립트 전용 이름으로 안전하게 매칭합니다.
const inputPlanFileEl = document.getElementById("planFile");
const inputPlanWrittenDateEl = document.getElementById("planWrittenDate");
const btnUploadPlanEl = document.getElementById("uploadPlanBtn");
const btnDeleteSelectedPlanEl = document.getElementById("deleteSelectedPlanBtn");
const cbSelectAllPlanEl = document.getElementById("selectAllPlanCheckbox");
const tableBodyPlanLibraryEl = document.getElementById("planLibraryTableBody");

let carePlanLibrary = [];

if (inputPlanWrittenDateEl) {
  inputPlanWrittenDateEl.setAttribute("max", "9999-12-31");

  inputPlanWrittenDateEl.addEventListener("input", () => {
    const value = inputPlanWrittenDateEl.value;

    if (value && value.length > 10) {
      inputPlanWrittenDateEl.value = value.slice(0, 10);
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
