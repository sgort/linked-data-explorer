/**
 * Small, hand-written request-body validators for the Assets and ROPA
 * upserts (#150).
 *
 * Deliberately shallow: presence, type and enum, following the database's
 * own `NOT NULL` / `CHECK` constraints (see `packages/backend/src/db/migrate.ts`),
 * plus a UUID *shape* check where a route casts a path id into a UUID column.
 * Nothing here parses the content of an XML or JSON blob (`xml`, `schema`,
 * `zones`, `bindings`, `assets`) — only that it is present and of the right
 * JSON type. Whether it is well-formed is not a promise this API makes (plan
 * decision 4). A field the route already defaults (`?? something`) before it
 * reaches the database is optional here too.
 *
 * The aim is that a request which fails today now fails as a 400 naming the
 * field, and that a request which succeeds today still succeeds. In a few
 * edge cases the checks are deliberately stricter than the database: they do
 * not accept a value Postgres would coerce or store without complaint, such
 * as the string "1" for an integer, "true" for a boolean, or JSON `null` for a
 * required JSON value. No client sends those, and storing them would leave a
 * row no reader expects. This was checked against every row in a development
 * database and every example `.form` and `.document` file in the repository,
 * none of which a check here rejects.
 */

export type FieldErrors = string[];

type FieldType = 'string' | 'integer' | 'boolean' | 'array' | 'stringArray' | 'object';

function describeType(type: FieldType): string {
  switch (type) {
    case 'string':
      return 'a string';
    case 'integer':
      return 'an integer';
    case 'boolean':
      return 'a boolean';
    case 'array':
      return 'an array';
    case 'stringArray':
      return 'an array of strings';
    case 'object':
      return 'an object';
  }
}

function matchesType(value: unknown, type: FieldType): boolean {
  switch (type) {
    case 'string':
      return typeof value === 'string';
    // Every numeric field these routes bind is an INTEGER column, so 1.5 is
    // rejected here rather than left to fail as a 500 in the database.
    case 'integer':
      return typeof value === 'number' && Number.isInteger(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'array':
      return Array.isArray(value);
    case 'stringArray':
      return Array.isArray(value) && value.every((v) => typeof v === 'string');
    case 'object':
      return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}

export interface FieldSpec {
  /**
   * The column has no fallback in the route/service — an omitted value
   * reaches the database as-is. Leave unset (or `false`) for a field the
   * handler already defaults, which stays optional here regardless of what
   * the column itself requires.
   */
  required?: boolean;
  /** Checked only when the field is present, so an optional field with the
   *  wrong type still fails even though its absence would not. */
  type?: FieldType;
  /** A database CHECK constraint's allowed values. Checked only when the
   *  field is present (and, if `type` is also given, only when it matched). */
  enum?: readonly string[];
}

/**
 * Checks one field of `body` against `spec`, pushing a message onto `errors`
 * for every way it fails. Returns the field's value so a caller can use it
 * (e.g. to validate an array's items) without reading `body` again.
 */
export function checkField(
  errors: FieldErrors,
  body: Record<string, unknown>,
  field: string,
  spec: FieldSpec
): unknown {
  const value = body[field];
  const present = value !== undefined && value !== null;

  if (!present) {
    if (spec.required) errors.push(`${field} is required`);
    return undefined;
  }

  if (spec.type && !matchesType(value, spec.type)) {
    errors.push(`${field} must be ${describeType(spec.type)}`);
    return value;
  }

  if (spec.enum && !spec.enum.includes(value as string)) {
    errors.push(`${field} must be one of: ${spec.enum.join(', ')}`);
  }

  return value;
}

/** Prefixes every field name in `errors` with `prefix` (e.g. an array index). */
export function prefixErrors(errors: FieldErrors, prefix: string): FieldErrors {
  return errors.map((e) => `${prefix}.${e}`);
}

/**
 * A parsed JSON body can be anything JSON allows, not only an object — an
 * array, a string, a number, a bare `null`. `checkField` indexes it with
 * `body[field]`, which throws for `null`/`undefined` and reads `undefined`
 * (safely) for anything else. Route handlers are `async`, so a synchronous
 * throw here would become an unhandled rejection rather than a response —
 * call this first to normalise any non-object body into an empty object,
 * which then fails every `required` check exactly as a genuinely empty body
 * would.
 */
export function asRecord(body: unknown): Record<string, unknown> {
  return typeof body === 'object' && body !== null && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : {};
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Shape check only — matches what Postgres accepts as a UUID literal, not a
 *  specific UUID version. */
export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

/** A lowercase, hyphenated slug — the shape every real `boardOwner` tag
 *  uses (`caseworker`, `infra-board`). */
const BOARD_OWNER_SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Validates a `boardOwner` field wherever the backend accepts one as
 * external input (#156). Semantics, unchanged from before this check
 * existed: *omitted* (`undefined`) means "derive it"; `''` means "opt out,
 * leave it untagged"; any other value is stored as-is once it passes this
 * check. Only a non-empty string is checked against the slug pattern — an
 * omitted or empty value is always valid.
 *
 * A JSON `null` is deliberately NOT treated the same as omitted, even
 * though `checkField`'s `present` check (elsewhere in this file) does fold
 * the two together for other fields. `operaton.service.ts`'s
 * `deployProcess` only derives on `boardOwner === undefined`; a `null`
 * reaches it as `null`, which `injectBoardOwner` treats as falsy — silently
 * "no tag" rather than "derive". OpenAPI also documents this field as
 * `type: string`, not `string | null`. So `null` is rejected here with the
 * same "must be a string" a non-string, non-null value gets.
 */
export function checkBoardOwner(
  errors: FieldErrors,
  body: Record<string, unknown>,
  field = 'boardOwner'
): void {
  const value = body[field];
  if (value === undefined) return;
  if (typeof value !== 'string') {
    errors.push(`${field} must be a string`);
    return;
  }
  if (value === '') return;
  if (!BOARD_OWNER_SLUG_RE.test(value)) {
    errors.push(
      `${field} must be a lowercase slug matching ^[a-z0-9]+(?:-[a-z0-9]+)*$ ` +
        `(e.g. "caseworker", "infra-board") when non-empty`
    );
  }
}
