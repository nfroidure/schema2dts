import { describe, test, beforeEach, expect, jest } from '@jest/globals';
import { combineFragments } from './fragments.js';
import { type Statement } from 'typescript';

describe('combineFragments', () => {
  const log = jest.fn();

  beforeEach(() => {
    log.mockReset();
  });

  describe('should work', () => {
    test('with empty fragments', async () => {
      expect(
        combineFragments(
          [],
          [
            {
              ref: 'x://yyyy',
              type: 'assumed',
            },
          ],
        ),
      ).toMatchInlineSnapshot(`
[
  {
    "ref": "x://yyyy",
    "type": "assumed",
  },
]
`);
    });

    test('with filled fragments', async () => {
      expect(
        combineFragments(
          [
            {
              ref: 'x://yyyy',
              type: 'statement',
              statement: null as unknown as Statement,
            },
          ],
          [
            {
              ref: 'x://yyyy',
              type: 'assumed',
            },
          ],
        ),
      ).toMatchInlineSnapshot(`
[
  {
    "ref": "x://yyyy",
    "statement": null,
    "type": "statement",
  },
]
`);
    });

    test('with assumed fragments', async () => {
      expect(
        combineFragments(
          [
            {
              ref: 'x://yyyy',
              type: 'assumed',
            },
          ],
          [
            {
              ref: 'x://yyyy',
              type: 'assumed',
            },
          ],
        ),
      ).toMatchInlineSnapshot(`
[
  {
    "ref": "x://yyyy",
    "type": "assumed",
  },
]
`);
    });
  });
});
