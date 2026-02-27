(function initOverlay(globalObj) {
  class TypeWiseOverlay {
    constructor() {
      this.root = null;
      this.onAction = null;
    }

    open(anchorRect, model) {
      this.close();

      const root = document.createElement("div");
      root.className = "tw3-overlay";

      const header = document.createElement("div");
      header.className = "tw3-header";

      const title = document.createElement("h3");
      title.textContent = "TypeWise AI";
      header.appendChild(title);

      const modeSelect = document.createElement("select");
      modeSelect.className = "tw3-mode";
      for (const mode of model.modeOptions) {
        const option = document.createElement("option");
        option.value = mode.value;
        option.textContent = mode.label;
        if (mode.value === model.selectedMode) option.selected = true;
        modeSelect.appendChild(option);
      }
      modeSelect.addEventListener("change", () => this.emit("modeChanged", { mode: modeSelect.value }));
      header.appendChild(modeSelect);

      const info = document.createElement("div");
      info.className = "tw3-info";

      const confidence = document.createElement("span");
      confidence.textContent = model.confidenceText || "Confiance: -";
      info.appendChild(confidence);

      const quota = document.createElement("span");
      quota.textContent = model.quotaText || "Quota: -";
      info.appendChild(quota);

      const status = document.createElement("p");
      status.className = "tw3-status";
      status.textContent = model.statusText || "";

      const diff = document.createElement("div");
      diff.className = "tw3-diff";
      if (Array.isArray(model.diffSpans)) {
        for (const span of model.diffSpans) {
          const el = document.createElement("span");
          el.className = `tw3-${span.type}`;
          el.textContent = span.text;
          diff.appendChild(el);
        }
      }

      const correctedBox = document.createElement("textarea");
      correctedBox.className = "tw3-corrected";
      correctedBox.value = model.correctedText || "";
      correctedBox.placeholder = "Resultat de correction";

      const actions = document.createElement("div");
      actions.className = "tw3-actions";

      actions.appendChild(this.makeButton("Corriger", "primary", () => {
        this.emit("run", { mode: modeSelect.value });
      }));
      actions.appendChild(this.makeButton("Remplacer", "", () => {
        this.emit("replace", { text: correctedBox.value });
      }));
      actions.appendChild(this.makeButton("Copier", "", () => {
        this.emit("copy", { text: correctedBox.value });
      }));
      actions.appendChild(this.makeButton("Annuler", "", () => {
        this.emit("cancel", {});
      }));

      root.append(header, info, status, diff, correctedBox, actions);
      document.documentElement.appendChild(root);
      this.position(root, anchorRect);
      this.root = root;
    }

    update(model) {
      if (!this.root) return;
      this.open(this.root.getBoundingClientRect(), model);
    }

    close() {
      if (this.root) {
        this.root.remove();
        this.root = null;
      }
    }

    makeButton(label, variant, onClick) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `tw3-btn ${variant ? `tw3-${variant}` : ""}`.trim();
      button.textContent = label;
      button.addEventListener("click", onClick);
      return button;
    }

    emit(action, payload) {
      if (typeof this.onAction === "function") this.onAction(action, payload);
    }

    position(root, anchorRect) {
      const margin = 8;
      const rect = anchorRect || { left: 24, top: 24, bottom: 24 };
      root.style.left = `${Math.max(margin, window.scrollX + rect.left)}px`;
      root.style.top = `${Math.max(margin, window.scrollY + rect.bottom + margin)}px`;

      const bounds = root.getBoundingClientRect();
      if (bounds.right > window.innerWidth - margin) {
        root.style.left = `${Math.max(margin, window.scrollX + window.innerWidth - bounds.width - margin)}px`;
      }
      if (bounds.bottom > window.innerHeight - margin) {
        root.style.top = `${Math.max(margin, window.scrollY + rect.top - bounds.height - margin)}px`;
      }
    }
  }

  globalObj.TypeWiseOverlay = TypeWiseOverlay;
})(window);
