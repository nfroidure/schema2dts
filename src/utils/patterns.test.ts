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
      `"\`\${string}-\${string}-\${string}T\${string}:\${string}:\${string}Z\`"`,
    );
  });

  test('should work with a semver pattern', () => {
    expect(
      toSource(
        generateTypeFromPattern(
          '^(0|[1-9]\\d*)\\.(0|[1-9]\\d*)\\.(0|[1-9]\\d*)(?:-((?:0|[1-9]\\d*|\\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\\.(?:0|[1-9]\\d*|\\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\\+([0-9a-zA-Z-]+(?:\\.[0-9a-zA-Z-]+)*))?$',
        ),
      ),
    ).toMatchInlineSnapshot(`"\`\${string}.\${string}.\${string}\`"`);
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
    ).toMatchInlineSnapshot(`"\`a\${string}b\${string}c\`"`);
  });

  test.skip('should extract a type template variable for non-capturing groups', () => {
    expect(
      toSource(generateTypeFromPattern('^(?:abc)$')),
    ).toMatchInlineSnapshot(`""abc""`);
  });

  test('should work with escaped numeric character set', () => {
    expect(
      toSource(generateTypeFromPattern('^\\d\\.\\d$')),
    ).toMatchInlineSnapshot(`"\`\${string}.\${string}\`"`);
  });

  test('should work with escaped numeric character set', () => {
    expect(toSource(generateTypeFromPattern('^\\d+$'))).toMatchInlineSnapshot(
      `"string"`,
    );
  });

  test('should work with a character set', () => {
    expect(toSource(generateTypeFromPattern('[0-9]+'))).toMatchInlineSnapshot(
      `"string"`,
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
    ).toMatchInlineSnapshot(`"\`\${string}-suffix\`"`);
  });
});
