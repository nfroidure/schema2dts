import { describe, test, expect } from '@jest/globals';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  createTypeGeneratorService,
  DEFAULT_OPEN_API_OPTIONS,
  generateOpenAPITypes,
  toSource,
} from './index.js';
import { type OpenAPI } from 'ya-open-api-types';

function readFixture(pathName: string): string {
  return readFileSync(path.join(process.cwd(), pathName)).toString();
}

describe('partial OpenAPI generation', () => {
  test('filters generated types by operation id', async () => {
    const source = toSource(
      await generateOpenAPITypes(
        JSON.parse(
          readFixture('fixtures/openapi/whook_example_components.json'),
        ) as OpenAPI,
        {
          ...DEFAULT_OPEN_API_OPTIONS,
          filterOperations: ['putEcho'],
        },
      ),
    );

    expect(source).toContain('put: operations["putEcho"]');
    expect(source).toContain('putEcho');
    expect(source).toContain('Echo');
    expect(source).not.toContain('getDelay');
  });

  test('generates full and partial schema files with the type generator service', async () => {
    const typeGenerator = createTypeGeneratorService({
      openAPITypesOptions: {
        basePath: 'src/schema/openapi.d.ts',
      },
      resolveSchemaPath: (name) =>
        `src/schema/${name.split('/').slice(-1)[0]}.d.ts`,
    });
    const fixture = readFixture('fixtures/openapi/whook_example_components.json');
    const fullSchema = await typeGenerator.generateOpenAPISchema(fixture);

    expect(fullSchema).toHaveLength(1);
    expect(fullSchema[0].path).toBe('src/schema/openapi.d.ts');
    expect(fullSchema[0].contents).toContain('putEcho');
    expect(fullSchema[0].contents).toContain('getDelay');

    const partialSchemas = await typeGenerator.generateSchemas(['putEcho', 'Echo']);

    expect(partialSchemas).toHaveLength(2);
    expect(partialSchemas[0].path).toBe('src/schema/putEcho.d.ts');
    expect(partialSchemas[1].path).toBe('src/schema/Echo.d.ts');
    expect(partialSchemas[0].contents).toContain('put: operations["putEcho"]');
    expect(partialSchemas[0].contents).toContain('components["schemas"]["Echo"]');
    expect(partialSchemas[0].contents).not.toContain('getDelay');
    expect(partialSchemas[1].contents).toContain('Echo');
    expect(partialSchemas[1].contents).not.toContain('putEcho');
  });

  test('fails when generating partial schemas before loading OpenAPI content', async () => {
    const typeGenerator = createTypeGeneratorService();

    await expect(typeGenerator.generateSchemas(['putEcho'])).rejects.toThrow(
      'E_OPEN_API_SCHEMA_NOT_GENERATED',
    );
  });

  test('fails with an unknown name', async () => {
    const typeGenerator = createTypeGeneratorService();

    await typeGenerator.generateOpenAPISchema(
      readFixture('fixtures/openapi/whook_example_components.json'),
    );

    await expect(
      typeGenerator.generateSchemas(['some_unknown_schema']),
    ).rejects.toThrow('E_SCHEMA_NOT_FOUND');
  });
});
