import camelCase from 'camelcase';
import type {
  JSONSchema4,
  JSONSchema6,
  JSONSchema6Definition,
  JSONSchema6TypeName,
  JSONSchema7,
  JSONSchema7Definition,
} from 'json-schema';
import type { OpenAPIV3 } from 'openapi-types';
import * as ts from 'typescript';
import { factory } from 'typescript';
import YError from 'yerror';

type SeenReferencesHash = { [refName: string]: boolean };
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
    if (!curSchema) {
      throw new YError('E_RESOLVE', parts, part);
    }
    return curSchema[part];
  }, root as unknown as U) as U;
}

async function ensureResolved<T>(
  root: OpenAPIV3.Document,
  object: T | OpenAPIV3.ReferenceObject,
): Promise<T> {
  let resolvedObject = object;

  while ('$ref' in resolvedObject) {
    resolvedObject = await resolve<OpenAPIV3.Document, T>(
      root,
      splitRef(resolvedObject.$ref),
    );
  }

  return resolvedObject as T;
}

export const DEFAULT_OPTIONS = {
  baseName: 'API',
};

export async function generateOpenAPITypes(
  root: OpenAPIV3.Document,
  {
    baseName = DEFAULT_OPTIONS.baseName,
    filterStatuses,
    generateUnusedSchemas,
  }: {
    filterStatuses?: (number | 'default')[];
    generateUnusedSchemas?: boolean;
    baseName?: string;
  } = DEFAULT_OPTIONS,
): Promise<ts.NodeArray<ts.Statement>> {
  const seenSchemas: SeenReferencesHash = {};
  let sideTypes: { type: ts.Statement; parts: string[] }[] = [];
  const context: Context = {
    nameResolver: async (ref) => {
      seenSchemas[ref] = true;

      return splitRef(ref);
    },
    buildIdentifier,
  };

  const components: {
    schemas: NonNullable<
      NonNullable<OpenAPIV3.Document['components']>['schemas']
    >;
    requestBodies: NonNullable<
      NonNullable<OpenAPIV3.Document['components']>['requestBodies']
    >;
    parameters: NonNullable<
      NonNullable<OpenAPIV3.Document['components']>['parameters']
    >;
    responses: NonNullable<
      NonNullable<OpenAPIV3.Document['components']>['responses']
    >;
    headers: NonNullable<
      NonNullable<OpenAPIV3.Document['components']>['headers']
    >;
  } = {
    schemas: root.components?.schemas || {},
    requestBodies: root.components?.requestBodies || {},
    parameters: root.components?.parameters || {},
    responses: root.components?.responses || {},
    headers: root.components?.headers || {},
  };
  root.components = components;

  if (generateUnusedSchemas) {
    Object.keys(root.components?.schemas || {}).forEach((schemaName) => {
      const schema = root.components?.schemas?.[
        schemaName
      ] as OpenAPIV3.ReferenceObject;

      if ('$ref' in schema) {
        seenSchemas[schema.$ref] = true;
      }
      seenSchemas[`#/components/schemas/${schemaName}`] = true;
    });
  }

  await Object.keys(root.paths).reduce(async (promise, path) => {
    await Object.keys(root.paths[path] || {}).reduce(
      async (promise, method) => {
        await promise;

        const pathObject = root.paths[path] as OpenAPIV3.PathItemObject;
        const operation: OpenAPIV3.OperationObject = pathObject[method];
        const allInputs: {
          name: string;
          path: string[];
          required: boolean;
        }[] = [];
        const operationId = operation.operationId as string;

        if (!operationId) {
          throw new YError('E_OPERATION_ID_REQUIRED', path, method);
        }

        if (operation.requestBody) {
          const uniquePrefix = `${operationId}RequestBody`;
          const requestBody = await ensureResolved<OpenAPIV3.RequestBodyObject>(
            root,
            operation.requestBody,
          );

          if (!('$ref' in operation.requestBody)) {
            components.requestBodies[uniquePrefix] = operation.requestBody;
            operation.requestBody = {
              $ref: `#/components/requestBodies/${uniquePrefix}`,
            };
          }

          allInputs.push({
            name: 'body',
            path: ['Body'],
            required: !!requestBody.required,
          });

          sideTypes.push({
            parts: [baseName, operationId, 'Body'],
            type: factory.createTypeAliasDeclaration(
              undefined,
              [factory.createModifier(ts.SyntaxKind.ExportKeyword)],
              'Body',
              undefined,
              buildTypeReference(context, [
                'Components',
                'RequestBodies',
                context.buildIdentifier(
                  splitRef(
                    operation?.requestBody?.$ref as string,
                  ).pop() as string,
                ),
              ]),
            ),
          });
        }

        if ('responses' in operation && operation.responses) {
          const responses = operation.responses as OpenAPIV3.ResponsesObject;
          const uniquePrefix = `${operationId}Response`;
          let responsesCodes = Object.keys(operation.responses);

          // We filter only if filterStatuses got at least one status code
          if (filterStatuses?.length) {
            responsesCodes = responsesCodes.filter((code) =>
              filterStatuses.includes(
                code === 'default' ? 'default' : parseInt(code, 10),
              ),
            );
          }

          await Promise.all(
            responsesCodes.map(async (code) => {
              const uniqueKey = `${uniquePrefix + code}`;

              if (!('$ref' in responses[code])) {
                components.responses[uniqueKey] = responses[code];
                responses[code] = {
                  $ref: `#/components/responses/${uniqueKey}`,
                };
              }

              sideTypes.push({
                parts: [baseName, operationId, 'Responses', `$${code}`],
                type: factory.createTypeAliasDeclaration(
                  undefined,
                  [factory.createModifier(ts.SyntaxKind.ExportKeyword)],
                  `$${code}`,
                  [],
                  factory.createTypeReferenceNode(
                    factory.createQualifiedName(
                      factory.createQualifiedName(
                        factory.createIdentifier('Components'),
                        'Responses',
                      ),
                      splitRef(
                        (responses[code] as OpenAPIV3.ReferenceObject).$ref,
                      ).pop() as string,
                    ),
                    [
                      code === 'default'
                        ? factory.createKeywordTypeNode(
                            ts.SyntaxKind.NumberKeyword,
                          )
                        : factory.createLiteralTypeNode(
                            factory.createNumericLiteral(code),
                          ),
                    ],
                  ),
                ),
              });
              return uniqueKey;
            }),
          );

          sideTypes.push({
            parts: [baseName, operationId, 'Output'],
            type: factory.createTypeAliasDeclaration(
              undefined,
              [factory.createModifier(ts.SyntaxKind.ExportKeyword)],
              'Output',
              undefined,
              responsesCodes.length
                ? factory.createUnionTypeNode(
                    responsesCodes.map((responsesCode) =>
                      factory.createTypeReferenceNode(
                        factory.createQualifiedName(
                          factory.createIdentifier('Responses'),
                          `$${responsesCode}`,
                        ),
                        [],
                      ),
                    ),
                  )
                : factory.createKeywordTypeNode(ts.SyntaxKind.UnknownKeyword),
            ),
          });
        }

        if (operation.parameters && operation.parameters.length) {
          await Promise.all(
            operation.parameters.map(async (parameter, index) => {
              const uniqueKey = `${operationId + index}`;

              if (!('$ref' in parameter)) {
                components.parameters[uniqueKey] = parameter;
                (
                  operation.parameters as (
                    | OpenAPIV3.ReferenceObject
                    | OpenAPIV3.ParameterObject
                  )[]
                )[index] = {
                  $ref: `#/components/parameters/${uniqueKey}`,
                };
              }

              const parameterKey = context.buildIdentifier(
                splitRef(
                  (
                    (
                      operation.parameters as (
                        | OpenAPIV3.ReferenceObject
                        | OpenAPIV3.ParameterObject
                      )[]
                    )[index] as OpenAPIV3.ReferenceObject
                  ).$ref,
                ).pop() as string,
              );
              const resolvedParameter =
                await ensureResolved<OpenAPIV3.ParameterObject>(
                  root,
                  parameter,
                );

              allInputs.push({
                name: resolvedParameter.name,
                path: ['Parameters', resolvedParameter.name],
                required: !!resolvedParameter.required,
              });
              sideTypes.push({
                parts: [baseName, operationId, 'Parameters', parameterKey],
                type: factory.createTypeAliasDeclaration(
                  undefined,
                  [factory.createModifier(ts.SyntaxKind.ExportKeyword)],
                  context.buildIdentifier(resolvedParameter.name),
                  undefined,
                  buildTypeReference(context, [
                    'Components',
                    'Parameters',
                    parameterKey,
                  ]),
                ),
              });
            }),
          );
        }

        sideTypes.push({
          parts: [baseName, operationId, 'Input'],
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
      },
      promise,
    );
  }, Promise.resolve());

  await Promise.all(
    Object.keys(components.requestBodies).map(async (name) => {
      const requestBody = components.requestBodies[name];
      let type: ts.Statement;
      if ('$ref' in requestBody) {
        type = factory.createTypeAliasDeclaration(
          [],
          [factory.createModifier(ts.SyntaxKind.ExportKeyword)],
          name,
          [],
          buildTypeReference(context, [
            'Components',
            'RequestBodies',
            splitRef(requestBody.$ref).pop() as string,
          ]),
        );
      } else {
        const requestBodySchemas = requestBody
          ? Object.keys(requestBody.content)
              .filter(
                (contentType) => 'schema' in requestBody.content[contentType],
              )
              .map((contentType) => {
                return requestBody.content[contentType].schema;
              })
          : [];

        if (!requestBodySchemas.length) {
          type = await generateTypeDeclaration(context, { type: 'any' }, name);
        } else {
          const requestBodySchemasReferences: OpenAPIV3.ReferenceObject[] = (
            requestBodySchemas as (
              | OpenAPIV3.ReferenceObject
              | OpenAPIV3.ArraySchemaObject
              | OpenAPIV3.NonArraySchemaObject
            )[]
          ).map((schema, index) => {
            let ref;

            if ('$ref' in schema) {
              ref = schema.$ref;
            } else {
              ref = `#/components/schemas/RequestBodies${name}Body${index}`;
              components.schemas[`RequestBodies${name}Body${index}`] = schema;
            }
            seenSchemas[ref] = true;
            return { $ref: ref };
          });

          type = await generateTypeDeclaration(
            context,
            {
              oneOf: requestBodySchemasReferences,
            },
            name,
          );
        }
      }
      sideTypes.push({
        parts: ['Components', 'RequestBodies', name],
        type,
      });
    }),
  );
  await Promise.all(
    Object.keys(components.parameters).map(async (name) => {
      const parameter = components.parameters[name];

      if ('$ref' in parameter) {
        sideTypes.push({
          parts: ['Components', 'Parameters', name],
          type: factory.createTypeAliasDeclaration(
            [],
            [factory.createModifier(ts.SyntaxKind.ExportKeyword)],
            name,
            [],
            buildTypeReference(context, [
              'Components',
              'Parameters',
              splitRef(parameter.$ref).pop() as string,
            ]),
          ),
        });
      } else {
        sideTypes.push({
          parts: ['Components', 'Parameters', name],
          type: await generateTypeDeclaration(
            context,
            parameter.schema || { type: 'any' },
            name,
          ),
        });
      }
    }),
  );
  await Promise.all(
    Object.keys(components.responses).map(async (name) => {
      const response = components.responses[name];
      let schemasType: ts.TypeNode;

      if ('$ref' in response) {
        sideTypes.push({
          parts: ['Components', 'Responses', name],
          type: factory.createTypeAliasDeclaration(
            undefined,
            [factory.createModifier(ts.SyntaxKind.ExportKeyword)],
            name,
            undefined,
            buildTypeReference(context, [
              'Components',
              'Responses',
              splitRef(response.$ref).pop() as string,
            ]),
          ),
        });
      } else {
        const responseSchemas =
          response && response.content
            ? Object.keys(response.content)
                .filter(
                  (contentType) =>
                    'schema' in (response.content || {})[contentType],
                )
                .map((contentType) => {
                  return response.content?.[contentType].schema;
                })
            : [];

        if (!responseSchemas.length) {
          schemasType = await schemaToTypeNode(context, { type: 'any' });
        } else {
          const responseSchemasReferences: OpenAPIV3.ReferenceObject[] = (
            responseSchemas as (
              | OpenAPIV3.ReferenceObject
              | OpenAPIV3.ArraySchemaObject
              | OpenAPIV3.NonArraySchemaObject
            )[]
          ).map((schema, index) => {
            let ref;

            if ('$ref' in schema) {
              ref = schema.$ref;
            } else {
              ref = `#/components/schemas/Responses${name}Body${index}`;
              components.schemas[`Responses${name}Body${index}`] = schema;
            }
            seenSchemas[ref] = true;
            return { $ref: ref };
          });

          schemasType = await schemaToTypeNode(context, {
            oneOf: responseSchemasReferences,
          });
        }
        let hasRequiredHeaders = false;
        const headersTypes = await Promise.all(
          Object.keys(response.headers || {}).map(async (headerName) => {
            const header = response.headers?.[headerName] as
              | OpenAPIV3.ReferenceObject
              | OpenAPIV3.HeaderObject;
            const uniqueKey = `${name}Headers${context.buildIdentifier(
              headerName,
            )}`;
            const resolvedHeader = await ensureResolved(root, header);

            hasRequiredHeaders =
              hasRequiredHeaders || !!resolvedHeader.required;

            if (!('$ref' in header)) {
              components.headers[uniqueKey] = header;
              (response.headers || {})[headerName] = {
                $ref: `#/components/headers/${uniqueKey}`,
              };
            }

            return factory.createPropertySignature(
              [factory.createModifier(ts.SyntaxKind.ReadonlyKeyword)],
              factory.createStringLiteral(headerName.toLowerCase()),
              resolvedHeader.required
                ? undefined
                : factory.createToken(ts.SyntaxKind.QuestionToken),
              buildTypeReference(context, [
                'Components',
                'Headers',
                context.buildIdentifier(
                  splitRef(
                    (
                      (response.headers || {})[
                        headerName
                      ] as OpenAPIV3.ReferenceObject
                    ).$ref,
                  ).pop() as string,
                ),
              ]),
            );
          }),
        );

        sideTypes.push({
          parts: ['Components', 'Responses', name],
          type: factory.createTypeAliasDeclaration(
            [],
            [],
            name,
            [
              factory.createTypeParameterDeclaration(
                'S',
                factory.createKeywordTypeNode(ts.SyntaxKind.NumberKeyword),
              ),
            ],
            factory.createTypeLiteralNode([
              factory.createPropertySignature(
                [factory.createModifier(ts.SyntaxKind.ReadonlyKeyword)],
                'status',
                undefined,
                factory.createTypeReferenceNode('S'),
              ),
              factory.createPropertySignature(
                [factory.createModifier(ts.SyntaxKind.ReadonlyKeyword)],
                'headers',
                hasRequiredHeaders
                  ? undefined
                  : factory.createToken(ts.SyntaxKind.QuestionToken),
                factory.createTypeLiteralNode([
                  ...headersTypes,
                  factory.createIndexSignature(
                    [],
                    [factory.createModifier(ts.SyntaxKind.ReadonlyKeyword)],
                    [
                      factory.createParameterDeclaration(
                        [],
                        [],
                        undefined,
                        factory.createIdentifier('name'),
                        undefined,
                        factory.createKeywordTypeNode(
                          ts.SyntaxKind.StringKeyword,
                        ),
                        undefined,
                      ),
                    ],
                    factory.createKeywordTypeNode(ts.SyntaxKind.UnknownKeyword),
                  ),
                ]),
              ),
              factory.createPropertySignature(
                [factory.createModifier(ts.SyntaxKind.ReadonlyKeyword)],
                'body',
                !responseSchemas.length
                  ? factory.createToken(ts.SyntaxKind.QuestionToken)
                  : undefined,
                schemasType,
              ),
            ]),
          ),
        });
      }
    }),
  );
  await Promise.all(
    Object.keys(components.headers).map(async (name) => {
      const header = components.headers[name];

      if ('$ref' in header) {
        sideTypes.push({
          parts: ['Components', 'Headers', name],
          type: factory.createTypeAliasDeclaration(
            undefined,
            [factory.createModifier(ts.SyntaxKind.ExportKeyword)],
            name,
            undefined,
            buildTypeReference(context, [
              'Components',
              'Headers',
              splitRef(header.$ref).pop() as string,
            ]),
          ),
        });
      } else {
        sideTypes.push({
          parts: ['Components', 'Headers', name],
          type: await generateTypeDeclaration(
            context,
            header.schema || { type: 'any' },
            name,
          ),
        });
      }
    }),
  );

  const builtRefs: { [refName: string]: boolean } = {};
  let refsToBuild = Object.keys(seenSchemas);

  do {
    sideTypes = sideTypes.concat(
      await Promise.all(
        refsToBuild.map(async (ref) => {
          builtRefs[ref] = true;
          const parts = splitRef(ref);
          const subSchema = await resolve<Schema, Schema>(root, parts);

          return {
            type: await generateTypeDeclaration(
              { ...context, root: parts.length === 1 },
              subSchema,
              buildIdentifier(parts[parts.length - 1]),
            ),
            parts: parts.map((part) => buildIdentifier(part)),
          };
        }),
      ),
    );
    refsToBuild = Object.keys(seenSchemas).filter((ref) => !builtRefs[ref]);
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
  const seenSchemas: SeenReferencesHash = {};
  const context: Context = {
    nameResolver: async (ref) => {
      seenSchemas[ref] = true;

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
  const builtRefs: { [refName: string]: boolean } = {};
  let refsToBuild = Object.keys(seenSchemas);

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
    refsToBuild = Object.keys(seenSchemas).filter((ref) => !builtRefs[ref]);
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

async function schemaToTypeNode(
  context: Context,
  schema: SchemaDefinition,
): Promise<ts.TypeNode> {
  const types = await schemaToTypes(context, schema);

  return types.length > 1 ? factory.createUnionTypeNode(types) : types[0];
}

async function schemaToTypes(
  context: Context,
  schema: SchemaDefinition,
  parentType?: JSONSchema6TypeName | JSONSchema6TypeName[],
): Promise<ts.TypeNode[]> {
  if (typeof schema === 'boolean') {
    if (schema) {
      return [factory.createKeywordTypeNode(ts.SyntaxKind.UnknownKeyword)];
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
      return (schema.enum as Parameters<typeof buildLiteralType>[0][]).map(
        buildLiteralType,
      );
    }

    throw new YError('E_UNSUPPORTED_ENUM', schema.enum);
  } else if (schema.type) {
    return handleTypedSchema(context, schema);
  } else if (schema.anyOf || schema.allOf || schema.oneOf) {
    return handleComposedSchemas(context, schema);
  } else if (parentType) {
    // Inject type from parent
    schema.type = parentType;
    return handleTypedSchema(context, schema);
  }

  throw new YError('E_UNSUPPORTED_SCHEMA', schema);
}

// Handle schema where type is defined
async function handleTypedSchema(
  context: Context,
  schema: Schema,
): Promise<ts.TypeNode[]> {
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
            return factory.createKeywordTypeNode(ts.SyntaxKind.UnknownKeyword);
          case 'boolean':
            return factory.createKeywordTypeNode(ts.SyntaxKind.BooleanKeyword);
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

  const baseTypes = isNullable
    ? typesParameters
    : typesParameters.map((typeParameter) =>
        factory.createTypeReferenceNode('NonNullable', [typeParameter]),
      );

  // Schema also contains a composed schema, handle it as well and do a intersection with base schema
  if (schema.anyOf || schema.allOf || schema.oneOf) {
    const innerTypes = await handleComposedSchemas(context, schema);
    return [factory.createIntersectionTypeNode([...baseTypes, ...innerTypes])];
  } else {
    return baseTypes;
  }
}

// Handle oneOf / anyOf / allOf
async function handleComposedSchemas(
  context: Context,
  schema: Schema,
): Promise<ts.TypeNode[]> {
  const types = (
    await Promise.all(
      ((schema.anyOf || schema.allOf || schema.oneOf) as Schema[]).map(
        async (innerSchema) =>
          await schemaToTypes(context, innerSchema, schema.type),
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
  } else {
    throw new YError('E_COMPOSED_SCHEMA_UNSUPPORTED', schema);
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
          const property = schema.properties?.[
            propertyName
          ] as JSONSchema7Definition;
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
        Object.keys(schema.patternProperties || {}).map(
          async (propertyPattern) => {
            const property = schema.patternProperties?.[
              propertyPattern
            ] as JSONSchema7Definition;
            const required = (schema.required || []).includes(propertyPattern);
            const readOnly = !!(property as JSONSchema7).readOnly;
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
                type: factory.createKeywordTypeNode(
                  ts.SyntaxKind.UnknownKeyword,
                ),
                required: false,
                readOnly: false,
              },
            ]
          : [],
      )
      .reduce<{ readOnly: boolean; required: boolean; types: ts.TypeNode[] }>(
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
  const schemas = (
    schema.items instanceof Array ? schema.items : [schema.items]
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
    parts.reduce<ts.EntityName>(
      (curNode: ts.EntityName | null, referencePart: string) => {
        const identifier = factory.createIdentifier(
          context.buildIdentifier(referencePart),
        );

        return curNode
          ? factory.createQualifiedName(curNode, identifier)
          : identifier;
      },
      null as unknown as ts.EntityName,
    ),
    undefined,
  );
}
