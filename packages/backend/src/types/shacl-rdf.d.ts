// packages/backend/src/types/shacl-rdf.d.ts
//
// Ambient module declarations for the two RDF dependencies that ship as pure ESM
// (`"type": "module"`) without a `types` field: `rdf-validate-shacl` and
// `@rdfjs/dataset`. Under `moduleResolution: node10` + `noImplicitAny` these would
// otherwise fail to resolve at compile time. `n3` is covered by `@types/n3`.
//
// These declarations describe only the surface the SHACL validator uses — they are
// deliberately minimal, not a full typing of either library.

interface RdfTerm {
  termType: string;
  value: string;
}

interface RdfQuad {
  subject: RdfTerm;
  predicate: RdfTerm;
  object: RdfTerm;
  graph: RdfTerm;
}

interface RdfDataset extends Iterable<RdfQuad> {
  match(s?: RdfTerm | null, p?: RdfTerm | null, o?: RdfTerm | null, g?: RdfTerm | null): RdfDataset;
  readonly size: number;
}

declare module 'rdf-validate-shacl' {
  interface ValidationResult {
    focusNode: RdfTerm | null;
    path: RdfTerm | null;
    severity: RdfTerm | null;
    sourceConstraintComponent: RdfTerm | null;
    message: RdfTerm[];
    value: RdfTerm | null;
  }

  interface ValidationReport {
    conforms: boolean;
    results: ValidationResult[];
  }

  export default class SHACLValidator {
    constructor(shapes: Iterable<RdfQuad>, options?: { factory?: unknown });
    validate(data: Iterable<RdfQuad>): Promise<ValidationReport>;
  }
}

declare module '@rdfjs/dataset' {
  const factory: {
    dataset(quads?: Iterable<RdfQuad>): RdfDataset;
  };
  export default factory;
}
