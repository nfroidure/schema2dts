import { describe, test, beforeEach, expect, jest } from '@jest/globals';
import initTSFilesRegister from './tsFilesRegister.js';
import { factory } from 'typescript';

describe('tsFilesRegister', () => {
  const log = jest.fn();

  beforeEach(() => {
    log.mockReset();
  });

  describe('should work', () => {
    test('when empty', async () => {
      const tsFilesRegister = await initTSFilesRegister({
        log,
      });

      expect(tsFilesRegister.toSources()).toMatchInlineSnapshot(`[]`);
    });

    test('with statement fragments', async () => {
      const tsFilesRegister = await initTSFilesRegister({
        log,
      });

      tsFilesRegister.push('src/schema.d.ts', {
        ref: '_none_',
        type: 'statement',
        statement: factory.createExpressionStatement(factory.createTrue()),
      });

      expect(tsFilesRegister.toSources()).toMatchInlineSnapshot(`
[
  {
    "content": "true;",
    "path": "src/schema.d.ts",
  },
]
`);
    });

    test('with schema fragments', async () => {
      const tsFilesRegister = await initTSFilesRegister({
        log,
      });

      tsFilesRegister.push('src/schema.d.ts', {
        ref: '_none_',
        type: 'statement',
        statement: factory.createExpressionStatement(factory.createTrue()),
      });

      expect(tsFilesRegister.toSources()).toMatchInlineSnapshot(`
[
  {
    "content": "true;",
    "path": "src/schema.d.ts",
  },
]
`);
    });
  });
});
