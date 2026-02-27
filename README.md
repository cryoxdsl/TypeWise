# TypeWise Orthographe IA (MVP)

Extension Chrome/Edge Manifest V3 pour corriger l'orthographe d'un texte selectionne dans des champs editables via l'API OpenAI.

## Arborescence

- `manifest.json`
- `service_worker.js`
- `content_script.js`
- `ui/overlay.css`
- `popup.html`
- `popup.js`
- `popup.css`
- `icons/icon16.png`
- `icons/icon32.png`
- `icons/icon48.png`
- `icons/icon128.png`

## Installation (Load unpacked)

### Chrome
1. Ouvre `chrome://extensions`.
2. Active `Developer mode`.
3. Clique `Load unpacked`.
4. Selectionne le dossier `/mnt/c/Users/Paul/Sources/TypeWise`.

### Edge
1. Ouvre `edge://extensions`.
2. Active `Developer mode`.
3. Clique `Load unpacked`.
4. Selectionne le dossier `/mnt/c/Users/Paul/Sources/TypeWise`.

## Utilisation

1. Clique l'icone de l'extension.
2. Renseigne la cle API OpenAI, la langue (FR par defaut) et active l'extension.
3. Choisis le mode:
   - `API OpenAI (automatique)` pour correction directe.
   - `Login ChatGPT (manuel)` pour travailler sans cle API (copier/coller via chatgpt.com).
4. Sur une page web, selectionne du texte dans un `input`, `textarea` ou `contenteditable`.
5. Clic droit `Corriger l'orthographe (IA)` (ou raccourci `Alt+Shift+C`).
6. Dans l'overlay, choisis `Remplacer`, `Copier` ou `Annuler`.

## Limitations MVP

- Orthographe uniquement (pas de reformulation, pas de style).
- Maximum 2000 caracteres par requete.
- Le remplacement dans certains editeurs riches complexes (Google Docs natif, certains iframes sandboxes) peut etre partiel selon leurs protections DOM.
- Cle API stockee en `chrome.storage.sync` (non chiffree applicativement).
- En mode `Login ChatGPT`, la correction est manuelle (pas de retour automatique depuis chatgpt.com pour des raisons de securite des sessions web).

## TODO V2

- Correction grammaire/syntaxe/reformulation par mode.
- Multi-langue plus riche + auto-detection.
- Mode "corriger tout le champ".
- Cache local de corrections.
- Support plus robuste des editeurs riches (Google Docs, Notion, etc.).
- Option modele OpenAI configurable.

## Plan de tests manuels rapide

1. `textarea` simple : selection partielle -> menu -> correction -> `Remplacer`.
2. `input type="text"` : selection -> correction -> `Copier`.
3. `contenteditable` simple : selection -> correction -> `Remplacer`.
4. Gmail (compose) : selection d'un mot fautif -> correction.
5. Google Docs : tester et verifier comportement (selon limitations).
6. Cas sans selection : verifier message "Selectionne du texte".
7. Cas extension desactivee : verifier message dedie.
8. Cas cle API invalide : verifier erreur lisible 401.
9. Cas texte > 2000 caracteres : verifier blocage UX.
10. Mode `Login ChatGPT` : verifier le flux `Copier le prompt` -> `Ouvrir ChatGPT` -> coller la correction -> `Remplacer`.
