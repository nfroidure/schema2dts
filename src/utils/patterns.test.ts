import { describe, test, expect } from '@jest/globals';
import { generateTypeFromPattern } from './patterns.js';
import { toSource } from '../index.js';

describe('generateTypeFromPattern', () => {
  test('should fail with a bad pattern', () => {
    expect(() => toSource(generateTypeFromPattern('[')))
      .toThrowErrorMatchingInlineSnapshot(`
     "E_BAD_PATTERN
     Cause: Invalid regular expression: /[/: Unterminated character class"
    `);
  });

  test('should work with a pattern with a start assertion only', () => {
    expect(toSource(generateTypeFromPattern('^'))).toMatchInlineSnapshot(
      `"string"`,
    );
  });

  test('should work with a pattern with several start assertions only', () => {
    expect(toSource(generateTypeFromPattern('^^'))).toMatchInlineSnapshot(
      `"string"`,
    );
  });

  test('should work with a pattern with an end assertion only', () => {
    expect(toSource(generateTypeFromPattern('$'))).toMatchInlineSnapshot(
      `"string"`,
    );
  });

  test('should work with a pattern with several end assertions only', () => {
    expect(toSource(generateTypeFromPattern('$$'))).toMatchInlineSnapshot(
      `"string"`,
    );
  });

  test('should work with a pattern with start/end assertions only', () => {
    expect(toSource(generateTypeFromPattern('^$'))).toMatchInlineSnapshot(
      `""""`,
    );
  });

  test('should work with a pattern with start/end assertions', () => {
    expect(toSource(generateTypeFromPattern('^test$'))).toMatchInlineSnapshot(
      `""test""`,
    );
  });

  test('should work with simple raw string pattern', () => {
    expect(toSource(generateTypeFromPattern('test'))).toMatchInlineSnapshot(
      `"\`\${string}test\${string}\`"`,
    );
  });

  test('should work with a UUID pattern', () => {
    expect(
      toSource(
        generateTypeFromPattern(
          '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
        ),
      ),
    ).toMatchInlineSnapshot(
      `"\`\${string}-\${string}-\${string}-\${string}-\${string}\`"`,
    );
  });

  test('should work with a date pattern', () => {
    expect(
      toSource(
        generateTypeFromPattern(
          '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\\.[0-9]{1,3}|)Z$',
        ),
      ),
    ).toMatchInlineSnapshot(
      `"\`\${string}-\${string}-\${string}T\${string}:\${string}:\${string}\${\`.\${string}\` | ""}Z\`"`,
    );
  });

  test('should work with a semver pattern', () => {
    expect(
      toSource(
        generateTypeFromPattern(
          '^v(0|[1-9]\\d*)\\.(0|[1-9]\\d*)\\.(0|[1-9]\\d*)$',
          {
            expandChars: true,
          },
        ),
      ),
    ).toMatchInlineSnapshot(
      `"\`v\${"0" | \`\${"1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9"}\${number | ""}\`}.\${"0" | \`\${"1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9"}\${number | ""}\`}.\${"0" | \`\${"1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9"}\${number | ""}\`}\`"`,
    );
  });

  test('should work with a simple prefixed pattern', () => {
    expect(
      toSource(generateTypeFromPattern('^%[_a-zA-Z][_a-zA-Z0-9]')),
    ).toMatchInlineSnapshot(`"\`%\${string}\`"`);
  });

  test('should work with a negated character class pattern', () => {
    expect(toSource(generateTypeFromPattern('^[^:]+$'))).toMatchInlineSnapshot(
      `"string"`,
    );
  });

  test('should create a union type for regex alternatives', () => {
    expect(
      toSource(generateTypeFromPattern('^one$|^two$')),
    ).toMatchInlineSnapshot(`""one" | "two""`);
  });

  test('should properly interleave variables and multiple sequential characters without skipping', () => {
    expect(
      toSource(generateTypeFromPattern('^a[0-9]b[0-9]c$')),
    ).toMatchInlineSnapshot(`"\`a\${number}b\${number}c\`"`);
  });

  test('should extract a type template variable for non-capturing groups', () => {
    expect(
      toSource(generateTypeFromPattern('^(?:abc)$')),
    ).toMatchInlineSnapshot(`""abc""`);
  });
  test('should consider infinite quantifier as string', () => {
    expect(
      toSource(generateTypeFromPattern('^(?:abc)*$')),
    ).toMatchInlineSnapshot(`"string"`);
  });
  test('should extract a type template variable from optional quantifier', () => {
    expect(
      toSource(generateTypeFromPattern('^(?:abc)?$')),
    ).toMatchInlineSnapshot(`""abc" | """`);
  });

  test('should work with escaped numeric character set', () => {
    expect(
      toSource(generateTypeFromPattern('^\\d\\.\\d$')),
    ).toMatchInlineSnapshot(`"\`\${number}.\${number}\`"`);
  });

  test('should work with escaped numeric character set (quantifier)', () => {
    expect(toSource(generateTypeFromPattern('^\\d+$'))).toMatchInlineSnapshot(
      `"\`\${number}\`"`,
    );
  });

  test('should work with several imbricated alternatives', () => {
    expect(
      toSource(generateTypeFromPattern('aaa|.|(bbb|ccc|)')),
    ).toMatchInlineSnapshot(
      `"\`\${string}aaa\${string}\` | string | \`\${string}\${"bbb" | "ccc" | ""}\${string}\`"`,
    );
  });

  test('should work with a character set', () => {
    expect(toSource(generateTypeFromPattern('^[0-9]+$'))).toMatchInlineSnapshot(
      `"\`\${number}\`"`,
    );
  });

  test('should work with escaped chars', () => {
    expect(toSource(generateTypeFromPattern('^a\\.b$'))).toMatchInlineSnapshot(
      `""a.b""`,
    );
  });

  test('should handle a single character followed by an unanchored dynamic block', () => {
    expect(toSource(generateTypeFromPattern('^%[A-Z]+'))).toMatchInlineSnapshot(
      `"\`%\${string}\`"`,
    );
  });

  test('should handle variables at the very beginning when strictly anchored at the start', () => {
    expect(
      toSource(generateTypeFromPattern('^[0-9]+-suffix$')),
    ).toMatchInlineSnapshot(`"\`\${number}-suffix\`"`);
  });

  test('should work with single char quantifier', () => {
    expect(
      toSource(
        generateTypeFromPattern('^https?://', {
          expandChars: true,
        }),
      ),
    ).toMatchInlineSnapshot(`"\`http\${"s" | ""}://\${string}\`"`);
  });
});
