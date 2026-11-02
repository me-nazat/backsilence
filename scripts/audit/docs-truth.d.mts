export interface DocViolation {
  file: string;
  detail: string;
}

export function checkDocsTruth(rootDir?: string): DocViolation[];
