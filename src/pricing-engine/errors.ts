/** Mirrors Python's ConfiguratoreError: a validation error that blocks configuration. */
export class ConfiguratoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfiguratoreError";
  }
}

/** Formats a string list the way Python's repr(sorted(list)) does, e.g. "['a', 'b']". */
export function pyListRepr(values: string[]): string {
  return `[${values.map((v) => `'${v}'`).join(", ")}]`;
}
