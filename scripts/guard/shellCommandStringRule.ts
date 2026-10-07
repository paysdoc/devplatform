/**
 * shellCommandStringRule.ts — the 'shell-command-string' rule.
 *
 * Inside the two packages that may run git and gh (`src/git`,
 * `src/providers/github`) a command is an argv array: element 0 is the
 * program and every later element is one argument, so no value is ever
 * parsed by a shell. A string or template literal that spells a whole
 * command line — program, whitespace, arguments — is the injectable shape
 * wherever it appears: a call argument, a builder's return value, an array
 * element. The bare program name (`'git'`, `'gh'`, an argv's element 0)
 * never matches, because the pattern needs whitespace after it.
 *
 * Applied only inside the exempt packages. Everywhere else the
 * 'git-gh-shellout' rule already flags the shape at a call's first argument,
 * and running both rules there would report one line twice.
 *
 * Deliberately conservative: a log or error message that merely starts with
 * `git ` or `gh ` is flagged too. Reword the message instead of exempting it.
 */

import * as ts from 'typescript';
import type { Violation } from './violationTypes.js';

/** A literal opening with the program and then an argument, e.g. a git commit or a gh pr create line. */
const COMMAND_LINE_RE = /^(git|gh)\s/;

/** Returns the violation's `command` text when `node` is a literal that spells a command line, else null. */
function describeCommandLineLiteral(node: ts.Node): string | null {
  if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && COMMAND_LINE_RE.test(node.text)) {
    return node.text;
  }
  if (ts.isTemplateExpression(node) && COMMAND_LINE_RE.test(node.head.text)) {
    return `${node.head.text}\${...}`;
  }
  return null;
}

/** Flags every literal in `sourceFile` that spells a whole git/gh command line. */
export function flagShellCommandStrings(sourceFile: ts.SourceFile): Violation[] {
  const violations: Violation[] = [];
  const visit = (node: ts.Node): void => {
    const command = describeCommandLineLiteral(node);
    if (command !== null) {
      const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
      violations.push({ file: sourceFile.fileName, line: line + 1, command, rule: 'shell-command-string' });
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return violations;
}
