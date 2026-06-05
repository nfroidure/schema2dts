import { RegExpParser } from 'regexpp';
import {
  type Assertion,
  type Character,
  type Alternative,
} from 'regexpp/ast';
import {
  SyntaxKind,
  TemplateLiteralTypeSpan,
  type TypeNode,
  factory,
} from 'typescript';
import { buildLiteralType } from './typeDefinitions.js';
import { YError } from 'yerror';

export function generateTypeFromPattern(pattern: string): TypeNode {
  try {
    const parser = new RegExpParser();
    const patternAST = parser.parsePattern(pattern);

    return generateTypeFromAlternatives(patternAST.alternatives);
  } catch (err) {
    throw YError.wrap(err as Error, 'E_BAD_PATTERN', [pattern]);
  }
}

function generateTypeFromAlternatives(
  alternatives: Alternative[],
  { strictStart, strictEnd } = {
    strictStart: false,
    strictEnd: false,
  },
): TypeNode {
  if (alternatives.length === 1) {
    return generateTypeFromAlternative(alternatives[0], {
      strictStart,
      strictEnd,
    });
  }

  return factory.createUnionTypeNode(
    alternatives.map((alternative) =>
      generateTypeFromAlternative(alternative, { strictStart, strictEnd }),
    ),
  );
}

type Segment =
  | { type: 'text'; text: string }
  | { type: 'variable' }
  | { type: 'type'; value: TypeNode };

function generateTypeFromAlternative(
  alternative: Alternative,
  { strictStart, strictEnd } = {
    strictStart: false,
    strictEnd: false,
  },
): TypeNode {
  let elements = alternative.elements;

  while (elements[0]?.type === 'Assertion' && elements[0].kind === 'start') {
    strictStart = true;
    elements = elements.slice(1);
  }

  while (
    elements[elements.length - 1]?.type === 'Assertion' &&
    (elements[elements.length - 1] as Assertion).kind === 'end'
  ) {
    strictEnd = true;
    elements = elements.slice(0, -1);
  }

  const segments: Segment[] = [];
  let currentText = '';

  for (const element of elements) {
    if (element.type === 'Character') {
      currentText += String.fromCodePoint((element as Character).value);
    } else {
      if (currentText) {
        segments.push({ type: 'text', text: currentText });
        currentText = '';
      }

      if (segments[segments.length - 1]?.type !== 'variable') {
        segments.push({ type: 'variable' });
      }
    }
  }

  if (currentText) {
    segments.push({ type: 'text', text: currentText });
  }

  if (!strictStart && segments[0]?.type !== 'variable') {
    segments.unshift({ type: 'variable' });
  }
  if (!strictEnd && segments[segments.length - 1]?.type !== 'variable') {
    segments.push({ type: 'variable' });
  }

  if (segments.length === 0) {
    return buildLiteralType('');
  }

  if (segments.length === 1) {
    if (segments[0].type === 'text') {
      return buildLiteralType(segments[0].text);
    } else if (segments[0].type === 'variable') {
      return factory.createKeywordTypeNode(SyntaxKind.StringKeyword);
    } else {
      return segments[0].value;
    }
  }

  const headText = segments[0].type === 'text' ? segments[0].text : '';
  const remaining = segments[0].type === 'text' ? segments.slice(1) : segments;

  const spans: TemplateLiteralTypeSpan[] = [];

  for (let k = 0; k < remaining.length; k++) {
    const current = remaining[k];
    if (current.type === 'variable' || current.type === 'type') {
      const next = remaining[k + 1];
      const middleText = next && next.type === 'text' ? next.text : '';
      const isLast =
        k === remaining.length - 1 ||
        (k === remaining.length - 2 && next?.type === 'text');

      spans.push(
        factory.createTemplateLiteralTypeSpan(
          current.type === 'variable'
            ? factory.createKeywordTypeNode(SyntaxKind.StringKeyword)
            : current.value,
          isLast
            ? factory.createTemplateTail(middleText, middleText)
            : factory.createTemplateMiddle(middleText, middleText),
        ),
      );

      if (next && next.type === 'text') k++;
    }
  }

  return factory.createTemplateLiteralType(
    factory.createTemplateHead(headText, headText),
    spans,
  );
}
