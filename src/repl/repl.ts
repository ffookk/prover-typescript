import readline from 'node:readline';
import { elaborate } from '../elaborator/elaborate';
import { check, infer, show } from '../kernel/typecheck';
import { GlobalEnvironment, Environment } from '../environment/environment';
import { parseCommand } from '../parser/command';
import { ProofState } from '../proof/state';

export const EXIT_COMMAND = 'exit';

const HELP_TEXT = [
  'REPL commands:',
  '  term                  Infer a term\'s type (example: Nat)',
  '  def name := term      Define a reusable term (example: def zero := 0)',
  '  theorem name : proposition := proof',
  '                        Check and store a proof',
  '                        Example: theorem self : Eq Nat 0 0 := Refl Nat 0',
  '  #help                 Show this help',
  '  exit                  Leave the REPL',
].join('\n');

export function formatProofState(state: ProofState): string {
  if (state.goals.length === 0) return 'No goals.\nProof complete.';
  return ['Goals:', ...state.goals.map((goal, index) => {
    const focused = goal.id === state.focusedGoalId ? '▶ ' : '  ';
    const header = `${focused}Goal ${index + 1}${goal.caseName ? ` (${goal.caseName})` : ''}`;
    const context = goal.context.map(entry => `  ${entry.name} : ${show(entry.type)}`);
    return [header, ...context, `  ⊢ ${show(goal.type)}`].join('\n');
  })].join('\n\n');
}
export function processLine(input: string, environment: Environment = new GlobalEnvironment()): string | null {
  const line = input.trim();
  if (line === '') return '';
  if (line === EXIT_COMMAND) return null;
  const command = parseCommand(line);
  if (command.kind === 'help') return HELP_TEXT;
  if (command.kind === 'term') {
    const core = elaborate(command.term, [], environment);
    return show(infer([], core));
  }
  if (command.kind === 'theorem') {
    const proposition = elaborate(command.proposition, [], environment);
    const proof = elaborate(command.proof, [], environment);
    infer([], proposition);
    check([], proof, proposition);
    environment.define(command.name, proof);
    return `theorem ${command.name}`;
  }
  const core = elaborate(command.term, [], environment);
  infer([], core);
  environment.define(command.name, core);
  return `defined ${command.name}`;
}

export async function startRepl(
  input: NodeJS.ReadableStream = process.stdin,
  output: NodeJS.WritableStream = process.stdout,
): Promise<void> {
  const rl = readline.createInterface({ input, output, prompt: '> ' });
  const environment = new GlobalEnvironment();
  let closed = false;
  rl.on('close', () => { closed = true; });
  output.write('prover-typescript REPL\n');
  rl.prompt();
  for await (const line of rl) {
    try {
      const result = processLine(line, environment);
      if (result === null) { rl.close(); return; }
      if (result !== '') output.write(`${result}\n`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const kind = error instanceof Error ? error.name : 'Error';
      output.write(`Error [${kind}]: ${message}\n`);
    }
    if (closed) break;
    rl.prompt();
  }
}