export interface IntegrityViolation {
  file: string;
  detail: string;
}

export interface ReferenceIntegrityResult {
  violations: IntegrityViolation[];
  canonicalHash: string | null;
  checkedCount: number;
}

export function checkReferenceIntegrity(rootDir?: string): ReferenceIntegrityResult;
export function walkJsonFiles(dir: string, out?: string[]): string[];

