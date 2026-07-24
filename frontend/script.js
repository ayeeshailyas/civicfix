const API_BASE =
  window.location.port === "5000" ? "" : "http://localhost:5000";

const fileInput = document.getElementById("file-input");
const dropzone = document.getElementById("dropzone");
const dropzoneEmpty = document.getElementById("dropzone-empty");
const previewImg = document.getElementById("preview-img");

const form = document.getElementById("report-form");
const submitBtn = document.getElementById("submit-btn");
const submitLabel = document.getElementById("submit-btn-label");
const formError = document.getElementById("form-error");

const uploadSection = document.getElementById("upload-section");
const loadingState = document.getElementById("loading-state");
const loadingLabel = document.getElementById("loading-label");
const resultSection = document.getElementById("result-section");

const newReportBtn = document.getElementById("new-report-btn");

let selectedFile = null;
let selectedFileDataUrl = null;

/* ---------- image selection + preview ---------- */

fileInput.addEventListener("change", () => {
  if (fileInput.files && fileInput.files[0]) {
    setSelectedFile(fileInput.files[0]);
  }
});

["dragover", "dragenter"].forEach((evt) => {
  dropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropzone.classList.add("drag-over");
  });
});

["dragleave", "drop"].forEach((evt) => {
  dropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropzone.classList.remove("drag-over");
  });
});

dropzone.addEventListener("drop", (e) => {
  const file = e.dataTransfer.files && e.dataTransfer.files[0];
  if (file) setSelectedFile(file);
});

function setSelectedFile(file) {
  if (!file.type.startsWith("image/")) {
    showFormError("Please choose an image file (JPG or PNG).");
    return;
  }
  selectedFile = file;
  const reader = new FileReader();
  reader.onload = (e) => {
    selectedFileDataUrl = e.target.result;
    previewImg.src = selectedFileDataUrl;
    previewImg.hidden = false;
    dropzoneEmpty.hidden = true;
  };
  reader.readAsDataURL(file);
  clearFormError();
}

/* ---------- form submit ---------- */

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  clearFormError();

  if (!selectedFile) {
    showFormError("Add a photo of the issue first.");
    return;
  }

  const formData = new FormData();
  formData.append("image", selectedFile);
  formData.append("description", document.getElementById("description").value.trim());
  formData.append("location", document.getElementById("location").value.trim());

  setLoading(true);

  try {
    const res = await fetch(`${API_BASE}/api/analyze`, {
      method: "POST",
      body: formData,
    });

    const rawText = await res.text();
    let data = {};
    if (rawText) {
      try {
        data = JSON.parse(rawText);
      } catch {
        throw new Error(
          `Server returned a non-JSON response (status ${res.status}).`
        );
      }
    }

    if (!res.ok) {
      throw new Error(data.error || "The analysis failed. Please try again.");
    }

    if (data.error === true) {
      throw new Error(data.message || "OpenRouter Error");
    }

    renderResult(data, selectedFileDataUrl);
    showResult();
  } catch (err) {
    setLoading(false);
    showFormError(err.message);
  }
});

function setLoading(isLoading) {
  if (isLoading) {
    uploadSection.hidden = true;
    loadingState.hidden = false;
    submitBtn.disabled = true;
    const messages = [
      "Reading the photo…",
      "Judging severity…",
      "Matching the right department…",
      "Drafting the complaint letter…",
    ];
    let i = 0;
    loadingLabel.textContent = messages[0];
    window._loadingInterval = setInterval(() => {
      i = (i + 1) % messages.length;
      loadingLabel.textContent = messages[i];
    }, 1400);
  } else {
    clearInterval(window._loadingInterval);
    loadingState.hidden = true;
    submitBtn.disabled = false;
  }
}

function showResult() {
  clearInterval(window._loadingInterval);
  loadingState.hidden = true;
  resultSection.hidden = false;
  resultSection.scrollIntoView({ behavior: "smooth", block: "start" });
}

function showFormError(msg) {
  formError.textContent = msg;
  formError.hidden = false;
  uploadSection.hidden = false;
}

function clearFormError() {
  formError.hidden = true;
  formError.textContent = "";
}

/* ---------- render result ticket ---------- */

function renderResult(data, photoDataUrl) {
  document.getElementById("out-complaint-id").textContent = data.complaint_id || "CF-UNKNOWN";
  document.getElementById("out-photo").src = photoDataUrl;
  document.getElementById("out-category").textContent = data.category || "Uncategorized";
  document.getElementById("out-title").textContent = data.short_title || "Reported issue";
  document.getElementById("out-severity-reason").textContent = data.severity_reason || "";
  document.getElementById("out-department").textContent = data.department || "Not identified";
  document.getElementById("out-department-reason").textContent = data.department_reason || "";

  const severity = (data.severity || "Low").toLowerCase();
  const stampEl = document.getElementById("out-stamp");
  stampEl.className = `stamp sev-${severity}`;
  document.getElementById("out-severity").textContent = (data.severity || "Low").toUpperCase();

  const tagsEl = document.getElementById("out-tags");
  tagsEl.innerHTML = "";
  (data.tags || []).forEach((tag) => {
    const span = document.createElement("span");
    span.className = "tag";
    span.textContent = tag;
    tagsEl.appendChild(span);
  });

  const letter = data.complaint_letter || {};
  document.getElementById("out-letter-subject").textContent = letter.subject || "";
  document.getElementById("out-letter-body").textContent = letter.body || "";

  const checklistEl = document.getElementById("out-checklist");
  checklistEl.innerHTML = "";
  (data.checklist || []).forEach((step, idx) => {
    const li = document.createElement("li");
    const checkboxId = `check-${idx}`;
    li.innerHTML = `<input type="checkbox" id="${checkboxId}" /> <span>${escapeHtml(step)}</span>`;
    const checkbox = li.querySelector("input");
    checkbox.addEventListener("change", () => {
      li.classList.toggle("checked", checkbox.checked);
    });
    checklistEl.appendChild(li);
  });

  // wire up copy / download using the freshly rendered letter text
  document.getElementById("copy-letter-btn").onclick = () => {
    const fullText = `${letter.subject || ""}\n\n${letter.body || ""}`;
    navigator.clipboard.writeText(fullText).then(() => {
      flashButton("copy-letter-btn", "Copied");
    });
  };

  document.getElementById("download-letter-btn").onclick = () => {
    const fullText = `${letter.subject || ""}\n\n${letter.body || ""}`;
    const blob = new Blob([fullText], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${data.complaint_id || "civicfix-complaint"}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };
}

function flashButton(id, tempLabel) {
  const btn = document.getElementById(id);
  const original = btn.textContent;
  btn.textContent = tempLabel;
  setTimeout(() => (btn.textContent = original), 1400);
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

/* ---------- reset ---------- */

newReportBtn.addEventListener("click", () => {
  selectedFile = null;
  selectedFileDataUrl = null;
  fileInput.value = "";
  previewImg.hidden = true;
  dropzoneEmpty.hidden = false;
  form.reset();
  clearFormError();
  resultSection.hidden = true;
  uploadSection.hidden = false;
  window.scrollTo({ top: 0, behavior: "smooth" });
});
