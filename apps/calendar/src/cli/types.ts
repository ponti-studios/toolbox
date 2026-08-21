export type CliArgs = {
  command: string | null;
  positional: string[];
  flags: Record<string, any>;
  arrays: Record<string, string[]>;
};

export type ParseResult =
  | { ok: true; result: CliArgs }
  | { ok: false; error: { code: string; message: string } };
