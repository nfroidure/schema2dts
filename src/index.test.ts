import { describe, test, expect } from '@jest/globals';
import {
  generateJSONSchemaTypes,
  generateOpenAPITypes,
  toSource,
} from './index.js';
import { readFileSync, readdirSync } from 'fs';
import path from 'path';
import { OpenAPIV3_1 } from 'openapi-types';
import type { JSONSchema7 } from 'json-schema';

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
                required: true,
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
              required: true,
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
    } as OpenAPIV3_1.Document;

    expect(
      toSource(
        await generateOpenAPITypes(schema, {
          generateRealEnums: true,
          exportNamespaces: true,
          tuplesFromFixedArraysLengthLimit: 5,
        }),
      ),
    ).toMatchInlineSnapshot(`
"export interface paths {
    "/test": {
        get: operations["GetPing"];
    };
}
export interface operations {
    GetPing: {
        requestBody: string;
        responses: {
            200: {
                body: string;
                headers: {
                    "X-A-Header": number;
                    "X-SDK-Version"?: string;
                };
            };
        };
        parameters: {
            header: {
                "X-A-Header": number;
                "X-API-Version"?: string;
            };
        };
    };
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
          TheXAHeaderClone: {
            $ref: '#/components/headers/TheXAHeader',
          },
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
                $ref: '#/components/headers/TheXAHeaderClone',
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
    } as OpenAPIV3_1.Document;

    expect(
      toSource(
        await generateOpenAPITypes(schema, {
          brandedTypes: ['TheSchema', 'TheSchemaClone'],
          generateRealEnums: true,
          tuplesFromFixedArraysLengthLimit: 5,
          exportNamespaces: false,
        }),
      ),
    ).toMatchInlineSnapshot(`
"declare interface paths {
    "/test": {
        get: operations["GetTest"];
    };
}
declare interface operations {
    GetTest: {
        requestBody?: components["requestBodies"]["TheBody"];
        responses: {
            200: components["responses"]["TheResponse"];
        };
        parameters: {
            query: {
                TestParam?: components["parameters"]["TheTestParam"];
            };
        };
    };
}
declare interface components {
    requestBodies: {
        TheBody: components["schemas"]["TheSchemaClone"];
    };
    responses: {
        TheResponse: {
            body: components["schemas"]["TheSchema"];
            headers: {
                "X-A-Header"?: components["headers"]["TheXAHeaderClone"];
            };
        };
    };
    headers: {
        TheXAHeader: number;
        TheXAHeaderClone: components["headers"]["TheXAHeader"];
    };
    parameters: {
        TheTestParam: components["schemas"]["TheSchema"];
    };
    schemas: {
        TheSchemaClone: components["schemas"]["TheSchema"];
        TheSchema: string & {
            _type?: "TheSchema";
        };
    };
}"
`);
  });

  describe('with OpenAPI samples', () => {
    const fixturesDir = path.join('fixtures', 'openapi');

    readdirSync(fixturesDir).forEach((file) => {
      test(`should work with ${file}`, async () => {
        const schema = JSON.parse(
          readFileSync(path.join(fixturesDir, file)).toString(),
        ) as OpenAPIV3_1.Document;

        expect(
          toSource(
            await generateOpenAPITypes(schema, {
              generateRealEnums: true,
              tuplesFromFixedArraysLengthLimit: 5,
              exportNamespaces: false,
            }),
          ),
        ).toMatchSnapshot();
      });

      test(`should work with ${file} and filterStatuses 200/201/202/300 and brandedTypes`, async () => {
        const schema = JSON.parse(
          readFileSync(path.join(fixturesDir, file)).toString(),
        ) as OpenAPIV3_1.Document;

        expect(
          toSource(
            await generateOpenAPITypes(schema, {
              filterStatuses: [200, 201, 202, 300],
              brandedTypes: 'schemas',
              generateRealEnums: false,
              tuplesFromFixedArraysLengthLimit: 5,
              exportNamespaces: false,
            }),
          ),
        ).toMatchSnapshot();
      });

      test(`should work with ${file} and generateUnusedSchemas option to true`, async () => {
        const schema = JSON.parse(
          readFileSync(path.join(fixturesDir, file)).toString(),
        ) as OpenAPIV3_1.Document;

        expect(
          toSource(
            await generateOpenAPITypes(schema, {
              baseName: 'AnotherAPI',
              generateUnusedSchemas: true,
              generateRealEnums: true,
              tuplesFromFixedArraysLengthLimit: 5,
              exportNamespaces: true,
            }),
          ),
        ).toMatchSnapshot();
      });
    });
  });

  test('should work without operation id per default', async () => {
    const schema = {
      openapi: '3.0.2',
      info: {
        version: '0.0.0',
        title: 'foobar-api',
        description: 'The FooBar API',
      },
      servers: [
        {
          url: 'http://localhost:8000/v0',
        },
      ],
      paths: {
        '/test': {
          get: {
            parameters: [
              {
                name: 'foo_bar',
                in: 'query',
                schema: {
                  type: 'string',
                },
              },
            ],
            responses: {},
          },
        },
      },
    } as OpenAPIV3_1.Document;

    expect(
      toSource(
        await generateOpenAPITypes(schema, {
          camelizeInputs: false,
          generateRealEnums: false,
          tuplesFromFixedArraysLengthLimit: 5,
          exportNamespaces: false,
        }),
      ),
    ).toMatchInlineSnapshot(`
"declare interface paths {
    "/test": {
        get: operations["PathsTest"];
    };
}
declare interface operations {
    PathsTest: {
        parameters: {
            query: {
                foo_bar?: string;
            };
        };
    };
}"
`);
  });

  test('should work with snake case parameter in query', async () => {
    const schema = {
      openapi: '3.0.2',
      info: {
        version: '0.0.0',
        title: 'foobar-api',
        description: 'The FooBar API',
      },
      servers: [
        {
          url: 'http://localhost:8000/v0',
        },
      ],
      paths: {
        '/test': {
          get: {
            operationId: 'Test',
            parameters: [
              {
                name: 'foo_bar',
                in: 'query',
                schema: {
                  type: 'string',
                },
              },
            ],
            responses: {},
          },
        },
      },
    } as OpenAPIV3_1.Document;

    expect(
      toSource(
        await generateOpenAPITypes(schema, {
          camelizeInputs: false,
          generateRealEnums: false,
          tuplesFromFixedArraysLengthLimit: 5,
          exportNamespaces: false,
        }),
      ),
    ).toMatchInlineSnapshot(`
"declare interface paths {
    "/test": {
        get: operations["Test"];
    };
}
declare interface operations {
    Test: {
        parameters: {
            query: {
                foo_bar?: string;
            };
        };
    };
}"
`);
  });
});

describe('generateJSONSchemaTypes()', () => {
  describe('with JSONSchema samples', () => {
    const fixturesDir = path.join('fixtures', 'jsonschema');

    readdirSync(fixturesDir).forEach((file) => {
      test(`should work with ${file}`, async () => {
        const schema = JSON.parse(
          readFileSync(path.join(fixturesDir, file)).toString(),
        ) as JSONSchema7;

        expect(
          toSource(await generateJSONSchemaTypes(schema)),
        ).toMatchSnapshot();
      });
    });
  });

  test('should work with enums having values starting with a number', async () => {
    const schema: JSONSchema7 = {
      title: 'Limit',
      type: 'string',
      enum: ['1m', '1d', '1w'],
    };

    expect(
      toSource(
        await generateJSONSchemaTypes(schema, {
          brandedTypes: [],
          generateRealEnums: true,
          tuplesFromFixedArraysLengthLimit: 5,
          exportNamespaces: true,
        }),
      ),
    ).toMatchInlineSnapshot(`
"export type Main = Enums.Limit;
export namespace Enums {
    export enum Limit {
        _1M = "1m",
        _1D = "1d",
        _1W = "1w"
    }
}"
`);
  });

  test('should camelize number separated identifiers', async () => {
    const schema: JSONSchema7 = {
      title: 'Limit',
      type: 'string',
      enum: ['user1name', 'user_2_name', 'user3_name'],
    };

    expect(
      toSource(
        await generateJSONSchemaTypes(schema, {
          brandedTypes: [],
          generateRealEnums: true,
          tuplesFromFixedArraysLengthLimit: 5,
          exportNamespaces: true,
        }),
      ),
    ).toMatchInlineSnapshot(`
"export type Main = Enums.Limit;
export namespace Enums {
    export enum Limit {
        User1Name = "user1name",
        User2Name = "user_2_name",
        User3Name = "user3_name"
    }
}"
`);
  });

  test('should work with string literal enums', async () => {
    const schema: JSONSchema7 = {
      title: 'Limit',
      type: ['string'],
      enum: ['str1', 'str2'],
    };

    expect(
      toSource(
        await generateJSONSchemaTypes(schema, {
          brandedTypes: [],
          exportNamespaces: false,
          generateRealEnums: true,
          tuplesFromFixedArraysLengthLimit: 5,
        }),
      ),
    ).toMatchInlineSnapshot(`
"declare type Main = Enums.Limit;
declare namespace Enums {
    export enum Limit {
        Str1 = "str1",
        Str2 = "str2"
    }
}"
`);
  });

  describe('for JSONSchema v7', () => {
    test('should work with simple literal type schema', async () => {
      const schema: JSONSchema7 = {
        type: 'number',
      };

      expect(
        toSource(
          await generateJSONSchemaTypes(schema, {
            brandedTypes: [],
            generateRealEnums: true,
            tuplesFromFixedArraysLengthLimit: 5,
            exportNamespaces: true,
            baseName: 'Limit',
          }),
        ),
      ).toMatchInlineSnapshot(`"export type Limit = number;"`);
    });

    test('should work with several literal type schema', async () => {
      const schema: JSONSchema7 = {
        title: 'Limit',
        type: ['number', 'string', 'boolean'],
      };

      expect(
        toSource(
          await generateJSONSchemaTypes(schema, {
            brandedTypes: [],
            generateRealEnums: true,
            tuplesFromFixedArraysLengthLimit: 5,
            exportNamespaces: true,
          }),
        ),
      ).toMatchInlineSnapshot(
        `"export type Main = number | string | boolean;"`,
      );
    });

    test('should work with a literal nullable type schema', async () => {
      const schema: JSONSchema7 = {
        title: 'Limit',
        type: ['number', 'null'],
      };

      expect(
        toSource(
          await generateJSONSchemaTypes(schema, {
            brandedTypes: [],
            generateRealEnums: true,
            tuplesFromFixedArraysLengthLimit: 5,
            exportNamespaces: true,
            baseName: 'Limit',
          }),
        ),
      ).toMatchInlineSnapshot(`"export type Limit = number | null;"`);
    });

    test('should work with several literal nullable type schema', async () => {
      const schema: JSONSchema7 = {
        title: 'Limit',
        type: ['number', 'string', 'null'],
      };

      expect(
        toSource(
          await generateJSONSchemaTypes(schema, {
            brandedTypes: [],
            generateRealEnums: true,
            tuplesFromFixedArraysLengthLimit: 5,
            exportNamespaces: true,
            baseName: 'Limit',
          }),
        ),
      ).toMatchInlineSnapshot(`"export type Limit = number | string | null;"`);
    });

    test('should work with literal enums', async () => {
      const schema: JSONSchema7 = {
        title: 'Limit',
        type: ['number', 'string', 'null'],
        enum: [1, 2, 'hop', 'lol', null],
      };

      expect(
        toSource(
          await generateJSONSchemaTypes(schema, {
            brandedTypes: [],
            generateRealEnums: true,
            tuplesFromFixedArraysLengthLimit: 5,
            exportNamespaces: true,
            baseName: 'Limit',
          }),
        ),
      ).toMatchInlineSnapshot(
        `"export type Limit = 1 | 2 | "hop" | "lol" | null;"`,
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

      expect(
        toSource(
          await generateJSONSchemaTypes(schema, {
            brandedTypes: [],
            generateRealEnums: true,
            tuplesFromFixedArraysLengthLimit: 5,
            exportNamespaces: true,
            baseName: 'Limit',
          }),
        ),
      ).toMatchInlineSnapshot(`
"export type Limit = {
    min: number;
    max: number;
    minIncluded?: boolean;
    maxIncluded?: boolean;
    pace?: number;
};"
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

      expect(
        toSource(
          await generateJSONSchemaTypes(schema, {
            brandedTypes: [],
            generateRealEnums: true,
            tuplesFromFixedArraysLengthLimit: 5,
            exportNamespaces: true,
            baseName: 'Limit',
          }),
        ),
      ).toMatchInlineSnapshot(`
"export type Limit = {
    min?: number;
    max?: number;
    minIncluded?: boolean;
    maxIncluded?: boolean;
    pace?: number;
    nothing?: never;
    anything?: unknown;
    aConst?: "test";
    [pattern: string]: string | unknown;
} | null;"
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

      expect(
        toSource(
          await generateJSONSchemaTypes(schema, {
            brandedTypes: [],
            generateRealEnums: true,
            tuplesFromFixedArraysLengthLimit: 5,
            exportNamespaces: true,
            baseName: 'Limit',
          }),
        ),
      ).toMatchInlineSnapshot(`
"export type Limit = {
    min?: number;
    max?: number;
    minIncluded?: boolean;
    maxIncluded?: boolean;
    readonly pace?: number;
} | null | number | [
    number,
    string
];"
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

      expect(
        toSource(
          await generateJSONSchemaTypes(schema, {
            brandedTypes: [],
            generateRealEnums: true,
            tuplesFromFixedArraysLengthLimit: 5,
            exportNamespaces: true,
            baseName: 'Limit',
          }),
        ),
      ).toMatchInlineSnapshot(`
"export type Limit = (null | number) | {
    min?: number;
    max?: number;
    minIncluded?: boolean;
    maxIncluded?: boolean;
    readonly pace?: number;
} | [
    number,
    string
];"
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

      expect(
        toSource(
          await generateJSONSchemaTypes(schema, {
            brandedTypes: [],
            generateRealEnums: true,
            tuplesFromFixedArraysLengthLimit: 5,
            exportNamespaces: true,
            baseName: 'Limit',
          }),
        ),
      ).toMatchInlineSnapshot(`
"export type Limit = (null | number) | {
    min?: number;
    max?: number;
    minIncluded?: boolean;
    maxIncluded?: boolean;
    readonly pace?: number;
} | [
    number,
    string
];"
`);
    });

    test('should work with base schema and nested oneof schemas', async () => {
      const schema: JSONSchema7 = {
        title: 'User',
        type: 'object',
        properties: {
          name: {
            type: 'string',
          },
        },
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
      };

      expect(
        toSource(
          await generateJSONSchemaTypes(schema, {
            brandedTypes: [],
            generateRealEnums: true,
            tuplesFromFixedArraysLengthLimit: 5,
            exportNamespaces: true,
          }),
        ),
      ).toMatchInlineSnapshot(`
"export type Main = {
    name?: string;
} & ({
    email: string;
} | {
    cellphone: string;
});"
`);
    });

    test('should work with base schema and nested oneof schemas and inherited types', async () => {
      const schema: JSONSchema7 = {
        title: 'User',
        type: 'object',
        properties: {
          name: {
            type: 'string',
          },
        },
        oneOf: [
          {
            required: ['email'],
            properties: {
              email: {
                type: 'string',
              },
            },
          },
          {
            required: ['cellphone'],
            properties: {
              cellphone: {
                type: 'string',
              },
            },
          },
        ],
      };

      expect(
        toSource(
          await generateJSONSchemaTypes(schema, {
            brandedTypes: [],
            generateRealEnums: true,
            tuplesFromFixedArraysLengthLimit: 5,
            exportNamespaces: true,
          }),
        ),
      ).toMatchInlineSnapshot(`
"export type Main = {
    name?: string;
} & ({
    email: string;
} | {
    cellphone: string;
});"
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

      expect(
        toSource(
          await generateJSONSchemaTypes(schema, {
            brandedTypes: [],
            generateRealEnums: true,
            tuplesFromFixedArraysLengthLimit: 5,
            exportNamespaces: true,
            baseName: 'Limit',
          }),
        ),
      ).toMatchInlineSnapshot(`
"export type Limit = (null | number) & {
    min?: number;
    max?: number;
    minIncluded?: boolean;
    maxIncluded?: boolean;
    readonly pace?: number;
} & [
    number,
    string
];"
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

      expect(
        toSource(
          await generateJSONSchemaTypes(schema, {
            brandedTypes: [],
            generateRealEnums: true,
            tuplesFromFixedArraysLengthLimit: 5,
            exportNamespaces: true,
            baseName: 'Limit',
          }),
        ),
      ).toMatchInlineSnapshot(`
"export type Limit = {
    min?: number;
    max?: number;
    minIncluded?: boolean;
    maxIncluded?: boolean;
    readonly pace?: number;
} & {
    min: unknown;
    max: unknown;
};"
`);
    });

    test('should work with simple literal type schema', async () => {
      const schema: JSONSchema7 = {
        title: 'Limit',
        $ref: '#/definitions/User',
        definitions: {
          User: { type: 'string' },
        },
      };

      expect(
        toSource(
          await generateJSONSchemaTypes(schema, {
            brandedTypes: [],
            generateRealEnums: true,
            tuplesFromFixedArraysLengthLimit: 5,
            exportNamespaces: true,
            baseName: 'Limit',
          }),
        ),
      ).toMatchInlineSnapshot(`
"export type Limit = definitions["User"];
export interface definitions {
    User: string;
}"
`);
    });

    test('should work with empty objects schemas', async () => {
      const schema: JSONSchema7 = {
        title: 'Limit',
        type: 'object',
      };

      expect(
  toSource(
    await generateJSONSchemaTypes(schema, {
      brandedTypes: [],
      generateRealEnums: true,
      tuplesFromFixedArraysLengthLimit: 5,
      exportNamespaces: true,
      baseName: 'Limit'
    })
  )
).toMatchInlineSnapshot(`"export type Limit = object;"`);
    });

    test('should work with a nested oneOf in allOf schemas', async () => {
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

      expect(
        toSource(
          await generateJSONSchemaTypes(schema, {
            brandedTypes: [],
            generateRealEnums: true,
            tuplesFromFixedArraysLengthLimit: 5,
            exportNamespaces: true,
          }),
        ),
      ).toMatchInlineSnapshot(`
"export type Main = {
    name: string;
} & ({
    email: string;
} | {
    phone: string;
});"
`);
    });

    test('should work with not defined items array schemas', async () => {
      const schema: JSONSchema7 = {
        type: 'array',
      };

      expect(
        toSource(
          await generateJSONSchemaTypes(schema, {
            brandedTypes: [],
            generateRealEnums: true,
            tuplesFromFixedArraysLengthLimit: 5,
            exportNamespaces: true,
          }),
        ),
      ).toMatchInlineSnapshot(`"export type Main = unknown[];"`);
    });

    test('should work with no items array schemas', async () => {
      const schema: JSONSchema7 = {
        type: 'array',
        maxItems: 0,
      };

      expect(
        toSource(
          await generateJSONSchemaTypes(schema, {
            brandedTypes: [],
            generateRealEnums: true,
            tuplesFromFixedArraysLengthLimit: 5,
            exportNamespaces: true,
          }),
        ),
      ).toMatchInlineSnapshot(`"export type Main = never[];"`);
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
            $ref: '#/definitions/Date',
          },
          end: {
            $ref: '#/definitions/Date',
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
                    $ref: '#/definitions/Date',
                  },
                  { type: 'number' },
                  { type: 'string', enum: ['first', 'bosse', 'last'] },
                  { type: 'string', pattern: '[0-9]+' },
                ],
              },
            },
          },
          context: {
            $ref: '#/definitions/Data',
          },
        },
        definitions: {
          Date: { type: 'string' },
          Data: { type: 'string' },
        },
      };

      expect(
        toSource(
          await generateJSONSchemaTypes(schema, {
            brandedTypes: [],
            generateRealEnums: true,
            tuplesFromFixedArraysLengthLimit: 5,
            exportNamespaces: true,
          }),
        ),
      ).toMatchInlineSnapshot(`
"export type Main = {
    name: string;
    duration: number;
    start: definitions["Date"];
    end: definitions["Date"];
    labels: ("value" | "peaks" | "startTime" | "endTime" | "peakTime")[];
    timestamp: ("startTime" | "endTime" | "peakTime")[];
    data: (definitions["Date"] | number | ("first" | "bosse" | "last") | string)[][];
    context: definitions["Data"];
    [pattern: string]: unknown;
};
export interface definitions {
    Date: string;
    Data: string;
}"
`);
    });
  });

  test('should work with tuple test case schemas', async () => {
    const schema: JSONSchema7 = {
      title: 'TupleTest',
      type: 'object',
      additionalProperties: false,
      required: ['data'],
      properties: {
        data: {
          type: 'array',
          items: {
            type: 'array',
            items: [
              { type: 'string' },
              { type: 'number' },
              { type: 'number' },
              {
                type: 'array',
                items: { type: 'string' },
              },
            ],
          },
        },
      },
    };

    expect(
      toSource(
        await generateJSONSchemaTypes(schema, {
          brandedTypes: [],
          generateRealEnums: true,
          tuplesFromFixedArraysLengthLimit: 5,
          exportNamespaces: true,
        }),
      ),
    ).toMatchInlineSnapshot(`
"export type Main = {
    data: [
        string,
        number,
        number,
        string[]
    ][];
};"
`);
  });

  test('should create tuples from fixed length arrays', async () => {
    const schema: JSONSchema7 = {
      title: 'FixedArrayToTupleTest',
      type: 'object',
      additionalProperties: false,
      required: ['data'],
      properties: {
        data: {
          type: 'array',
          items: { type: 'string' },
          minItems: 4,
          maxItems: 4,
        },
      },
    };

    expect(
      toSource(
        await generateJSONSchemaTypes(schema, {
          brandedTypes: [],
          generateRealEnums: true,
          tuplesFromFixedArraysLengthLimit: 5,
          exportNamespaces: true,
        }),
      ),
    ).toMatchInlineSnapshot(`
"export type Main = {
    data: [
        string,
        string,
        string,
        string
    ];
};"
`);
  });

  test('should create tuples from min length arrays', async () => {
    const schema: JSONSchema7 = {
      title: 'FixedArrayToTupleTest',
      type: 'object',
      additionalProperties: false,
      required: ['data'],
      properties: {
        data: {
          type: 'array',
          items: { type: 'string' },
          minItems: 2,
        },
      },
    };

    expect(
      toSource(
        await generateJSONSchemaTypes(schema, {
          brandedTypes: [],
          generateRealEnums: true,
          tuplesFromFixedArraysLengthLimit: 5,
          exportNamespaces: true,
        }),
      ),
    ).toMatchInlineSnapshot(`
"export type Main = {
    data: [
        string,
        string,
        ...string[]
    ];
};"
`);
  });

  test('should work with tuples and rest test case schemas', async () => {
    const schema: JSONSchema7 = {
      title: 'TupleTest',
      type: 'object',
      additionalProperties: false,
      required: ['data'],
      properties: {
        data: {
          type: 'array',
          items: {
            type: 'array',
            items: [
              { type: 'string' },
              { type: 'number' },
              { type: 'number' },
              {
                type: 'array',
                items: { type: 'string' },
              },
            ],
            additionalItems: { type: 'boolean' },
          },
        },
      },
    };

    expect(
      toSource(
        await generateJSONSchemaTypes(schema, {
          brandedTypes: [],
          generateRealEnums: true,
          tuplesFromFixedArraysLengthLimit: 5,
          exportNamespaces: true,
        }),
      ),
    ).toMatchInlineSnapshot(`
"export type Main = {
    data: [
        string,
        number,
        number,
        string[],
        ...boolean[]
    ][];
};"
`);
  });

  test('should work with tuples and rest test case schemas', async () => {
    const schema: JSONSchema7 = {
      type: 'array',
      items: {
        minItems: 1,
        oneOf: [{ type: 'boolean' }, { type: 'string' }],
      },
    };

    expect(
      toSource(
        await generateJSONSchemaTypes(schema, {
          brandedTypes: [],
          generateRealEnums: true,
          tuplesFromFixedArraysLengthLimit: 5,
          exportNamespaces: true,
        }),
      ),
    ).toMatchInlineSnapshot(`"export type Main = (boolean | string)[];"`);
  });

  test('should work with numbers as props schemas', async () => {
    const schema: JSONSchema7 = {
      type: 'object',
      properties: {
        '1.0': {
          description: '1th percentile for this sensor',
          type: 'number',
        },
        '5.0': {
          description: '5th percentile for this sensor',
          type: 'number',
        },
        '25.0': {
          description: '25th percentile for this sensor',
          type: 'number',
        },
        '50.0': {
          description: '50th percentile for this sensor',
          type: 'number',
        },
        '75.0': {
          description: '75th percentile for this sensor',
          type: 'number',
        },
        '95.0': {
          description: '95th percentile for this sensor',
          type: 'number',
        },
        '99.0': {
          description: '99th percentile for this sensor',
          type: 'number',
        },
      },
    };

    expect(
      toSource(
        await generateJSONSchemaTypes(schema, {
          brandedTypes: [],
          generateRealEnums: true,
          tuplesFromFixedArraysLengthLimit: 5,
          exportNamespaces: true,
        }),
      ),
    ).toMatchInlineSnapshot(`
"export type Main = {
    "1.0"?: number;
    "5.0"?: number;
    "25.0"?: number;
    "50.0"?: number;
    "75.0"?: number;
    "95.0"?: number;
    "99.0"?: number;
};"
`);
  });
});
