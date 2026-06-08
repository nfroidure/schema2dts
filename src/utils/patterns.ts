import { RegExpParser } from 'regexpp';
import {
  type Assertion,
  type Character,
  type Alternative,
  type CharacterSet,
  type CharacterClass,
} from 'regexpp/ast';
import {
  SyntaxKind,
  type TemplateLiteralTypeSpan,
  type TypeNode,
  factory,
} from 'typescript';
import { buildLiteralType } from './typeDefinitions.js';
import { YError } from 'yerror';
import {
  LOWER_LETTER_CHARS,
  NUMBER_CHARS,
  UPPER_LETTER_CHARS,
} from './constants.js';

export function generateTypeFromPattern(
  pattern: string,
  { expandChars } = {
    expandChars: false,
  },
): TypeNode {
  try {
    const parser = new RegExpParser();
    const patternAST = parser.parsePattern(pattern);

    return generateTypeFromAlternatives(patternAST.alternatives, {
      strictStart: false,
      strictEnd: false,
      expandChars,
    });
  } catch (err) {
    throw YError.wrap(err as Error, 'E_BAD_PATTERN', [pattern]);
  }
}

function generateTypeFromAlternatives(
  alternatives: Alternative[],
  { strictStart, strictEnd, expandChars } = {
    strictStart: false,
    strictEnd: false,
    expandChars: false,
  },
): TypeNode {
  if (alternatives.length === 1) {
    return generateTypeFromAlternative(alternatives[0], {
      strictStart,
      strictEnd,
      expandChars,
    });
  }

  return factory.createUnionTypeNode(
    alternatives.map((alternative) =>
      generateTypeFromAlternative(alternative, {
        strictStart,
        strictEnd,
        expandChars,
      }),
    ),
  );
}

type Segment =
  | { type: 'text'; text: string }
  | { type: 'variable' }
  | { type: 'type'; value: TypeNode };

function generateTypeFromAlternative(
  alternative: Alternative,
  { strictStart, strictEnd, expandChars } = {
    strictStart: false,
    strictEnd: false,
    expandChars: false,
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

      if (element.type === 'CapturingGroup' || element.type === 'Group') {
        segments.push({
          type: 'type',
          value: generateTypeFromAlternatives(element.alternatives, {
            strictStart: true,
            strictEnd: true,
            expandChars,
          }),
        });
        continue;
      }

      if (
        element.type === 'Quantifier' &&
        element.min <= 1 &&
        element.max === 1 &&
        (element.element.type === 'Group' ||
          element.element.type === 'CapturingGroup')
      ) {
        const type = generateTypeFromAlternatives(
          element.element.alternatives,
          {
            strictStart: true,
            strictEnd: true,
            expandChars,
          },
        );
        segments.push({
          type: 'type',
          value:
            element.min === 1
              ? type
              : factory.createUnionTypeNode([type, buildLiteralType('')]),
        });
        continue;
      }

      if (
        element.type === 'CharacterSet' ||
        (element.type === 'CharacterClass' && !element.negate) ||
        (element.type === 'Quantifier' &&
          element.min <= 1 &&
          (element.max === 1 || element.max === Infinity) &&
          (element.element.type === 'CharacterSet' ||
            element.element.type === 'Character' ||
            (element.element.type === 'CharacterClass' &&
              !element.element.negate)))
      ) {
        const min = element.type === 'Quantifier' ? element.min : 1;
        const max = element.type === 'Quantifier' ? element.max : 1;
        const types =
          element.type === 'Quantifier'
            ? element.element.type === 'Character'
              ? [[String.fromCodePoint(element.element.value)]]
              : element.element.type === 'CharacterSet'
                ? [simpleCharSetFromCharacterSet(element.element)]
                : simpleCharSetFromCharacterClass(
                    element.element as CharacterClass,
                  )
            : element.type === 'CharacterSet'
              ? [simpleCharSetFromCharacterSet(element)]
              : simpleCharSetFromCharacterClass(element);
        const hasOnlyChars = types.every((t) => t instanceof Array);

        if (expandChars && hasOnlyChars && max === 1) {
          const allChars = [...new Set(types.flat())];
          const type =
            allChars.length < 2
              ? buildLiteralType(allChars[0])
              : factory.createUnionTypeNode(
                  allChars.map((c) => buildLiteralType(c)),
                );
          segments.push({
            type: 'type',
            value:
              min === 1
                ? type
                : factory.createUnionTypeNode([type, buildLiteralType('')]),
          });
          continue;
        }

        const hasOnlyNumbers = types.every(
          (t) =>
            t === 'numbers' ||
            t === 'number' ||
            (t instanceof Array && t.every((c) => NUMBER_CHARS.includes(c))),
        );

        if (hasOnlyNumbers) {
          const type = factory.createKeywordTypeNode(SyntaxKind.NumberKeyword);

          segments.push({
            type: 'type',
            value:
              min === 1
                ? type
                : factory.createUnionTypeNode([type, buildLiteralType('')]),
          });
          continue;
        }
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
      if (segments[0].value.kind !== SyntaxKind.NumberKeyword) {
        return segments[0].value;
      }
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
            ? factory.createTemplateTail(middleText)
            : factory.createTemplateMiddle(middleText),
        ),
      );

      if (next && next.type === 'text') k++;
    }
  }

  return factory.createTemplateLiteralType(
    factory.createTemplateHead(headText),
    spans,
  );
}

type SimplifiedCharSet =
  | 'number'
  | 'numbers'
  | 'word'
  | 'words'
  | 'space'
  | 'spaces'
  | 'char'
  | 'string'
  | string[];

function simpleCharSetFromCharacterSet(
  element: CharacterSet,
): SimplifiedCharSet {
  if (element.kind === 'digit') {
    return 'number';
  }
  if (element.kind === 'any') {
    return 'char';
  }
  if (element.kind === 'word') {
    return 'word';
  }
  if (element.kind === 'space') {
    return 'space';
  }

  return 'string';
}

function simpleCharSetFromCharacterClass(
  element: CharacterClass,
): SimplifiedCharSet[] {
  const charSet: SimplifiedCharSet[] = [];

  for (const child of element.elements) {
    if (child.type === 'CharacterSet') {
      charSet.push(simpleCharSetFromCharacterSet(child));
    } else if (child.type === 'Character') {
      charSet.push([String.fromCodePoint(child.value)]);
    } else if (child.type === 'CharacterClassRange') {
      const min = String.fromCodePoint(child.min.value);
      const max = String.fromCodePoint(child.max.value);

      if (NUMBER_CHARS.includes(min) && NUMBER_CHARS.includes(max)) {
        charSet.push(
          NUMBER_CHARS.slice(
            NUMBER_CHARS.indexOf(min),
            NUMBER_CHARS.indexOf(max) + 1,
          ),
        );
      } else if (
        LOWER_LETTER_CHARS.includes(min) &&
        LOWER_LETTER_CHARS.includes(max)
      ) {
        charSet.push(
          LOWER_LETTER_CHARS.slice(
            LOWER_LETTER_CHARS.indexOf(min),
            LOWER_LETTER_CHARS.indexOf(max) + 1,
          ),
        );
      } else if (
        UPPER_LETTER_CHARS.includes(min) &&
        UPPER_LETTER_CHARS.includes(max)
      ) {
        charSet.push(
          UPPER_LETTER_CHARS.slice(
            UPPER_LETTER_CHARS.indexOf(min),
            UPPER_LETTER_CHARS.indexOf(max) + 1,
          ),
        );
      } else {
        charSet.push('string');
      }
    }
  }

  return charSet;
}
