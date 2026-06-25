// ── OPTION C CONFIGURATION ───────────────────────────────────────────────────
// Set this to true to enable client-side PDF generation.
// Note: Client-side conversion requires compatible libraries (like mammoth.js or pdf-lib)
// which need to be loaded to support right-to-left layout and formatting.
const ENABLE_CLIENT_SIDE_PDF_CONVERSION = false;
// ─────────────────────────────────────────────────────────────────────────────

let lastSessionId = null;
let pollingInterval = null;
let isProcessing = false;
let isStatusRequestInFlight = false;
let selectedDirHandle = null;

document.addEventListener('DOMContentLoaded', () => {
  const refreshBtn = document.getElementById('refreshSystemBtn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      if(confirm('Are you sure you want to refresh the system? This will restart the document generator and cancel active conversions.')) {
        refreshBtn.disabled = true;
        fetch('/refresh-system', { method: 'POST' })
          .then(r => r.json())
          .then(d => {
             alert(d.message);
             setTimeout(() => window.location.reload(), 12000);
          })
          .catch(e => {
             refreshBtn.disabled = false;
             alert('Error refreshing system: ' + e);
          });
      }
    });
  }

  // Hamburger Menu Logic
  const hamburgerBtn = document.getElementById('hamburgerBtn');
  const hamburgerContent = document.getElementById('hamburgerContent');
  if (hamburgerBtn && hamburgerContent) {
    hamburgerBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      hamburgerContent.classList.toggle('show');
    });

    document.addEventListener('click', (e) => {
      if (!hamburgerBtn.contains(e.target) && !hamburgerContent.contains(e.target)) {
        hamburgerContent.classList.remove('show');
      }
    });
  }

  // Wire signature modal buttons
  initSigModalButtons();
  // Wire folder browse button and mutual exclusion
  initFolderBrowse();
});

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
  if (ENABLE_CLIENT_SIDE_PDF_CONVERSION && filename.toLowerCase().endsWith('.pdf')) {
      console.log(`[Option C] Client-side PDF generation activated for: ${filename}`);
      // Implement browser-based PDF generation logic here
      // For example, fetch the original docx and convert it in the user's browser.
      const docxUrl = url.replace(/\.pdf$/, '.docx');
      fetch(docxUrl)
        .then(resp => resp.blob())
        .then(docxBlob => {
            return convertDocxToPdfClientSide(docxBlob, filename);
        })
        .catch(err => {
            console.error("Client-side conversion failed, falling back to server download:", err);
            // Fallback to normal server download if client-side fails
            downloadBlob(url, filename);
        });
      return;
  }
  downloadBlob(url, filename);
}

function downloadBlob(url, filename) {
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

// Option C client-side conversion function (inactive for now)
async function convertDocxToPdfClientSide(docxBlob, filename) {
  // TODO: Add your custom client-side PDF generation library/logic here.
  // Example: Use mammoth.js to convert DOCX to HTML, then pdf-lib or html2pdf to create a PDF.
  // Since this is inactive, we show a warning and fall back to the server.
  console.warn("Client-side PDF conversion is enabled but not configured. PC compatibility check needed.");
  throw new Error("Client-side PDF engine not initialized.");
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

// ── SIGNATURE POPUP CONTROLLER ───────────────────────────────────────────────
const SIG_TYPES = [
  { value: 'employee_signature', label: 'Employee Signatures' },
  { value: 'sponsor_signature',  label: 'Sponsor Signatures'  },
  { value: 'stamp',              label: 'Stamps'              }
];

const sigFilesMap = {}; // { 'employee_signature': [File,...], ... }
let sigQueue = [];
let sigQueueIndex = 0;
let pendingFormPayload = null;
let currentDropFiles = []; // files collected for the current modal step

let scannedFolderData = {}; // srNum -> { employee_signature: File, sponsor_signature: File, stamp: File }
let selectedFolderName = "";

function initFolderBrowse() {
  const browseBtn = document.getElementById('sigBrowseFolderBtn');
  const clearBtn = document.getElementById('sigClearFolderBtn');
  const statusEl = document.getElementById('sigPathStatus');

  if (browseBtn) {
    browseBtn.addEventListener('click', handleFolderBrowse);
  }

  if (clearBtn) {
    clearBtn.addEventListener('click', clearFolderSelection);
  }

  // Setup mutual exclusion for checkboxes
  const checkboxes = document.querySelectorAll('.sig-check');
  checkboxes.forEach(cb => {
    cb.addEventListener('change', () => {
      const anyChecked = Array.from(checkboxes).some(c => c.checked);
      if (anyChecked) {
        if (selectedFolderName) {
          clearFolderSelection();
        }
        if (browseBtn) browseBtn.disabled = true;
        if (statusEl) {
          statusEl.className = 'sig-path-status warning';
          statusEl.textContent = '⚠️ Folder browsing disabled while manual signature checkboxes are checked.';
        }
      } else {
        if (browseBtn) browseBtn.disabled = false;
        if (statusEl) {
          statusEl.className = 'sig-path-status';
          statusEl.textContent = '';
        }
      }
    });
  });
}

function clearFolderSelection() {
  scannedFolderData = {};
  selectedFolderName = "";
  selectedDirHandle = null;
  
  const folderNameSpan = document.getElementById('sigFolderName');
  if (folderNameSpan) folderNameSpan.textContent = "No folder selected";

  const clearBtn = document.getElementById('sigClearFolderBtn');
  if (clearBtn) clearBtn.style.display = 'none';

  const statusEl = document.getElementById('sigPathStatus');
  if (statusEl) {
    statusEl.className = 'sig-path-status';
    statusEl.textContent = '';
  }

  const checkboxes = document.querySelectorAll('.sig-check');
  checkboxes.forEach(cb => {
    cb.disabled = false;
  });

  const browseBtn = document.getElementById('sigBrowseFolderBtn');
  if (browseBtn) browseBtn.disabled = false;
}

async function handleFolderBrowse() {
  const statusEl = document.getElementById('sigPathStatus');
  try {
    if (!window.showDirectoryPicker) {
      alert("Folder browsing is only supported on Chromium-based browsers (Chrome, Edge, Opera). Please use the manual signature checkboxes instead.");
      return;
    }

    const dirHandle = await window.showDirectoryPicker();
    selectedDirHandle = dirHandle;
    selectedFolderName = dirHandle.name;
    
    const folderNameSpan = document.getElementById('sigFolderName');
    if (folderNameSpan) folderNameSpan.textContent = selectedFolderName;

    const clearBtn = document.getElementById('sigClearFolderBtn');
    if (clearBtn) clearBtn.style.display = 'inline-block';
    
    const checkboxes = document.querySelectorAll('.sig-check');
    checkboxes.forEach(cb => {
      cb.checked = false;
      cb.disabled = true;
    });

    statusEl.className = 'sig-path-status warning';
    statusEl.textContent = 'Scanning folder...';

    const stats = await scanDirectory(dirHandle);

    statusEl.className = 'sig-path-status success';
    statusEl.textContent = `✅ Successfully scanned directory. Found ${stats.totalSrFolders} SR folders (Employee: ${stats.employeeCount}, Sponsor: ${stats.sponsorCount}, Stamp: ${stats.stampCount}).`;

  } catch (err) {
    console.error(err);
    if (err.name !== 'AbortError') {
      statusEl.className = 'sig-path-status error';
      statusEl.textContent = `❌ Error scanning: ${err.message}`;
      clearFolderSelection();
    }
  }
}

async function scanDirectory(dirHandle) {
    scannedFolderData = {};
    let totalSrFolders = 0;
    let employeeCount = 0;
    let sponsorCount = 0;
    let stampCount = 0;

    for await (const entry of dirHandle.values()) {
      if (entry.kind !== 'directory') continue;
      
      const match = entry.name.match(/^(\d+)/);
      if (!match) continue;
      
      const srNum = parseInt(match[1], 10);
      totalSrFolders++;

      for await (const fileEntry of entry.values()) {
        if (fileEntry.kind !== 'file') continue;
        
        const fname = fileEntry.name;
        const base = fname.replace(/\.[^.]+$/, '').toLowerCase();
        const ext = fname.split('.').pop().toLowerCase();
        
        if (!['png', 'jpg', 'jpeg'].includes(ext)) continue;
        
        let type = null;
        if (base === 'pax') {
          type = 'employee_signature';
          employeeCount++;
        } else if (base === 'spsg') {
          type = 'sponsor_signature';
          sponsorCount++;
        } else if (base === 'stamp') {
          type = 'stamp';
          stampCount++;
        }
        
        if (type) {
          const file = await fileEntry.getFile();
          const renamedFile = new File([file], `${srNum}.${ext}`, { type: file.type });
          if (!scannedFolderData[srNum]) {
            scannedFolderData[srNum] = {};
          }
          scannedFolderData[srNum][type] = renamedFile;
        }
      }
    }
    return { totalSrFolders, employeeCount, sponsorCount, stampCount };
}

function populateSigFilesMapFromScannedFolder() {
  Object.keys(sigFilesMap).forEach(k => delete sigFilesMap[k]);
  
  sigFilesMap['employee_signature'] = [];
  sigFilesMap['sponsor_signature'] = [];
  sigFilesMap['stamp'] = [];

  const startSrno = document.getElementById('startSrno').value;
  const endSrno = document.getElementById('endSrno').value;

  if (startSrno && endSrno) {
    const start = parseInt(startSrno, 10);
    const end = parseInt(endSrno, 10);
    for (let sr = start; sr <= end; sr++) {
      if (scannedFolderData[sr]) {
        if (scannedFolderData[sr].employee_signature) {
          sigFilesMap['employee_signature'].push(scannedFolderData[sr].employee_signature);
        }
        if (scannedFolderData[sr].sponsor_signature) {
          sigFilesMap['sponsor_signature'].push(scannedFolderData[sr].sponsor_signature);
        }
        if (scannedFolderData[sr].stamp) {
          sigFilesMap['stamp'].push(scannedFolderData[sr].stamp);
        }
      }
    }
  } else {
    Object.keys(scannedFolderData).forEach(sr => {
      const data = scannedFolderData[sr];
      if (data.employee_signature) sigFilesMap['employee_signature'].push(data.employee_signature);
      if (data.sponsor_signature) sigFilesMap['sponsor_signature'].push(data.sponsor_signature);
      if (data.stamp) sigFilesMap['stamp'].push(data.stamp);
    });
  }
}

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function renderFileList(files) {
  const list = document.getElementById('sigFileList');
  if (!files || files.length === 0) {
    list.innerHTML = '';
    return;
  }
  list.innerHTML = Array.from(files).map(f => `
    <div class="sig-file-item">
      <span class="sig-file-item-name">📄 ${f.name}</span>
      <span class="sig-file-item-size">${formatBytes(f.size)}</span>
    </div>
  `).join('');
}

function loadImageForCanvas(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read signature image'));
    };
    img.src = url;
  });
}

function canvasToPngBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob) resolve(blob);
      else reject(new Error('Could not convert signature image'));
    }, 'image/png');
  });
}

async function removeSignatureBackground(file) {
  if (!/\.(png|jpe?g)$/i.test(file.name)) return file;

  const img = await loadImageForCanvas(file);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  canvas.width = img.naturalWidth || img.width;
  canvas.height = img.naturalHeight || img.height;
  ctx.drawImage(img, 0, 0);

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  let minX = canvas.width;
  let minY = canvas.height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const i = (y * canvas.width + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const isLightNeutral = max > 218 && (max - min) < 42;
      const isAlmostWhite = r > 238 && g > 238 && b > 238;

      if (isLightNeutral || isAlmostWhite) {
        data[i + 3] = 0;
      } else if (data[i + 3] > 15) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < minX || maxY < minY) return file;
  ctx.putImageData(imageData, 0, 0);

  const pad = 12;
  minX = Math.max(0, minX - pad);
  minY = Math.max(0, minY - pad);
  maxX = Math.min(canvas.width - 1, maxX + pad);
  maxY = Math.min(canvas.height - 1, maxY + pad);

  const cropWidth = maxX - minX + 1;
  const cropHeight = maxY - minY + 1;
  const cropCanvas = document.createElement('canvas');
  cropCanvas.width = cropWidth;
  cropCanvas.height = cropHeight;
  cropCanvas.getContext('2d').drawImage(canvas, minX, minY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);

  const blob = await canvasToPngBlob(cropCanvas);
  const baseName = file.name.replace(/\.[^.]+$/, '');
  return new File([blob], `${baseName}.png`, { type: 'image/png', lastModified: file.lastModified });
}

async function prepareSignatureFile(file, type) {
  if (!type.includes('signature')) return file;
  try {
    return await removeSignatureBackground(file);
  } catch (err) {
    console.warn(`Signature cleanup skipped for ${file.name}:`, err);
    return file;
  }
}
function openSigModal(sigType) {
  const overlay   = document.getElementById('sigModalOverlay');
  const title     = document.getElementById('sigModalTitle');
  const stepBadge = document.getElementById('sigModalStep');
  const fileInput = document.getElementById('sigFileInput');
  const nextBtn   = document.getElementById('sigNextBtn');
  const dropZone  = document.getElementById('sigDropZone');

  const isLast = sigQueueIndex === sigQueue.length - 1;
  title.textContent = `✍️ Upload ${sigType.label}`;
  nextBtn.textContent = isLast ? '▶ Start Generating' : 'Next →';
  stepBadge.textContent = `Step ${sigQueueIndex + 1} of ${sigQueue.length}`;

  // Reset state for this step
  fileInput.value = '';
  currentDropFiles = [];
  renderFileList([]);

  // File input change
  fileInput.onchange = () => {
    currentDropFiles = Array.from(fileInput.files);
    renderFileList(currentDropFiles);
  };

  // Drag and drop events
  dropZone.ondragover = (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
  };
  dropZone.ondragleave = (e) => {
    if (!dropZone.contains(e.relatedTarget)) {
      dropZone.classList.remove('dragover');
    }
  };
  dropZone.ondrop = (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    const droppedFiles = Array.from(e.dataTransfer.files).filter(f =>
      /\.(png|jpg|jpeg)$/i.test(f.name)
    );
    if (droppedFiles.length > 0) {
      currentDropFiles = droppedFiles;
      renderFileList(currentDropFiles);
    }
  };

  // Clicking the drop zone (not just the button) also triggers file browser
  dropZone.onclick = (e) => {
    if (!e.target.closest('.sig-file-label')) {
      fileInput.click();
    }
  };

  overlay.style.display = 'flex';
}

function closeSigModal() {
  const dropZone = document.getElementById('sigDropZone');
  if (dropZone) {
    dropZone.ondragover = null;
    dropZone.ondragleave = null;
    dropZone.ondrop = null;
    dropZone.onclick = null;
  }
  document.getElementById('sigModalOverlay').style.display = 'none';
}

function proceedSigQueue() {
  const currentType = sigQueue[sigQueueIndex];
  // Use dragged files if any, else fall back to file input
  const fileInput = document.getElementById('sigFileInput');
  const files = currentDropFiles.length > 0 ? currentDropFiles : Array.from(fileInput.files);
  sigFilesMap[currentType.value] = files;

  sigQueueIndex++;
  if (sigQueueIndex < sigQueue.length) {
    openSigModal(sigQueue[sigQueueIndex]);
  } else {
    closeSigModal();
    submitWithSignatures();
  }
}

async function submitWithSignatures() {
  if (!pendingFormPayload) return;

  const formData = new FormData();
  Object.entries(pendingFormPayload).forEach(([k, v]) => {
    if (Array.isArray(v)) {
      v.forEach(item => formData.append(k + '[]', item));
    } else {
      formData.append(k, v);
    }
  });

  for (const [type, files] of Object.entries(sigFilesMap)) {
    for (const file of files) {
      const preparedFile = await prepareSignatureFile(file, type);
      formData.append(`sig_${type}`, preparedFile);
    }
  }

  submitFormData(formData, true);
}

function initSigModalButtons() {
  document.getElementById('sigNextBtn').addEventListener('click', proceedSigQueue);
  document.getElementById('sigCancelBtn').addEventListener('click', () => { closeSigModal(); stopPolling(); setFormBusy(false); });
  document.getElementById('sigModalClose').addEventListener('click', () => { closeSigModal(); stopPolling(); setFormBusy(false); });
}
// ── END SIGNATURE POPUP CONTROLLER ───────────────────────────────────────────

// Form submission handler
document.getElementById('trackForm').addEventListener('submit', async function(event) {
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

  // Check which signature types are selected
  const checkedSigTypes = SIG_TYPES.filter(st => {
    const el = document.querySelector(`.sig-check[value="${st.value}"]`);
    return el && el.checked;
  });

  // Calculate dynamic skeleton count to show immediately
  let initialSkeletonCount = selectedDocs.length;
  if (startSrno && endSrno) {
    const range = parseInt(endSrno) - parseInt(startSrno) + 1;
    initialSkeletonCount = Math.min(range * selectedDocs.length, 4);
  }

  document.getElementById('result').innerHTML = `
    <p style="margin-bottom:6px;">Downloading latest data from Google Sheets (this may take up to 20s)...</p>
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

  // Store form payload
  pendingFormPayload = { passportNumber, startSrno, endSrno, outputFormat, company, useDate, selectedDocs };

  if (selectedDirHandle) {
    // Re-scan folder right before submission to pick up the absolute latest changes!
    try {
        const statusEl = document.getElementById('sigPathStatus');
        if (statusEl) {
            statusEl.className = 'sig-path-status warning';
            statusEl.textContent = 'Fetching latest files from folder...';
        }
        await scanDirectory(selectedDirHandle);
        if (statusEl) {
            statusEl.className = 'sig-path-status success';
            statusEl.textContent = `✅ Latest files synced successfully. ${stats.totalSrFolders} SR folders (Employee: ${stats.employeeCount}, Sponsor: ${stats.sponsorCount}, Stamp: ${stats.stampCount}).`;
        }
    } catch (err) {
        console.warn("Failed to rescan directory before submit:", err);
    }
    // Using browsed folder path signatures
    populateSigFilesMapFromScannedFolder();
    submitWithSignatures();
  } else if (checkedSigTypes.length > 0) {
    // Open sequential upload popup first
    sigQueue = checkedSigTypes;
    sigQueueIndex = 0;
    Object.keys(sigFilesMap).forEach(k => delete sigFilesMap[k]); // clear previous
    openSigModal(sigQueue[0]);
  } else {
    // No signatures — submit directly as JSON (existing behaviour)
    submitFormData(pendingFormPayload, false);
  }
});

// ── SHARED SUBMIT FUNCTION ────────────────────────────────────────────────────
// Called either directly (no sigs) or after modal collection (with sigs).
function submitFormData(payload, isMultipart) {
  let fetchOptions;
  if (isMultipart) {
    // FormData with files
    fetchOptions = { method: 'POST', body: payload };
  } else {
    // Plain JSON (original path — unchanged)
    fetchOptions = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    };
  }

  fetch('/process', fetchOptions)
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
}
// ── END SHARED SUBMIT ─────────────────────────────────────────────────────────

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
