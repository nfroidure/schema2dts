import * as ts from 'typescript';
import { factory } from 'typescript';
import YError from 'yerror';
import camelCase from 'camelcase';
import type {
  JSONSchema4,
  JSONSchema6,
  JSONSchema7,
  JSONSchema6Definition,
  JSONSchema7Definition,
} from 'json-schema';
import type { OpenAPIV3 } from 'openapi-types';

type Context = {
  nameResolver: (ref: string) => Promise<string[]>;
  buildIdentifier: (part: string) => string;
  root?: boolean;
};
type Schema = JSONSchema4 | JSONSchema6 | JSONSchema7;
type SchemaDefinition =
  | JSONSchema4
  | JSONSchema6Definition
  | JSONSchema7Definition;
type PackageTreeNode = {
  name: string;
  childs: PackageTreeNode[];
  types: ts.Statement[];
};

export function splitRef(ref: string): string[] {
  return ref
    .replace(/^#\//, '')
    .split('/')
    .filter((s) => s);
}

export function buildIdentifier(part: string): string {
  return part.replace(/(?:^|[^a-z0-9]+)([a-z])/gi, (_: unknown, $1: string) =>
    $1.toUpperCase(),
  );
}

async function resolve<T, U>(root: T, parts: string[]): Promise<U> {
  return parts.reduce((curSchema, part) => {
    return curSchema[part];
  }, (root as unknown) as U) as U;
}

async function ensureResolved<T>(
  root: OpenAPIV3.Document,
  object: T | OpenAPIV3.ReferenceObject,
): Promise<T> {
  const ref = (object as OpenAPIV3.ReferenceObject).$ref;
  let resolvedObject: T;

  if (ref) {
    resolvedObject = await resolve<OpenAPIV3.Document, T>(root, splitRef(ref));
  } else {
    resolvedObject = object as T;
  }

  return resolvedObject;
}

export async function generateOpenAPITypes(
  schema: OpenAPIV3.Document,
  baseName = 'API',
  {
    filterStatuses,
    generateUnusedSchemas,
  }: {
    filterStatuses?: number[];
    generateUnusedSchemas?: boolean;
  } = {},
): Promise<ts.NodeArray<ts.Statement>> {
  let sideTypes: { type: ts.Statement; parts: string[] }[] = [];
  const seenRefs: { [refName: string]: boolean } = {};
  const builtRefs: { [refName: string]: boolean } = {};
  const context: Context = {
    nameResolver: async (ref) => {
      seenRefs[ref] = true;

      return splitRef(ref);
    },
    buildIdentifier,
  };

  if (generateUnusedSchemas) {
    Object.keys(schema.components?.schemas || {}).forEach((schemaName) => {
      if (
        typeof (schema.components.schemas[
          schemaName
        ] as OpenAPIV3.ReferenceObject).$ref !== 'undefined'
      ) {
        seenRefs[
          (schema.components.schemas[
            schemaName
          ] as OpenAPIV3.ReferenceObject).$ref
        ] = true;
      } else {
        seenRefs[`#/components/schemas/${schemaName}`] = true;
      }
    });
  }

  await Object.keys(schema.paths).reduce(async (promise, path) => {
    await Object.keys(schema.paths[path]).reduce(async (promise, method) => {
      await promise;
      const operation: OpenAPIV3.OperationObject = schema.paths[path][method];
      const allInputs: {
        name: string;
        path: string[];
        required: boolean;
      }[] = [];
      const allOutputs: {
        status: string;
        path: string[];
        headersSchemas: Record<
          string,
          {
            schema: OpenAPIV3.HeaderObject['schema'];
            required: boolean;
          }
        >;
      }[] = [];

      if (operation.requestBody) {
        const requestBody = await ensureResolved<OpenAPIV3.RequestBodyObject>(
          schema,
          operation.requestBody,
        );

        const requestBodySchemas = requestBody
          ? Object.keys(requestBody.content)
              .filter(
                (contentType) => 'schema' in requestBody.content[contentType],
              )
              .map((contentType) => {
                return requestBody.content[contentType].schema;
              })
          : [];

        if (requestBodySchemas.length) {
          allInputs.push({
            name: 'body',
            path: ['Body'],
            required: !!requestBody.required,
          });

          requestBodySchemas.forEach((bodySchema, index) => {
            schema.components = schema.components || {};
            schema.components.schemas = schema.components.schemas || {};
            schema.components.schemas['__api_request_bodies'] =
              schema.components.schemas['__api_request_bodies'] || {};
            schema.components.schemas['__api_request_bodies'][
              operation.operationId
            ] =
              schema.components.schemas['__api_request_bodies'][
                operation.operationId
              ] || {};
            schema.components.schemas['__api_request_bodies'][
              operation.operationId
            ]['Body' + index] = bodySchema;
          });

          sideTypes.push({
            parts: [baseName, operation.operationId, 'Body'],
            type: await generateTypeDeclaration(
              context,
              {
                oneOf: requestBodySchemas.map((_, index) => {
                  return {
                    $ref:
                      '#/components/schemas/__api_request_bodies/' +
                      operation.operationId +
                      '/' +
                      'Body' +
                      index,
                  };
                }),
              },
              'Body',
            ),
          });
        }
      }

      if (operation.responses) {
        let responsesCodes = Object.keys(operation.responses);

        // We filter only if filterStatuses got at least one status code
        if (filterStatuses?.length) {
          responsesCodes = responsesCodes.filter((code) =>
            filterStatuses.includes(parseInt(code)),
          );
        }

        await Promise.all(
          responsesCodes.map(async (code) => {
            const response = await ensureResolved<OpenAPIV3.ResponseObject>(
              schema,
              operation.responses[code],
            );

            const responseSchemas =
              response && response.content
                ? Object.keys(response.content)
                    .filter(
                      (contentType) =>
                        'schema' in response.content[contentType],
                    )
                    .map((contentType) => {
                      return response.content[contentType].schema;
                    })
                : [];

            if (responseSchemas.length) {
              allOutputs.push({
                status: code,
                path: ['Responses', `$${code}`],
                headersSchemas: response.headers
                  ? (
                      await Promise.all(
                        Object.keys(response.headers).map(
                          async (headerName) => {
                            const header = await ensureResolved<OpenAPIV3.HeaderObject>(
                              schema,
                              response.headers[headerName],
                            );

                            return {
                              name: headerName,
                              header,
                            };
                          },
                        ),
                      )
                    )
                      .filter(({ header }) => 'schema' in header)
                      .reduce(
                        (headersMap, { name, header }) => ({
                          ...headersMap,
                          [name]: {
                            schema: header.schema,
                            required: header.required,
                          },
                        }),
                        {},
                      )
                  : [],
              });

              responseSchemas.forEach((bodySchema, index) => {
                schema.components = schema.components || {};
                schema.components.schemas = schema.components.schemas || {};
                schema.components.schemas['__api_responses'] =
                  schema.components.schemas['__api_responses'] || {};
                schema.components.schemas['__api_responses'][
                  operation.operationId
                ] =
                  schema.components.schemas['__api_responses'][
                    operation.operationId
                  ] || {};
                schema.components.schemas['__api_responses'][
                  operation.operationId
                ][`Response${code}`] =
                  schema.components.schemas['__api_responses'][
                    operation.operationId
                  ][`Response${code}`] || {};
                schema.components.schemas['__api_responses'][
                  operation.operationId
                ][`Response${code}`][`Schema${index}`] =
                  schema.components.schemas['__api_responses'][
                    operation.operationId
                  ][`Response${code}`][`Schema${index}`] || {};
                schema.components.schemas['__api_responses'][
                  operation.operationId
                ][`Response${code}`][`Schema${index}`] = bodySchema;
              });

              sideTypes.push({
                parts: [
                  baseName,
                  operation.operationId,
                  'Responses',
                  `$${code}`,
                ],
                type: await generateTypeDeclaration(
                  context,
                  {
                    oneOf: responseSchemas.map((_, index) => {
                      return {
                        $ref: `#/components/schemas/__api_responses/${operation.operationId}/Response${code}/Schema${index}`,
                      };
                    }),
                  },
                  `$${code}`,
                ),
              });
            }
          }),
        );
      }

      if (operation.parameters && operation.parameters.length) {
        await Promise.all(
          operation.parameters.map(async (parameter) => {
            const resolvedParameter = await ensureResolved<OpenAPIV3.ParameterObject>(
              schema,
              parameter,
            );
            const ref = (parameter as OpenAPIV3.ReferenceObject).$ref;

            allInputs.push({
              name: resolvedParameter.name,
              path: ['Parameters', resolvedParameter.name],
              required: !!resolvedParameter.required,
            });

            if (
              (resolvedParameter.schema as OpenAPIV3.ReferenceObject).$ref ||
              !ref
            ) {
              sideTypes.push({
                parts: [
                  baseName,
                  operation.operationId,
                  'Parameters',
                  resolvedParameter.name,
                ],
                type: await generateTypeDeclaration(
                  context,
                  resolvedParameter.schema,
                  resolvedParameter.name,
                ),
              });
            } else {
              const parameterName = splitRef(ref).pop();

              schema.components = schema.components || {};
              schema.components.schemas = schema.components.schemas || {};
              schema.components.schemas['__api_parameters'] =
                schema.components.schemas['__api_parameters'] || {};
              schema.components.schemas['__api_parameters'][parameterName] =
                resolvedParameter.schema;
              sideTypes.push({
                parts: [
                  baseName,
                  operation.operationId,
                  'Parameters',
                  resolvedParameter.name,
                ],
                type: await generateTypeDeclaration(
                  context,
                  {
                    $ref:
                      '#/components/schemas/__api_parameters/' + parameterName,
                  },
                  resolvedParameter.name,
                ),
              });
            }
          }),
        );
      }

      sideTypes.push({
        parts: [baseName, operation.operationId, 'Input'],
        type: factory.createTypeAliasDeclaration(
          undefined,
          [factory.createModifier(ts.SyntaxKind.ExportKeyword)],
          'Input',
          undefined,
          factory.createTypeLiteralNode(
            allInputs.map(({ name, path, required }) => {
              return factory.createPropertySignature(
                [factory.createModifier(ts.SyntaxKind.ReadonlyKeyword)],
                camelCase(name),
                required
                  ? undefined
                  : factory.createToken(ts.SyntaxKind.QuestionToken),
                buildTypeReference(context, path),
              );
            }),
          ),
        ),
      });

      sideTypes.push({
        parts: [baseName, operation.operationId, 'Output'],
        type: factory.createTypeAliasDeclaration(
          undefined,
          [factory.createModifier(ts.SyntaxKind.ExportKeyword)],
          'Output',
          undefined,
          allOutputs.length
            ? factory.createUnionTypeNode(
                await Promise.all(
                  allOutputs.map(async ({ status, path, headersSchemas }) => {
                    return factory.createTypeLiteralNode([
                      factory.createPropertySignature(
                        [factory.createModifier(ts.SyntaxKind.ReadonlyKeyword)],
                        'status',
                        undefined,
                        status === 'default'
                          ? (
                              await schemaToTypes(context, {
                                type: 'number',
                              })
                            )[0]
                          : (
                              await schemaToTypes(context, {
                                const: parseInt(status, 10),
                              })
                            )[0],
                      ),
                      factory.createPropertySignature(
                        [factory.createModifier(ts.SyntaxKind.ReadonlyKeyword)],
                        'headers',
                        Object.keys(headersSchemas).reduce(
                          (somerequired, propertyName) =>
                            somerequired ||
                            headersSchemas[propertyName].required,
                          false,
                        )
                          ? undefined
                          : factory.createToken(ts.SyntaxKind.QuestionToken),
                        (
                          await schemaToTypes(context, {
                            type: 'object',
                            required: Object.keys(headersSchemas).reduce(
                              (allRequired, propertyName) => [
                                ...allRequired,
                                ...(headersSchemas[propertyName].required
                                  ? [camelCase(propertyName)]
                                  : []),
                              ],
                              [],
                            ),
                            properties: Object.keys(headersSchemas).reduce(
                              (finalProperties, propertyName) => {
                                return {
                                  ...finalProperties,
                                  [camelCase(propertyName)]: headersSchemas[
                                    propertyName
                                  ].schema,
                                };
                              },
                              {},
                            ),
                            patternProperties: {
                              '/a-z0-9/': {
                                oneOf: [
                                  { type: 'string' },
                                  { type: 'array', items: { type: 'string' } },
                                ],
                              },
                            },
                          })
                        )[0],
                      ),
                      factory.createPropertySignature(
                        [factory.createModifier(ts.SyntaxKind.ReadonlyKeyword)],
                        'body',
                        undefined,
                        buildTypeReference(context, path),
                      ),
                    ]);
                  }),
                ),
              )
            : factory.createKeywordTypeNode(ts.SyntaxKind.AnyKeyword),
        ),
      });
    }, promise);
  }, Promise.resolve());

  let refsToBuild = Object.keys(seenRefs);

  do {
    sideTypes = sideTypes.concat(
      await Promise.all(
        refsToBuild.map(async (ref) => {
          builtRefs[ref] = true;

          const parts = splitRef(ref);
          const subSchema = await resolve<Schema, Schema>(schema, parts);

          return {
            type: await generateTypeDeclaration(
              { ...context, root: parts.length === 1 },
              subSchema,
              parts[parts.length - 1][0] + parts[parts.length - 1].slice(1),
            ),
            parts,
          };
        }),
      ),
    );
    refsToBuild = Object.keys(seenRefs).filter((ref) => !builtRefs[ref]);
  } while (refsToBuild.length);

  const packageTree: PackageTreeNode[] = [];

  sideTypes.forEach(({ type, parts }) => {
    buildTree(packageTree, parts, type);
  }, []);

  return factory.createNodeArray([
    ...buildModuleDeclarations(context, packageTree),
  ]);
}

// Could use https://apitools.dev/json-schema-ref-parser/
/**
 * Create the TypeScript types declarations from a JSONSchema document
 * @param {JSONSchema.Document} schema
 * @param {string} name
 * @returns {TypeScript.NodeArray}
 */
export async function generateJSONSchemaTypes(
  schema: Schema,
  name = 'Main',
): Promise<ts.NodeArray<ts.Statement>> {
  const seenRefs: { [refName: string]: boolean } = {};
  const builtRefs: { [refName: string]: boolean } = {};
  const context: Context = {
    nameResolver: async (ref) => {
      seenRefs[ref] = true;

      return splitRef(ref);
    },
    buildIdentifier,
  };

  const mainType = await generateTypeDeclaration(
    { ...context, root: true },
    schema,
    name,
  );
  let sideTypes: { type: ts.Statement; parts: string[] }[] = [];
  let refsToBuild = Object.keys(seenRefs);

  do {
    sideTypes = sideTypes.concat(
      await Promise.all(
        refsToBuild.map(async (ref) => {
          builtRefs[ref] = true;

          const parts = splitRef(ref);
          const subSchema = await resolve<Schema, Schema>(schema, parts);

          return {
            type: await generateTypeDeclaration(
              { ...context, root: parts.length === 1 },
              subSchema,
              parts[parts.length - 1][0] + parts[parts.length - 1].slice(1),
            ),
            parts,
          };
        }),
      ),
    );
    refsToBuild = Object.keys(seenRefs).filter((ref) => !builtRefs[ref]);
  } while (refsToBuild.length);

  const packageTree: PackageTreeNode[] = [];

  sideTypes.forEach(({ type, parts }) => {
    buildTree(packageTree, parts, type);
  }, []);

  return factory.createNodeArray([
    mainType,
    ...buildModuleDeclarations(context, packageTree),
  ]);
}

export async function generateTypeDeclaration(
  context: Context,
  schema: SchemaDefinition,
  name?: string,
): Promise<ts.Statement> {
  const types = await schemaToTypes(context, schema);

  name = context.buildIdentifier(
    name || (schema && (schema as Schema).title) || 'Unknown',
  );

  return factory.createTypeAliasDeclaration(
    undefined,
    [
      context.root
        ? factory.createModifier(ts.SyntaxKind.DeclareKeyword)
        : factory.createModifier(ts.SyntaxKind.ExportKeyword),
    ],
    name,
    undefined,
    types.length > 1 ? factory.createUnionTypeNode(types) : types[0],
  );
}

async function schemaToTypes(
  context: Context,
  schema: SchemaDefinition,
): Promise<ts.TypeNode[]> {
  if (typeof schema === 'boolean') {
    if (schema) {
      return [factory.createKeywordTypeNode(ts.SyntaxKind.AnyKeyword)];
    } else {
      return [factory.createKeywordTypeNode(ts.SyntaxKind.NeverKeyword)];
    }
  }

  if (schema.$ref) {
    const referenceParts = await context.nameResolver(schema.$ref);

    return [buildTypeReference(context, referenceParts)];
  } else if ('const' in schema) {
    return [buildLiteralType(schema.const)];
  } else if (schema.enum) {
    const allEnumValuesAreLiteral = schema.enum
      .filter((value) => value !== null)
      .every((value) => ['number', 'string', 'boolean'].includes(typeof value));

    if (allEnumValuesAreLiteral) {
      return schema.enum.map(buildLiteralType);
    }

    throw new YError('E_UNSUPPORTED_ENUM', schema.enum);
  } else if (schema.type) {
    const types = schema.type instanceof Array ? schema.type : [schema.type];
    const isNullable = types.includes('null');
    const typesParameters: ts.TypeNode[] = await Promise.all(
      types
        .filter(
          (type): type is Exclude<typeof types[number], 'null'> =>
            type !== 'null',
        )
        .map(async (type) => {
          switch (type) {
            case 'any':
              return factory.createKeywordTypeNode(ts.SyntaxKind.AnyKeyword);
            case 'boolean':
              return factory.createKeywordTypeNode(
                ts.SyntaxKind.BooleanKeyword,
              );
            case 'integer':
              return factory.createKeywordTypeNode(ts.SyntaxKind.NumberKeyword);
            case 'number':
              return factory.createKeywordTypeNode(ts.SyntaxKind.NumberKeyword);
            case 'string':
              return factory.createKeywordTypeNode(ts.SyntaxKind.StringKeyword);
            case 'object':
              return await buildObjectTypeNode(context, schema);
            case 'array':
              return await buildArrayTypeNode(context, schema);
            default:
              throw new YError('E_BAD_TYPE', type);
          }
        }),
    );

    if (isNullable) {
      return typesParameters;
    }

    return typesParameters.map((typeParameter) =>
      factory.createTypeReferenceNode('NonNullable', [typeParameter]),
    );
  } else if (schema.anyOf || schema.allOf || schema.oneOf) {
    const types = (
      await Promise.all(
        ((schema.anyOf || schema.allOf || schema.oneOf) as Schema[]).map(
          async (innerSchema) => await schemaToTypes(context, innerSchema),
        ),
      )
    ).map((innerTypes) =>
      innerTypes.length > 1
        ? factory.createUnionTypeNode(innerTypes)
        : innerTypes[0],
    );

    if (schema.oneOf) {
      return [factory.createUnionTypeNode(types)];
    } else if (schema.anyOf) {
      // Not really a union types but no way to express
      // this in TypeScript atm 🤷
      return [factory.createUnionTypeNode(types)];
    } else if (schema.allOf) {
      // Fallback to intersection type which will only work
      // in some situations (see the README)
      return [factory.createIntersectionTypeNode(types)];
    }
  } else {
    throw new YError('E_UNSUPPORTED_SCHEMA', schema);
  }
}

async function buildObjectTypeNode(
  context: Context,
  schema: Schema,
): Promise<ts.TypeNode> {
  let elements: ts.TypeElement[] = [];

  if (schema.properties) {
    elements = elements.concat(
      await Promise.all(
        Object.keys(schema.properties).map(async (propertyName) => {
          const property = schema.properties[propertyName];
          const required = (schema.required || []).includes(propertyName);
          const readOnly = (property as JSONSchema7).readOnly;
          const types = await schemaToTypes(context, property as Schema);

          return factory.createPropertySignature(
            readOnly
              ? [factory.createModifier(ts.SyntaxKind.ReadonlyKeyword)]
              : [],
            propertyName,
            required
              ? undefined
              : factory.createToken(ts.SyntaxKind.QuestionToken),
            types.length > 1 ? factory.createUnionTypeNode(types) : types[0],
          );
        }),
      ),
    );
  }

  // We need to handle empty required properties in order to be able
  // to generate objects with only required properties
  if (schema.required) {
    elements = elements.concat(
      await Promise.all(
        schema.required
          .filter(
            (propertyName) =>
              'undefined' === typeof schema.properties?.[propertyName],
          )
          .map(async (propertyName) => {
            return factory.createPropertySignature(
              [],
              propertyName,
              undefined,
              factory.createKeywordTypeNode(ts.SyntaxKind.UnknownKeyword),
            );
          }),
      ),
    );
  }

  // We have to manage pattern and additional properties together
  // since TypeScript disallow several string index signatures
  if (schema.patternProperties || schema.additionalProperties) {
    const { readOnly, required, types } = (
      await Promise.all(
        Object.keys(schema.patternProperties || []).map(
          async (propertyPattern) => {
            const property = schema.patternProperties[propertyPattern];
            const required = (schema.required || []).includes(propertyPattern);
            const readOnly = (property as JSONSchema7).readOnly;
            const types = await schemaToTypes(context, property as Schema);

            return {
              readOnly,
              required,
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
                type: factory.createKeywordTypeNode(ts.SyntaxKind.AnyKeyword),
                required: false,
                readOnly: false,
              },
            ]
          : [],
      )
      .reduce(
        (
          { required: allRequired, readOnly: allReadOnly, types: allTypes },
          { required, readOnly, type },
        ) => ({
          types: allTypes.concat([type]),
          required: allRequired && required,
          readOnly: allReadOnly && readOnly,
        }),
        { required: false, readOnly: false, types: [] },
      );

    elements = elements.concat(
      factory.createIndexSignature(
        undefined,
        readOnly ? [factory.createModifier(ts.SyntaxKind.ReadonlyKeyword)] : [],
        [
          factory.createParameterDeclaration(
            [],
            [],
            undefined,
            factory.createIdentifier('pattern'),
            required
              ? factory.createToken(ts.SyntaxKind.QuestionToken)
              : undefined,
            factory.createTypeReferenceNode('string', []),
            undefined,
          ),
        ],
        factory.createUnionTypeNode(types),
      ),
    );
  }

  return factory.createTypeLiteralNode(elements);
}

async function buildArrayTypeNode(
  context: Context,
  schema: Schema,
): Promise<ts.TypeNode> {
  const schemas = (schema.items instanceof Array
    ? schema.items
    : [schema.items]
  ).filter((s): s is Schema => typeof s !== 'boolean');
  const types = (
    await Promise.all(schemas.map((schema) => schemaToTypes(context, schema)))
  ).reduce((allTypes, types) => [...allTypes, ...types], []);
  const type = types.length > 1 ? factory.createUnionTypeNode(types) : types[0];

  if (
    typeof schema.minItems === 'number' &&
    typeof schema.maxItems === 'number'
  ) {
    if (schema.minItems > schema.maxItems) {
      return factory.createKeywordTypeNode(ts.SyntaxKind.NeverKeyword);
    }

    // Avoid having heavy results
    // if (schema.maxItems < 5) {
    //   const tupleTypes =
    //   return ast.buildTupleTypeNode(types, minItems, maxItems);
    // }
  }

  return factory.createArrayTypeNode(type);
}

function buildLiteralType(value: number | string | boolean): ts.TypeNode {
  switch (typeof value) {
    case 'number':
      return factory.createLiteralTypeNode(factory.createNumericLiteral(value));
    case 'string':
      return factory.createLiteralTypeNode(factory.createStringLiteral(value));
    case 'boolean':
      return factory.createLiteralTypeNode(
        value ? factory.createTrue() : factory.createFalse(),
      );
    case 'object':
      return factory.createLiteralTypeNode(factory.createNull());
  }
}

/**
 * Returns source from a list of TypeScript statements
 * @param {TypedPropertyDescriptor.NodeArray} nodes
 * @returns string
 */
export function toSource(nodes: ts.Node | ts.NodeArray<ts.Node>): string {
  const resultFile = ts.createSourceFile(
    'someFileName.ts',
    '',
    ts.ScriptTarget.Latest,
    /*setParentNodes*/ false,
    ts.ScriptKind.TS,
  );
  const printer = ts.createPrinter({
    newLine: ts.NewLineKind.LineFeed,
  });
  return printer.printList(
    ts.ListFormat.SourceFileStatements,
    nodes instanceof Array
      ? nodes
      : factory.createNodeArray([nodes as ts.Node]),
    resultFile,
  );
}

function buildModuleDeclarations(
  context: Context,
  currentTree: PackageTreeNode[],
  level = 0,
): ts.Statement[] {
  return currentTree.map((treeNode) => {
    return factory.createModuleDeclaration(
      undefined,
      [
        level === 0
          ? factory.createModifier(ts.SyntaxKind.DeclareKeyword)
          : factory.createModifier(ts.SyntaxKind.ExportKeyword),
      ],
      factory.createIdentifier(context.buildIdentifier(treeNode.name)),
      factory.createModuleBlock([
        ...treeNode.types,
        ...(treeNode.childs
          ? buildModuleDeclarations(context, treeNode.childs, level + 1)
          : []),
      ]),
      ts.NodeFlags.Namespace |
        ts.NodeFlags.ExportContext |
        ts.NodeFlags.ContextFlags,
    );
  });
}

function buildTree(
  currentTree: PackageTreeNode[],
  baseParts: string[],
  type: ts.Statement,
) {
  const [part, ...leftParts] = baseParts;
  let child = currentTree.find(({ name }) => name === part);

  if (!child) {
    child = {
      name: part,
      childs: [],
      types: [],
    };
    currentTree.push(child);
  }

  if (leftParts.length > 1) {
    buildTree(child.childs, leftParts, type);
    return;
  }
  child.types.push(type);
}

function buildTypeReference(context: Context, parts: string[]) {
  return factory.createTypeReferenceNode(
    parts.reduce((curNode: ts.EntityName, referencePart: string) => {
      const identifier = factory.createIdentifier(
        context.buildIdentifier(referencePart),
      );

      return curNode
        ? factory.createQualifiedName(curNode, identifier)
        : identifier;
    }, null),
    undefined,
  );
}
