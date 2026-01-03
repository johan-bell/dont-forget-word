/**
 * NOPLP - Régie Finale
 * Lyrics management system for "N'oubliez pas les paroles"
 */

// Application state
let win = null;
let songData = [];
let cursor = -1;
let finale = false;
let currentInfo = { n: "", c: "" };
let filteredStorage = [];
let broadcastChannel = null;

// Game state (TV show features)
let gameState = {
  round: 1,
  score: 0,
  totalLines: 0,
  correctLines: 0,
  timer: {
    running: false,
    startTime: null,
    elapsed: 0,
    interval: null,
  },
  stats: {
    totalTime: 0,
    averageTimePerLine: 0,
    accuracy: 0,
  },
};

// Load data from localStorage with error handling
function loadStorage() {
  try {
    const stored = localStorage.getItem("noplp_v3");
    return stored ? JSON.parse(stored) : [];
  } catch (e) {
    showToast("Erreur lors du chargement des données", "error");
    console.error("Storage load error:", e);
    return [];
  }
}

let storage = loadStorage();
filteredStorage = [...storage];

// Initialize BroadcastChannel for projection sync
try {
  broadcastChannel = new BroadcastChannel("noplp_channel");
} catch (e) {
  console.warn("BroadcastChannel not supported, falling back to localStorage");
}

/**
 * Escape HTML to prevent XSS attacks
 */
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Save data to localStorage with error handling
 */
function saveToStorage() {
  try {
    localStorage.setItem("noplp_v3", JSON.stringify(storage));
    return true;
  } catch (e) {
    if (e.name === "QuotaExceededError") {
      showToast(
        "Espace de stockage insuffisant ! Veuillez exporter/supprimer des chants.",
        "error"
      );
    } else {
      showToast("Erreur lors de la sauvegarde", "error");
    }
    console.error("Storage save error:", e);
    return false;
  }
}

/**
 * Toast notification system
 */
function showToast(message, type = "info", duration = 3000) {
  // Remove existing toasts
  const existing = document.getElementById("toast-container");
  if (existing) existing.remove();

  // Create toast container
  const container = document.createElement("div");
  container.id = "toast-container";
  container.className = "fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-md";
  document.body.appendChild(container);

  // Create toast element
  const toast = document.createElement("div");
  const bgColor =
    type === "error"
      ? "bg-red-600"
      : type === "success"
      ? "bg-green-600"
      : "bg-blue-600";

  toast.className = `${bgColor} text-white px-6 py-4 rounded-lg shadow-lg flex items-center justify-between animate-slide-in`;
  toast.innerHTML = `
    <span>${escapeHtml(message)}</span>
    <button onclick="this.parentElement.remove()" class="ml-4 text-white hover:text-gray-200" aria-label="Fermer">
      ✕
    </button>
  `;
  container.appendChild(toast);

  // Auto remove after duration
  setTimeout(() => {
    toast.style.animation = "slide-out 0.3s ease-out forwards";
    setTimeout(() => {
      if (toast.parentElement) toast.remove();
      if (container.children.length === 0) container.remove();
    }, 300);
  }, duration);
}

/**
 * Show projection URL when popup is blocked
 */
function showProjectionUrl(url) {
  const urlDiv = document.createElement("div");
  urlDiv.id = "projection-url-display";
  urlDiv.className =
    "fixed top-20 right-4 bg-yellow-600 text-black p-4 rounded-lg shadow-lg z-50 max-w-md";
  urlDiv.innerHTML = `
    <div class="font-bold mb-2">URL de projection pour vMix:</div>
    <div class="bg-black text-green-400 p-2 rounded mb-2 font-mono text-sm break-all">${escapeHtml(
      url
    )}</div>
    <button onclick="copyProjectionUrl('${escapeHtml(
      url
    )}')" class="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 w-full mb-2">
      Copier l'URL
    </button>
    <button onclick="document.getElementById('projection-url-display').remove()" class="bg-gray-600 text-white px-4 py-2 rounded hover:bg-gray-700 w-full">
      Fermer
    </button>
  `;
  document.body.appendChild(urlDiv);
}

/**
 * Copy projection URL to clipboard
 */
function copyProjectionUrl(url) {
  navigator.clipboard
    .writeText(url)
    .then(() => {
      showToast("URL copiée dans le presse-papier !", "success");
      const urlDiv = document.getElementById("projection-url-display");
      if (urlDiv) urlDiv.remove();
    })
    .catch(() => {
      showToast("Erreur lors de la copie", "error");
    });
}

/**
 * Validate song number
 */
function validateSongNumber(num) {
  if (!num || num.trim() === "") {
    return { valid: false, error: "Le numéro est requis" };
  }
  if (!/^\d+$/.test(num.trim())) {
    return { valid: false, error: "Le numéro doit être un nombre" };
  }
  return { valid: true };
}

/**
 * Validate song text
 */
function validateSongText(text) {
  if (!text || text.trim() === "") {
    return { valid: false, error: "Le texte est requis" };
  }
  if (text.length > 10000) {
    return {
      valid: false,
      error: "Le texte est trop long (max 10000 caractères)",
    };
  }
  return { valid: true };
}

/**
 * Validate category
 */
function validateCategory(cat) {
  const categories = Array.from(document.getElementById("in-cat").options).map(
    (opt) => opt.value
  );
  if (!categories.includes(cat)) {
    return { valid: false, error: "Catégorie invalide" };
  }
  return { valid: true };
}

/**
 * Save a song to the database
 */
function saveSong() {
  const n = document.getElementById("in-num").value.trim();
  const c = document.getElementById("in-cat").value;
  const t = document.getElementById("in-text").value.trim();

  // Validation
  const numValidation = validateSongNumber(n);
  if (!numValidation.valid) {
    showToast(numValidation.error, "error");
    return;
  }

  const textValidation = validateSongText(t);
  if (!textValidation.valid) {
    showToast(textValidation.error, "error");
    return;
  }

  const catValidation = validateCategory(c);
  if (!catValidation.valid) {
    showToast(catValidation.error, "error");
    return;
  }

  // Update or add song
  const idx = storage.findIndex((s) => s.num === n && s.cat === c);
  const isUpdate = idx > -1;

  if (isUpdate) {
    storage[idx].txt = t;
    showToast(`Chant ${n} mis à jour avec succès !`, "success");
  } else {
    storage.push({ num: n, cat: c, txt: t });
    showToast(`Chant ${n} enregistré avec succès !`, "success");
  }

  if (saveToStorage()) {
    filteredStorage = [...storage];
    document.getElementById("in-num").value = "";
    document.getElementById("in-text").value = "";
  }
}

/**
 * Filter library by search term
 */
function filterLibrary(searchTerm) {
  const term = searchTerm.toLowerCase().trim();
  if (!term) {
    filteredStorage = [...storage];
  } else {
    filteredStorage = storage.filter(
      (s) =>
        s.num.toLowerCase().includes(term) ||
        s.cat.toLowerCase().includes(term) ||
        s.txt.toLowerCase().includes(term)
    );
  }
  renderLibrary();
}

/**
 * Render library table
 */
function renderLibrary() {
  const body = document.getElementById("lib-body");
  body.innerHTML = "";

  if (filteredStorage.length === 0) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td colspan="4" class="text-center text-gray-400 py-4">
        ${storage.length === 0 ? "Aucun chant enregistré" : "Aucun résultat"}
      </td>
    `;
    body.appendChild(tr);
    return;
  }

  filteredStorage.forEach((s) => {
    const tr = document.createElement("tr");
    const preview = escapeHtml(s.txt.substring(0, 30));
    const num = escapeHtml(s.num);
    const cat = escapeHtml(s.cat);

    tr.innerHTML = `
      <td class="font-semibold">${num}</td>
      <td>${cat}</td>
      <td class="text-gray-400">${preview}...</td>
      <td>
        <div class="flex gap-2">
          <button 
            onclick="loadSong('${num.replace(/'/g, "\\'")}','${cat.replace(
      /'/g,
      "\\'"
    )}')" 
            class="bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded text-sm transition-colors"
            aria-label="Charger le chant numéro ${num}">
            CHARGER
          </button>
          <button 
            onclick="editSong('${num.replace(/'/g, "\\'")}','${cat.replace(
      /'/g,
      "\\'"
    )}')" 
            class="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-sm transition-colors"
            aria-label="Modifier le chant numéro ${num}">
            MODIFIER
          </button>
          <button 
            onclick="deleteSong('${num.replace(/'/g, "\\'")}','${cat.replace(
      /'/g,
      "\\'"
    )}')" 
            class="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded text-sm transition-colors"
            aria-label="Supprimer le chant numéro ${num}">
            SUPPRIMER
          </button>
        </div>
      </td>
    `;
    body.appendChild(tr);
  });
}

/**
 * Open the library modal
 */
function openLib() {
  filteredStorage = [...storage];
  const modal = document.getElementById("lib-modal");
  const searchInput = document.getElementById("lib-search");
  modal.classList.remove("hidden");
  searchInput.value = "";
  renderLibrary();
  // Focus on search input for better UX
  setTimeout(() => searchInput.focus(), 100);

  // Trap focus within modal
  modal.addEventListener("keydown", handleModalKeydown);
}

/**
 * Handle keyboard navigation in modal
 */
function handleModalKeydown(e) {
  if (e.key === "Escape") {
    closeLib();
  }
  // Trap Tab key within modal
  if (e.key === "Tab") {
    const modal = document.getElementById("lib-modal");
    const focusableElements = modal.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    if (e.shiftKey && document.activeElement === firstElement) {
      e.preventDefault();
      lastElement.focus();
    } else if (!e.shiftKey && document.activeElement === lastElement) {
      e.preventDefault();
      firstElement.focus();
    }
  }
}

/**
 * Close the library modal
 */
function closeLib() {
  const modal = document.getElementById("lib-modal");
  modal.classList.add("hidden");
  modal.removeEventListener("keydown", handleModalKeydown);

  // Return focus to the button that opened the modal
  const openButton = document.querySelector('button[onclick="openLib()"]');
  if (openButton) {
    openButton.focus();
  }
}

/**
 * Edit a song from the library
 */
function editSong(num, cat) {
  const s = storage.find((i) => i.num === num && i.cat === cat);
  if (!s) {
    showToast("Chant introuvable", "error");
    return;
  }

  document.getElementById("in-num").value = s.num;
  document.getElementById("in-cat").value = s.cat;
  document.getElementById("in-text").value = s.txt;
  closeLib();
  showToast(`Chant ${num} chargé pour modification`, "info");

  // Scroll to top of form
  document.getElementById("in-num").scrollIntoView({ behavior: "smooth" });
}

/**
 * Delete a song from the library
 */
function deleteSong(num, cat) {
  const s = storage.find((i) => i.num === num && i.cat === cat);
  if (!s) {
    showToast("Chant introuvable", "error");
    return;
  }

  if (
    confirm(
      `Êtes-vous sûr de vouloir supprimer le chant ${num} (${cat}) ?\n\nCette action est irréversible.`
    )
  ) {
    const idx = storage.findIndex((i) => i.num === num && i.cat === cat);
    if (idx > -1) {
      storage.splice(idx, 1);
      if (saveToStorage()) {
        filteredStorage = filteredStorage.filter(
          (i) => !(i.num === num && i.cat === cat)
        );
        renderLibrary();
        showToast(`Chant ${num} supprimé`, "success");
      }
    }
  }
}

/**
 * Load a song from the library
 */
function loadSong(n, c) {
  const s = storage.find((i) => i.num === n && i.cat === c);
  if (!s) {
    showToast("Chant introuvable", "error");
    return;
  }

  currentInfo = { n: s.num, c: s.cat };
  songData = s.txt
    .split("\n")
    .filter((l) => l.trim() !== "")
    .map((l) => ({ t: l.trim(), trap: false }));
  cursor = -1;
  finale = false;

  // Reset game state
  gameState.totalLines = songData.length;
  gameState.correctLines = 0;
  gameState.score = 0;
  gameState.round = 1;
  gameState.stats.totalTime = 0;
  gameState.stats.averageTimePerLine = 0;
  gameState.stats.accuracy = 0;
  stopTimer();
  resetTimer();

  renderRegie();
  closeLib();
  updateView("PRÊT");
  updateGameDisplay();
  showToast(`Chant ${n} chargé`, "success");
}

/**
 * Render the lyrics list in the main area
 */
function renderRegie() {
  const cont = document.getElementById("lyrics-list");
  cont.innerHTML = "";

  if (songData.length === 0) {
    cont.innerHTML =
      '<h2 class="text-gray-600 text-center mt-24 text-2xl">CHARGEZ UN CHANT</h2>';
    return;
  }

  songData.forEach((l, i) => {
    const d = document.createElement("div");
    d.className = `line-item ${cursor === i ? "active" : ""}`;
    const trapClass = l.trap
      ? "bg-orange-600 hover:bg-orange-700"
      : "bg-gray-600 hover:bg-gray-500";
    const lineText = escapeHtml(l.t);
    const lineNum = i + 1;

    d.innerHTML = `
      <b class="text-yellow-400 w-8">${lineNum}</b>
      <span class="line-text">${lineText}</span>
      <button 
        onclick="setTrap(${i})" 
        class="${trapClass} text-white px-4 py-2 rounded transition-colors"
        aria-label="${
          l.trap ? "Retirer" : "Ajouter"
        } le piège pour la ligne ${lineNum}">
        PIÈGE
      </button>
    `;
    cont.appendChild(d);
  });
}

/**
 * Toggle trap status for a line
 */
function setTrap(i) {
  if (i >= 0 && i < songData.length) {
    songData[i].trap = !songData[i].trap;
    renderRegie();
    updateView();
  }
}

/**
 * Debounce function for performance
 */
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Debounced sync function
const debouncedSync = debounce((val) => {
  syncNowInternal(val);
}, 150);

/**
 * Sync the input text to projection window in real-time (debounced)
 */
function syncNow() {
  const val = document.getElementById("in-compare").value;
  debouncedSync(val);
}

/**
 * Internal sync function
 */
function syncNowInternal(val) {
  const escapedVal = escapeHtml(val);
  const content = escapedVal ? `<div><i>${escapedVal}</i></div>` : "";
  lastProjectionContent = content; // Store for preservation
  const projData = {
    info: currentInfo.n
      ? `${escapeHtml(currentInfo.c)} - N°${escapeHtml(currentInfo.n)}`
      : "",
    content: content,
    gameState: {
      score: gameState.score,
      round: gameState.round,
      timer: formatTime(gameState.timer.elapsed),
      accuracy: gameState.stats.accuracy.toFixed(1) + "%",
    },
  };
  sendToProjection(projData);
}

/**
 * Send data to projection window (using BroadcastChannel or localStorage)
 */
function sendToProjection(projData) {
  try {
    if (broadcastChannel) {
      broadcastChannel.postMessage({ type: "update", data: projData });
    } else {
      localStorage.setItem("noplp_projection", JSON.stringify(projData));
    }
  } catch (e) {
    console.error("Error sending to projection:", e);
  }
}

/**
 * Update projection data in localStorage for the projection window to read
 */
function updateProjectionData() {
  const projData = {
    info: currentInfo.n
      ? `${escapeHtml(currentInfo.c)} - N°${escapeHtml(currentInfo.n)}`
      : "",
    content: lastProjectionContent || "PRÊT", // Preserve existing content or show ready state
    gameState: {
      score: gameState.score,
      round: gameState.round,
      timer: formatTime(gameState.timer.elapsed),
      accuracy: gameState.stats.accuracy.toFixed(1) + "%",
    },
  };
  sendToProjection(projData);
}

/**
 * Open the projection window
 */
function openProj() {
  // Construct the projection.html URL relative to current page
  const currentUrl = new URL(window.location.href);
  const projUrl = currentUrl.href.replace(
    currentUrl.pathname.split("/").pop(),
    "projection.html"
  );

  // Open the projection window with a proper URL that can be used in vMix
  win = window.open(projUrl, "Proj", "width=800,height=600");

  // Check if popup was blocked
  if (!win || win.closed || typeof win.closed === "undefined") {
    showProjectionUrl(projUrl);
    showToast(
      "La fenêtre popup a été bloquée. Utilisez l'URL affichée pour vMix.",
      "error",
      5000
    );
  } else {
    console.log("Projection URL:", projUrl);
    showToast(
      `Projection ouverte! URL pour vMix:\n${projUrl}\n\n(Copiez cette URL pour l'utiliser dans vMix)`,
      "info",
      8000
    );
  }

  // Update localStorage immediately so projection window can display content
  updateProjectionData();
}

/**
 * Update the projection view
 */
function updateView(custom = null) {
  const projData = {
    info: currentInfo.n
      ? `${escapeHtml(currentInfo.c)} - N°${escapeHtml(currentInfo.n)}`
      : "",
    content: "",
    gameState: {
      score: gameState.score,
      round: gameState.round,
      timer: formatTime(gameState.timer.elapsed),
      accuracy: gameState.stats.accuracy.toFixed(1) + "%",
    },
  };

  if (custom) {
    projData.content = custom;
  } else {
    let h = "";
    if (finale) {
      // Show all trap lines
      songData.forEach((l) => {
        if (l.trap) {
          const masked = l.t.replace(/[a-zA-ZÀ-ÿ]/g, "_");
          h += `<div>${escapeHtml(masked)}</div>`;
        }
      });
    } else {
      // Show current line(s) based on mode
      const m = parseInt(document.getElementById("sel-mode").value) || 1;
      for (let i = 0; i < m; i++) {
        let idx = cursor + i;
        if (songData[idx]) {
          const text = songData[idx].trap
            ? songData[idx].t.replace(/[a-zA-ZÀ-ÿ]/g, "_")
            : songData[idx].t;
          h += `<div>${escapeHtml(text)}</div>`;
        }
      }
    }
    projData.content = h || "PRÊT";
  }

  // Store the content so updateGameDisplay() can preserve it
  lastProjectionContent = projData.content;

  sendToProjection(projData);
  renderRegie();
  // Update UI elements but don't send projection data (already sent above)
  updateGameDisplayUI();
}

/**
 * Verify the input against the target lyrics
 */
function verifyNow() {
  const input = document.getElementById("in-compare").value.trim().split(/\s+/);
  let h = "";
  let wordIdx = 0;
  let correctWords = 0;
  let totalWords = 0;
  const targetLines = finale
    ? songData.filter((l) => l.trap)
    : [songData[cursor]];

  targetLines.forEach((line) => {
    if (!line) return;
    h += "<div>";
    line.t.split(/\s+/).forEach((word) => {
      totalWords++;
      let cleanT = word.toLowerCase().replace(/[.,!?;:]/g, "");
      let cleanI = (input[wordIdx] || "")
        .toLowerCase()
        .replace(/[.,!?;:]/g, "");
      const isCorrect = cleanT === cleanI;
      if (isCorrect) correctWords++;
      const className = isCorrect ? "correct" : "wrong";
      h += `<span class="${className}">${escapeHtml(word)}</span> `;
      wordIdx++;
    });
    h += "</div>";
  });

  // Calculate score and update stats
  const accuracy = totalWords > 0 ? (correctWords / totalWords) * 100 : 0;
  const lineScore = Math.round(accuracy);

  // Update game state
  if (!finale && cursor >= 0) {
    const lineTime = gameState.timer.elapsed;
    gameState.stats.totalTime += lineTime;

    const previousScore = gameState.score;
    if (accuracy >= 80) {
      // 80% accuracy threshold for "correct"
      gameState.correctLines++;
      gameState.score += lineScore;

      // Animate score increase
      if (gameState.score > previousScore) {
        const scoreEl = document.getElementById("game-score");
        if (scoreEl) {
          scoreEl.classList.add("score-increase");
          setTimeout(() => scoreEl.classList.remove("score-increase"), 500);
        }
      }
    }

    gameState.stats.averageTimePerLine =
      gameState.stats.totalTime / (cursor + 1);
    gameState.stats.accuracy = (gameState.correctLines / (cursor + 1)) * 100;

    stopTimer();
  }

  updateView(h);
  updateGameDisplay();
}

/**
 * Activate finale mode (show all traps)
 */
function activateFinale() {
  finale = true;
  cursor = -1;
  updateView();
  showToast("Mode finale activé - Tous les pièges affichés", "info");
}

/**
 * Go to next line
 */
function goNext() {
  if (cursor < songData.length - 1) {
    // Stop timer for previous line if it was running
    if (gameState.timer.running) {
      stopTimer();
    }

    cursor++;
    finale = false;
    document.getElementById("in-compare").value = "";

    // Start timer for new line if auto-start is enabled
    const autoStart = document.getElementById("auto-start-timer");
    if (autoStart && autoStart.checked) {
      resetTimer();
      startTimer();
    }

    updateView();
    updateGameDisplay();
  }
}

/**
 * Go to previous line
 */
function goPrev() {
  if (cursor > 0) {
    if (gameState.timer.running) {
      stopTimer();
    }
    cursor--;
    finale = false;
    updateView();
    updateGameDisplay();
  }
}

/**
 * Export data to JSON file
 */
function exportData() {
  try {
    const data = JSON.stringify(storage, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `noplp-backup-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast("Données exportées avec succès !", "success");
  } catch (e) {
    showToast("Erreur lors de l'export", "error");
    console.error("Export error:", e);
  }
}

/**
 * Import data from JSON file
 */
function importData() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".json";
  input.onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const imported = JSON.parse(event.target.result);
        if (!Array.isArray(imported)) {
          throw new Error("Format de fichier invalide");
        }

        if (
          confirm(
            `Importer ${imported.length} chant(s) ?\n\nLes chants existants avec le même numéro et catégorie seront écrasés.`
          )
        ) {
          // Merge imported data with existing storage
          imported.forEach((item) => {
            const idx = storage.findIndex(
              (s) => s.num === item.num && s.cat === item.cat
            );
            if (idx > -1) {
              storage[idx] = item;
            } else {
              storage.push(item);
            }
          });

          if (saveToStorage()) {
            filteredStorage = [...storage];
            showToast(
              `${imported.length} chant(s) importé(s) avec succès !`,
              "success"
            );
            if (
              !document.getElementById("lib-modal").classList.contains("hidden")
            ) {
              renderLibrary();
            }
          }
        }
      } catch (e) {
        showToast(
          "Erreur lors de l'import: Format de fichier invalide",
          "error"
        );
        console.error("Import error:", e);
      }
    };
    reader.readAsText(file);
  };
  input.click();
}

/**
 * Timer functions for game show features
 */
function startTimer() {
  if (gameState.timer.running) return;

  gameState.timer.running = true;
  gameState.timer.startTime = Date.now() - gameState.timer.elapsed;

  gameState.timer.interval = setInterval(() => {
    gameState.timer.elapsed = Date.now() - gameState.timer.startTime;
    updateTimerDisplay();
  }, 100);
}

function stopTimer() {
  if (!gameState.timer.running) return;

  gameState.timer.running = false;
  if (gameState.timer.interval) {
    clearInterval(gameState.timer.interval);
    gameState.timer.interval = null;
  }
}

function resetTimer() {
  stopTimer();
  gameState.timer.elapsed = 0;
  gameState.timer.startTime = null;
  updateTimerDisplay();
}

function formatTime(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const milliseconds = Math.floor((ms % 1000) / 100);
  return `${minutes.toString().padStart(2, "0")}:${seconds
    .toString()
    .padStart(2, "0")}.${milliseconds}`;
}

function updateTimerDisplay() {
  const timerEl = document.getElementById("game-timer");
  if (timerEl) {
    timerEl.textContent = formatTime(gameState.timer.elapsed);
    if (gameState.timer.running) {
      timerEl.classList.add("timer-running");
    } else {
      timerEl.classList.remove("timer-running");
    }
  }

  // Also send to projection
  updateGameDisplay();
}

// Store last projection content to preserve it when updating game state
let lastProjectionContent = "";

/**
 * Update game display UI elements only (without sending projection data)
 */
function updateGameDisplayUI() {
  // Update main display
  const scoreEl = document.getElementById("game-score");
  const roundEl = document.getElementById("game-round");
  const accuracyEl = document.getElementById("game-accuracy");
  const timerEl = document.getElementById("game-timer");
  const statsEl = document.getElementById("game-stats");

  if (scoreEl) scoreEl.textContent = gameState.score;
  if (roundEl) roundEl.textContent = gameState.round;
  if (accuracyEl) {
    const acc = gameState.stats.accuracy.toFixed(1);
    accuracyEl.textContent = `${acc}%`;
  }
  if (timerEl) {
    timerEl.textContent = formatTime(gameState.timer.elapsed);
  }
  if (statsEl) {
    const avgTime =
      gameState.stats.averageTimePerLine > 0
        ? formatTime(gameState.stats.averageTimePerLine)
        : "00:00.0";
    statsEl.innerHTML = `
      <div class="text-xs text-gray-400">Lignes: ${cursor + 1}/${
      gameState.totalLines
    }</div>
      <div class="text-xs text-gray-400">Correctes: ${
        gameState.correctLines
      }</div>
      <div class="text-xs text-gray-400">Temps moyen: ${avgTime}</div>
    `;
  }
}

/**
 * Update game display (score, timer, stats) and send to projection
 */
function updateGameDisplay() {
  // Update UI elements
  updateGameDisplayUI();

  // Send game state to projection, preserving existing content
  const projData = {
    info: currentInfo.n
      ? `${escapeHtml(currentInfo.c)} - N°${escapeHtml(currentInfo.n)}`
      : "",
    content: lastProjectionContent, // Preserve the last content
    gameState: {
      score: gameState.score,
      round: gameState.round,
      timer: formatTime(gameState.timer.elapsed),
      accuracy: gameState.stats.accuracy.toFixed(1) + "%",
    },
  };
  sendToProjection(projData);
}

/**
 * Advance to next round
 */
function nextRound() {
  gameState.round++;
  resetTimer();
  showToast(`Manche ${gameState.round} commencée !`, "info");
  updateGameDisplay();
}

/**
 * Reset current round
 */
function resetRound() {
  if (confirm("Réinitialiser la manche actuelle ? Le score sera conservé.")) {
    cursor = -1;
    finale = false;
    resetTimer();
    document.getElementById("in-compare").value = "";
    gameState.correctLines = 0;
    gameState.stats.totalTime = 0;
    gameState.stats.averageTimePerLine = 0;
    gameState.stats.accuracy = 0;
    updateView("PRÊT");
    updateGameDisplay();
    renderRegie();
  }
}

/**
 * Keyboard shortcuts
 */
window.onkeydown = (e) => {
  // ESC key closes modals
  if (e.key === "Escape") {
    const modal = document.getElementById("lib-modal");
    if (!modal.classList.contains("hidden")) {
      closeLib();
      e.preventDefault();
      return;
    }
    const urlDisplay = document.getElementById("projection-url-display");
    if (urlDisplay) {
      urlDisplay.remove();
      e.preventDefault();
      return;
    }
  }

  // Don't interfere with input fields
  if (
    e.target.tagName === "TEXTAREA" ||
    e.target.tagName === "INPUT" ||
    e.target.tagName === "SELECT"
  ) {
    return;
  }

  // Spacebar: next line
  if (e.key === " ") {
    e.preventDefault();
    goNext();
  }

  // Enter: show current line
  if (e.key === "Enter") {
    e.preventDefault();
    let displayText = "";
    if (finale) {
      const lines = songData.filter((l) => l.trap).map((l) => l.t);
      displayText = lines.map((l) => escapeHtml(l)).join("<br>");
    } else {
      displayText = escapeHtml(songData[cursor]?.t || "");
    }
    updateView(displayText);
  }
};

// Add CSS animations for toast
const style = document.createElement("style");
style.textContent = `
  @keyframes slide-in {
    from {
      transform: translateX(400px);
      opacity: 0;
    }
    to {
      transform: translateX(0);
      opacity: 1;
    }
  }
  @keyframes slide-out {
    from {
      transform: translateX(0);
      opacity: 1;
    }
    to {
      transform: translateX(400px);
      opacity: 0;
    }
  }
  .animate-slide-in {
    animation: slide-in 0.3s ease-out;
  }
`;
document.head.appendChild(style);
