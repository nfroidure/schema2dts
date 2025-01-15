import { YError } from 'yerror';
import {
  type JSONSchema7TypeName,
  type JSONSchema7,
  type JSONSchema7Definition,
} from 'json-schema';
import {
  buildLiteralType,
  buildTypeReference,
  buildIdentifier,
} from './typeDefinitions.js';
import {
  factory,
  SyntaxKind,
  type TypeElement,
  type TypeNode,
} from 'typescript';
import { type IngestedDocument } from '../index.js';
import { type Fragment, type FragmentLocation } from './fragments.js';

export const ALL_TYPES = 'all' as const;
export const DEFAULT_JSON_SCHEMA_OPTIONS: Required<JSONSchemaOptions> = {
  baseName: 'Main',
  basePath: 'schema.d.ts',
  brandedTypes: [],
  generateRealEnums: false,
  tuplesFromFixedArraysLengthLimit: 5,
  exportNamespaces: false,
  strictMode: false,
};
export type JSONSchemaOptions = {
  baseName?: string;
  basePath?: string;
  brandedTypes: string[] | typeof ALL_TYPES;
  generateRealEnums: boolean;
  tuplesFromFixedArraysLengthLimit: number;
  exportNamespaces: boolean;
  strictMode?: boolean;
};
export type JSONSchemaContext = {
  baseLocation: Pick<FragmentLocation, 'path' | 'kind' | 'type'>;
  rootSchema?: IngestedDocument | JSONSchema;
  jsonSchemaOptions: JSONSchemaOptions;
};
export type JSONSchema = JSONSchema7;
export type JSONSchemaDefinition = JSONSchema7Definition;
export type Reference = { $ref: string };
export type BaseResult = {
  fragments?: Fragment[];
};
export type TypeNodeResult = { type: TypeNode } & BaseResult;
export type TypeNodesResult = { types: TypeNode[] } & BaseResult;

export async function jsonSchemaToFragments(
  context: JSONSchemaContext,
  schema: JSONSchema,
): Promise<Fragment[]> {
  const { type: typeNode, fragments } = await schemaToTypeNode(context, schema);
  const identifier = buildIdentifier(
    context.jsonSchemaOptions.baseName || schema?.title || 'Unknown',
  );
  const finalSchema = eventuallyIdentifySchema(schema, identifier);
  const finalType = await eventuallyBrandType(context, finalSchema, typeNode);

  return [
    ...(fragments || []),
    {
      ref: 'virtual://main',
      location: {
        ...context.baseLocation,
        kind: 'statement',
        namespace: [identifier],
      },
      type: 'statement',
      statement: factory.createTypeAliasDeclaration(
        [
          context.jsonSchemaOptions.exportNamespaces
            ? factory.createModifier(SyntaxKind.ExportKeyword)
            : factory.createModifier(SyntaxKind.DeclareKeyword),
        ],
        identifier,
        undefined,
        finalType,
      ),
    },
  ];
}

export async function schemaToTypeNode(
  context: JSONSchemaContext,
  schema: JSONSchemaDefinition,
): Promise<TypeNodeResult> {
  const { types, ...resultRest } = await schemaToTypes(context, schema);

  return {
    type: types.length > 1 ? factory.createUnionTypeNode(types) : types[0],
    ...resultRest,
  };
}

export async function schemaToTypes(
  context: JSONSchemaContext,
  schema: JSONSchemaDefinition,
  parentType?: JSONSchema7TypeName | JSONSchema7TypeName[],
): Promise<TypeNodesResult> {
  if (typeof schema === 'boolean') {
    if (schema) {
      return {
        types: [factory.createKeywordTypeNode(SyntaxKind.UnknownKeyword)],
      };
    } else {
      return {
        types: [factory.createKeywordTypeNode(SyntaxKind.NeverKeyword)],
      };
    }
  }
  if (schema.type === 'null') {
    return {
      types: [
        factory.createLiteralTypeNode(
          factory.createToken(SyntaxKind.NullKeyword),
        ),
      ],
    };
  }
  if (typeof schema.type === 'undefined') {
    if ('properties' in schema) {
      schema.type = 'object';
    }
  }

  if (schema.$ref) {
    const referenceParts = splitRef(schema.$ref);

    return {
      types: [buildTypeReference(referenceParts.map(buildIdentifier))],
      fragments: [{ type: 'assumed', ref: schema.$ref }],
    };
  } else if ('const' in schema && 'undefined' !== typeof schema.const) {
    return {
      types: [buildLiteralType(schema.const)],
    };
  } else if ('enum' in schema && 'undefined' !== typeof schema.enum) {
    const enumTypes = schema.enum.reduce<string[]>(
      (acc, value) =>
        acc.includes(typeof value) ? acc : [...acc, typeof value],
      [],
    );
    const enumValuesCanBeRealEnums =
      enumTypes.length === 1 &&
      schema.enum.length > 1 &&
      enumTypes[0] === 'string';
    const name = schema.title;

    if (
      enumValuesCanBeRealEnums &&
      name &&
      context.jsonSchemaOptions.generateRealEnums
    ) {
      const identifier = buildIdentifier(name);

      return {
        fragments: [
          {
            location: {
              ...context.baseLocation,
              namespace: ['Enums', identifier],
              kind: 'type',
            },
            type: 'typeDeclaration',
            typeNode: factory.createEnumDeclaration(
              [factory.createModifier(SyntaxKind.ExportKeyword)],
              identifier,
              schema.enum.map((value) =>
                factory.createEnumMember(
                  buildIdentifier(value as string),
                  factory.createStringLiteral(value as string),
                ),
              ),
            ),
            ref: `virtual://enums/${name}`,
          },
        ],
        types: [buildTypeReference(['Enums', identifier])],
      };
    }

    return {
      types: schema.enum.map(buildLiteralType),
    };
  } else if (schema.type) {
    return await handleTypedSchema(context, schema);
  } else if (schema.anyOf || schema.allOf || schema.oneOf) {
    return handleComposedSchemas(context, schema);
  } else if (parentType) {
    // Inject type from parent
    schema.type = parentType;
    return await handleTypedSchema(context, schema);
  } else if (!context.jsonSchemaOptions.strictMode) {
    return { types: [factory.createKeywordTypeNode(SyntaxKind.AnyKeyword)] };
  }

  throw new YError('E_UNSUPPORTED_SCHEMA', schema);
}

// Handle schema where type is defined
export async function handleTypedSchema(
  context: JSONSchemaContext,
  schema: JSONSchema,
): Promise<TypeNodesResult> {
  const types = schema.type instanceof Array ? schema.type : [schema.type];
  const baseResults: TypeNodeResult[] = await Promise.all(
    types.map(async (type) => {
      switch (type) {
        case 'null':
          return { type: factory.createLiteralTypeNode(factory.createNull()) };
        case 'boolean':
          return {
            type: factory.createKeywordTypeNode(SyntaxKind.BooleanKeyword),
          };
        case 'integer':
          return {
            type: factory.createKeywordTypeNode(SyntaxKind.NumberKeyword),
          };
        case 'number':
          return {
            type: factory.createKeywordTypeNode(SyntaxKind.NumberKeyword),
          };
        case 'string':
          return {
            type: factory.createKeywordTypeNode(SyntaxKind.StringKeyword),
          };
        case 'object':
          return await buildObjectTypeNode(context, schema);
        case 'array':
          return await buildArrayTypeNode(context, schema);
        default:
          throw new YError('E_BAD_TYPE', type);
      }
    }),
  );
  const baseTypes = baseResults.map(({ type }) => type);
  const baseResultsRests = combineResultRest(baseResults);

  // Schema also contains a composed schema, handle it as well and do a intersection with base schema
  if (schema.anyOf || schema.allOf || schema.oneOf) {
    const innerResult = await handleComposedSchemas(context, schema);

    return {
      ...combineResultRest([baseResultsRests, innerResult]),
      types: [
        factory.createIntersectionTypeNode([
          ...baseTypes,
          ...innerResult.types,
        ]),
      ],
    };
  } else {
    return {
      ...baseResultsRests,
      types: baseTypes,
    };
  }
}

// Handle oneOf / anyOf / allOf
async function handleComposedSchemas(
  context: JSONSchemaContext,
  schema: JSONSchema,
): Promise<TypeNodesResult> {
  const results = await Promise.all(
    ((schema.anyOf || schema.allOf || schema.oneOf) as JSONSchema[]).map(
      async (innerSchema) =>
        await schemaToTypes(context, innerSchema, schema.type),
    ),
  );
  const types = results.map((result) =>
    result.types.length > 1
      ? factory.createUnionTypeNode(result.types)
      : result.types[0],
  );
  const resultRest = combineResultRest(results);

  if (schema.oneOf) {
    return {
      ...resultRest,
      types: [factory.createUnionTypeNode(types)],
    };
  } else if (schema.anyOf) {
    // Not really a union types but no way to express
    // this in TypeScript atm 🤷
    return {
      ...resultRest,
      types: [factory.createUnionTypeNode(types)],
    };
  } else if (schema.allOf) {
    // Fallback to intersection type which will only work
    // in some situations (see the README)
    return {
      ...resultRest,
      types: [factory.createIntersectionTypeNode(types)],
    };
  } else {
    throw new YError('E_COMPOSED_SCHEMA_UNSUPPORTED', schema);
  }
}

export async function buildObjectTypeNode(
  context: JSONSchemaContext,
  schema: JSONSchema,
): Promise<TypeNodeResult> {
  const requiredProperties =
    schema.required && schema.required instanceof Array ? schema.required : [];
  let elements: TypeElement[] = [];
  const resultsRests: BaseResult[] = [];

  if (schema.properties) {
    for (const propertyName of Object.keys(schema.properties)) {
      const property = schema.properties?.[
        propertyName
      ] as JSONSchema7Definition;
      const required = requiredProperties.includes(propertyName);
      const readOnly = (property as JSONSchema7).readOnly;
      const { types, ...resultRest } = await schemaToTypes(
        context,
        eventuallyIdentifySchema(property as JSONSchema, propertyName),
      );
      const isSuitableAsIdentifierName = /^[a-z_$][a-z0-9_$]*$/i.test(
        propertyName,
      );

      elements.push(
        factory.createPropertySignature(
          readOnly ? [factory.createModifier(SyntaxKind.ReadonlyKeyword)] : [],
          isSuitableAsIdentifierName
            ? propertyName
            : factory.createStringLiteral(propertyName),
          required ? undefined : factory.createToken(SyntaxKind.QuestionToken),
          types.length > 1 ? factory.createUnionTypeNode(types) : types[0],
        ),
      );
      resultsRests.push(resultRest);
    }
  }

  // We need to handle empty required properties in order to be able
  // to generate objects with only required properties
  if (requiredProperties.length) {
    for (const propertyName of requiredProperties.filter(
      (propertyName) =>
        'undefined' === typeof schema.properties?.[propertyName],
    )) {
      elements.push(
        factory.createPropertySignature(
          [],
          propertyName,
          undefined,
          factory.createKeywordTypeNode(SyntaxKind.UnknownKeyword),
        ),
      );
    }
  }

  // We have to manage pattern and additional properties together
  // since TypeScript disallow several string index signatures
  if (schema.patternProperties || schema.additionalProperties) {
    const { readOnly, required, types, ...resultRest } = (
      await Promise.all(
        Object.keys(schema.patternProperties || {}).map(
          async (propertyPattern) => {
            const property = schema.patternProperties?.[
              propertyPattern
            ] as JSONSchema7Definition;
            const required = requiredProperties.includes(propertyPattern);
            const readOnly = !!(property as JSONSchema7).readOnly;
            const { types, ...resultRest } = await schemaToTypes(
              context,
              property as JSONSchema,
            );

            return {
              readOnly,
              required,
              ...resultRest,
              type:
                types.length > 1
                  ? factory.createUnionTypeNode(types)
                  : types[0],
            };
          },
        ),
      )
    )
      .concat(
        schema.additionalProperties
          ? [
              {
                type: factory.createKeywordTypeNode(SyntaxKind.UnknownKeyword),
                required: false,
                readOnly: false,
              },
            ]
          : [],
      )
      .reduce<{ readOnly: boolean; required: boolean; types: TypeNode[] }>(
        (
          {
            required: allRequired,
            readOnly: allReadOnly,
            types: allTypes,
            ...allResultsRests
          },
          { required, readOnly, type, ...resultRest },
        ) => ({
          types: allTypes.concat([type]),
          required: allRequired && required,
          readOnly: allReadOnly && readOnly,
          ...combineResultRest([resultRest, allResultsRests]),
        }),
        { required: false, readOnly: false, types: [] },
      );

    resultsRests.push(resultRest);
    elements = elements.concat(
      factory.createIndexSignature(
        readOnly ? [factory.createModifier(SyntaxKind.ReadonlyKeyword)] : [],
        [
          factory.createParameterDeclaration(
            [],
            undefined,
            factory.createIdentifier('pattern'),
            required
              ? factory.createToken(SyntaxKind.QuestionToken)
              : undefined,
            factory.createTypeReferenceNode('string', []),
            undefined,
          ),
        ],
        factory.createUnionTypeNode(types),
      ),
    );
  }

  return {
    ...combineResultRest(resultsRests),
    type: factory.createTypeLiteralNode(elements),
  };
}

export async function buildArrayTypeNode(
  context: JSONSchemaContext,
  schema: JSONSchema,
): Promise<TypeNodeResult> {
  if (typeof schema.maxItems === 'number' && schema.maxItems <= 0) {
    return {
      type: factory.createArrayTypeNode(
        factory.createKeywordTypeNode(SyntaxKind.NeverKeyword),
      ),
    };
  }

  const additionalItems =
    schema.additionalItems ||
    // Backward compatibility with old JSONSchema behavior
    (typeof schema.items !== 'boolean' && !(schema.items instanceof Array)
      ? schema.items
      : undefined);
  const prefixItems: JSONSchema[] =
    // Here, we are supporting the new way to declare tuples
    // in the last JSONSchema Draft
    // (see https://json-schema.org/understanding-json-schema/reference/array#tupleValidation )
    (schema as unknown as { prefixItems: JSONSchema[] }).prefixItems ||
    (typeof schema.items === 'object' && schema.items instanceof Array)
      ? (schema.items as unknown as JSONSchema[])
      : [];

  if (prefixItems.length) {
    const results = await Promise.all(
      prefixItems.map((schema) => schemaToTypes(context, schema)),
    );
    const types = results.map(({ types }) =>
      types.length > 1 ? factory.createUnionTypeNode(types) : types[0],
    );
    let resultsRests = combineResultRest(results);

    if (additionalItems) {
      const { types: additionalTypes, ...resultRest } = await schemaToTypes(
        context,
        additionalItems,
      );

      resultsRests = combineResultRest([resultsRests, resultRest]);

      types.push(
        factory.createRestTypeNode(
          factory.createArrayTypeNode(
            additionalTypes.length > 1
              ? factory.createUnionTypeNode(additionalTypes)
              : additionalTypes[0],
          ),
        ),
      );
    }

    return {
      ...resultsRests,
      type: factory.createTupleTypeNode(types),
    };
  } else {
    const { types, ...resultRest } = additionalItems
      ? await schemaToTypes(context, additionalItems)
      : { types: [factory.createKeywordTypeNode(SyntaxKind.UnknownKeyword)] };

    // Switch from arrays to tuples for small fixed length arrays
    if (
      'minItems' in schema &&
      'maxItems' in schema &&
      typeof schema.minItems === 'number' &&
      typeof schema.maxItems === 'number' &&
      schema.maxItems === schema.minItems &&
      schema.maxItems <
        context.jsonSchemaOptions.tuplesFromFixedArraysLengthLimit
    ) {
      return {
        ...resultRest,
        type: factory.createTupleTypeNode(
          new Array(schema.minItems).fill(
            types.length > 1 ? factory.createUnionTypeNode(types) : types[0],
          ),
        ),
      };
    }

    // Switch from arrays to tuples and spread for small min length arrays
    if (
      'minItems' in schema &&
      typeof schema.minItems === 'number' &&
      schema.minItems > 0 &&
      schema.minItems <
        context.jsonSchemaOptions.tuplesFromFixedArraysLengthLimit
    ) {
      return {
        ...resultRest,
        type: factory.createTupleTypeNode(
          new Array(schema.minItems)
            .fill(
              types.length > 1 ? factory.createUnionTypeNode(types) : types[0],
            )
            .concat(
              factory.createRestTypeNode(
                factory.createArrayTypeNode(
                  types.length > 1
                    ? factory.createUnionTypeNode(types)
                    : types[0],
                ),
              ),
            ),
        ),
      };
    }

    return {
      ...resultRest,
      type: factory.createArrayTypeNode(
        types.length > 1 ? factory.createUnionTypeNode(types) : types[0],
      ),
    };
  }
}

export function splitRef(ref: string): string[] {
  return ref
    .replace(/^#\//, '')
    .split('/')
    .filter((s) => s);
}

export async function resolve<T, U>(
  root: T,
  namespaceParts: string[],
): Promise<U> {
  if (typeof root === 'undefined') {
    throw new YError('E_RESOLVE', namespaceParts, '__root');
  }

  return namespaceParts.reduce(
    (curSchema, part) => {
      if (typeof curSchema[part] === 'undefined') {
        throw new YError('E_RESOLVE', namespaceParts, part);
      }
      return curSchema[part];
    },
    root as unknown as U,
  ) as U;
}

export async function ensureResolved<T, U>(
  root: T,
  object: U | Reference,
): Promise<U> {
  let resolvedObject = object;

  while ('$ref' in (resolvedObject as Reference)) {
    resolvedObject = await resolve<T, U>(
      root,
      splitRef((resolvedObject as Reference).$ref),
    );
  }

  return resolvedObject as U;
}

export function eventuallyIdentifySchema(schema: JSONSchema, title: string) {
  return typeof schema === 'object' && schema
    ? {
        title,
        ...schema,
      }
    : schema;
}

export async function eventuallyBrandType(
  context: JSONSchemaContext,
  schema: JSONSchemaDefinition,
  typeNode: TypeNode,
): Promise<TypeNode> {
  if (
    typeof schema === 'boolean' ||
    typeof schema === 'undefined' ||
    !(typeof schema === 'object') ||
    !schema ||
    !['string', 'number', 'integer', 'boolean'].includes(schema?.type as string)
  ) {
    return typeNode;
  }

  const name =
    typeof schema === 'object' &&
    schema &&
    'title' in schema &&
    schema.title !== 'Unknown' &&
    schema.title;

  if (!name) {
    return typeNode;
  }

  const isBrandedType =
    context.jsonSchemaOptions.brandedTypes === ALL_TYPES ||
    context.jsonSchemaOptions.brandedTypes.includes(name);

  if (isBrandedType) {
    return factory.createIntersectionTypeNode([
      typeNode,
      factory.createTypeLiteralNode([
        factory.createPropertySignature(
          undefined,
          factory.createIdentifier('_type'),
          factory.createToken(SyntaxKind.QuestionToken),
          factory.createLiteralTypeNode(factory.createStringLiteral(name)),
        ),
      ]),
    ]);
  }

  return typeNode;
}

function combineResultRest(results: BaseResult[]): BaseResult {
  return results.reduce(
    (rest, { fragments }) => ({
      fragments: (rest.fragments || []).concat(fragments || []),
    }),
    { fragments: [] },
  );
}
