import { SurfaceTerm } from '../syntax/surface';
import { ParseError, parse } from './parser';

export type Command =
  | { readonly kind: 'term'; readonly term: SurfaceTerm }
  | { readonly kind: 'check'; readonly term: SurfaceTerm }
  | { readonly kind: 'eval'; readonly term: SurfaceTerm }
  | { readonly kind: 'def'; readonly name: string; readonly term: SurfaceTerm }
  | { readonly kind: 'theorem'; readonly name: string; readonly proposition: SurfaceTerm; readonly proof: SurfaceTerm };

const identifierPattern = /^[A-Za-z_][A-Za-z0-9_']*$/;

export function parseCommand(input: string): Command {
  const source = input.trim();
  const inspection = /^#(check|eval)(?:\s|$)/.exec(source);
  if (inspection) {
    const kind = inspection[1] as 'check' | 'eval';
    const termSource = source.slice(kind.length + 1).trim();
    if (!termSource) throw new ParseError(`Expected a term after #${kind}`);
    return { kind, term: parse(termSource) };
  }
  if (/^def(?:\s|$)/.test(source)) {
    const match = /^def\s+([^\s:=]+)\s*:=\s*([\s\S]*)$/.exec(source);
    if (!match) throw new ParseError("Expected 'def name := term'");
    const [, name, termSource] = match;
    if (!identifierPattern.test(name)) throw new ParseError(`Invalid definition name: ${name}`);
    if (termSource.trim() === '') throw new ParseError('Expected a term after :=');
    return { kind: 'def', name, term: parse(termSource) };
  }
  if (/^theorem(?:\s|$)/.test(source)) {
    const match = /^theorem\s+([^\s:=]+)\s*:\s*([\s\S]*?)\s*:=\s*([\s\S]*)$/.exec(source);
    if (!match) throw new ParseError("Expected 'theorem name : proposition := proof'");
    const [, name, propositionSource, proofSource] = match;
    if (!identifierPattern.test(name)) throw new ParseError(`Invalid theorem name: ${name}`);
    if (propositionSource.trim() === '') throw new ParseError('Expected a proposition after :');
    if (proofSource.trim() === '') throw new ParseError('Expected a proof after :=');
    return { kind: 'theorem', name, proposition: parse(propositionSource), proof: parse(proofSource) };
  }
  return { kind: 'term', term: parse(source) };
}
