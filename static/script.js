let lastSessionId = null;
let pollingInterval = null;
let isProcessing = false;
let isStatusRequestInFlight = false;

function stopPolling() {
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
  }
  isStatusRequestInFlight = false;
  isProcessing = false;
}

function setFormBusy(isBusy) {
  const form = document.getElementById('trackForm');
  const submitButton = form ? form.querySelector('button[type="submit"], input[type="submit"]') : null;
  if (submitButton) {
    submitButton.disabled = isBusy;
  }
}

// Download button helper
function createDownloadButton(url, filename) {
  return `<a href="${url}" onclick="event.preventDefault(); forceDownload('${url}', '${filename}')">Download ${filename}</a>`;
}
const useDate = document.getElementById('usedate').value;

// Force download helper
function forceDownload(url, filename) {
  fetch(url)
    .then(resp => resp.blob())
    .then(blob => {
      const link = document.createElement('a');
      link.href = window.URL.createObjectURL(blob);
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      setTimeout(() => {
        window.URL.revokeObjectURL(link.href);
        document.body.removeChild(link);
      }, 100);
    });
}

// Download all files as zip
function downloadAllFiles() {
  const filePrefix = "AllDocs";
  fetch('/download-all', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      session_id: lastSessionId,
      file_prefix: filePrefix
    })
  })
  .then(response => response.blob())
  .then(blob => {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filePrefix}.zip`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    }, 100);
  });
}

// Polling for batch status
function pollBatchStatus(sessionId) {
  if (!sessionId || isStatusRequestInFlight) {
    return;
  }

  isStatusRequestInFlight = true;
  fetch(`/batch-status/${sessionId}`)
    .then(res => res.json())
    .then(data => {
      if (!data.success || !data.status) {
        stopPolling();
        setFormBusy(false);
        document.getElementById('result').innerHTML = `<p style="color:red">Error: ${data.message || "Unable to check status"}</p>`;
        return;
      }

      updateResultsUI(data);
      if (data.status === "completed" || data.status === "error") {
        stopPolling();
        setFormBusy(false);
      }
    })
    .catch(err => {
      stopPolling();
      setFormBusy(false);
      document.getElementById('result').innerHTML = `<p>Error: ${err.message}</p>`;
    })
    .finally(() => {
      isStatusRequestInFlight = false;
    });
}

// Helper for skeleton loading placeholders
function getSkeletonHTML(count = 3) {
  let html = '';
  for (let i = 0; i < count; i++) {
    html += `
      <div class="skeleton-item">
        <div class="skeleton-text"></div>
        <div class="skeleton-button"></div>
      </div>
    `;
  }
  return html;
}

// Update UI with batch status, showing each file only once
function updateResultsUI(data) {
  let resultHTML = '';
  if (data.status === "processing") {
    const progress = data.total_batches ? Math.round((data.completed_batches / data.total_batches) * 100) : 0;
    const label = data.progress_label || `Processing... ${progress}%`;
    resultHTML += `
      <p style="margin-bottom:6px;">${label}</p>
      <div style="background:#ddd;border-radius:8px;height:14px;width:100%;overflow:hidden;">
        <div style="background:#4caf50;height:100%;width:${progress}%;transition:width 0.4s ease;border-radius:8px;"></div>
      </div>
      <p style="font-size:12px;color:#888;margin-top:4px;">${progress}% complete</p>`;
    
    // Show placeholder skeleton items while files are being processed
    if (!data.files || data.files.length === 0) {
      const docCheckboxes = document.querySelectorAll('.check');
      const selectedDocsCount = Array.from(docCheckboxes).filter(cb => cb.checked).length || 3;
      const startSrno = document.getElementById('startSrno').value;
      const endSrno = document.getElementById('endSrno').value;
      let count = selectedDocsCount;
      if (startSrno && endSrno) {
        const range = parseInt(endSrno) - parseInt(startSrno) + 1;
        count = Math.min(range * selectedDocsCount, 4);
      }
      resultHTML += `<div style="margin-top: 20px;">${getSkeletonHTML(count)}</div>`;
    }
  } else if (data.status === "completed") {
    resultHTML += `<p>✅ Processing complete!</p>`;
  } else if (data.status === "error") {
    resultHTML += `<p style="color:red">❌ Error: ${data.error || "Unknown error"}</p>`;
  }

  // Show files, only unique names
  const seenFiles = new Set();
  if (data.files && data.files.length > 0) {
    if (data.files.length > 1) {
      resultHTML += `
      <div class="output-item" style="justify-content: flex-end; margin-bottom: 20px;">
          <button class="download-all-btn" onclick="downloadAllFiles()">Download All</button>
      </div>
      `;
    }
    data.files.forEach((file) => {
      if (!seenFiles.has(file.name)) {
        seenFiles.add(file.name);
        resultHTML += `
          <div class="output-item">
            <span>${file.name}</span>
            <button class="download-btn" onclick="forceDownload('${file.url}', '${file.name}')">Download</button>
          </div>
        `;
      }
    });
  }

  if (data.missing_values && data.missing_values.length > 0) {
    resultHTML += `<div style="display : none;">Missing values in: ${data.missing_values.join(', ')}</div>`;
  }
  document.getElementById('result').innerHTML = resultHTML;
}
document.getElementById('searchBtn').addEventListener('click', function(event) {
  event.preventDefault();
  const useDate = document.getElementById('usedate').value;


  const company = document.getElementById('company').value;
  fetch('/search-srnos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ useDate, company })
  })
  .then(response => response.json())
  .then(data => {
    if (data.count > 0) {
      document.getElementById('result').innerHTML = `<p>Found <b>${data.count}</b> SRNOs for this date:<br>${data.srnos.join(', ')}</p>`;
    } else {
      document.getElementById('result').innerHTML = `<p style="color:red">No SRNOs found for this date.</p>`;
    }
  });
});

// Form submission handler
document.getElementById('trackForm').addEventListener('submit', function(event) {
  event.preventDefault();

  if (isProcessing) {
    return;
  }

  const passportNumber = document.getElementById('passportNumber').value;
  const outputFormat = document.querySelector('input[name="outputFormat"]:checked').value;
  const company = document.getElementById('company').value;
  const docCheckboxes = document.querySelectorAll('.check');
  const selectedDocs = Array.from(docCheckboxes)
    .filter(cb => cb.checked)
    .map(cb => cb.value);
  const useDate = document.getElementById('usedate').value;
  console.log('useDate sent to backend:', useDate);
  const startSrno = document.getElementById('startSrno').value;
  const endSrno = document.getElementById('endSrno').value;

  if ((!startSrno || !endSrno) && !passportNumber) {
    alert("Please provide either SRNO range or Passport Number");
    return;
  }

  if (!company || selectedDocs.length === 0) {
    alert("Please select company and at least one document");
    return;
  }

  // Calculate dynamic skeleton count to show immediately
  let initialSkeletonCount = selectedDocs.length;
  if (startSrno && endSrno) {
    const range = parseInt(endSrno) - parseInt(startSrno) + 1;
    initialSkeletonCount = Math.min(range * selectedDocs.length, 4);
  }

  document.getElementById('result').innerHTML = `
    <p style="margin-bottom:6px;">Processing... 0%</p>
    <div style="background:#ddd;border-radius:8px;height:14px;width:100%;overflow:hidden;">
      <div style="background:#4caf50;height:100%;width:0%;transition:width 0.4s ease;border-radius:8px;"></div>
    </div>
    <p style="font-size:12px;color:#888;margin-top:4px;">0% complete</p>
    <div style="margin-top: 20px;">
      ${getSkeletonHTML(initialSkeletonCount)}
    </div>
  `;

  stopPolling();
  isProcessing = true;
  setFormBusy(true);

  fetch('/process', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      passportNumber,
      startSrno,
      endSrno,
      outputFormat,
      company,
      selectedDocs,
      useDate
    })
  })
  .then(response => response.json())
  .then(data => {
    if (data.success) {
      lastSessionId = data.session_id;
      pollBatchStatus(lastSessionId);
      pollingInterval = setInterval(() => pollBatchStatus(lastSessionId), 5000);
    } else {
      stopPolling();
      setFormBusy(false);
      document.getElementById('result').innerHTML = `<p>Error: ${data.message}</p>`;
    }
  })
  .catch(err => {
    stopPolling();
    setFormBusy(false);
    document.getElementById('result').innerHTML = `<p>Error: ${err.message}</p>`;
  });
});

// (Optional) Set today's date on page load
document.addEventListener("DOMContentLoaded", () => {
  const today = new Date().toISOString().split("T")[0];
  document.getElementById("usedate").value = today;
});

// (Keep your dark mode code as is)
const toggle = document.getElementById('darkModeToggle');
if (localStorage.getItem('darkMode') === 'enabled') {
  toggle.checked = true;
  document.body.classList.add('dark-mode');
}
toggle.addEventListener('change', function() {
  if (this.checked) {
      document.body.classList.add('dark-mode');
      localStorage.setItem('darkMode', 'enabled');
  } else {
      document.body.classList.remove('dark-mode');
      localStorage.setItem('darkMode', 'disabled');
  }
});
