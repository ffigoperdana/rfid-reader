(function () {
  "use strict";

  const DEFAULT_NAMES = [
    "maulida.afifah",
    "wahid.fathurrohman",
    "jilahan.jahroo",
    "aditya.putra",
    "figo.putra",
    "marzetha.indaswari",
    "marsha.amydea",
    "rizka.shafira",
    "aji.saputra",
    "rahmat.harahap",
    "ary.pratama",
    "siti.muthiah",
    "aulia.fauziyah",
    "saori.oktari",
    "al.hidayat",
    "prissly.ilela",
    "muhammad.ramahadi",
    "refika.pratiwi",
    "gryselda.gurnita",
    "aulia.aditiarawati",
    "adinda.wibowo",
    "m.putra",
    "ardandy.irshadi",
    "asmi.firmanshah",
    "taufan",
    "annisa.fitranti",
    "ratna.rengganis",
    "gulfi.oktariani",
    "cindy.sari",
    "indriyanti",
  ];

  const STORAGE_KEY = "rfid-pair-session-v1";
  const AUTO_SUBMIT_DELAY = 190;
  const MIN_AUTO_SUBMIT_LENGTH = 3;

  const elements = {
    setupView: document.querySelector("#setupView"),
    scannerView: document.querySelector("#scannerView"),
    editorView: document.querySelector("#editorView"),
    brandButton: document.querySelector("#brandButton"),
    setupForm: document.querySelector("#setupForm"),
    namesInput: document.querySelector("#namesInput"),
    nameCount: document.querySelector("#nameCount"),
    startButtonText: document.querySelector("#startButtonText"),
    resumeNote: document.querySelector("#resumeNote"),
    resumeText: document.querySelector("#resumeText"),
    backToSetupButton: document.querySelector("#backToSetupButton"),
    pauseButton: document.querySelector("#pauseButton"),
    openEditorButton: document.querySelector("#openEditorButton"),
    progressLabel: document.querySelector("#progressLabel"),
    progressPercent: document.querySelector("#progressPercent"),
    progressBar: document.querySelector("#progressBar"),
    activeScanPanel: document.querySelector("#activeScanPanel"),
    currentStepLabel: document.querySelector("#currentStepLabel"),
    scannerTitle: document.querySelector("#scannerTitle"),
    currentPersonHint: document.querySelector("#currentPersonHint"),
    readerInputWrap: document.querySelector("#readerInputWrap"),
    readerStatusTitle: document.querySelector("#readerStatusTitle"),
    readerStatusText: document.querySelector("#readerStatusText"),
    scanInput: document.querySelector("#scanInput"),
    scanError: document.querySelector("#scanError"),
    scanActions: document.querySelector(".scan-actions"),
    undoButton: document.querySelector("#undoButton"),
    skipButton: document.querySelector("#skipButton"),
    completionCard: document.querySelector("#completionCard"),
    completionTitle: document.querySelector("#completionTitle"),
    completionText: document.querySelector("#completionText"),
    reviewDataButton: document.querySelector("#reviewDataButton"),
    fillMissingButton: document.querySelector("#fillMissingButton"),
    queueSummary: document.querySelector("#queueSummary"),
    queueCount: document.querySelector("#queueCount"),
    queueList: document.querySelector("#queueList"),
    backToScannerButton: document.querySelector("#backToScannerButton"),
    copyCsvButton: document.querySelector("#copyCsvButton"),
    downloadCsvButton: document.querySelector("#downloadCsvButton"),
    editorFilledCount: document.querySelector("#editorFilledCount"),
    editorEmptyCount: document.querySelector("#editorEmptyCount"),
    editorAlert: document.querySelector("#editorAlert"),
    editorTableBody: document.querySelector("#editorTableBody"),
    resetSessionButton: document.querySelector("#resetSessionButton"),
    toast: document.querySelector("#toast"),
    toastText: document.querySelector("#toastText"),
    confirmDialog: document.querySelector("#confirmDialog"),
    confirmTitle: document.querySelector("#confirmTitle"),
    confirmMessage: document.querySelector("#confirmMessage"),
    confirmAcceptButton: document.querySelector("#confirmAcceptButton"),
  };

  let state = createEmptyState();
  let currentView = "setup";
  let scanTimer = null;
  let scanBurstStart = 0;
  let scanInputEvents = 0;
  let lastAcceptedAt = 0;
  let toastTimer = null;

  function createEmptyState(names = DEFAULT_NAMES) {
    return {
      names: [...names],
      records: names.map(() => ""),
      currentIndex: 0,
      started: false,
      paused: false,
      lastScan: null,
      updatedAt: Date.now(),
    };
  }

  function parseNames(value) {
    return value
      .split(/\r?\n/)
      .map((name) => name.trim())
      .filter(Boolean);
  }

  function normalizeCode(value) {
    return String(value || "")
      .replace(/[\r\n\t]/g, "")
      .trim();
  }

  function countFilled() {
    return state.records.filter((code) => Boolean(normalizeCode(code))).length;
  }

  function findDuplicateNames(names) {
    const seen = new Set();
    const duplicates = new Set();
    names.forEach((name) => {
      const key = name.toLocaleLowerCase("id-ID");
      if (seen.has(key)) duplicates.add(name);
      seen.add(key);
    });
    return [...duplicates];
  }

  function getDuplicateCodeIndexes() {
    const codeMap = new Map();
    state.records.forEach((rawCode, index) => {
      const code = normalizeCode(rawCode);
      if (!code) return;
      if (!codeMap.has(code)) codeMap.set(code, []);
      codeMap.get(code).push(index);
    });

    const duplicates = new Set();
    codeMap.forEach((indexes) => {
      if (indexes.length > 1) indexes.forEach((index) => duplicates.add(index));
    });
    return duplicates;
  }

  function isSameNameList(left, right) {
    return left.length === right.length && left.every((name, index) => name === right[index]);
  }

  function safeLoadState() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed.names) || !Array.isArray(parsed.records)) return null;
      if (parsed.names.length !== parsed.records.length || parsed.names.length === 0) return null;

      return {
        names: parsed.names.map((name) => String(name)),
        records: parsed.records.map((code) => normalizeCode(code)),
        currentIndex: Number.isInteger(parsed.currentIndex)
          ? Math.max(0, Math.min(parsed.currentIndex, parsed.names.length))
          : 0,
        started: Boolean(parsed.started),
        paused: false,
        lastScan:
          parsed.lastScan && Number.isInteger(parsed.lastScan.index)
            ? {
                index: parsed.lastScan.index,
                previousCode: normalizeCode(parsed.lastScan.previousCode),
                newCode: normalizeCode(parsed.lastScan.newCode),
              }
            : null,
        updatedAt: Number(parsed.updatedAt) || Date.now(),
      };
    } catch (error) {
      console.warn("Sesi tersimpan tidak dapat dibaca.", error);
      return null;
    }
  }

  function saveState() {
    state.updatedAt = Date.now();
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      console.warn("Progres tidak dapat disimpan ke browser.", error);
    }
  }

  function updateNameCounter() {
    const names = parseNames(elements.namesInput.value);
    const duplicates = findDuplicateNames(names);
    elements.nameCount.textContent = `${names.length} nama`;
    elements.nameCount.classList.toggle("has-warning", duplicates.length > 0);
    elements.nameCount.title = duplicates.length
      ? `Nama duplikat: ${duplicates.join(", ")}`
      : "";
  }

  function updateResumeNote() {
    const filled = countFilled();
    const hasProgress = state.started && state.names.length > 0;
    elements.resumeNote.hidden = !hasProgress;
    elements.resumeText.textContent = `${filled} dari ${state.names.length} kartu terisi`;
    elements.startButtonText.textContent = hasProgress ? "Lanjutkan scan" : "Mulai scan";
  }

  function setView(view) {
    currentView = view;
    elements.setupView.hidden = view !== "setup";
    elements.scannerView.hidden = view !== "scanner";
    elements.editorView.hidden = view !== "editor";
    window.scrollTo({ top: 0, behavior: "smooth" });

    if (view === "setup") {
      elements.namesInput.value = state.names.join("\n");
      updateNameCounter();
      updateResumeNote();
    }

    if (view === "scanner") {
      renderScanner();
      focusScannerSoon();
    }

    if (view === "editor") {
      clearScanTimer();
      renderEditor();
    }
  }

  function initializeSession(names) {
    state = createEmptyState(names);
    state.started = true;
    saveState();
    setView("scanner");
  }

  async function handleStart(event) {
    event.preventDefault();
    const names = parseNames(elements.namesInput.value);
    if (!names.length) {
      showToast("Isi minimal satu nama terlebih dahulu.", "error");
      elements.namesInput.focus();
      return;
    }

    const duplicates = findDuplicateNames(names);
    if (duplicates.length) {
      const confirmed = await askConfirmation({
        title: "Ada nama yang berulang",
        message: `${duplicates.join(", ")} muncul lebih dari sekali. Tetap gunakan daftar ini?`,
        confirmLabel: "Tetap lanjut",
        danger: false,
      });
      if (!confirmed) return;
    }

    if (state.started && isSameNameList(names, state.names)) {
      state.paused = false;
      if (state.currentIndex >= state.names.length) {
        const firstEmpty = state.records.findIndex((code) => !normalizeCode(code));
        if (firstEmpty >= 0) state.currentIndex = firstEmpty;
      }
      saveState();
      setView("scanner");
      return;
    }

    if (state.started && countFilled() > 0 && !isSameNameList(names, state.names)) {
      const confirmed = await askConfirmation({
        title: "Ganti daftar nama?",
        message: "Daftar berubah. Progres scan yang tersimpan akan dikosongkan agar urutannya tetap aman.",
        confirmLabel: "Ganti & mulai baru",
        danger: true,
      });
      if (!confirmed) return;
    }

    initializeSession(names);
  }

  function findNextEmpty(startIndex) {
    for (let index = startIndex; index < state.records.length; index += 1) {
      if (!normalizeCode(state.records[index])) return index;
    }
    return state.names.length;
  }

  function getActiveIndex() {
    return state.currentIndex >= 0 && state.currentIndex < state.names.length
      ? state.currentIndex
      : -1;
  }

  function renderScanner() {
    const filled = countFilled();
    const total = state.names.length;
    const percent = total ? Math.round((filled / total) * 100) : 0;
    const activeIndex = getActiveIndex();
    const completePass = activeIndex === -1;
    const emptyCount = total - filled;

    elements.progressLabel.textContent = `${filled} dari ${total} kartu terisi`;
    elements.progressPercent.textContent = `${percent}%`;
    elements.progressBar.style.width = `${percent}%`;
    elements.queueSummary.textContent = emptyCount ? `${emptyCount} belum diisi` : "Semua sudah terisi";
    elements.queueCount.textContent = total;

    elements.activeScanPanel.hidden = completePass;
    elements.readerInputWrap.hidden = completePass;
    elements.scanError.hidden = true;
    elements.scanError.textContent = "";
    elements.scanActions.hidden = completePass;
    elements.completionCard.hidden = !completePass;

    if (!completePass) {
      const existingCode = normalizeCode(state.records[activeIndex]);
      elements.currentStepLabel.textContent = existingCode ? "SCAN ULANG UNTUK" : `KARTU ${activeIndex + 1} DARI ${total} UNTUK`;
      elements.scannerTitle.textContent = state.names[activeIndex];
      elements.currentPersonHint.textContent = existingCode
        ? `Kode saat ini: ${existingCode}. Tap kartu baru untuk menggantinya.`
        : "Tempelkan kartu milik nama di atas ke reader.";
    } else {
      elements.completionTitle.textContent = emptyCount
        ? `${filled} kartu sudah dipasangkan.`
        : "Semua kartu sudah dipasangkan.";
      elements.completionText.textContent = emptyCount
        ? `${emptyCount} nama masih kosong. Kamu bisa mengisinya sekarang atau mengedit data secara manual.`
        : "Periksa kembali datanya sebelum mengunduh CSV.";
      elements.fillMissingButton.hidden = emptyCount === 0;
    }

    elements.undoButton.disabled = !state.lastScan;
    updatePauseUi();
    renderQueue();
  }

  function renderQueue() {
    const fragment = document.createDocumentFragment();
    elements.queueList.replaceChildren();

    state.names.forEach((name, index) => {
      const code = normalizeCode(state.records[index]);
      const button = document.createElement("button");
      button.type = "button";
      button.className = "queue-item";
      button.dataset.index = String(index);
      button.setAttribute("role", "listitem");
      button.setAttribute("aria-label", `${name}, ${code ? `RFID ${code}` : "belum diisi"}`);
      if (index === state.currentIndex) button.classList.add("is-active");
      if (code) button.classList.add("is-complete");

      const number = document.createElement("span");
      number.className = "queue-item__number";
      number.textContent = String(index + 1).padStart(2, "0");

      const copy = document.createElement("span");
      copy.className = "queue-item__copy";
      const strong = document.createElement("strong");
      strong.textContent = name;
      const small = document.createElement("small");
      small.textContent = code || "Menunggu scan";
      copy.append(strong, small);

      const status = document.createElement("span");
      status.className = "queue-item__status";
      status.textContent = "✓";
      status.setAttribute("aria-hidden", "true");

      button.append(number, copy, status);
      fragment.append(button);
    });

    elements.queueList.append(fragment);
    const active = elements.queueList.querySelector(".is-active");
    if (active) active.scrollIntoView({ block: "nearest" });
  }

  function updatePauseUi() {
    const paused = state.paused;
    elements.scanInput.disabled = paused || getActiveIndex() === -1;
    elements.readerInputWrap.classList.toggle("is-paused", paused);
    elements.readerStatusTitle.textContent = paused ? "Scan sedang dijeda" : "Siap membaca kartu";
    elements.readerStatusText.textContent = paused
      ? "Tekan Mulai lagi untuk melanjutkan"
      : "Klik area ini bila reader belum merespons";
    elements.pauseButton.querySelector("span").textContent = paused ? "Mulai lagi" : "Jeda";
    const icon = elements.pauseButton.querySelector("svg");
    icon.innerHTML = paused
      ? '<path d="m9 7 8 5-8 5V7Z" fill="currentColor" stroke="none" />'
      : '<path d="M9 7v10M15 7v10" />';
  }

  function focusScannerSoon() {
    if (currentView !== "scanner" || state.paused || getActiveIndex() === -1) return;
    window.setTimeout(() => {
      if (currentView === "scanner" && !state.paused) elements.scanInput.focus({ preventScroll: true });
    }, 70);
  }

  function clearScanTimer() {
    if (scanTimer) window.clearTimeout(scanTimer);
    scanTimer = null;
  }

  function resetScanBuffer() {
    clearScanTimer();
    elements.scanInput.value = "";
    scanBurstStart = 0;
    scanInputEvents = 0;
  }

  function scheduleAutoSubmit(event) {
    clearScanTimer();
    const code = normalizeCode(elements.scanInput.value);
    if (!code) {
      resetScanBuffer();
      return;
    }

    if (!scanBurstStart) scanBurstStart = performance.now();
    scanInputEvents += 1;
    const isPaste = event && event.inputType === "insertFromPaste";

    if (code.length >= MIN_AUTO_SUBMIT_LENGTH && (scanInputEvents >= 3 || isPaste)) {
      scanTimer = window.setTimeout(() => submitScan("timeout"), AUTO_SUBMIT_DELAY);
    }
  }

  function submitScan(source) {
    clearScanTimer();
    if (currentView !== "scanner" || state.paused) return;
    const activeIndex = getActiveIndex();
    if (activeIndex === -1) return;

    const code = normalizeCode(elements.scanInput.value);
    resetScanBuffer();
    if (!code) {
      focusScannerSoon();
      return;
    }

    const now = Date.now();
    if (now - lastAcceptedAt < 300) {
      focusScannerSoon();
      return;
    }

    const duplicateIndex = state.records.findIndex(
      (savedCode, index) => index !== activeIndex && normalizeCode(savedCode) === code,
    );
    if (duplicateIndex >= 0) {
      showScanError(`Kode ${code} sudah dipakai oleh ${state.names[duplicateIndex]}. Coba kartu lain.`);
      focusScannerSoon();
      return;
    }

    const previousCode = normalizeCode(state.records[activeIndex]);
    state.records[activeIndex] = code;
    state.lastScan = {
      index: activeIndex,
      previousCode,
      newCode: code,
      source,
    };
    lastAcceptedAt = now;
    state.currentIndex = findNextEmpty(activeIndex + 1);
    saveState();
    showToast(`${state.names[activeIndex]} · ${code}`);
    renderScanner();
    focusScannerSoon();
  }

  function showScanError(message) {
    elements.scanError.textContent = message;
    elements.scanError.hidden = false;
    elements.readerInputWrap.classList.add("is-error");
    window.setTimeout(() => elements.readerInputWrap.classList.remove("is-error"), 900);
  }

  function handleScanKeydown(event) {
    if (event.key === "Enter" || event.key === "Tab") {
      event.preventDefault();
      submitScan(event.key.toLowerCase());
    }
  }

  function handleUndo() {
    if (!state.lastScan) return;
    const { index, previousCode } = state.lastScan;
    state.records[index] = previousCode || "";
    state.currentIndex = index;
    state.lastScan = null;
    state.paused = false;
    saveState();
    renderScanner();
    showToast("Scan terakhir dibatalkan.");
    focusScannerSoon();
  }

  function handleSkip() {
    const activeIndex = getActiveIndex();
    if (activeIndex === -1) return;
    state.currentIndex = activeIndex + 1;
    if (state.currentIndex >= state.names.length) state.currentIndex = state.names.length;
    saveState();
    renderScanner();
    focusScannerSoon();
  }

  function togglePause() {
    state.paused = !state.paused;
    resetScanBuffer();
    saveState();
    updatePauseUi();
    if (!state.paused) focusScannerSoon();
  }

  function jumpToQueueItem(event) {
    const button = event.target.closest(".queue-item");
    if (!button) return;
    state.currentIndex = Number(button.dataset.index);
    state.paused = false;
    saveState();
    renderScanner();
    focusScannerSoon();
  }

  function renderEditor() {
    const fragment = document.createDocumentFragment();
    elements.editorTableBody.replaceChildren();

    state.names.forEach((name, index) => {
      const row = document.createElement("tr");
      const numberCell = document.createElement("td");
      numberCell.textContent = String(index + 1).padStart(2, "0");

      const nameCell = document.createElement("td");
      nameCell.textContent = name;

      const codeCell = document.createElement("td");
      codeCell.className = "rfid-cell";
      const input = document.createElement("input");
      input.type = "text";
      input.className = "rfid-edit-input";
      input.value = normalizeCode(state.records[index]);
      input.placeholder = "Belum diisi";
      input.dataset.index = String(index);
      input.autocomplete = "off";
      input.spellcheck = false;
      input.setAttribute("aria-label", `Kode RFID untuk ${name}`);
      codeCell.append(input);

      const statusCell = document.createElement("td");
      const status = document.createElement("span");
      status.className = "row-status";
      status.dataset.statusIndex = String(index);
      status.textContent = normalizeCode(state.records[index]) ? "✓" : "—";
      statusCell.append(status);

      row.append(numberCell, nameCell, codeCell, statusCell);
      fragment.append(row);
    });

    elements.editorTableBody.append(fragment);
    refreshEditorValidation();
  }

  function handleEditorInput(event) {
    const input = event.target.closest(".rfid-edit-input");
    if (!input) return;
    const index = Number(input.dataset.index);
    state.records[index] = normalizeCode(input.value);
    state.lastScan = null;
    saveState();
    refreshEditorValidation();
  }

  function handleEditorBlur(event) {
    const input = event.target.closest(".rfid-edit-input");
    if (!input) return;
    const index = Number(input.dataset.index);
    input.value = normalizeCode(state.records[index]);
  }

  function refreshEditorValidation() {
    const duplicates = getDuplicateCodeIndexes();
    const filled = countFilled();
    const empty = state.names.length - filled;

    elements.editorFilledCount.textContent = String(filled);
    elements.editorEmptyCount.textContent = String(empty);
    elements.editorAlert.hidden = duplicates.size === 0;
    elements.editorAlert.textContent = duplicates.size
      ? "Ada kode RFID yang dipakai lebih dari sekali. Perbaiki field berwarna merah sebelum mengekspor CSV."
      : "";
    elements.downloadCsvButton.disabled = duplicates.size > 0;
    elements.copyCsvButton.disabled = duplicates.size > 0;

    elements.editorTableBody.querySelectorAll(".rfid-edit-input").forEach((input) => {
      const index = Number(input.dataset.index);
      input.classList.toggle("is-duplicate", duplicates.has(index));
      input.setAttribute("aria-invalid", duplicates.has(index) ? "true" : "false");
    });

    elements.editorTableBody.querySelectorAll(".row-status").forEach((status) => {
      const index = Number(status.dataset.statusIndex);
      const hasCode = Boolean(normalizeCode(state.records[index]));
      status.classList.toggle("is-complete", hasCode && !duplicates.has(index));
      status.classList.toggle("is-duplicate", duplicates.has(index));
      status.textContent = duplicates.has(index) ? "!" : hasCode ? "✓" : "—";
      status.title = duplicates.has(index) ? "Kode duplikat" : hasCode ? "Terisi" : "Belum diisi";
    });
  }

  function csvEscape(value) {
    return `"${String(value).replace(/"/g, '""')}"`;
  }

  function buildCsv() {
    const rows = [["nama", "kode rfid"]];
    state.names.forEach((name, index) => rows.push([name, normalizeCode(state.records[index])]));
    return rows.map((row) => row.map(csvEscape).join(",")).join("\r\n");
  }

  function canExport() {
    if (getDuplicateCodeIndexes().size) {
      showToast("Perbaiki kode RFID duplikat terlebih dahulu.", "error");
      return false;
    }
    return true;
  }

  function downloadCsv() {
    if (!canExport()) return;
    const blob = new Blob(["\uFEFF", buildCsv()], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const date = new Date().toISOString().slice(0, 10);
    link.href = url;
    link.download = `data-rfid-${date}.csv`;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast("File CSV berhasil dibuat.");
  }

  async function copyCsv() {
    if (!canExport()) return;
    const csv = buildCsv();
    try {
      await navigator.clipboard.writeText(csv);
    } catch (_error) {
      const helper = document.createElement("textarea");
      helper.value = csv;
      helper.style.position = "fixed";
      helper.style.opacity = "0";
      document.body.append(helper);
      helper.select();
      document.execCommand("copy");
      helper.remove();
    }
    showToast("CSV disalin ke clipboard.");
  }

  async function resetSession() {
    const confirmed = await askConfirmation({
      title: "Reset seluruh sesi?",
      message: "Semua kode RFID yang sudah dipasangkan akan dikosongkan. Tindakan ini tidak bisa dibatalkan.",
      confirmLabel: "Ya, reset sesi",
      danger: true,
    });
    if (!confirmed) return;

    const currentNames = [...state.names];
    state = createEmptyState(currentNames);
    saveState();
    setView("setup");
    showToast("Sesi sudah direset.");
  }

  function askConfirmation({ title, message, confirmLabel, danger }) {
    elements.confirmTitle.textContent = title;
    elements.confirmMessage.textContent = message;
    elements.confirmAcceptButton.textContent = confirmLabel;
    elements.confirmAcceptButton.className = `button ${danger ? "button--danger" : "button--primary"}`;
    elements.confirmDialog.showModal();

    return new Promise((resolve) => {
      const onClose = () => {
        resolve(elements.confirmDialog.returnValue === "confirm");
        elements.confirmDialog.removeEventListener("close", onClose);
      };
      elements.confirmDialog.addEventListener("close", onClose);
    });
  }

  function showToast(message, type = "success") {
    if (toastTimer) window.clearTimeout(toastTimer);
    elements.toastText.textContent = message;
    elements.toast.hidden = false;
    elements.toast.querySelector(".toast__icon").style.background =
      type === "error" ? "var(--danger)" : "var(--primary)";
    toastTimer = window.setTimeout(() => {
      elements.toast.hidden = true;
    }, 2600);
  }

  function fillFirstMissing() {
    const firstEmpty = state.records.findIndex((code) => !normalizeCode(code));
    if (firstEmpty < 0) return;
    state.currentIndex = firstEmpty;
    state.paused = false;
    saveState();
    renderScanner();
    focusScannerSoon();
  }

  function returnToScanner() {
    const firstEmpty = state.records.findIndex((code) => !normalizeCode(code));
    if (firstEmpty < 0) {
      state.currentIndex = state.names.length;
    } else if (state.currentIndex >= state.names.length || normalizeCode(state.records[state.currentIndex])) {
      state.currentIndex = firstEmpty;
    }
    state.paused = false;
    saveState();
    setView("scanner");
  }

  function handleGlobalKeydown(event) {
    if (currentView !== "scanner" || state.paused || getActiveIndex() === -1) return;
    const target = event.target;
    const isEditable = target.matches("input, textarea, [contenteditable='true']");
    if (!isEditable && (event.key.length === 1 || event.key === "Enter" || event.key === "Tab")) {
      elements.scanInput.focus({ preventScroll: true });
      if (event.key.length === 1) {
        elements.scanInput.value += event.key;
        scheduleAutoSubmit({ inputType: "insertText" });
        event.preventDefault();
      } else {
        event.preventDefault();
        submitScan(event.key.toLowerCase());
      }
    }
  }

  function attachEvents() {
    elements.setupForm.addEventListener("submit", handleStart);
    elements.namesInput.addEventListener("input", updateNameCounter);
    elements.brandButton.addEventListener("click", () => setView("setup"));
    elements.backToSetupButton.addEventListener("click", () => setView("setup"));
    elements.pauseButton.addEventListener("click", togglePause);
    elements.openEditorButton.addEventListener("click", () => setView("editor"));
    elements.reviewDataButton.addEventListener("click", () => setView("editor"));
    elements.backToScannerButton.addEventListener("click", returnToScanner);
    elements.fillMissingButton.addEventListener("click", fillFirstMissing);
    elements.scanInput.addEventListener("keydown", handleScanKeydown);
    elements.scanInput.addEventListener("input", scheduleAutoSubmit);
    elements.scanInput.addEventListener("focus", () => elements.readerInputWrap.classList.add("is-focused"));
    elements.scanInput.addEventListener("blur", () => elements.readerInputWrap.classList.remove("is-focused"));
    elements.readerInputWrap.addEventListener("click", focusScannerSoon);
    elements.undoButton.addEventListener("click", handleUndo);
    elements.skipButton.addEventListener("click", handleSkip);
    elements.queueList.addEventListener("click", jumpToQueueItem);
    elements.editorTableBody.addEventListener("input", handleEditorInput);
    elements.editorTableBody.addEventListener("focusout", handleEditorBlur);
    elements.downloadCsvButton.addEventListener("click", downloadCsv);
    elements.copyCsvButton.addEventListener("click", copyCsv);
    elements.resetSessionButton.addEventListener("click", resetSession);
    document.addEventListener("keydown", handleGlobalKeydown);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) focusScannerSoon();
    });
  }

  function boot() {
    const savedState = safeLoadState();
    if (savedState) state = savedState;
    elements.namesInput.value = state.names.join("\n");
    attachEvents();

    if (state.started) {
      setView("scanner");
    } else {
      setView("setup");
    }
  }

  boot();
})();
