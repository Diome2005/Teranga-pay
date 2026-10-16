// [FICHIER] : backend/services/store.js
// [RÔLE] : persistance simple et robuste du backend (registres factures, OTP, sessions).
// [CHOIX] : stockage JSON fichier + écriture atomique (tmp -> rename).
//   Pas de dépendance native (better-sqlite3 / bcrypt...) -> zéro risque de build cassé.
//   L'écriture est faite à chaque mutation (volume faible : une facture par paiement) ;
//   un remplacement "vraie base" ne changera que ce module (même API Map-like).
// [REPLI] : fichier absent ou corrompu => démarrage à vide, sans crash.

const fs = require("fs");
const path = require("path");

// Répertoire des données. Surchargeable via DATA_DIR (tests / prod / volume monté).
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "..", "data");

function ensureDir(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch {
    /* déjà présent ou permission — l'écriture gérera l'erreur */
  }
}

// Collection clé/valeur persistante, API compatible Map (has/get/set/delete/values).
class JsonCollection {
  constructor(name) {
    this.name = name;
    this.file = path.join(DATA_DIR, `${name}.json`);
    this.map = new Map();
    this._load();
  }

  // Charge le fichier JSON si présent ; sinon ouvre une collection vide.
  _load() {
    try {
      const raw = fs.readFileSync(this.file, "utf8");
      const obj = JSON.parse(raw);
      if (obj && typeof obj === "object" && !Array.isArray(obj)) {
        for (const [k, v] of Object.entries(obj)) this.map.set(k, v);
      }
    } catch {
      // Fichier absent ou JSON invalide -> on repart à vide (pas de crash).
    }
  }

  // Écriture atomique : on serialise vers .tmp puis on renomme (évite un fichier tronqué
  // si le processus est tué au milieu de l'écriture).
  _persist() {
    ensureDir(DATA_DIR);
    const tmp = `${this.file}.tmp`;
    const payload = JSON.stringify(Object.fromEntries(this.map), null, 2);
    try {
      fs.writeFileSync(tmp, payload, "utf8");
      fs.renameSync(tmp, this.file);
    } catch (error) {
      console.error(`[teranga-pay] store(${this.name}) échec d'écriture :`, error.message);
    }
  }

  has(key) {
    return this.map.has(key);
  }

  get(key) {
    return this.map.get(key);
  }

  set(key, value) {
    this.map.set(key, value);
    this._persist();
    return this;
  }

  delete(key) {
    const removed = this.map.delete(key);
    if (removed) this._persist();
    return removed;
  }

  values() {
    return this.map.values();
  }

  entries() {
    return this.map.entries();
  }

  get size() {
    return this.map.size;
  }

  // Nettoyage des entrées expirées (TTL). `expiresAt` est un timestamp (ms).
  pruneExpired() {
    const now = Date.now();
    let removed = 0;
    for (const [k, v] of this.map.entries()) {
      if (v && typeof v.expiresAt === "number" && v.expiresAt <= now) {
        this.map.delete(k);
        removed += 1;
      }
    }
    if (removed > 0) this._persist();
    return removed;
  }

  toJSON() {
    return Object.fromEntries(this.map);
  }
}

// Singleton par nom : garantit un même registre partagé partout (routes, tests).
const collections = new Map();

function collection(name) {
  if (!collections.has(name)) {
    collections.set(name, new JsonCollection(name));
  }
  return collections.get(name);
}

module.exports = { DATA_DIR, JsonCollection, collection };
