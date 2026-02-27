(function initDiff(globalObj) {
  function tokenize(text) {
    const raw = text.match(/\s+|[\p{L}\p{N}_'-]+|[^\s\p{L}\p{N}_]/gu) || [];
    return raw;
  }

  function lcsTable(a, b) {
    const m = a.length;
    const n = b.length;
    const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

    for (let i = m - 1; i >= 0; i -= 1) {
      for (let j = n - 1; j >= 0; j -= 1) {
        if (a[i] === b[j]) {
          dp[i][j] = dp[i + 1][j + 1] + 1;
        } else {
          dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
        }
      }
    }
    return dp;
  }

  function backtrackDiff(a, b, dp) {
    const ops = [];
    let i = 0;
    let j = 0;

    while (i < a.length && j < b.length) {
      if (a[i] === b[j]) {
        ops.push({ type: "same", text: a[i] });
        i += 1;
        j += 1;
      } else if (dp[i + 1][j] >= dp[i][j + 1]) {
        ops.push({ type: "remove", text: a[i] });
        i += 1;
      } else {
        ops.push({ type: "add", text: b[j] });
        j += 1;
      }
    }

    while (i < a.length) {
      ops.push({ type: "remove", text: a[i] });
      i += 1;
    }

    while (j < b.length) {
      ops.push({ type: "add", text: b[j] });
      j += 1;
    }

    return mergeChangeRuns(ops);
  }

  function mergeChangeRuns(ops) {
    const merged = [];
    for (let i = 0; i < ops.length; i += 1) {
      const cur = ops[i];
      const next = ops[i + 1];
      if (!next) {
        merged.push(cur);
        continue;
      }

      if ((cur.type === "remove" && next.type === "add") || (cur.type === "add" && next.type === "remove")) {
        merged.push({ type: "change", text: `${cur.text}|${next.text}` });
        i += 1;
      } else {
        merged.push(cur);
      }
    }
    return compact(merged);
  }

  function compact(spans) {
    if (spans.length === 0) return spans;
    const out = [spans[0]];
    for (let i = 1; i < spans.length; i += 1) {
      const prev = out[out.length - 1];
      const cur = spans[i];
      if (prev.type === cur.type) {
        prev.text += cur.text;
      } else {
        out.push({ ...cur });
      }
    }
    return out;
  }

  function computeDiffSpans(original, corrected) {
    const a = tokenize(original || "");
    const b = tokenize(corrected || "");
    const dp = lcsTable(a, b);
    return backtrackDiff(a, b, dp);
  }

  globalObj.TypeWiseDiff = {
    tokenize,
    computeDiffSpans
  };
})(window);
