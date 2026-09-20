import {
  SurfaceTerm,
  surfaceApp,
  surfaceEq,
  surfaceLambda,
  surfaceNat,
  surfacePi,
  surfaceRefl,
  surfaceSucc,
  surfaceVar,
  surfaceZero,
  surfaceSort,
} from '../syntax/surface';

type TokenKind = 'identifier' | 'number' | 'lparen' | 'rparen' | 'colon' | 'arrow' | 'fatArrow' | 'eof';
interface Token { readonly kind: TokenKind; readonly text: string; readonly position: number; }
export class ParseError extends Error { constructor(message: string) { super(message); this.name = 'ParseError'; } }

/** Blank line comments without changing token offsets or joining adjacent tokens. */
export function stripLineComments(input: string): string {
  return input.replace(/--[^\r\n]*/g, comment => ' '.repeat(comment.length));
}

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let position = 0;
  while (position < input.length) {
    const char = input[position];
    if (/\s/.test(char)) { position += 1; continue; }
    if (input.startsWith('->', position)) { tokens.push({ kind: 'arrow', text: '->', position }); position += 2; continue; }
    if (input.startsWith('=>', position)) { tokens.push({ kind: 'fatArrow', text: '=>', position }); position += 2; continue; }
    if (char === '(') { tokens.push({ kind: 'lparen', text: char, position }); position += 1; continue; }
    if (char === ')') { tokens.push({ kind: 'rparen', text: char, position }); position += 1; continue; }
    if (char === ':') { tokens.push({ kind: 'colon', text: char, position }); position += 1; continue; }
    if (/[0-9]/.test(char)) {
      const start = position;
      while (position < input.length && /[0-9]/.test(input[position])) position += 1;
      tokens.push({ kind: 'number', text: input.slice(start, position), position: start });
      continue;
    }
    if (/[A-Za-z_]/.test(char)) {
      const start = position;
      position += 1;
      while (position < input.length && /[A-Za-z0-9_']/.test(input[position])) position += 1;
      tokens.push({ kind: 'identifier', text: input.slice(start, position), position: start });
      continue;
    }
    throw new ParseError(`Unexpected character '${char}' at position ${position}`);
  }
  tokens.push({ kind: 'eof', text: '', position: input.length });
  return tokens;
}

class Parser {
  private readonly tokens: readonly Token[];
  private position = 0;
  constructor(input: string) { this.tokens = tokenize(input); }
  parse(): SurfaceTerm {
    const term = this.parseTerm();
    if (this.current.kind !== 'eof') throw this.error(`Unexpected token '${this.current.text}'`);
    return term;
  }
  private parseTerm(): SurfaceTerm { return this.current.kind === 'lparen' && this.looksLikeBinder() ? this.parseBinder() : this.parseApplication(); }
  private parseBinder(): SurfaceTerm {
    this.expect('lparen');
    const name = this.expect('identifier').text;
    this.expect('colon');
    const domain = this.parseTerm();
    this.expect('rparen');
    const arrow = this.current;
    if (arrow.kind !== 'arrow' && arrow.kind !== 'fatArrow') throw this.error("Expected '->' or '=>' after binder");
    this.position += 1;
    const body = this.parseTerm();
    return arrow.kind === 'arrow' ? surfacePi(name, domain, body) : surfaceLambda(name, domain, body);
  }
  private parseApplication(): SurfaceTerm {
    let term = this.parseAtom();
    while (this.startsAtom(this.current)) term = surfaceApp(term, this.parseAtom());
    return term;
  }
  private parseAtom(): SurfaceTerm {
    const token = this.current;
    if (token.kind === 'identifier') {
      this.position += 1;
      switch (token.text) {
        case 'Type': return surfaceSort;
        case 'Nat': return surfaceNat;
        case 'Succ': return surfaceSucc(this.parseAtom());
        case 'Eq': return surfaceEq(this.parseAtom(), this.parseAtom(), this.parseAtom());
        case 'Refl': return surfaceRefl(this.parseAtom(), this.parseAtom());
        default: return surfaceVar(token.text);
      }
    }
    if (token.kind === 'number') {
      this.position += 1;
      const value = Number(token.text);
      if (!Number.isSafeInteger(value)) throw this.error(`Natural literal is too large: ${token.text}`);
      let result: SurfaceTerm = surfaceZero;
      for (let index = 0; index < value; index += 1) result = surfaceSucc(result);
      return result;
    }
    if (token.kind === 'lparen') {
      this.position += 1;
      const term = this.parseTerm();
      this.expect('rparen');
      return term;
    }
    throw this.error(`Expected a term, found '${token.text || 'EOF'}'`);
  }
  private startsAtom(token: Token): boolean { return token.kind === 'identifier' || token.kind === 'number' || token.kind === 'lparen'; }
  private looksLikeBinder(): boolean { return this.tokens[this.position + 1]?.kind === 'identifier' && this.tokens[this.position + 2]?.kind === 'colon'; }
  private expect(kind: TokenKind): Token {
    if (this.current.kind !== kind) throw this.error(`Expected ${kind}, found '${this.current.text || 'EOF'}'`);
    const token = this.current; this.position += 1; return token;
  }
  private get current(): Token { return this.tokens[this.position]; }
  private error(message: string): ParseError { return new ParseError(`${message} at position ${this.current.position}`); }
}

export function parse(input: string): SurfaceTerm { return new Parser(stripLineComments(input)).parse(); }
