export interface HonestyViolation {
  file: string;
  line: number;
  text: string;
  pattern: string;
}

export function checkContentHonesty(content: string, filename?: string): HonestyViolation[];
export function scanReportsHonesty(reportsDir?: string): HonestyViolation[];
export function walkMarkdownFiles(dir: string, out?: string[]): string[];
