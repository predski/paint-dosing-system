const API = "";

const COLOR_INFO = {
  blue: { label: "Bleu", hex: "#2563eb", pin: "GPIO23" },
  red: { label: "Rouge", hex: "#ef4444", pin: "GPIO22" },
  yellow: { label: "Jaune", hex: "#facc15", pin: "GPIO21" },
  green: { label: "Vert", hex: "#22c55e", pin: "GPIO19" }
};

let reservoirs = [];
let recipes = {};
let mix = { blue: 0, red: 0, yellow: 0, green: 0 };
let running = false;
let token = localStorage.getItem("pfa_token") || "";

const $ = (id) => document.getElementById(id);


function showLoginError(message) {
  const errorBox = $("loginError");
  errorBox.textContent = message;
  errorBox.classList.remove("show");
  void errorBox.offsetWidth;
  errorBox.classList.add("show");
}

function hideLoginError() {
  const errorBox = $("loginError");
  if (!errorBox) return;
  errorBox.textContent = "";
  errorBox.classList.remove("show");
}

function setLoginLoading(isLoading) {
  const card = document.querySelector(".login-card");
  const button = $("loginBtn");
  if (!card || !button) return;

  card.classList.toggle("loading", isLoading);
  button.disabled = isLoading;
  button.textContent = isLoading ? "Connexion..." : "Se connecter";
}


function log(message) {
  const box = $("log");
  const time = new Date().toLocaleTimeString();
  box.innerHTML += `[${time}] ${message}<br>`;
  box.scrollTop = box.scrollHeight;
}

function setStatus(message, error = false) {
  const box = $("status");
  box.textContent = message;
  box.className = error ? "status err" : "status";
}

async function apiGet(url) {
  const res = await fetch(API + url);
  if (!res.ok) throw new Error("Erreur API");
  return res.json();
}

async function apiPost(url, data = {}) {
  const res = await fetch(API + url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + token
    },
    body: JSON.stringify(data)
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw body;
  return body;
}

async function login() {
  const username = $("loginUser").value.trim();
  const password = $("loginPass").value;

  hideLoginError();

  if (!username || !password) {
    showLoginError("Veuillez saisir le nom d’utilisateur et le mot de passe.");
    return;
  }

  setLoginLoading(true);

  try {
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });

    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(result.error || "Identifiants incorrects.");
    }

    token = result.token;
    localStorage.setItem("pfa_token", token);
    $("loginScreen").style.display = "none";
    await init();
  } catch (e) {
    localStorage.removeItem("pfa_token");
    token = "";
    showLoginError("Identifiants incorrects. Vérifiez le nom d’utilisateur et le mot de passe.");
    $("loginPass").value = "";
    $("loginPass").focus();
  } finally {
    setLoginLoading(false);
  }
}

async function init() {
  try {
    const status = await apiGet("/api/status");
    $("backendStatus").textContent = status.emailConfigured ? "Email configuré" : "Email non configuré";
    recipes = await apiGet("/api/recipes");

    const select = $("recipeSelect");
    select.innerHTML = "";
    Object.keys(recipes).forEach((name) => {
      const option = document.createElement("option");
      option.value = name;
      option.textContent = name;
      select.appendChild(option);
    });

    await refreshAll();
    log("Backend connecté. Interface prête.");
  } catch (e) {
    localStorage.removeItem("pfa_token");
    token = "";
    $("loginScreen").style.display = "grid";
    showLoginError("Session expirée ou serveur indisponible. Reconnectez-vous.");
  }
}

async function refreshAll() {
  reservoirs = await apiGet("/api/reservoirs");
  renderReservoirs();
  await renderHistory();
  await renderErrors();
  await renderStats();
  updateMixColor();
}

function renderReservoirs() {
  const box = $("reservoirs");
  box.innerHTML = "";

  reservoirs.forEach((r) => {
    const info = COLOR_INFO[r.color_key];
    const level = Math.max(0, Math.min(100, (r.volume_ml / r.max_volume_ml) * 100));
    const low = r.low_level === 1 || r.volume_ml < 250;

    const card = document.createElement("div");
    card.className = "res-card" + (low ? " low" : "");
    card.innerHTML = `
      <div class="tank">
        <div class="liquid" style="height:${level}%; background:${info.hex}"></div>
      </div>
      <div>
        <b>${info.label}</b><br>
        <span>${Math.round(r.volume_ml)} mL / ${Math.round(r.max_volume_ml)} mL</span><br>
        <small>${low ? "Niveau faible" : "Niveau normal"}</small>
      </div>
      <div class="pump-ind" id="pump-ind-${r.color_key}"></div>
    `;
    box.appendChild(card);

    const sensor = document.querySelector(`.sensor-card[data-color="${r.color_key}"]`);
    if (sensor) {
      sensor.classList.toggle("low", low);
      sensor.querySelector("span").textContent = low ? "Niveau faible" : "Normal";
    }
  });
}

async function renderStats() {
  const stats = await apiGet("/api/stats");
  $("statCycles").textContent = stats.total_cycles || 0;
  $("statDone").textContent = stats.completed_cycles || 0;
  $("statBlocked").textContent = stats.blocked_cycles || 0;
  $("statErrors").textContent = stats.total_errors || 0;
  $("statVolume").textContent = Math.round(stats.total_volume_ml || 0) + " mL";
}

async function renderHistory() {
  const rows = await apiGet("/api/history");
  const body = $("historyBody");
  body.innerHTML = "";

  rows.forEach((r) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${new Date(r.created_at).toLocaleString()}</td>
      <td>${r.mode}</td>
      <td>${r.color_name}</td>
      <td>${r.blue_ml}</td>
      <td>${r.red_ml}</td>
      <td>${r.yellow_ml}</td>
      <td>${r.green_ml}</td>
      <td>${r.total_ml}</td>
      <td>${r.status}</td>
    `;
    body.appendChild(tr);
  });
}

async function renderErrors() {
  const rows = await apiGet("/api/errors");
  const body = $("errorsBody");
  body.innerHTML = "";

  rows.forEach((r) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${new Date(r.created_at).toLocaleString()}</td>
      <td>${r.type}</td>
      <td>${r.details}</td>
      <td>${r.severity}</td>
    `;
    body.appendChild(tr);
  });
}

async function startDosage(mode, colorName, recipe) {
  if (running) return;
  running = true;

  setStatus("Dosage en cours...");
  setEspStatus("DOSING");
  log(`Consigne reçue : ${colorName}`);

  try {
    for (const key of ["blue", "red", "yellow", "green"]) {
      if ((recipe[key] || 0) > 0) {
        setPumpState(key, true);
        log(`${COLOR_INFO[key].pin} actif | Pompe ${COLOR_INFO[key].label} : ${recipe[key]} mL`);
        await wait(Math.min(2500, recipe[key] * 25));
        setPumpState(key, false);
        mix[key] += recipe[key];
        updateMixColor();
      }
    }

    const result = await apiPost("/api/dosage", { mode, colorName, recipe });
    reservoirs = result.reservoirs;
    renderReservoirs();
    await renderHistory();
    await renderStats();

    setStatus("Dosage terminé");
    setEspStatus("READY");
    log("Dosage enregistré dans SQLite.");
  } catch (e) {
    setStatus(e.message || "Dosage bloqué", true);
    setEspStatus("ERROR");
    log(e.message || "Erreur de dosage.");
    await refreshAll();
  }

  running = false;
}

function setEspStatus(text) {
  $("espStatus").textContent = text;
}

function setPumpState(key, state) {
  const ind = $("pump-ind-" + key);
  const p = $("pump-" + key);
  const pipe = $("pipe-" + key);
  const pin = $("pin-" + key);

  if (ind) ind.classList.toggle("on", state);
  if (p) p.classList.toggle("on", state);
  if (pipe) pipe.classList.toggle("flow", state);
  if (pin) pin.textContent = `Pompe ${COLOR_INFO[key].label} : ${state ? "ON" : "OFF"}`;
}

function updateMixColor() {
  const total = mix.blue + mix.red + mix.yellow + mix.green;
  const liquid = $("mixLiquid");
  const real = $("realMixLiquid");

  if (!total) {
    liquid.style.height = "0%";
    real.style.height = "0%";
    $("mixVolume").textContent = 0;
    $("mixColor").textContent = "Aucune";
    return;
  }

  const r = Math.round((mix.red*239 + mix.yellow*250 + mix.green*34 + mix.blue*37) / total);
  const g = Math.round((mix.red*68 + mix.yellow*204 + mix.green*197 + mix.blue*99) / total);
  const b = Math.round((mix.red*68 + mix.yellow*21 + mix.green*94 + mix.blue*235) / total);

  const height = Math.min(100, total / 500 * 100) + "%";
  const bg = `rgb(${r},${g},${b})`;

  liquid.style.height = height;
  liquid.style.background = bg;
  real.style.height = height;
  real.style.background = bg;

  $("mixVolume").textContent = total;
  $("mixColor").textContent = `RGB(${r}, ${g}, ${b})`;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

$("loginBtn").addEventListener("click", login);

["loginUser", "loginPass"].forEach((id) => {
  $(id).addEventListener("keydown", (event) => {
    if (event.key === "Enter") login();
  });

  $(id).addEventListener("input", hideLoginError);
});

$("logoutBtn").addEventListener("click", () => {
  localStorage.removeItem("pfa_token");
  location.reload();
});

$("autoBtn").addEventListener("click", () => {
  const name = $("recipeSelect").value;
  startDosage("Automatique", name, recipes[name]);
});

$("manualBtn").addEventListener("click", () => {
  const recipe = {
    blue: Number($("blueInput").value || 0),
    red: Number($("redInput").value || 0),
    yellow: Number($("yellowInput").value || 0),
    green: Number($("greenInput").value || 0)
  };
  startDosage("Manuel", "Personnalisée", recipe);
});

document.querySelectorAll(".sensor-card").forEach((btn) => {
  btn.addEventListener("click", async () => {
    const color = btn.dataset.color;
    const rows = await apiPost(`/api/reservoirs/${color}/toggle-low`);
    reservoirs = rows;
    renderReservoirs();
    await renderErrors();
    await renderStats();
    log(`État niveau modifié : ${COLOR_INFO[color].label}`);
  });
});

$("stopBtn").addEventListener("click", async () => {
  await apiPost("/api/emergency-stop");
  await renderErrors();
  await renderStats();
  setStatus("Arrêt d’urgence enregistré", true);
  setEspStatus("STOP");
  log("Arrêt d’urgence envoyé au backend.");
});

$("refillBtn").addEventListener("click", async () => {
  reservoirs = await apiPost("/api/refill");
  renderReservoirs();
  log("Réservoirs remplis.");
});

$("cleanBtn").addEventListener("click", () => {
  mix = { blue: 0, red: 0, yellow: 0, green: 0 };
  updateMixColor();
  log("Réservoir de mélange nettoyé manuellement.");
});

$("downloadHistory").addEventListener("click", () => {
  window.location.href = "/api/export/history";
});

$("downloadErrors").addEventListener("click", () => {
  window.location.href = "/api/export/errors";
});

$("emailHistory").addEventListener("click", async () => {
  const result = await apiPost("/api/email/history");
  log(result.sent ? "Historique envoyé par email." : result.reason);
});

$("emailErrors").addEventListener("click", async () => {
  const result = await apiPost("/api/email/errors");
  log(result.sent ? "Historique des erreurs envoyé par email." : result.reason);
});

$("themeBtn").addEventListener("click", () => {
  document.body.classList.toggle("light");
  $("themeBtn").textContent = document.body.classList.contains("light") ? "Mode nuit" : "Mode soleil";
});

$("realBtn").addEventListener("click", () => {
  const section = $("realMode");
  const shown = section.style.display === "block";
  section.style.display = shown ? "none" : "block";
  $("realBtn").textContent = shown ? "Mode réel" : "Masquer réel";
});

if (token) {
  $("loginScreen").style.display = "none";
  init();
}
