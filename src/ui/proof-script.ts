export interface ProofScriptCommand {
  readonly line: number;
  readonly tactic: string;
}

/** Limits apply to the whole script, before any tactic executes. */
export const MAX_PROOF_SCRIPT_LENGTH = 65_536;
export const MAX_PROOF_SCRIPT_COMMANDS = 256;

export class ProofScriptError extends Error {
  constructor(message: string, readonly line?: number) {
    super(message);
    this.name = "ProofScriptError";
  }
}

/** Scripts contain one tactic per line, with optional -- comments. */
export function parseProofScript(source: string): readonly ProofScriptCommand[] {
  if (source.length > MAX_PROOF_SCRIPT_LENGTH) {
    throw new ProofScriptError(`A proof script must contain at most ${MAX_PROOF_SCRIPT_LENGTH} characters.`);
  }
  const commands: ProofScriptCommand[] = [];
  for (const [index, line] of source.split(/\r\n|\r|\n/).entries()) {
    const tactic = line.split("--", 1)[0].trim();
    if (!tactic) continue;
    if (commands.length === MAX_PROOF_SCRIPT_COMMANDS) {
      throw new ProofScriptError(`A proof script must contain at most ${MAX_PROOF_SCRIPT_COMMANDS} tactics.`, index + 1);
    }
    commands.push({ line: index + 1, tactic });
  }
  if (commands.length === 0) throw new ProofScriptError("Enter at least one tactic in the proof script.");
  return commands;
}
