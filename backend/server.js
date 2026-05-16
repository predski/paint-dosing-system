require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const { initDatabase, run, all, get } = require("./database");
const { sendMail, emailReady } = require("./email");

const app = express();
const PORT = process.env.PORT || 3000;
const EXPORT_DIR = path.join(__dirname, "exports");
if (!fs.existsSync(EXPORT_DIR)) fs.mkdirSync(EXPORT_DIR, { recursive: true });
initDatabase();

app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(__dirname, "..", "frontend")));

const ADMIN_USER = process.env.ADMIN_USER || "admin";
const ADMIN_PASS = process.env.ADMIN_PASS || "admin123";
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "pfa_secure_token_2026";

const recipes = {
  "Marron": { blue: 20, red: 60, yellow: 45, green: 5 },
  "Violet": { blue: 60, red: 50, yellow: 0, green: 0 },
  "Orange": { blue: 0, red: 50, yellow: 70, green: 0 },
  "Vert clair": { blue: 0, red: 0, yellow: 45, green: 65 },
  "Turquoise": { blue: 60, red: 0, yellow: 0, green: 45 },
  "Olive": { blue: 10, red: 10, yellow: 50, green: 40 },
  "Gris coloré": { blue: 25, red: 25, yellow: 25, green: 25 },
  "Rose foncé": { blue: 10, red: 75, yellow: 10, green: 0 },
  "Bleu vert": { blue: 70, red: 0, yellow: 0, green: 30 },
  "Jaune vert": { blue: 0, red: 0, yellow: 80, green: 25 },
  "Noir expérimental": { blue: 45, red: 45, yellow: 45, green: 45 },
  "Rouge brun": { blue: 10, red: 90, yellow: 35, green: 0 }
};

function now() { return new Date().toISOString(); }

function requireAdmin(req, res, next) {
  const token = (req.headers.authorization || "").replace("Bearer ", "").trim();
  if (token !== ADMIN_TOKEN) return res.status(401).json({ error: "Accès non autorisé" });
  next();
}

function toCSV(rows, headerMap) {
  const keys = Object.keys(headerMap), titles = Object.values(headerMap);
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return [titles.map(esc).join(";"), ...rows.map(r => keys.map(k => esc(r[k])).join(";"))].join("\n");
}

async function recordError(type, details, severity = "HIGH", sendAlert = false) {
  await run("INSERT INTO errors (created_at, type, details, severity) VALUES (?, ?, ?, ?)", [now(), type, details, severity]);
  if (sendAlert) {
    await sendMail({
      subject: `Alerte PFA - ${type}`,
      text: `Une erreur a été détectée.\n\nType: ${type}\nDétails: ${details}\nSévérité: ${severity}\nDate: ${new Date().toLocaleString()}`
    });
  }
}

app.post("/api/auth/login", (req, res) => {
  const { username, password } = req.body || {};
  if (username === ADMIN_USER && password === ADMIN_PASS) return res.json({ ok: true, token: ADMIN_TOKEN, user: ADMIN_USER });
  res.status(401).json({ error: "Identifiants incorrects" });
});

app.get("/api/status", (req, res) => {
  res.json({ ok: true, emailConfigured: emailReady(), database: "SQLite", backendTime: now() });
});
app.get("/api/recipes", (req, res) => res.json(recipes));
app.get("/api/reservoirs", async (req, res) => res.json(await all("SELECT * FROM reservoirs ORDER BY color_key")));

app.post("/api/reservoirs/:color/toggle-low", requireAdmin, async (req, res) => {
  const row = await get("SELECT * FROM reservoirs WHERE color_key = ?", [req.params.color]);
  if (!row) return res.status(404).json({ error: "Réservoir introuvable" });
  const val = row.low_level ? 0 : 1;
  await run("UPDATE reservoirs SET low_level = ? WHERE color_key = ?", [val, req.params.color]);
  if (val === 1) await recordError("Niveau faible", `Réservoir ${row.label} faible`, "MEDIUM", true);
  res.json(await all("SELECT * FROM reservoirs ORDER BY color_key"));
});

app.post("/api/dosage", requireAdmin, async (req, res) => {
  try {
    const { mode, colorName, recipe } = req.body;
    if (!recipe) return res.status(400).json({ error: "Recette manquante" });
    const reservoirs = await all("SELECT * FROM reservoirs");
    const map = {};
    reservoirs.forEach(r => map[r.color_key] = r);

    for (const key of ["blue", "red", "yellow", "green"]) {
      const required = Number(recipe[key] || 0);
      if (map[key].low_level === 1 || map[key].volume_ml < required) {
        await recordError("Dosage bloqué", `Quantité insuffisante ou niveau faible dans le réservoir ${map[key].label}`, "HIGH", true);
        await run(`INSERT INTO dosages (created_at, mode, color_name, blue_ml, red_ml, yellow_ml, green_ml, total_ml, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [now(), mode || "Inconnu", colorName || "Inconnue", recipe.blue || 0, recipe.red || 0, recipe.yellow || 0, recipe.green || 0, (recipe.blue || 0)+(recipe.red || 0)+(recipe.yellow || 0)+(recipe.green || 0), "Bloqué"]);
        return res.status(409).json({ status: "blocked", message: `Dosage bloqué : réservoir ${map[key].label} insuffisant` });
      }
    }
    for (const key of ["blue", "red", "yellow", "green"]) {
      await run("UPDATE reservoirs SET volume_ml = volume_ml - ? WHERE color_key = ?", [Number(recipe[key] || 0), key]);
    }
    const total = (recipe.blue || 0)+(recipe.red || 0)+(recipe.yellow || 0)+(recipe.green || 0);
    await run(`INSERT INTO dosages (created_at, mode, color_name, blue_ml, red_ml, yellow_ml, green_ml, total_ml, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [now(), mode || "Inconnu", colorName || "Inconnue", recipe.blue || 0, recipe.red || 0, recipe.yellow || 0, recipe.green || 0, total, "Terminé"]);
    res.json({ status: "ok", message: "Dosage enregistré", reservoirs: await all("SELECT * FROM reservoirs ORDER BY color_key") });
  } catch (e) {
    console.error(e); res.status(500).json({ error: "Erreur serveur" });
  }
});

app.post("/api/refill", requireAdmin, async (req, res) => {
  await run("UPDATE reservoirs SET volume_ml = max_volume_ml, low_level = 0");
  res.json(await all("SELECT * FROM reservoirs ORDER BY color_key"));
});

app.post("/api/emergency-stop", requireAdmin, async (req, res) => {
  await recordError("Arrêt d’urgence", "Arrêt manuel déclenché depuis l’interface", "CRITICAL", true);
  res.json({ ok: true });
});

app.get("/api/history", async (req, res) => res.json(await all("SELECT * FROM dosages ORDER BY id DESC")));
app.get("/api/errors", async (req, res) => res.json(await all("SELECT * FROM errors ORDER BY id DESC")));
app.get("/api/stats", async (req, res) => {
  const totals = await get(`SELECT COUNT(*) AS total_cycles, SUM(CASE WHEN status='Terminé' THEN 1 ELSE 0 END) AS completed_cycles, SUM(CASE WHEN status='Bloqué' THEN 1 ELSE 0 END) AS blocked_cycles, COALESCE(SUM(total_ml),0) AS total_volume_ml FROM dosages`);
  const errors = await get("SELECT COUNT(*) AS total_errors FROM errors");
  res.json({ ...totals, total_errors: errors.total_errors, reservoirs: await all("SELECT * FROM reservoirs ORDER BY color_key") });
});

app.get("/api/export/history", async (req, res) => {
  const rows = await all("SELECT * FROM dosages ORDER BY id DESC");
  const csv = toCSV(rows, {created_at:"Date", mode:"Mode", color_name:"Couleur", blue_ml:"Bleu_mL", red_ml:"Rouge_mL", yellow_ml:"Jaune_mL", green_ml:"Vert_mL", total_ml:"Total_mL", status:"Etat"});
  res.header("Content-Type", "text/csv; charset=utf-8"); res.attachment("historique_dosage_pfa.csv"); res.send(csv);
});
app.get("/api/export/errors", async (req, res) => {
  const rows = await all("SELECT * FROM errors ORDER BY id DESC");
  const csv = toCSV(rows, {created_at:"Date", type:"Type", details:"Details", severity:"Severite"});
  res.header("Content-Type", "text/csv; charset=utf-8"); res.attachment("historique_erreurs_pfa.csv"); res.send(csv);
});
app.post("/api/email/history", requireAdmin, async (req, res) => {
  const rows = await all("SELECT * FROM dosages ORDER BY id DESC");
  const csv = toCSV(rows, {created_at:"Date", mode:"Mode", color_name:"Couleur", blue_ml:"Bleu_mL", red_ml:"Rouge_mL", yellow_ml:"Jaune_mL", green_ml:"Vert_mL", total_ml:"Total_mL", status:"Etat"});
  const filePath = path.join(EXPORT_DIR, "historique_dosage_pfa.csv");
  fs.writeFileSync(filePath, csv, "utf8");
  res.json(await sendMail({subject:"PFA - Historique des dosages", text:"Veuillez trouver ci-joint l’historique des dosages.", attachments:[{filename:"historique_dosage_pfa.csv", path:filePath}]}));
});
app.post("/api/email/errors", requireAdmin, async (req, res) => {
  const rows = await all("SELECT * FROM errors ORDER BY id DESC");
  const csv = toCSV(rows, {created_at:"Date", type:"Type", details:"Details", severity:"Severite"});
  const filePath = path.join(EXPORT_DIR, "historique_erreurs_pfa.csv");
  fs.writeFileSync(filePath, csv, "utf8");
  res.json(await sendMail({subject:"PFA - Historique des erreurs", text:"Veuillez trouver ci-joint l’historique des erreurs.", attachments:[{filename:"historique_erreurs_pfa.csv", path:filePath}]}));
});

app.get("/", (req, res) => res.sendFile(path.join(__dirname, "..", "frontend", "index.html")));
app.listen(PORT, () => console.log(`PFA Paint Dosing System running on http://localhost:${PORT}`));
