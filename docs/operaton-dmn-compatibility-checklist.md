# DMN Compatibility Checklist for Operaton (Camunda 7–style DMN engine)

This checklist focuses on the most common deployment/evaluation pitfalls in Operaton (a Camunda 7 CE fork), especially around **DMN 1.1 namespaces**, **FEEL**, and **decision table unary tests**.

---

## 1) DMN version and namespaces

- ✅ Use **DMN 1.1 (2015)** namespaces (required in some Operaton setups)
  - `xmlns="http://www.omg.org/spec/DMN/20151101/dmn.xsd"`
  - `xmlns:dmndi="http://www.omg.org/spec/DMN/20151101/dmndi.xsd"`
  - `xmlns:di="http://www.omg.org/spec/DMN/20151101/di.xsd"`
  - `xmlns:dc="http://www.omg.org/spec/DMN/20151101/dc.xsd"`
- ❌ Avoid DMN 1.3 (2019) namespaces if your Operaton build rejects them.

---

## 2) FEEL: literal expressions vs decision table unary tests

### 2.1 Literal expressions (`<literalExpression><text>…</text>`)

- ✅ Keep expressions simple; prefer `if … then … else …` over “fancy” functions when unsure.
- ✅ Prefer explicit comparisons:
  - `buitenlandseFinanciering = false` instead of `not(buitenlandseFinanciering)` (often more null-safe).
- ⚠️ Function availability can vary by engine/version; be cautious with:
  - `min()`, `max()`, `sum()`, etc.  
  If you use them, verify in Operaton early.
- ✅ For negation, safest patterns:
  - `not(x)` (function form) **or** `x = false`
- ❌ Avoid `not x` (keyword form) — can fail in Camunda 7–style FEEL.

### 2.2 Decision tables (`<decisionTable>`) input entries are **Unary Tests**

This is the big one.

- ✅ `<inputEntry>` values are **unary tests**, not general boolean expressions.
- ✅ Good unary tests:
  - Exact values: `"HO"`, `true`, `false`, `18`
  - Comparisons: `>= 18`, `< 30`
  - **Intervals**: `[18..30)`, `(0..100]`
  - Wildcard: `-`
- ❌ Don’t use boolean logic inside a unary test:
  - `>= 18 and < 30` ❌
  - Use `[18..30)` ✅ instead
- ⚠️ Avoid `not("HO")` and similar “negated value” unary tests; prefer explicit alternatives:
  - Use `"MBO"` or enumerate allowed values.

---

## 3) IDs, hrefs, and dependency wiring

- ✅ Every `requiredDecision href="#X"` must match an existing `<decision id="X">` **exactly**.
- ✅ Every `requiredInput href="#Y"` must match an existing `<inputData id="Y">` **exactly**.
- ✅ Prefer stable IDs (avoid re-exporting with changing auto-generated IDs if DI/scripts rely on them).
- ✅ Ensure each decision has a unique `id`, and variable/output names are consistent.

---

## 4) Variable naming and types

- ✅ Use simple variable names (letters, digits, underscore).  
  Avoid spaces and punctuation in variable names referenced by FEEL.
- ✅ In FEEL, reference **runtime variables** (the `<variable name="...">`) rather than element IDs.
- ✅ Keep numeric types consistent:
  - Request: `Integer` vs `Double`
  - DMN: `typeRef="number"` typically works, but avoid mixing string numbers.

---

## 5) Null / missing inputs (robustness)

If a required input is missing, Operaton may throw runtime errors.

- ✅ If inputs may be absent, write null-safe FEEL:
  - `x = false` is often safer than `not(x)` if `x` can be null/missing.
  - Use `if x = null then … else …` when needed.
- ✅ For “optional” inputs, provide defaults in expressions:
  - `if medischeVerklaring = true then true else missendeMaand = false`

---

## 6) DMNDI (diagram) does not affect execution, but can break tooling

- ✅ The engine ignores DI for execution, but Modeler/Operaton UI uses it.
- ✅ Avoid Modeler warning “multiple DI elements defined for element”:
  - Don’t have multiple DI elements referencing the same `dmnElementRef`.
  - If you include edges, reference **`informationRequirement` IDs**, not decisions.
- ✅ Fastest safe option while debugging: remove the entire `<dmndi:DMNDI>…</dmndi:DMNDI>` block, deploy, then re-add DI later.

---

## 7) Camunda/Operaton-specific extensions

- ✅ If your Operaton config enforces history cleanup TTL:
  - Set `camunda:historyTimeToLive="…"` on decisions (or configure global defaults).
- ✅ Keep extension namespaces consistent:
  - `xmlns:camunda="http://camunda.org/schema/1.0/dmn"`

---

## 8) Deployment debugging workflow

If you see:

> `ENGINE-22004 Unable to transform DMN resource …`

Use this sequence:

1. Verify DMN **namespace/version** (DMN 1.1 vs 1.3).
2. Check for broken `href="#..."` references.
3. Check FEEL parsing, especially:
   - `not x` vs `not(x)`
   - unary tests using `and/or` vs intervals (`[a..b)`).
4. Temporarily remove DI to rule it out.
5. Inspect server logs right after ENGINE-22004 for the underlying parse error.

---

## 9) Testing strategy that saves time

- ✅ Test leaf decisions first (single-input literal expressions).
- ✅ When testing a decision that depends on others, provide the full upstream input set (unless you’ve made it null-safe).
- ✅ Maintain one “superset” JSON payload covering all inputs for quick regression testing.

---

*If you share your exact Operaton version/build, you can further tighten this list (especially FEEL function support and unary-test quirks).*
