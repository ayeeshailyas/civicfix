const fileInput = document.getElementById("file-input");
const dropzone = document.getElementById("dropzone");
const dropzoneEmpty = document.getElementById("dropzone-empty");
const previewImg = document.getElementById("preview-img");
const changePhotoBtn = document.getElementById("change-photo-btn");

const form = document.getElementById("report-form");
const submitBtn = document.getElementById("submit-btn");
const submitLabel = document.getElementById("submit-btn-label");
const formError = document.getElementById("form-error");

let selectedFile = null;
let selectedFileDataUrl = null;

fileInput.addEventListener("change", () => {
  if (fileInput.files && fileInput.files[0]) {
    setSelectedFile(fileInput.files[0]);
  }
});

changePhotoBtn.addEventListener("click", () => {
  fileInput.click();
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
  if (file) {
    setSelectedFile(file);
  }
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
    changePhotoBtn.hidden = false;
  };
  reader.readAsDataURL(file);
  clearFormError();
}

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

  setSubmitting(true);

  try {
    const res = await fetch("/api/analyze", {
      method: "POST",
      body: formData,
    });

    const rawText = await res.text();
    let data = {};

    if (rawText) {
      try {
        data = JSON.parse(rawText);
      } catch {
        throw new Error(`Server returned a non-JSON response (status ${res.status}).`);
      }
    }

    if (!res.ok) {
      throw new Error(data.error || "The analysis failed. Please try again.");
    }

    if (data.error === true) {
      throw new Error(data.message || "OpenRouter Error");
    }

    const payload = {
      data,
      photoDataUrl: selectedFileDataUrl,
      savedAt: new Date().toISOString(),
    };

    sessionStorage.setItem("civicfix.latestReport", JSON.stringify(payload));
    window.location.href = "report.html";
  } catch (err) {
    setSubmitting(false);
    showFormError(err.message || "Something went wrong.");
  }
});

function setSubmitting(isSubmitting) {
  submitBtn.disabled = isSubmitting;
  submitLabel.textContent = isSubmitting
    ? "Preparing your report..."
    : "Analyze and generate report";
}

function showFormError(msg) {
  formError.textContent = msg;
  formError.hidden = false;
}

function clearFormError() {
  formError.hidden = true;
  formError.textContent = "";
}
