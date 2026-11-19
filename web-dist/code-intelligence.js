(() => {
  "use strict";

  const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";
  const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";

  function normalizeDigits(value) {
    return String(value == null ? "" : value)
      .replace(/[٠-٩]/g, digit => String(ARABIC_DIGITS.indexOf(digit)))
      .replace(/[۰-۹]/g, digit => String(PERSIAN_DIGITS.indexOf(digit)));
  }

  function codeOf(record, codeField) {
    if (typeof record === "string" || typeof record === "number") return String(record);
    if (!record || typeof record !== "object") return "";
    return String(record[codeField || "code"] || record.code || record.id || "");
  }

  function normalizeRecords(records) {
    if (Array.isArray(records)) return records.filter(Boolean);
    if (records && typeof records === "object") {
      return Object.entries(records).map(([key, value]) =>
        value && typeof value === "object" ? Object.assign({ code: value.code || key }, value) : { code: key }
      );
    }
    return [];
  }

  function filterScope(records, options) {
    const groupBy = options && options.groupBy;
    if (!groupBy || !options || options.groupValue === undefined || options.groupValue === null || options.groupValue === "") return records;
    const wanted = String(options.groupValue).trim().toLowerCase();
    return records.filter(record => String(record && record[groupBy] != null ? record[groupBy] : "").trim().toLowerCase() === wanted);
  }

  function extractNumericPattern(rawCode) {
    const code = normalizeDigits(rawCode).trim();
    if (!code || /[.#$\[\]/]/.test(code)) return null;
    const matches = [...code.matchAll(/\d+/g)];
    if (!matches.length) return null;
    const match = matches[matches.length - 1];
    const value = Number(match[0]);
    if (!Number.isSafeInteger(value)) return null;
    const index = match.index;
    return {
      code,
      prefix: code.slice(0, index),
      suffix: code.slice(index + match[0].length),
      width: match[0].length,
      value
    };
  }

  function patternKey(pattern) {
    return pattern.prefix + "\u0000" + pattern.suffix;
  }

  function describePattern(pattern) {
    return pattern.prefix + "#".repeat(Math.max(1, pattern.width)) + pattern.suffix;
  }

  function fallbackResult(records, fallbackPrefix, options) {
    const prefix = String(fallbackPrefix || "CODE").trim().replace(/[.#$\[\]/]/g, "") || "CODE";
    const used = new Set(records.map(record => normalizeDigits(codeOf(record, options && options.codeField)).trim().toUpperCase()));
    let number = 1;
    let code = "";
    do {
      code = prefix + (options && options.separator === false ? "" : "-") + String(number++).padStart(Math.max(1, Number(options && options.minDigits) || 3), "0");
    } while (used.has(code.toUpperCase()));
    const width = Math.max(1, Number(options && options.minDigits) || 3);
    return {
      code,
      pattern: prefix + (options && options.separator === false ? "" : "-") + "#".repeat(width),
      source: "fallback",
      matchedCount: 0,
      scopeCount: records.length,
      sequence: number - 1,
      explanation: "لم يتم العثور على تسلسل واضح داخل المجموعة؛ تم استخدام البادئة الافتراضية."
    };
  }

  function suggestNext(input) {
    const options = input || {};
    const allRecords = normalizeRecords(options.records);
    const records = filterScope(allRecords, options);
    const used = new Set(records.map(record => normalizeDigits(codeOf(record, options.codeField)).trim().toUpperCase()).filter(Boolean));
    const grouped = new Map();

    for (const record of records) {
      const pattern = extractNumericPattern(codeOf(record, options.codeField));
      if (!pattern) continue;
      const key = patternKey(pattern);
      const group = grouped.get(key) || Object.assign({}, pattern, { count: 0, examples: [] });
      group.count += 1;
      group.value = Math.max(group.value, pattern.value);
      group.width = Math.max(group.width, pattern.width);
      if (group.examples.length < 3) group.examples.push(pattern.code);
      grouped.set(key, group);
    }

    let candidates = [...grouped.values()];
    const preferredPrefix = options.preferredPrefix == null ? "" : String(options.preferredPrefix);
    if (preferredPrefix) {
      const preferred = candidates.filter(pattern => pattern.prefix.toUpperCase() === preferredPrefix.toUpperCase());
      if (preferred.length) candidates = preferred;
    }

    // Prefer a repeated, consistent family over a lone number that may be a year or identifier.
    candidates = candidates.filter(pattern => pattern.count >= 2 || pattern.width <= 3);
    candidates.sort((a, b) => b.count - a.count || b.value - a.value || b.width - a.width || a.prefix.localeCompare(b.prefix));

    if (!candidates.length) return fallbackResult(records, options.fallbackPrefix || preferredPrefix, options);

    const chosen = candidates[0];
    let nextValue = chosen.value + 1;
    let code = "";
    let attempts = 0;
    const width = Math.max(chosen.width, Number(options.minDigits) || 0);
    do {
      code = chosen.prefix + String(nextValue).padStart(width, "0") + chosen.suffix;
      nextValue += 1;
      attempts += 1;
      if (attempts > 10000) throw new Error("تعذر إيجاد كود متاح داخل نمط التكويد.");
    } while (used.has(code.toUpperCase()));

    return {
      code,
      pattern: describePattern(chosen),
      source: "inferred",
      matchedCount: chosen.count,
      scopeCount: records.length,
      sequence: nextValue - 1,
      examples: chosen.examples,
      explanation: "تم استنتاج النمط من " + chosen.count + " سجل داخل نفس المجموعة، واستكمال أكبر رقم مستخدم."
    };
  }

  function hint(result, rtl) {
    if (!result) return "";
    if (rtl === false) {
      return result.source === "inferred"
        ? "Detected pattern " + result.pattern + " from " + result.matchedCount + " records."
        : "No clear sequence found in this group; using the default pattern " + result.pattern + ".";
    }
    return result.source === "inferred"
      ? "النمط المستنتج: " + result.pattern + " (من " + result.matchedCount + " سجل)."
      : "لم يظهر تسلسل واضح داخل المجموعة؛ الاقتراح يستخدم النمط الافتراضي " + result.pattern + ".";
  }

  const root = typeof window !== "undefined" ? window : globalThis;
  root.PEST_CODE_INTELLIGENCE = Object.freeze({
    suggestNext,
    hint,
    extractNumericPattern
  });
})();
