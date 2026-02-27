# TypeWise V3 - Extension IA SaaS-ready (Freemium / Multi-tenant)

Monorepo local avec:
- `extension/` Chrome/Edge Manifest V3
- `server/` backend Node.js Express (proxy OpenAI + auth + quotas)

Objectif: corriger/améliorer du texte sélectionné dans des champs éditables via un backend proxy sécurisé, sans clé OpenAI côté extension.

## Arborescence

```text
/extension
  manifest.json
  background/service_worker.js
  content/content_script.js
  content/overlay.js
  content/overlay.css
  lib/diff.js
  lib/apiClient.js
  popup/popup.html
  popup/popup.js
  options/options.html
  options/options.js
  icons/
/server
  package.json
  src/index.js
  src/auth.js
  src/quotas.js
  src/openaiProxy.js
  src/logger.js
  .env.example
README.md
```

## Fonctionnalités V3 implémentées

- Modes: `MODE_ORTHO`, `MODE_GRAMMAR`, `MODE_REWRITE_LIGHT`, `MODE_REWRITE_PRO`, `MODE_CLARITY`, `MODE_TONE`
- Déclenchement: menu contextuel + raccourci `Alt+Shift+C`
- Overlay: sélecteur mode, score confiance, diff mot-à-mot, actions `Corriger / Remplacer / Copier / Annuler`, quota restant
- Auth SaaS: dev login (`/auth/dev-login`) avec token JWT stocké en `chrome.storage.local`
- Plans/quotas:
  - FREE: 20/jour
  - PREMIUM: 500/jour
  - ENTERPRISE: illimité
- Enforcement quotas côté serveur (source de vérité)
- Backend proxy OpenAI (clé côté serveur uniquement)
- Logs privacy-first (sans texte utilisateur)
- Historique local (extension): export JSON + suppression
- Stubs: Stripe webhook, SSO enterprise config

## Setup serveur (local)

Prerequis: Node.js 18+

1. Installer les dépendances:

```bash
cd server
npm install
```

2. Configurer l'environnement:

```bash
cp .env.example .env
```

3. (Optionnel) Mettre `OPENAI_API_KEY` dans `.env`.
- Si absent, le serveur utilise un fallback local de correction (stub) pour faciliter les tests.

4. Lancer le serveur:

```bash
npm run dev
```

Serveur sur `http://localhost:8787`.

## Setup extension (Chrome / Edge)

1. Ouvrir:
- Chrome: `chrome://extensions`
- Edge: `edge://extensions`

2. Activer `Developer mode`.
3. `Load unpacked`.
4. Sélectionner le dossier `.../TypeWise/extension`.

## Parcours E2E rapide

1. Lancer le serveur (`npm run dev`).
2. Charger l'extension unpacked.
3. Ouvrir `Options` de l'extension.
4. Faire `Dev login` avec un email:
- FREE: `alice@test.com`
- PREMIUM: `alice+premium@test.com`
- ENTERPRISE: `alice+enterprise@test.com`

5. Cliquer `Charger /me` et vérifier plan/quota.
6. Sur une page web avec `textarea` ou `contenteditable`:
- sélectionner du texte
- clic droit `Corriger avec IA`
- vérifier overlay: correction, diff, score, quota
- tester `Remplacer`

## API backend

### `POST /auth/dev-login`
Input:

```json
{
  "email": "alice@test.com",
  "orgId": "org_demo",
  "workspaceId": "ws_default"
}
```

Output:

```json
{
  "accessToken": "...",
  "refreshToken": "...",
  "tokenType": "Bearer",
  "expiresAt": 1710000000000,
  "plan": "FREE"
}
```

### `GET /me` (Bearer)
Output:

```json
{
  "userId": "...",
  "email": "alice@test.com",
  "plan": "FREE",
  "orgId": "org_demo",
  "workspaceId": "ws_default",
  "quotaRemaining": 19,
  "features": {
    "modes": ["MODE_ORTHO", "MODE_GRAMMAR", "MODE_REWRITE_LIGHT"],
    "tone": false,
    "localHistoryOnly": true
  }
}
```

### `POST /correct` (Bearer)
Input:

```json
{
  "mode": "MODE_ORTHO",
  "language": "fr",
  "text": "ton texte",
  "hostname": "example.com"
}
```

Output:

```json
{
  "corrected_text": "...",
  "confidence_score": 0.92,
  "changes_explained": [
    { "original": "...", "corrected": "...", "type": "orthographe" }
  ],
  "quota_remaining": 19
}
```

### `POST /billing/webhook`
Stub Stripe.

### `GET /health`
Healthcheck.

## Notes sécurité / confidentialité

- Pas de clé OpenAI dans l'extension.
- JWT stocké en `chrome.storage.local` (pas `sync`).
- Côté serveur, pas de log de texte utilisateur.
- Logs: métriques agrégées (`textLength`, `mode`, `latency`, `status`, `orgHash`).
- Mode confidentialité renforcée côté client (`privacyEnhanced`): n'envoie pas `hostname`.
- Taille max texte: 3000 caractères.
- Rate limit en mémoire (IP + user-hint / minute).
- CSP extension stricte (`script-src 'self'`).

## Limites connues

- Stockage quotas/rate-limit en mémoire (pas persistant).
- Pas de vraie base de données multi-tenant.
- Pas de vrai magic link/OAuth (dev login uniquement).
- Refresh token endpoint minimal.
- Diff LCS simple (pas optimal sur très longs textes).
- Bouton discret près des champs = stub config uniquement.
- Webhook Stripe et SSO = stubs.

## Roadmap TODO

- Stripe réel (checkout + portal + webhooks signés)
- Magic link / OAuth (Google/Microsoft)
- Admin org/workspace + policies détaillées
- Historique synchronisé chiffré (E2E encryption)
- A/B testing prompts et modèles
- Rate-limit distribué + stockage persistant (Redis)
- Audit logs entreprise anonymisés avancés

## Guide de tests rapides

1. **Auth**: Options -> Dev login -> `/me` OK.
2. **Quota**: en plan FREE, faire 20 corrections puis vérifier erreur quota (`429`).
3. **Premium mode gate**: en FREE, tester `MODE_REWRITE_PRO` -> erreur plan (`402`).
4. **Overlay**: vérifier mode selector, diff, score, quota, boutons action.
5. **No selection**: déclencher sans sélection -> notification claire.
6. **401**: supprimer token local puis corriger -> demande reconnexion.
7. **Timeout**: simuler backend down -> message propre côté overlay.
8. **Privacy**: cocher mode confidentialité renforcée -> pas de hostname envoyé.
9. **History**: corrections enregistrées en local, export JSON et suppression OK.
