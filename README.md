# PFA - Système de dosage automatique intelligent de peinture

## Installation

```bash
npm install
```

## Lancement

```bash
npm start
```

Puis ouvrir :

```text
http://localhost:3000
```

## Connexion par défaut

```text
Utilisateur : admin
Mot de passe : admin123
```

À changer dans `.env`.

## Configuration email

Renommer `.env.example` en `.env` puis modifier :

```env
ADMIN_USER=admin
ADMIN_PASS=admin123
ADMIN_TOKEN=pfa_secure_token_2026

SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password
ALERT_TO=destination_email@gmail.com
```

Pour Gmail, utiliser un App Password.

## Fonctions ajoutées

- Authentification admin
- Dashboard statistiques
- ESP32 live panel
- Cartes capteurs
- Mode réel avec animation fluide
- Mode nuit / soleil
- SQLite
- Historique dosages
- Historique erreurs
- Export CSV
- Envoi email avec pièces jointes CSV
- Alerte email automatique en cas de niveau faible / arrêt d’urgence
