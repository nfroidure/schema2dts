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
  sideTypeDeclarations: { statement: ts.Statement; namespaceParts: string[] }[];
  jsonSchemaOptions: JSONSchemaOptions;
  seenSchemas: SeenReferencesHash;
  candidateName?: string;
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
const ALL_TYPES = 'all' as const;

export function splitRef(ref: string): string[] {
  return ref
    .replace(/^#\//, '')
    .split('/')
    .filter((s) => s);
}

export function buildIdentifier(part: string): string {
  const identifier = part
    .replace(/[^a-z0-9-_ ]/gi, '')
    .replace(/(?:^|[^a-z0-9]+)([a-z])/gi, (_: unknown, $1: string) =>
      $1.toUpperCase(),
    )
    .replace(/[^a-z0-9]/gi, '');

  return identifier || 'Unknown';
}

async function resolve<T, U>(root: T, namespaceParts: string[]): Promise<U> {
  return namespaceParts.reduce((curSchema, part) => {
    if (!curSchema) {
      throw new YError('E_RESOLVE', namespaceParts, part);
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

export const DEFAULT_JSON_SCHEMA_OPTIONS: Required<JSONSchemaOptions> = {
  baseName: 'Main',
  brandedTypes: [],
  generateRealEnums: false,
  exportNamespaces: false,
};
export const DEFAULT_OPEN_API_OPTIONS: OpenAPIOptions = {
  baseName: 'API',
  filterStatuses: [],
  brandedTypes: [],
  generateUnusedSchemas: false,
  camelizeInputs: true,
  generateRealEnums: false,
  exportNamespaces: false,
};

type OpenAPIOptions = {
  baseName: string;
  filterStatuses?: (number | 'default')[];
  generateUnusedSchemas?: boolean;
  camelizeInputs?: boolean;
  brandedTypes: string[] | typeof ALL_TYPES | 'schemas';
  generateRealEnums: boolean;
  exportNamespaces: boolean;
};
/**
 * Create the TypeScript types declarations from an Open API document
 * @param {JSONSchema.Document} schema
 * @param {Object} options
 * @param {string} options.baseName
 * @param {Array<number>} options.filterStatuses
 * @param {boolean} options.generateUnusedSchemas
 * @param {boolean} options.camelizeInputs
 * @param {Array<string>} options.brandedTypes
 * @returns {TypeScript.NodeArray}
 */
export async function generateOpenAPITypes(
  root: OpenAPIV3.Document,
  {
    baseName = DEFAULT_OPEN_API_OPTIONS.baseName,
    filterStatuses = DEFAULT_OPEN_API_OPTIONS.filterStatuses,
    generateUnusedSchemas = DEFAULT_OPEN_API_OPTIONS.generateUnusedSchemas,
    camelizeInputs = DEFAULT_OPEN_API_OPTIONS.camelizeInputs,
    brandedTypes = DEFAULT_OPEN_API_OPTIONS.brandedTypes,
    generateRealEnums = DEFAULT_OPEN_API_OPTIONS.generateRealEnums,
    exportNamespaces = DEFAULT_OPEN_API_OPTIONS.exportNamespaces,
  }: Omit<OpenAPIOptions, 'baseName' | 'brandedTypes'> &
    Partial<
      Pick<OpenAPIOptions, 'baseName' | 'brandedTypes'>
    > = DEFAULT_OPEN_API_OPTIONS,
): Promise<ts.NodeArray<ts.Statement>> {
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

  const context: Context = {
    nameResolver: async (ref) => {
      context.seenSchemas[ref] = true;

      return splitRef(ref);
    },
    buildIdentifier,
    sideTypeDeclarations: [],
    jsonSchemaOptions: {
      brandedTypes:
        brandedTypes !== 'schemas'
          ? brandedTypes
          : Object.keys(components.schemas).map(buildIdentifier),
      generateRealEnums,
      exportNamespaces,
    },
    seenSchemas: {},
  };

  if (generateUnusedSchemas) {
    Object.keys(root.components?.schemas || {}).forEach((schemaName) => {
      const schema = root.components?.schemas?.[
        schemaName
      ] as OpenAPIV3.ReferenceObject;

      if ('$ref' in schema) {
        context.seenSchemas[schema.$ref] = true;
      }
      context.seenSchemas[`#/components/schemas/${schemaName}`] = true;
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

          context.sideTypeDeclarations.push({
            namespaceParts: [baseName, operationId, 'Body'],
            statement: factory.createTypeAliasDeclaration(
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

              context.sideTypeDeclarations.push({
                namespaceParts: [
                  baseName,
                  operationId,
                  'Responses',
                  `$${code}`,
                ],
                statement: factory.createTypeAliasDeclaration(
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

          context.sideTypeDeclarations.push({
            namespaceParts: [baseName, operationId, 'Output'],
            statement: factory.createTypeAliasDeclaration(
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
              const uniqueKey = operationId + index;

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
              context.sideTypeDeclarations.push({
                namespaceParts: [
                  baseName,
                  operationId,
                  'Parameters',
                  parameterKey,
                ],
                statement: factory.createTypeAliasDeclaration(
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

        context.sideTypeDeclarations.push({
          namespaceParts: [baseName, operationId, 'Input'],
          statement: factory.createTypeAliasDeclaration(
            undefined,
            [factory.createModifier(ts.SyntaxKind.ExportKeyword)],
            'Input',
            undefined,
            factory.createTypeLiteralNode(
              allInputs.map(({ name, path, required }) => {
                return factory.createPropertySignature(
                  [factory.createModifier(ts.SyntaxKind.ReadonlyKeyword)],
                  camelizeInputs ? camelCase(name) : name,
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
      let statement: ts.Statement;
      if ('$ref' in requestBody) {
        statement = factory.createTypeAliasDeclaration(
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
          statement = await generateTypeDeclaration(
            {
              ...context,
              candidateName: name,
            },
            { type: 'any' },
          );
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
            context.seenSchemas[ref] = true;
            return { $ref: ref };
          });

          statement = await generateTypeDeclaration(
            {
              ...context,
              candidateName: name,
            },
            {
              oneOf: requestBodySchemasReferences,
            },
          );
        }
      }
      context.sideTypeDeclarations.push({
        namespaceParts: ['Components', 'RequestBodies', name],
        statement,
      });
    }),
  );
  await Promise.all(
    Object.keys(components.parameters).map(async (name) => {
      const parameter = components.parameters[name];

      if ('$ref' in parameter) {
        context.sideTypeDeclarations.push({
          namespaceParts: ['Components', 'Parameters', name],
          statement: factory.createTypeAliasDeclaration(
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
        context.sideTypeDeclarations.push({
          namespaceParts: ['Components', 'Parameters', name],
          statement: await generateTypeDeclaration(
            {
              ...context,
              candidateName: name,
            },
            parameter.schema || { type: 'any' },
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
        context.sideTypeDeclarations.push({
          namespaceParts: ['Components', 'Responses', name],
          statement: factory.createTypeAliasDeclaration(
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
            context.seenSchemas[ref] = true;
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

        context.sideTypeDeclarations.push({
          namespaceParts: ['Components', 'Responses', name],
          statement: factory.createTypeAliasDeclaration(
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
        context.sideTypeDeclarations.push({
          namespaceParts: ['Components', 'Headers', name],
          statement: factory.createTypeAliasDeclaration(
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
        context.sideTypeDeclarations.push({
          namespaceParts: ['Components', 'Headers', name],
          statement: await generateTypeDeclaration(
            {
              ...context,
              candidateName: name,
            },
            header.schema || { type: 'any' },
          ),
        });
      }
    }),
  );

  return gatherStatements(context, root, []);
}

type JSONSchemaOptions = {
  baseName?: string;
  brandedTypes: string[] | typeof ALL_TYPES;
  generateRealEnums: boolean;
  exportNamespaces: boolean;
};

// Could use https://apitools.dev/json-schema-ref-parser/
/**
 * Create the TypeScript types declarations from a JSONSchema document
 * @param {JSONSchema.Document} schema
 * @param {Object} options
 * @param {string} options.name
 * @param {Array<string>} options.brandedTypes
 * @returns {TypeScript.NodeArray}
 */
export async function generateJSONSchemaTypes(
  schema: Schema,
  {
    baseName = DEFAULT_JSON_SCHEMA_OPTIONS.baseName,
    brandedTypes = DEFAULT_JSON_SCHEMA_OPTIONS.brandedTypes,
    generateRealEnums = DEFAULT_JSON_SCHEMA_OPTIONS.generateRealEnums,
    exportNamespaces = DEFAULT_JSON_SCHEMA_OPTIONS.exportNamespaces,
  }: JSONSchemaOptions = DEFAULT_JSON_SCHEMA_OPTIONS,
): Promise<ts.NodeArray<ts.Statement>> {
  const context: Context = {
    nameResolver: async (ref) => {
      context.seenSchemas[ref] = true;

      return splitRef(ref);
    },
    buildIdentifier,
    sideTypeDeclarations: [],
    jsonSchemaOptions: {
      baseName,
      brandedTypes,
      generateRealEnums,
      exportNamespaces,
    },
    seenSchemas: {},
  };

  const mainStatement = await generateTypeDeclaration(
    { ...context, candidateName: baseName, root: true },
    schema,
  );

  return gatherStatements(context, schema, [mainStatement]);
}

export async function gatherStatements(
  context: Context,
  schema: Schema,
  statements: ts.Statement[],
): Promise<ts.NodeArray<ts.Statement>> {
  const builtRefs: { [refName: string]: boolean } = {};
  let refsToBuild = Object.keys(context.seenSchemas);

  do {
    context.sideTypeDeclarations = context.sideTypeDeclarations.concat(
      await Promise.all(
        refsToBuild.map(async (ref) => {
          builtRefs[ref] = true;

          const namespaceParts = splitRef(ref);
          const subSchema = await resolve<Schema, Schema>(
            schema,
            namespaceParts,
          );

          return {
            statement: await generateTypeDeclaration(
              {
                ...context,
                root: namespaceParts.length === 1,
                candidateName: buildIdentifier(
                  namespaceParts[namespaceParts.length - 1],
                ),
                jsonSchemaOptions: {
                  ...context.jsonSchemaOptions,
                },
              },
              subSchema,
            ),
            namespaceParts: namespaceParts.map((part) => buildIdentifier(part)),
          };
        }),
      ),
    );
    refsToBuild = Object.keys(context.seenSchemas).filter(
      (ref) => !builtRefs[ref],
    );
  } while (refsToBuild.length);

  const packageTree: PackageTreeNode[] = [];

  context.sideTypeDeclarations.forEach(({ statement, namespaceParts }) => {
    buildTree(packageTree, namespaceParts, statement);
  }, []);

  return factory.createNodeArray([
    ...statements,
    ...buildModuleDeclarations(context, packageTree),
  ]);
}

export async function generateTypeDeclaration(
  context: Context,
  schema: SchemaDefinition,
): Promise<ts.Statement> {
  const types = await schemaToTypes(context, schema);

  const name = context.buildIdentifier(
    context.candidateName || (schema && (schema as Schema).title) || 'Unknown',
  );
  const isBrandedType =
    name &&
    name !== 'Unknown' &&
    typeof schema !== 'boolean' &&
    (schema.type === 'string' ||
      schema.type === 'number' ||
      schema.type === 'integer' ||
      schema.type === 'boolean') &&
    (context.jsonSchemaOptions.brandedTypes === ALL_TYPES ||
      context.jsonSchemaOptions.brandedTypes.includes(name));
  let finalType =
    types.length > 1 ? factory.createUnionTypeNode(types) : types[0];

  if (isBrandedType) {
    finalType = factory.createIntersectionTypeNode([
      finalType,
      ...(await schemaToTypes(
        { ...context, candidateName: undefined },
        {
          type: 'object',
          properties: {
            _type: { enum: [name as string] },
          },
        },
      )),
    ]);
  }

  return factory.createTypeAliasDeclaration(
    undefined,
    [
      context.root && !context.jsonSchemaOptions.exportNamespaces
        ? factory.createModifier(ts.SyntaxKind.DeclareKeyword)
        : factory.createModifier(ts.SyntaxKind.ExportKeyword),
    ],
    name,
    undefined,
    finalType,
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
    const enumTypes = schema.enum.reduce<string[]>(
      (acc, value) =>
        acc.includes(typeof value) ? acc : [...acc, typeof value],
      [],
    );
    const allEnumValuesAreLiteral = schema.enum
      .filter((value) => value !== null)
      .every((value) => ['number', 'string', 'boolean'].includes(typeof value));
    const enumValuesCanBeEnumType =
      enumTypes.length === 1 &&
      schema.enum.length > 1 &&
      allEnumValuesAreLiteral &&
      enumTypes[0] === 'string';
    const name = schema.title || context.candidateName;

    if (
      enumValuesCanBeEnumType &&
      name &&
      context.jsonSchemaOptions.generateRealEnums
    ) {
      context.sideTypeDeclarations.push({
        statement: factory.createEnumDeclaration(
          [],
          [factory.createModifier(ts.SyntaxKind.ExportKeyword)],
          buildIdentifier(name),
          schema.enum.map((value) =>
            factory.createEnumMember(
              buildIdentifier(value as string),
              factory.createStringLiteral(value as string),
            ),
          ),
        ),
        namespaceParts: ['Enums', buildIdentifier(name)],
      });
      return [buildTypeReference(context, ['Enums', buildIdentifier(name)])];
    }

    if (allEnumValuesAreLiteral) {
      return (schema.enum as Parameters<typeof buildLiteralType>[0][]).map(
        buildLiteralType,
      );
    }

    throw new YError('E_UNSUPPORTED_ENUM', schema.enum);
  } else if (schema.type) {
    return await handleTypedSchema(
      { ...context, candidateName: undefined },
      schema,
    );
  } else if (schema.anyOf || schema.allOf || schema.oneOf) {
    return handleComposedSchemas(
      { ...context, candidateName: undefined },
      schema,
    );
  } else if (parentType) {
    // Inject type from parent
    schema.type = parentType;
    return await handleTypedSchema(
      { ...context, candidateName: undefined },
      schema,
    );
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
            return await buildObjectTypeNode(
              { ...context, candidateName: undefined },
              schema,
            );
          case 'array':
            return await buildArrayTypeNode(
              { ...context, candidateName: undefined },
              schema,
            );
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
  const requiredProperties =
    schema.required && schema.required instanceof Array ? schema.required : [];
  let elements: ts.TypeElement[] = [];

  if (schema.properties) {
    elements = elements.concat(
      await Promise.all(
        Object.keys(schema.properties).map(async (propertyName) => {
          const property = schema.properties?.[
            propertyName
          ] as JSONSchema7Definition;
          const required = requiredProperties.includes(propertyName);
          const readOnly = (property as JSONSchema7).readOnly;
          const types = await schemaToTypes(
            { ...context, candidateName: propertyName },
            property as Schema,
          );

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
  if (requiredProperties.length) {
    elements = elements.concat(
      await Promise.all(
        requiredProperties
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
            const required = requiredProperties.includes(propertyPattern);
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
    schema.items instanceof Array
      ? schema.items
      : 'undefined' !== typeof schema.items
      ? [schema.items]
      : []
  ).filter((s): s is Schema => typeof s !== 'boolean');

  if (schemas.length === 0) {
    return factory.createKeywordTypeNode(ts.SyntaxKind.NeverKeyword);
  }

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
        level === 0 && !context.jsonSchemaOptions.exportNamespaces
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

function buildTypeReference(context: Context, namespaceParts: string[]) {
  return factory.createTypeReferenceNode(
    namespaceParts.reduce<ts.EntityName>(
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
