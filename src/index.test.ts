import type { JSONSchema7 } from 'json-schema';
import {
  generateTypeDeclaration,
  generateJSONSchemaTypes,
  generateOpenAPITypes,
  buildIdentifier,
  toSource,
} from '.';
import { readFileSync, readdirSync } from 'fs';
import path from 'path';
import { OpenAPIV3 } from 'openapi-types';

describe('generateOpenAPITypes()', () => {
  test('with a denormalized simple sample', async () => {
    const schema = {
      openapi: '3.0.2',
      info: {
        version: '0.0.0',
        title: 'diagrams-api',
        description: 'The DiagRAMS API',
      },
      servers: [
        {
          url: 'http://localhost:8000/v0',
        },
      ],
      paths: {
        '/test': {
          get: {
            operationId: 'GetPing',
            parameters: [
              {
                name: 'X-A-Header',
                in: 'header',
                schema: {
                  type: 'number',
                },
              },
              {
                name: 'X-API-Version',
                in: 'header',
                schema: {
                  type: 'string',
                },
              },
            ],
            requestBody: {
              content: {
                'application/json': {
                  schema: { type: 'string' },
                },
              },
            },
            responses: {
              '200': {
                description: '',
                headers: {
                  'X-A-Header': {
                    required: true,
                    schema: {
                      type: 'number',
                    },
                  },
                  'X-SDK-Version': {
                    schema: {
                      type: 'string',
                    },
                  },
                },
                content: {
                  'application/json': {
                    schema: { type: 'string' },
                  },
                },
              },
            },
          },
        },
      },
    } as OpenAPIV3.Document;

    expect(toSource(await generateOpenAPITypes(schema))).toMatchInlineSnapshot(`
      "declare namespace API {
          export namespace GetPing {
              export type Body = Components.RequestBodies.GetPingRequestBody;
              export type Output = Responses.$200;
              export type Input = {
                  readonly body?: Body;
                  readonly xAHeader?: Parameters.XAHeader;
                  readonly xApiVersion?: Parameters.XAPIVersion;
              };
              export namespace Responses {
                  export type $200 = Components.Responses.GetPingResponse200<200>;
              }
              export namespace Parameters {
                  export type XAHeader = Components.Parameters.GetPing0;
                  export type XAPIVersion = Components.Parameters.GetPing1;
              }
          }
      }
      declare namespace Components {
          export namespace RequestBodies {
              export type GetPingRequestBody = Components.Schemas.RequestBodiesGetPingRequestBodyBody0;
          }
          export namespace Parameters {
              export type GetPing0 = NonNullable<number>;
              export type GetPing1 = NonNullable<string>;
          }
          export namespace Responses {
              type GetPingResponse200<S extends number> = {
                  readonly status: S;
                  readonly headers: {
                      readonly \\"x-a-header\\": Components.Headers.GetPingResponse200HeadersXAHeader;
                      readonly \\"x-sdk-version\\"?: Components.Headers.GetPingResponse200HeadersXSDKVersion;
                      readonly [name: string]: unknown;
                  };
                  readonly body: Components.Schemas.ResponsesGetPingResponse200Body0;
              };
          }
          export namespace Headers {
              export type GetPingResponse200HeadersXAHeader = NonNullable<number>;
              export type GetPingResponse200HeadersXSDKVersion = NonNullable<string>;
          }
          export namespace Schemas {
              export type RequestBodiesGetPingRequestBodyBody0 = NonNullable<string>;
              export type ResponsesGetPingResponse200Body0 = NonNullable<string>;
          }
      }"
    `);
  });

  test('with a normalized simple sample', async () => {
    const schema = {
      openapi: '3.0.2',
      info: {
        version: '0.0.0',
        title: 'diagrams-api',
        description: 'The DiagRAMS API',
      },
      servers: [
        {
          url: 'http://localhost:8000/v0',
        },
      ],
      components: {
        parameters: {
          TheTestParamClone: {
            $ref: '#/components/parameters/TheTestParam',
          },
          TheTestParam: {
            name: 'TestParam',
            in: 'query',
            schema: { $ref: '#/components/schemas/TheSchema' },
          },
        },
        headers: {
          TheXAHeader: {
            schema: {
              type: 'number',
            },
          },
        },
        schemas: {
          TheSchemaClone: {
            $ref: '#/components/schemas/TheSchema',
          },
          TheSchema: { type: 'string' },
        },
        responses: {
          TheResponseClone: {
            $ref: '#/components/responses/TheResponse',
          },
          TheResponse: {
            description: '',
            headers: {
              'X-A-Header': {
                $ref: '#/components/headers/TheXAHeader',
              },
            },
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/TheSchema',
                },
              },
            },
          },
        },
        requestBodies: {
          TheBodyClone: {
            $ref: '#/components/requestBodies/TheBody',
          },
          TheBody: {
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/TheSchemaClone',
                },
              },
            },
          },
        },
      },
      paths: {
        '/test': {
          get: {
            operationId: 'GetTest',
            parameters: [
              {
                $ref: '#/components/parameters/TheTestParam',
              },
            ],
            requestBody: {
              $ref: '#/components/requestBodies/TheBody',
            },
            responses: {
              '200': {
                $ref: '#/components/responses/TheResponse',
              },
            },
          },
        },
      },
    } as OpenAPIV3.Document;

    expect(toSource(await generateOpenAPITypes(schema))).toMatchInlineSnapshot(`
      "declare namespace API {
          export namespace GetTest {
              export type Body = Components.RequestBodies.TheBody;
              export type Output = Responses.$200;
              export type Input = {
                  readonly body?: Body;
                  readonly testParam?: Parameters.TestParam;
              };
              export namespace Responses {
                  export type $200 = Components.Responses.TheResponse<200>;
              }
              export namespace Parameters {
                  export type TestParam = Components.Parameters.TheTestParam;
              }
          }
      }
      declare namespace Components {
          export namespace RequestBodies {
              export type TheBodyClone = Components.RequestBodies.TheBody;
              export type TheBody = Components.Schemas.TheSchemaClone;
          }
          export namespace Parameters {
              export type TheTestParamClone = Components.Parameters.TheTestParam;
              export type TheTestParam = Components.Schemas.TheSchema;
          }
          export namespace Responses {
              export type TheResponseClone = Components.Responses.TheResponse;
              type TheResponse<S extends number> = {
                  readonly status: S;
                  readonly headers?: {
                      readonly \\"x-a-header\\"?: Components.Headers.TheXAHeader;
                      readonly [name: string]: unknown;
                  };
                  readonly body: Components.Schemas.TheSchema;
              };
          }
          export namespace Headers {
              export type TheXAHeader = NonNullable<number>;
          }
          export namespace Schemas {
              export type TheSchemaClone = Components.Schemas.TheSchema;
              export type TheSchema = NonNullable<string>;
          }
      }"
    `);
  });

  describe('with OpenAPI samples', () => {
    const fixturesDir = path.join(__dirname, '..', 'fixtures', 'openapi');

    readdirSync(fixturesDir).forEach((file) => {
      it(`should work with ${file}`, async () => {
        const schema = JSON.parse(
          readFileSync(path.join(fixturesDir, file)).toString(),
        ) as OpenAPIV3.Document;

        expect(toSource(await generateOpenAPITypes(schema))).toMatchSnapshot();
      });

      it(`should work with ${file} and filterStatuses 200/201/202/300`, async () => {
        const schema = JSON.parse(
          readFileSync(path.join(fixturesDir, file)).toString(),
        ) as OpenAPIV3.Document;

        expect(
          toSource(
            await generateOpenAPITypes(schema, {
              filterStatuses: [200, 201, 202, 300],
            }),
          ),
        ).toMatchSnapshot();
      });

      it(`should work with ${file} and generateUnusedSchemas option to true`, async () => {
        const schema = JSON.parse(
          readFileSync(path.join(fixturesDir, file)).toString(),
        ) as OpenAPIV3.Document;

        expect(
          toSource(
            await generateOpenAPITypes(schema, {
              baseName: 'AnotherAPI',
              generateUnusedSchemas: true,
            }),
          ),
        ).toMatchSnapshot();
      });
    });
  });
});

describe('generateJSONSchemaTypes()', () => {
  describe('with JSONSchema samples', () => {
    const fixturesDir = path.join(__dirname, '..', 'fixtures', 'jsonschema');

    readdirSync(fixturesDir).forEach((file) => {
      it(`should work with ${file}`, async () => {
        const schema = JSON.parse(
          readFileSync(path.join(fixturesDir, file)).toString(),
        ) as JSONSchema7;

        expect(
          toSource(await generateJSONSchemaTypes(schema)),
        ).toMatchSnapshot();
      });
    });
  });
});

describe('generateTypeDeclaration()', () => {
  const context = {
    nameResolver: jest.fn(),
    buildIdentifier,
  };

  beforeEach(() => {
    context.nameResolver.mockReset();
  });

  describe('for JSONSchema v7', () => {
    test('should work with simple literal type schema', async () => {
      const schema: JSONSchema7 = {
        type: 'number',
      };

      expect(
        toSource(
          await generateTypeDeclaration(
            {
              ...context,
              root: true,
            },
            schema,
            'Limit',
          ),
        ),
      ).toMatchInlineSnapshot(`"declare type Limit = NonNullable<number>;"`);
    });

    test('should work with several literal type schema', async () => {
      const schema: JSONSchema7 = {
        title: 'Limit',
        type: ['number', 'string', 'boolean'],
      };

      expect(
        toSource(await generateTypeDeclaration(context, schema)),
      ).toMatchInlineSnapshot(
        `"export type Limit = NonNullable<number> | NonNullable<string> | NonNullable<boolean>;"`,
      );
    });

    test('should work with a literal nullable type schema', async () => {
      const schema: JSONSchema7 = {
        title: 'Limit',
        type: ['number', 'null'],
      };

      expect(
        toSource(await generateTypeDeclaration(context, schema)),
      ).toMatchInlineSnapshot(`"export type Limit = number;"`);
    });

    test('should work with several literal nullable type schema', async () => {
      const schema: JSONSchema7 = {
        title: 'Limit',
        type: ['number', 'string', 'null'],
      };

      expect(
        toSource(await generateTypeDeclaration(context, schema)),
      ).toMatchInlineSnapshot(`"export type Limit = number | string;"`);
    });

    test('should work with literal enums', async () => {
      const schema: JSONSchema7 = {
        title: 'Limit',
        type: ['number', 'string', 'null'],
        enum: [1, 2, 'hop', 'lol', null],
      };

      expect(
        toSource(await generateTypeDeclaration(context, schema)),
      ).toMatchInlineSnapshot(
        `"export type Limit = 1 | 2 | \\"hop\\" | \\"lol\\" | null;"`,
      );
    });

    test('should work with object schema', async () => {
      const schema: JSONSchema7 = {
        title: 'Limit',
        type: 'object',
        required: ['min', 'max'],
        properties: {
          min: { type: 'integer' },
          max: { type: 'integer' },
          minIncluded: { type: 'boolean' },
          maxIncluded: { type: 'boolean' },
          pace: { type: 'number' },
        },
      };

      expect(toSource(await generateTypeDeclaration(context, schema)))
        .toMatchInlineSnapshot(`
        "export type Limit = NonNullable<{
            min: NonNullable<number>;
            max: NonNullable<number>;
            minIncluded?: NonNullable<boolean>;
            maxIncluded?: NonNullable<boolean>;
            pace?: NonNullable<number>;
        }>;"
      `);
    });

    test('should work with nullable object schema', async () => {
      const schema: JSONSchema7 = {
        title: 'Limit',
        type: ['object', 'null'],
        required: [],
        properties: {
          min: { type: 'integer' },
          max: { type: 'integer' },
          minIncluded: { type: 'boolean' },
          maxIncluded: { type: 'boolean' },
          pace: { type: 'number' },
          nothing: false,
          anything: true,
          aConst: { const: 'test' },
        },
        patternProperties: {
          '[a-z]{2}\\-[A-Z]{2,3}': { type: 'string' },
        },
        additionalProperties: true,
      };

      expect(toSource(await generateTypeDeclaration(context, schema)))
        .toMatchInlineSnapshot(`
        "export type Limit = {
            min?: NonNullable<number>;
            max?: NonNullable<number>;
            minIncluded?: NonNullable<boolean>;
            maxIncluded?: NonNullable<boolean>;
            pace?: NonNullable<number>;
            nothing?: never;
            anything?: unknown;
            aConst?: \\"test\\";
            [pattern: string]: NonNullable<string> | unknown;
        };"
      `);
    });

    test('should work with nested schemas', async () => {
      const schema: JSONSchema7 = {
        title: 'Limit',
        type: ['object', 'null', 'number', 'array'],
        properties: {
          min: { type: 'integer' },
          max: { type: 'integer' },
          minIncluded: { type: 'boolean' },
          maxIncluded: { type: 'boolean' },
          pace: { type: 'number', readOnly: true },
        },
        items: [{ type: 'number' }, { type: 'string' }],
      };

      expect(toSource(await generateTypeDeclaration(context, schema)))
        .toMatchInlineSnapshot(`
        "export type Limit = {
            min?: NonNullable<number>;
            max?: NonNullable<number>;
            minIncluded?: NonNullable<boolean>;
            maxIncluded?: NonNullable<boolean>;
            readonly pace?: NonNullable<number>;
        } | number | (NonNullable<number> | NonNullable<string>)[];"
      `);
    });

    test('should work with anyOf schemas', async () => {
      const schema: JSONSchema7 = {
        title: 'Limit',
        anyOf: [
          {
            type: ['null', 'number'],
          },
          {
            type: 'object',
            properties: {
              min: { type: 'integer' },
              max: { type: 'integer' },
              minIncluded: { type: 'boolean' },
              maxIncluded: { type: 'boolean' },
              pace: { type: 'number', readOnly: true },
            },
          },
          {
            type: 'array',
            items: [{ type: 'number' }, { type: 'string' }],
          },
        ],
      };

      expect(toSource(await generateTypeDeclaration(context, schema)))
        .toMatchInlineSnapshot(`
        "export type Limit = number | NonNullable<{
            min?: NonNullable<number>;
            max?: NonNullable<number>;
            minIncluded?: NonNullable<boolean>;
            maxIncluded?: NonNullable<boolean>;
            readonly pace?: NonNullable<number>;
        }> | NonNullable<(NonNullable<number> | NonNullable<string>)[]>;"
      `);
    });

    test('should work with oneOf schemas', async () => {
      const schema: JSONSchema7 = {
        title: 'Limit',
        oneOf: [
          {
            type: ['null', 'number'],
          },
          {
            type: 'object',
            properties: {
              min: { type: 'integer' },
              max: { type: 'integer' },
              minIncluded: { type: 'boolean' },
              maxIncluded: { type: 'boolean' },
              pace: { type: 'number', readOnly: true },
            },
          },
          {
            type: 'array',
            items: [{ type: 'number' }, { type: 'string' }],
          },
        ],
      };

      expect(toSource(await generateTypeDeclaration(context, schema)))
        .toMatchInlineSnapshot(`
        "export type Limit = number | NonNullable<{
            min?: NonNullable<number>;
            max?: NonNullable<number>;
            minIncluded?: NonNullable<boolean>;
            maxIncluded?: NonNullable<boolean>;
            readonly pace?: NonNullable<number>;
        }> | NonNullable<(NonNullable<number> | NonNullable<string>)[]>;"
      `);
    });

    test('should work with allOf schemas', async () => {
      const schema: JSONSchema7 = {
        title: 'Limit',
        allOf: [
          {
            type: ['null', 'number'],
          },
          {
            type: 'object',
            properties: {
              min: { type: 'integer' },
              max: { type: 'integer' },
              minIncluded: { type: 'boolean' },
              maxIncluded: { type: 'boolean' },
              pace: { type: 'number', readOnly: true },
            },
          },
          {
            type: 'array',
            items: [{ type: 'number' }, { type: 'string' }],
          },
        ],
      };

      expect(toSource(await generateTypeDeclaration(context, schema)))
        .toMatchInlineSnapshot(`
        "export type Limit = number & NonNullable<{
            min?: NonNullable<number>;
            max?: NonNullable<number>;
            minIncluded?: NonNullable<boolean>;
            maxIncluded?: NonNullable<boolean>;
            readonly pace?: NonNullable<number>;
        }> & NonNullable<(NonNullable<number> | NonNullable<string>)[]>;"
      `);
    });

    test('should work with allOf schemas and required properties added', async () => {
      const schema: JSONSchema7 = {
        title: 'Limit',
        allOf: [
          {
            type: 'object',
            properties: {
              min: { type: 'integer' },
              max: { type: 'integer' },
              minIncluded: { type: 'boolean' },
              maxIncluded: { type: 'boolean' },
              pace: { type: 'number', readOnly: true },
            },
          },
          {
            type: 'object',
            required: ['min', 'max'],
          },
        ],
      };

      expect(toSource(await generateTypeDeclaration(context, schema)))
        .toMatchInlineSnapshot(`
        "export type Limit = NonNullable<{
            min?: NonNullable<number>;
            max?: NonNullable<number>;
            minIncluded?: NonNullable<boolean>;
            maxIncluded?: NonNullable<boolean>;
            readonly pace?: NonNullable<number>;
        }> & NonNullable<{
            min: unknown;
            max: unknown;
        }>;"
      `);
    });

    test('should work with simple literal type schema', async () => {
      const schema: JSONSchema7 = {
        title: 'Limit',
        $ref: '#/components/schemas/User',
      };

      context.nameResolver.mockResolvedValueOnce([
        'Components',
        'Schemas',
        'User',
      ]);

      expect(
        toSource(await generateTypeDeclaration(context, schema)),
      ).toMatchInlineSnapshot(`"export type Limit = Components.Schemas.User;"`);
    });

    test('should work with belgian example 2', async () => {
      const schema: JSONSchema7 = {
        title: 'User',
        allOf: [
          {
            type: 'object',
            properties: {
              name: {
                type: 'string',
              },
            },
          },
          {
            oneOf: [
              {
                type: 'object',
                required: ['email'],
                properties: {
                  email: {
                    type: 'string',
                  },
                },
              },
              {
                type: 'object',
                required: ['cellphone'],
                properties: {
                  cellphone: {
                    type: 'string',
                  },
                },
              },
            ],
          },
        ],
      };

      expect(toSource(await generateTypeDeclaration(context, schema)))
        .toMatchInlineSnapshot(`
        "export type User = NonNullable<{
            name?: NonNullable<string>;
        }> & (NonNullable<{
            email: NonNullable<string>;
        }> | NonNullable<{
            cellphone: NonNullable<string>;
        }>);"
      `);
    });

    test('should work with a belgian schema', async () => {
      const schema: JSONSchema7 = {
        allOf: [
          {
            type: 'object',
            required: ['name'],
            properties: {
              name: {
                type: 'string',
              },
            },
          },
          {
            oneOf: [
              {
                type: 'object',
                required: ['email'],
                properties: {
                  email: {
                    type: 'string',
                  },
                },
              },
              {
                type: 'object',
                required: ['phone'],
                properties: {
                  phone: {
                    type: 'string',
                  },
                },
              },
            ],
          },
        ],
      };

      expect(toSource(await generateTypeDeclaration(context, schema)))
        .toMatchInlineSnapshot(`
        "export type Unknown = NonNullable<{
            name: NonNullable<string>;
        }> & (NonNullable<{
            email: NonNullable<string>;
        }> | NonNullable<{
            phone: NonNullable<string>;
        }>);"
      `);
    });

    test('should work with anyOf/array special test case schemas', async () => {
      const schema: JSONSchema7 = {
        title: 'TrickyThing',
        type: 'object',
        additionalProperties: true,
        required: [
          'name',
          'labels',
          'timestamp',
          'data',
          'start',
          'end',
          'duration',
          'context',
        ],
        properties: {
          name: { type: 'string' },
          duration: { type: 'number' },
          start: {
            $ref: '#/components/schemas/Date',
          },
          end: {
            $ref: '#/components/schemas/Date',
          },
          labels: {
            type: 'array',
            items: {
              type: 'string',
              enum: ['value', 'peaks', 'startTime', 'endTime', 'peakTime'],
            },
          },
          timestamp: {
            type: 'array',
            items: {
              type: 'string',
              enum: ['startTime', 'endTime', 'peakTime'],
            },
          },
          data: {
            type: 'array',
            items: {
              type: 'array',
              maxItems: 5,
              minItems: 5,
              items: {
                anyOf: [
                  {
                    $ref: '#/components/schemas/Date',
                  },
                  { type: 'number' },
                  { type: 'string', enum: ['first', 'bosse', 'last'] },
                  { type: 'string', pattern: '[0-9]+' },
                ],
              },
            },
          },
          context: {
            $ref: '#/components/schemas/Data',
          },
        },
      };

      context.nameResolver.mockResolvedValueOnce([
        'Components',
        'Schemas',
        'Date',
      ]);
      context.nameResolver.mockResolvedValueOnce([
        'Components',
        'Schemas',
        'Date',
      ]);
      context.nameResolver.mockResolvedValueOnce([
        'Components',
        'Schemas',
        'Date',
      ]);
      context.nameResolver.mockResolvedValueOnce([
        'Components',
        'Schemas',
        'Data',
      ]);

      expect(toSource(await generateTypeDeclaration(context, schema)))
        .toMatchInlineSnapshot(`
        "export type TrickyThing = NonNullable<{
            name: NonNullable<string>;
            duration: NonNullable<number>;
            start: Components.Schemas.Date;
            end: Components.Schemas.Date;
            labels: NonNullable<(\\"value\\" | \\"peaks\\" | \\"startTime\\" | \\"endTime\\" | \\"peakTime\\")[]>;
            timestamp: NonNullable<(\\"startTime\\" | \\"endTime\\" | \\"peakTime\\")[]>;
            data: NonNullable<NonNullable<(Components.Schemas.Date | NonNullable<number> | (\\"first\\" | \\"bosse\\" | \\"last\\") | NonNullable<string>)[]>[]>;
            context: Components.Schemas.Data;
            [pattern: string]: unknown;
        }>;"
      `);
    });
  });
});
