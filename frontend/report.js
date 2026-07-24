const reportShell = document.getElementById("report-shell");
const emptyReport = document.getElementById("empty-report");

init();

function init() {
  const raw = sessionStorage.getItem("civicfix.latestReport");
  if (!raw) {
    showEmpty();
    return;
  }

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    showEmpty();
    return;
  }

  const data = payload.data || {};
  const photoDataUrl = payload.photoDataUrl || "";

  render(data, photoDataUrl);
  reportShell.hidden = false;
}

function showEmpty() {
  emptyReport.hidden = false;
}

function render(data, photoDataUrl) {
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
    checklistEl.appendChild(li);
  });

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
  setTimeout(() => {
    btn.textContent = original;
  }, 1200);
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
