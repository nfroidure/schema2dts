/* eslint-disable @typescript-eslint/no-namespace */
import camelCase from 'camelcase';
import type {
  JSONSchema4,
  JSONSchema6,
  JSONSchema6Definition,
  JSONSchema6TypeName,
  JSONSchema7,
  JSONSchema7Definition,
} from 'json-schema';
import type { OpenAPIV3_1 } from 'openapi-types';
import ts from 'typescript';
import { YError } from 'yerror';
import type { Statement, NodeArray } from 'typescript';

type SeenReferencesHash = { [refName: string]: boolean };

export type Context = {
  nameResolver: (ref: string) => Promise<string[]>;
  buildIdentifier: (part: string) => string;
  root?: boolean;
  sideTypeDeclarations: { statement: Statement; namespaceParts: string[] }[];
  jsonSchemaOptions: JSONSchemaOptions;
  seenSchemas: SeenReferencesHash;
  candidateName?: string;
};
export type OASContext = Context & {
  oasOptions: OpenAPITypesGenerationOptions;
};

type Schema = JSONSchema4 | JSONSchema6 | JSONSchema7;
type SchemaDefinition =
  | JSONSchema4
  | JSONSchema6Definition
  | JSONSchema7Definition;
type PackageTreeNode = {
  name: string;
  childs: PackageTreeNode[];
  types: Statement[];
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
    .replace(
      /([^a-z]+)([a-z])/gi,
      (_: unknown, $1: string, $2: string) => $1 + $2.toUpperCase(),
    )
    .replace(/[^a-z0-9]/gi, '')
    .replace(/^([0-9])/, (_: unknown, $1: string) => '_' + $1);

  return identifier || 'Unknown';
}

async function resolve<T, U>(root: T, namespaceParts: string[]): Promise<U> {
  return namespaceParts.reduce(
    (curSchema, part) => {
      if (!curSchema) {
        throw new YError('E_RESOLVE', namespaceParts, part);
      }
      return curSchema[part];
    },
    root as unknown as U,
  ) as U;
}

async function ensureResolved<T>(
  root: IngestedDocument,
  object: T | OpenAPIV3_1.ReferenceObject,
): Promise<T> {
  let resolvedObject = object;

  while ('$ref' in (resolvedObject as OpenAPIV3_1.ReferenceObject)) {
    resolvedObject = await resolve<IngestedDocument, T>(
      root,
      splitRef((resolvedObject as OpenAPIV3_1.ReferenceObject).$ref),
    );
  }

  return resolvedObject as T;
}

export const DEFAULT_JSON_SCHEMA_OPTIONS: Required<JSONSchemaOptions> = {
  baseName: 'Main',
  brandedTypes: [],
  generateRealEnums: false,
  tuplesFromFixedArraysLengthLimit: 5,
  exportNamespaces: false,
};
export const DEFAULT_OPEN_API_OPTIONS: OpenAPITypesGenerationOptions = {
  baseName: 'API',
  filterStatuses: [],
  brandedTypes: [],
  generateUnusedSchemas: false,
  camelizeInputs: true,
  generateRealEnums: false,
  tuplesFromFixedArraysLengthLimit: 5,
  exportNamespaces: false,
  requireCleanAPI: false,
};

export type OpenAPITypesGenerationOptions = {
  baseName: string;
  filterStatuses?: (number | 'default')[];
  generateUnusedSchemas?: boolean;
  camelizeInputs?: boolean;
  brandedTypes: string[] | typeof ALL_TYPES | 'schemas';
  generateRealEnums: boolean;
  tuplesFromFixedArraysLengthLimit: number;
  exportNamespaces: boolean;
  requireCleanAPI?: boolean;
};

type IngestedDocument = {
  components: {
    schemas: NonNullable<
      NonNullable<OpenAPIV3_1.Document['components']>['schemas']
    >;
    requestBodies: NonNullable<
      NonNullable<OpenAPIV3_1.Document['components']>['requestBodies']
    >;
    parameters: NonNullable<
      NonNullable<OpenAPIV3_1.Document['components']>['parameters']
    >;
    responses: NonNullable<
      NonNullable<OpenAPIV3_1.Document['components']>['responses']
    >;
    headers: NonNullable<
      NonNullable<OpenAPIV3_1.Document['components']>['headers']
    >;
    pathItems: NonNullable<
      NonNullable<OpenAPIV3_1.Document['components']>['pathItems']
    >;
    callbacks: NonNullable<
      NonNullable<OpenAPIV3_1.Document['components']>['callbacks']
    >;
    operations: Record<string, NonNullable<OpenAPIV3_1.OperationObject>>;
  };
  webhooks: NonNullable<NonNullable<OpenAPIV3_1.Document['webhooks']>>;
  paths: NonNullable<NonNullable<OpenAPIV3_1.Document['paths']>>;
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
 * @param {boolean} options.generateRealEnums
 * @param {boolean} options.exportNamespaces
 * @param {boolean} options.requireCleanAPI
 * @returns {TypeScript.NodeArray}
 */
export async function generateOpenAPITypes(
  inputRoot: OpenAPIV3_1.Document,
  {
    baseName = DEFAULT_OPEN_API_OPTIONS.baseName,
    filterStatuses = DEFAULT_OPEN_API_OPTIONS.filterStatuses,
    generateUnusedSchemas = DEFAULT_OPEN_API_OPTIONS.generateUnusedSchemas,
    camelizeInputs = DEFAULT_OPEN_API_OPTIONS.camelizeInputs,
    brandedTypes = DEFAULT_OPEN_API_OPTIONS.brandedTypes,
    generateRealEnums = DEFAULT_OPEN_API_OPTIONS.generateRealEnums,
    tuplesFromFixedArraysLengthLimit = DEFAULT_OPEN_API_OPTIONS.tuplesFromFixedArraysLengthLimit,
    exportNamespaces = DEFAULT_OPEN_API_OPTIONS.exportNamespaces,
    requireCleanAPI = DEFAULT_OPEN_API_OPTIONS.requireCleanAPI,
  }: Omit<OpenAPITypesGenerationOptions, 'baseName' | 'brandedTypes'> &
    Partial<
      Pick<OpenAPITypesGenerationOptions, 'baseName' | 'brandedTypes'>
    > = DEFAULT_OPEN_API_OPTIONS,
): Promise<NodeArray<Statement>> {
  const root: IngestedDocument = {
    components: {
      schemas: inputRoot.components?.schemas || {},
      requestBodies: inputRoot.components?.requestBodies || {},
      parameters: inputRoot.components?.parameters || {},
      responses: inputRoot.components?.responses || {},
      headers: inputRoot.components?.headers || {},
      callbacks: inputRoot.components?.callbacks || {},
      pathItems: inputRoot.components?.pathItems || {},
      operations: {},
    },
    webhooks: inputRoot.webhooks || {},
    paths: inputRoot.paths || {},
  };

  const context: OASContext = {
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
          : Object.keys(root.components.schemas).map(buildIdentifier),
      generateRealEnums,
      tuplesFromFixedArraysLengthLimit,
      exportNamespaces,
    },
    oasOptions: {
      baseName,
      filterStatuses,
      generateUnusedSchemas,
      camelizeInputs,
      brandedTypes,
      generateRealEnums,
      tuplesFromFixedArraysLengthLimit,
      exportNamespaces,
      requireCleanAPI,
    },
    seenSchemas: {},
  };

  if (generateUnusedSchemas) {
    Object.keys(root.components?.schemas || {}).forEach((schemaName) => {
      const schema = root.components?.schemas?.[
        schemaName
      ] as OpenAPIV3_1.ReferenceObject;

      if ('$ref' in schema) {
        context.seenSchemas[schema.$ref] = true;
      }
      context.seenSchemas[`#/components/schemas/${schemaName}`] = true;
    });
  }

  let hasUnreferenced = true;

  while (hasUnreferenced) {
    hasUnreferenced = false;
    for (const [webhook, pathItem] of Object.entries(root.webhooks)) {
      if ('$ref' in pathItem) {
        continue;
      }

      const identifier = ['webhook', camelCase(webhook)]
        .map(context.buildIdentifier)
        .join('');

      root.components.pathItems[identifier] = pathItem;
      root.webhooks[webhook] = {
        $ref: `#/components/pathItems/${identifier}`,
      };

      hasUnreferenced = true;
    }

    for (const [callbackName, callback] of Object.entries(
      root.components.callbacks,
    )) {
      if ('$ref' in callback) {
        continue;
      }

      for (const [expression, pathItem] of Object.entries(callback)) {
        if ('$ref' in pathItem) {
          continue;
        }

        const identifier = [
          'Callbacks',
          camelCase(callbackName),
          camelCase(expression),
        ]
          .map(context.buildIdentifier)
          .join('');

        root.components.pathItems[identifier] = pathItem;
        root.components.callbacks[callbackName][expression] = {
          $ref: `#/components/pathItems/${identifier}`,
        };

        hasUnreferenced = true;
      }
    }

    for (const [path, pathItem] of Object.entries(root.paths)) {
      if (!pathItem) {
        continue;
      }
      if ('$ref' in pathItem) {
        continue;
      }

      const identifier = context.buildIdentifier(camelCase(path));

      root.components.pathItems[identifier] = pathItem;
      root.paths[path] = {
        $ref: `#/components/pathItems/${identifier}`,
      };

      hasUnreferenced = true;
    }

    for (const [pathId, pathItem] of Object.entries(
      root.components.pathItems,
    )) {
      if ('$ref' in pathItem) {
        continue;
      }

      if ('parameters' in pathItem && pathItem.parameters) {
        for (const name of Object.keys(pathItem.parameters || {})) {
          if ('$ref' in pathItem.parameters[name]) {
            continue;
          }

          const parameterIdentifier = pathId + context.buildIdentifier(name);

          root.components.parameters[parameterIdentifier] =
            pathItem.parameters[name];
          pathItem.parameters = pathItem.parameters || {};
          pathItem.parameters[parameterIdentifier] = {
            $ref: `#/components/parameters/${parameterIdentifier}`,
          };
        }
      }

      for (const [method, pathItemProperty] of Object.entries(pathItem)) {
        const maybeOperationObject = pickOperationObject(
          method,
          pathItemProperty,
        );

        if (!maybeOperationObject) {
          continue;
        }

        const finalOperationObject =
          await ensureResolved<OpenAPIV3_1.OperationObject>(
            root,
            maybeOperationObject,
          );

        const operationId =
          (finalOperationObject.operationId as string) ||
          (context.oasOptions.requireCleanAPI
            ? ''
            : [method, pathId]
                .filter((id) => id)
                .map(context.buildIdentifier)
                .join(''));

        if (!operationId) {
          throw new YError('E_OPERATION_ID_REQUIRED', pathId, method);
        }

        if (!('$ref' in maybeOperationObject)) {
          root.components.operations[operationId] = finalOperationObject;
          pathItem[method] = {
            $ref: `#/components/operations/${operationId}`,
          };
          hasUnreferenced = true;
        }
      }
    }

    for (const [operationId, operation] of Object.entries(
      root.components.operations,
    )) {
      if ('$ref' in operation) {
        continue;
      }

      if ('requestBody' in operation && operation.requestBody) {
        if (!('$ref' in operation.requestBody)) {
          root.components.requestBodies[operationId] = operation.requestBody;
          operation.requestBody = {
            $ref: `#/components/requestBodies/${operationId}`,
          };
          hasUnreferenced = true;
        }
      }

      if ('callbacks' in operation) {
        for (const [callbackName, callback] of Object.entries(
          operation.callbacks || {},
        )) {
          if ('$ref' in callback) {
            continue;
          }

          const uniquePrefix = [
            operationId,
            'Callbacks',
            camelCase(callbackName),
          ]
            .map(context.buildIdentifier)
            .join('');

          root.components.callbacks[uniquePrefix] =
            root.components.callbacks[uniquePrefix] || {};
          root.components.callbacks[uniquePrefix] = callback;
          operation.callbacks = operation.callbacks || {};
          operation.callbacks[callbackName] = {
            $ref: `#/components/callbacks/${uniquePrefix}`,
          };
          hasUnreferenced = true;
        }
      }
    }
  }

  for (const [operationId, operation] of Object.entries(
    root.components.operations,
  )) {
    const allInputs: {
      name: string;
      path: string[];
      required: boolean;
    }[] = [];

    if ('callbacks' in operation && operation.callbacks) {
      for (const callbackName of Object.keys(operation.callbacks)) {
        const callbackRef = operation.callbacks[
          callbackName
        ] as OpenAPIV3_1.ReferenceObject;
        const identifier = context.buildIdentifier(camelCase(callbackName));

        context.sideTypeDeclarations.push({
          namespaceParts: [
            'Components',
            'Operations',
            operationId,
            'Callbacks',
            identifier,
          ],
          statement: ts.factory.createImportEqualsDeclaration(
            [ts.factory.createModifier(ts.SyntaxKind.ExportKeyword)],
            false,
            identifier,
            buildTypeReference(context, [
              'Components',
              'Callbacks',
              context.buildIdentifier(
                splitRef(callbackRef.$ref).pop() as string,
              ),
            ]) as unknown as ts.ModuleReference,
          ),
        });
      }
    }

    if ('requestBody' in operation && operation.requestBody) {
      const requestBodyRef =
        operation.requestBody as OpenAPIV3_1.ReferenceObject;
      const requestBody = await ensureResolved<OpenAPIV3_1.RequestBodyObject>(
        root,
        requestBodyRef,
      );

      allInputs.push({
        name: 'body',
        path: ['Body'],
        required: !!requestBody.required,
      });

      context.sideTypeDeclarations.push({
        namespaceParts: ['Components', 'Operations', operationId, 'Body'],
        statement: ts.factory.createTypeAliasDeclaration(
          [ts.factory.createModifier(ts.SyntaxKind.ExportKeyword)],
          'Body',
          undefined,
          buildTypeReference(context, [
            'Components',
            'RequestBodies',
            context.buildIdentifier(
              splitRef(requestBodyRef.$ref).pop() as string,
            ),
          ]),
        ),
      });
    }

    if ('responses' in operation && operation.responses) {
      const responses = operation.responses;
      const uniquePrefix = `${operationId}Response`;
      let responsesCodes = Object.keys(operation.responses);

      // We filter only if filterStatuses got at least one status code
      if (context.oasOptions.filterStatuses?.length) {
        responsesCodes = responsesCodes.filter((code) =>
          (context.oasOptions.filterStatuses || []).includes(
            code === 'default' ? 'default' : parseInt(code, 10),
          ),
        );
      }

      for (const code of responsesCodes) {
        const uniqueKey = `${uniquePrefix + code}`;

        if (!('$ref' in responses[code])) {
          root.components.responses[uniqueKey] = responses[code];
          responses[code] = {
            $ref: `#/components/responses/${uniqueKey}`,
          };
        }

        context.sideTypeDeclarations.push({
          namespaceParts: [
            'Components',
            'Operations',
            operationId,
            'Responses',
            `$${code}`,
          ],
          statement: ts.factory.createTypeAliasDeclaration(
            [ts.factory.createModifier(ts.SyntaxKind.ExportKeyword)],
            `$${code}`,
            [],
            ts.factory.createTypeReferenceNode(
              ts.factory.createQualifiedName(
                ts.factory.createQualifiedName(
                  ts.factory.createIdentifier('Components'),
                  'Responses',
                ),
                splitRef(
                  (responses[code] as OpenAPIV3_1.ReferenceObject).$ref,
                ).pop() as string,
              ),
              [
                code === 'default'
                  ? ts.factory.createKeywordTypeNode(
                      ts.SyntaxKind.NumberKeyword,
                    )
                  : ts.factory.createLiteralTypeNode(
                      ts.factory.createNumericLiteral(code),
                    ),
              ],
            ),
          ),
        });
      }

      context.sideTypeDeclarations.push({
        namespaceParts: ['Components', 'Operations', operationId, 'Output'],
        statement: ts.factory.createTypeAliasDeclaration(
          [ts.factory.createModifier(ts.SyntaxKind.ExportKeyword)],
          'Output',
          undefined,
          responsesCodes.length
            ? ts.factory.createUnionTypeNode(
                responsesCodes.map((responsesCode) =>
                  ts.factory.createTypeReferenceNode(
                    ts.factory.createQualifiedName(
                      ts.factory.createIdentifier('Responses'),
                      `$${responsesCode}`,
                    ),
                    [],
                  ),
                ),
              )
            : ts.factory.createKeywordTypeNode(ts.SyntaxKind.UnknownKeyword),
        ),
      });
    }

    if (operation.parameters && operation.parameters.length) {
      await Promise.all(
        operation.parameters.map(async (parameter, index) => {
          const uniqueKey = operationId + index;

          if (!('$ref' in parameter)) {
            root.components.parameters[uniqueKey] = parameter;
            (
              operation.parameters as (
                | OpenAPIV3_1.ReferenceObject
                | OpenAPIV3_1.ParameterObject
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
                    | OpenAPIV3_1.ReferenceObject
                    | OpenAPIV3_1.ParameterObject
                  )[]
                )[index] as OpenAPIV3_1.ReferenceObject
              ).$ref,
            ).pop() as string,
          );
          const resolvedParameter =
            await ensureResolved<OpenAPIV3_1.ParameterObject>(root, parameter);

          allInputs.push({
            name: resolvedParameter.name,
            path: ['Parameters', resolvedParameter.name],
            required: !!resolvedParameter.required,
          });
          context.sideTypeDeclarations.push({
            namespaceParts: [
              'Components',
              'Operations',
              operationId,
              'Parameters',
              parameterKey,
            ],
            statement: ts.factory.createTypeAliasDeclaration(
              [ts.factory.createModifier(ts.SyntaxKind.ExportKeyword)],
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
      namespaceParts: ['Components', 'Operations', operationId, 'Input'],
      statement: ts.factory.createTypeAliasDeclaration(
        [ts.factory.createModifier(ts.SyntaxKind.ExportKeyword)],
        'Input',
        undefined,
        ts.factory.createTypeLiteralNode(
          allInputs.map(({ name, path, required }) => {
            return ts.factory.createPropertySignature(
              [ts.factory.createModifier(ts.SyntaxKind.ReadonlyKeyword)],
              context.oasOptions.camelizeInputs ? camelCase(name) : name,
              required
                ? undefined
                : ts.factory.createToken(ts.SyntaxKind.QuestionToken),
              buildTypeReference(context, path),
            );
          }),
        ),
      ),
    });
  }

  for (const [pathId, pathItem] of Object.entries(root.components.pathItems)) {
    if ('$ref' in pathItem) {
      context.sideTypeDeclarations.push({
        namespaceParts: ['Components', 'PathItems', pathId],
        statement: ts.factory.createImportEqualsDeclaration(
          [ts.factory.createModifier(ts.SyntaxKind.ExportKeyword)],
          false,
          pathId,
          buildTypeReference(context, [
            'Components',
            'PathItems',
            splitRef(
              (pathItem as OpenAPIV3_1.ReferenceObject).$ref,
            ).pop() as string,
          ]) as unknown as ts.ModuleReference,
        ),
      });
      continue;
    }

    const finalPathItem = await ensureResolved<OpenAPIV3_1.PathItemObject>(
      root,
      pathItem,
    );

    for (const [method, pathItemProperty] of Object.entries(finalPathItem)) {
      const maybeOperationObject = pickOperationObject(
        method,
        pathItemProperty,
      );

      if (!maybeOperationObject) {
        continue;
      }

      context.sideTypeDeclarations.push({
        namespaceParts: ['Components', 'PathItems', pathId, method],
        statement: ts.factory.createImportEqualsDeclaration(
          [ts.factory.createModifier(ts.SyntaxKind.ExportKeyword)],
          false,
          context.buildIdentifier(method),
          buildTypeReference(context, [
            'Components',
            'Operations',
            splitRef(
              (maybeOperationObject as OpenAPIV3_1.ReferenceObject).$ref,
            ).pop() as string,
          ]) as unknown as ts.ModuleReference,
        ),
      });
    }
  }

  for (const path of Object.keys(root.paths)) {
    const pathItemRef = root.paths[path] as OpenAPIV3_1.ReferenceObject;
    const pathItem = await ensureResolved<OpenAPIV3_1.RequestBodyObject>(
      root,
      pathItemRef,
    );

    for (const method of Object.keys(pathItem)) {
      const maybeOperationObject = pickOperationObject(
        method,
        pathItem[method],
      );

      if (!maybeOperationObject) {
        continue;
      }

      const operationObjectRef =
        maybeOperationObject as OpenAPIV3_1.ReferenceObject;

      context.sideTypeDeclarations.push({
        namespaceParts: [
          context.oasOptions.baseName,
          splitRef(operationObjectRef.$ref).pop() as string,
        ],
        statement: ts.factory.createImportEqualsDeclaration(
          [ts.factory.createModifier(ts.SyntaxKind.ExportKeyword)],
          false,
          splitRef(operationObjectRef.$ref).pop() as string,
          buildTypeReference(context, [
            'Components',
            'Operations',
            context.buildIdentifier(
              splitRef(operationObjectRef.$ref).pop() as string,
            ),
          ]) as unknown as ts.ModuleReference,
        ),
      });
    }
  }

  for (const callbackId of Object.keys(root.components.callbacks)) {
    const callback = root.components.callbacks[callbackId];

    if ('$ref' in callback) {
      context.sideTypeDeclarations.push({
        namespaceParts: ['Components', 'Callbacks', callbackId],
        statement: ts.factory.createImportEqualsDeclaration(
          [ts.factory.createModifier(ts.SyntaxKind.ExportKeyword)],
          false,
          callbackId,
          buildTypeReference(context, [
            'Components',
            'Callbacks',
            splitRef(
              (callback as OpenAPIV3_1.ReferenceObject).$ref,
            ).pop() as string,
          ]) as unknown as ts.ModuleReference,
        ),
      });
    } else {
      for (const expression of Object.keys(
        callback as OpenAPIV3_1.CallbackObject,
      )) {
        const pathItem = callback[expression] as OpenAPIV3_1.ReferenceObject;

        context.sideTypeDeclarations.push({
          namespaceParts: [
            'Components',
            'Callbacks',
            callbackId,
            context.buildIdentifier(camelCase(expression)),
          ],
          statement: ts.factory.createImportEqualsDeclaration(
            [ts.factory.createModifier(ts.SyntaxKind.ExportKeyword)],
            false,
            context.buildIdentifier(camelCase(expression)),
            ts.factory.createTypeReferenceNode(
              ts.factory.createQualifiedName(
                ts.factory.createQualifiedName(
                  ts.factory.createIdentifier('Components'),
                  'PathItems',
                ),
                splitRef(
                  (pathItem as OpenAPIV3_1.ReferenceObject).$ref,
                ).pop() as string,
              ),
              [],
            ) as unknown as ts.ModuleReference,
          ),
        });
      }
    }
  }

  for (const webhookName of Object.keys(root.webhooks)) {
    const webhook = root.webhooks[webhookName];

    if ('$ref' in webhook) {
      context.sideTypeDeclarations.push({
        namespaceParts: ['WebHooks', webhookName],
        statement: ts.factory.createImportEqualsDeclaration(
          [ts.factory.createModifier(ts.SyntaxKind.ExportKeyword)],
          false,
          webhookName,
          buildTypeReference(context, [
            'Components',
            'PathItems',
            splitRef(
              (webhook as OpenAPIV3_1.ReferenceObject).$ref,
            ).pop() as string,
          ]) as unknown as ts.ModuleReference,
        ),
      });
    }
  }

  for (const requestBodyId of Object.keys(root.components.requestBodies)) {
    const requestBody = root.components.requestBodies[requestBodyId];
    let statement: Statement;

    if ('$ref' in requestBody) {
      statement = ts.factory.createTypeAliasDeclaration(
        [ts.factory.createModifier(ts.SyntaxKind.ExportKeyword)],
        requestBodyId,
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
            candidateName: requestBodyId,
          },
          { type: 'any' },
        );
      } else {
        const requestBodySchemasReferences: OpenAPIV3_1.ReferenceObject[] = (
          requestBodySchemas as (
            | OpenAPIV3_1.ReferenceObject
            | OpenAPIV3_1.ArraySchemaObject
            | OpenAPIV3_1.NonArraySchemaObject
          )[]
        ).map((schema, index) => {
          let ref;

          if ('$ref' in schema) {
            ref = schema.$ref;
          } else {
            ref = `#/components/schemas/RequestBodies${requestBodyId}Body${index}`;
            root.components.schemas[
              `RequestBodies${requestBodyId}Body${index}`
            ] = schema;
          }
          context.seenSchemas[ref] = true;
          return { $ref: ref };
        });

        statement = await generateTypeDeclaration(
          {
            ...context,
            candidateName: requestBodyId,
          },
          {
            oneOf: requestBodySchemasReferences,
          },
        );
      }
    }
    context.sideTypeDeclarations.push({
      namespaceParts: ['Components', 'RequestBodies', requestBodyId],
      statement,
    });
  }

  for (const parameterId of Object.keys(root.components.parameters)) {
    const parameter = root.components.parameters[parameterId];

    if ('$ref' in parameter) {
      context.sideTypeDeclarations.push({
        namespaceParts: ['Components', 'Parameters', parameterId],
        statement: ts.factory.createTypeAliasDeclaration(
          [ts.factory.createModifier(ts.SyntaxKind.ExportKeyword)],
          context.buildIdentifier(parameterId),
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
        namespaceParts: ['Components', 'Parameters', parameterId],
        statement: await generateTypeDeclaration(
          {
            ...context,
            candidateName: parameterId,
          },
          parameter.schema || { type: 'any' },
        ),
      });
    }
  }

  for (const responseId of Object.keys(root.components.responses)) {
    const response = root.components.responses[responseId];
    let schemasType: ts.TypeNode;

    if ('$ref' in response) {
      context.sideTypeDeclarations.push({
        namespaceParts: ['Components', 'Responses', responseId],
        statement: ts.factory.createTypeAliasDeclaration(
          [ts.factory.createModifier(ts.SyntaxKind.ExportKeyword)],
          responseId,
          [
            ts.factory.createTypeParameterDeclaration(
              [],
              'S',
              ts.factory.createKeywordTypeNode(ts.SyntaxKind.NumberKeyword),
            ),
          ],
          buildTypeReference(
            context,
            [
              'Components',
              'Responses',
              splitRef(response.$ref).pop() as string,
            ],
            ['S'],
          ),
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
        const responseSchemasReferences: OpenAPIV3_1.ReferenceObject[] = (
          responseSchemas as (
            | OpenAPIV3_1.ReferenceObject
            | OpenAPIV3_1.ArraySchemaObject
            | OpenAPIV3_1.NonArraySchemaObject
          )[]
        ).map((schema, index) => {
          let ref;

          if ('$ref' in schema) {
            ref = schema.$ref;
          } else {
            ref = `#/components/schemas/Responses${responseId}Body${index}`;
            root.components.schemas[`Responses${responseId}Body${index}`] =
              schema;
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
            | OpenAPIV3_1.ReferenceObject
            | OpenAPIV3_1.HeaderObject;
          const uniqueKey = `${responseId}Headers${context.buildIdentifier(
            headerName,
          )}`;
          const resolvedHeader = await ensureResolved(root, header);

          hasRequiredHeaders = hasRequiredHeaders || !!resolvedHeader.required;

          if (!('$ref' in header)) {
            root.components.headers[uniqueKey] = header;
            (response.headers || {})[headerName] = {
              $ref: `#/components/headers/${uniqueKey}`,
            };
          }

          return ts.factory.createPropertySignature(
            [ts.factory.createModifier(ts.SyntaxKind.ReadonlyKeyword)],
            ts.factory.createStringLiteral(headerName.toLowerCase()),
            resolvedHeader.required
              ? undefined
              : ts.factory.createToken(ts.SyntaxKind.QuestionToken),
            buildTypeReference(context, [
              'Components',
              'Headers',
              context.buildIdentifier(
                splitRef(
                  (
                    (response.headers || {})[
                      headerName
                    ] as OpenAPIV3_1.ReferenceObject
                  ).$ref,
                ).pop() as string,
              ),
            ]),
          );
        }),
      );

      context.sideTypeDeclarations.push({
        namespaceParts: ['Components', 'Responses', responseId],
        statement: ts.factory.createTypeAliasDeclaration(
          [ts.factory.createModifier(ts.SyntaxKind.ExportKeyword)],
          responseId,
          [
            ts.factory.createTypeParameterDeclaration(
              [],
              'S',
              ts.factory.createKeywordTypeNode(ts.SyntaxKind.NumberKeyword),
            ),
          ],
          ts.factory.createTypeLiteralNode([
            ts.factory.createPropertySignature(
              [ts.factory.createModifier(ts.SyntaxKind.ReadonlyKeyword)],
              'status',
              undefined,
              ts.factory.createTypeReferenceNode('S'),
            ),
            ts.factory.createPropertySignature(
              [ts.factory.createModifier(ts.SyntaxKind.ReadonlyKeyword)],
              'headers',
              hasRequiredHeaders
                ? undefined
                : ts.factory.createToken(ts.SyntaxKind.QuestionToken),
              ts.factory.createTypeLiteralNode([
                ...headersTypes,
                ts.factory.createIndexSignature(
                  [ts.factory.createModifier(ts.SyntaxKind.ReadonlyKeyword)],
                  [
                    ts.factory.createParameterDeclaration(
                      [],
                      undefined,
                      ts.factory.createIdentifier('name'),
                      undefined,
                      ts.factory.createKeywordTypeNode(
                        ts.SyntaxKind.StringKeyword,
                      ),
                      undefined,
                    ),
                  ],
                  ts.factory.createKeywordTypeNode(
                    ts.SyntaxKind.UnknownKeyword,
                  ),
                ),
              ]),
            ),
            ts.factory.createPropertySignature(
              [ts.factory.createModifier(ts.SyntaxKind.ReadonlyKeyword)],
              'body',
              !responseSchemas.length
                ? ts.factory.createToken(ts.SyntaxKind.QuestionToken)
                : undefined,
              schemasType,
            ),
          ]),
        ),
      });
    }
  }

  for (const headerId of Object.keys(root.components.headers)) {
    const header = root.components.headers[headerId];

    if ('$ref' in header) {
      context.sideTypeDeclarations.push({
        namespaceParts: ['Components', 'Headers', headerId],
        statement: ts.factory.createTypeAliasDeclaration(
          [ts.factory.createModifier(ts.SyntaxKind.ExportKeyword)],
          headerId,
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
        namespaceParts: ['Components', 'Headers', headerId],
        statement: await generateTypeDeclaration(
          {
            ...context,
            candidateName: headerId,
          },
          header.schema || { type: 'any' },
        ),
      });
    }
  }

  return gatherStatements(context, root, []);
}

type JSONSchemaOptions = {
  baseName?: string;
  brandedTypes: string[] | typeof ALL_TYPES;
  generateRealEnums: boolean;
  tuplesFromFixedArraysLengthLimit: number;
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
    tuplesFromFixedArraysLengthLimit = DEFAULT_JSON_SCHEMA_OPTIONS.tuplesFromFixedArraysLengthLimit,
    exportNamespaces = DEFAULT_JSON_SCHEMA_OPTIONS.exportNamespaces,
  }: JSONSchemaOptions = DEFAULT_JSON_SCHEMA_OPTIONS,
): Promise<NodeArray<Statement>> {
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
      tuplesFromFixedArraysLengthLimit,
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
  statements: Statement[],
): Promise<NodeArray<Statement>> {
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

  return ts.factory.createNodeArray([
    ...statements,
    ...buildModuleDeclarations(context, packageTree),
  ]);
}

export async function generateTypeDeclaration(
  context: Context,
  schema: SchemaDefinition,
): Promise<Statement> {
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
    types.length > 1 ? ts.factory.createUnionTypeNode(types) : types[0];

  if (isBrandedType) {
    finalType = ts.factory.createIntersectionTypeNode([
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

  return ts.factory.createTypeAliasDeclaration(
    [
      context.root && !context.jsonSchemaOptions.exportNamespaces
        ? ts.factory.createModifier(ts.SyntaxKind.DeclareKeyword)
        : ts.factory.createModifier(ts.SyntaxKind.ExportKeyword),
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

  return types.length > 1 ? ts.factory.createUnionTypeNode(types) : types[0];
}

async function schemaToTypes(
  context: Context,
  schema: SchemaDefinition,
  parentType?: JSONSchema6TypeName | JSONSchema6TypeName[],
): Promise<ts.TypeNode[]> {
  if (typeof schema === 'boolean') {
    if (schema) {
      return [ts.factory.createKeywordTypeNode(ts.SyntaxKind.UnknownKeyword)];
    } else {
      return [ts.factory.createKeywordTypeNode(ts.SyntaxKind.NeverKeyword)];
    }
  }
  if (schema.type === 'null') {
    return [
      ts.factory.createLiteralTypeNode(
        ts.factory.createToken(ts.SyntaxKind.NullKeyword),
      ),
    ];
  }
  if (typeof schema.type === 'undefined') {
    if ('properties' in schema) {
      schema.type = 'object';
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
        statement: ts.factory.createEnumDeclaration(
          [ts.factory.createModifier(ts.SyntaxKind.ExportKeyword)],
          buildIdentifier(name),
          schema.enum.map((value) =>
            ts.factory.createEnumMember(
              buildIdentifier(value as string),
              ts.factory.createStringLiteral(value as string),
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
  const baseTypes: ts.TypeNode[] = await Promise.all(
    types.map(async (type) => {
      switch (type) {
        case 'null':
          return ts.factory.createLiteralTypeNode(ts.factory.createNull());
        case 'any':
          return ts.factory.createKeywordTypeNode(ts.SyntaxKind.UnknownKeyword);
        case 'boolean':
          return ts.factory.createKeywordTypeNode(ts.SyntaxKind.BooleanKeyword);
        case 'integer':
          return ts.factory.createKeywordTypeNode(ts.SyntaxKind.NumberKeyword);
        case 'number':
          return ts.factory.createKeywordTypeNode(ts.SyntaxKind.NumberKeyword);
        case 'string':
          return ts.factory.createKeywordTypeNode(ts.SyntaxKind.StringKeyword);
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

  // Schema also contains a composed schema, handle it as well and do a intersection with base schema
  if (schema.anyOf || schema.allOf || schema.oneOf) {
    const innerTypes = await handleComposedSchemas(context, schema);

    return [
      ts.factory.createIntersectionTypeNode([...baseTypes, ...innerTypes]),
    ];
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
      ? ts.factory.createUnionTypeNode(innerTypes)
      : innerTypes[0],
  );

  if (schema.oneOf) {
    return [ts.factory.createUnionTypeNode(types)];
  } else if (schema.anyOf) {
    // Not really a union types but no way to express
    // this in TypeScript atm 🤷
    return [ts.factory.createUnionTypeNode(types)];
  } else if (schema.allOf) {
    // Fallback to intersection type which will only work
    // in some situations (see the README)
    return [ts.factory.createIntersectionTypeNode(types)];
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
          const isSuitableAsIdentifierName = /^[a-z_$][a-z0-9_$]*$/i.test(
            propertyName,
          );

          return ts.factory.createPropertySignature(
            readOnly
              ? [ts.factory.createModifier(ts.SyntaxKind.ReadonlyKeyword)]
              : [],
            isSuitableAsIdentifierName
              ? propertyName
              : ts.factory.createStringLiteral(propertyName),
            required
              ? undefined
              : ts.factory.createToken(ts.SyntaxKind.QuestionToken),
            types.length > 1 ? ts.factory.createUnionTypeNode(types) : types[0],
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
            return ts.factory.createPropertySignature(
              [],
              propertyName,
              undefined,
              ts.factory.createKeywordTypeNode(ts.SyntaxKind.UnknownKeyword),
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
                  ? ts.factory.createUnionTypeNode(types)
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
                type: ts.factory.createKeywordTypeNode(
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
      ts.factory.createIndexSignature(
        readOnly
          ? [ts.factory.createModifier(ts.SyntaxKind.ReadonlyKeyword)]
          : [],
        [
          ts.factory.createParameterDeclaration(
            [],
            undefined,
            ts.factory.createIdentifier('pattern'),
            required
              ? ts.factory.createToken(ts.SyntaxKind.QuestionToken)
              : undefined,
            ts.factory.createTypeReferenceNode('string', []),
            undefined,
          ),
        ],
        ts.factory.createUnionTypeNode(types),
      ),
    );
  }

  return ts.factory.createTypeLiteralNode(elements);
}

async function buildArrayTypeNode(
  context: Context,
  schema: Schema,
): Promise<ts.TypeNode> {
  if (typeof schema.maxItems === 'number' && schema.maxItems <= 0) {
    return ts.factory.createArrayTypeNode(
      ts.factory.createKeywordTypeNode(ts.SyntaxKind.NeverKeyword),
    );
  }

  const additionalItems =
    schema.additionalItems ||
    // Backward compatibility with old JSONSchema behavior
    (typeof schema.items !== 'boolean' && !(schema.items instanceof Array)
      ? schema.items
      : undefined);
  const prefixItems: Schema[] =
    // Here, we are supporting the new way to declare tuples
    // in the last JSONSchema Draft
    // (see https://json-schema.org/understanding-json-schema/reference/array#tupleValidation )
    (schema as unknown as { prefixItems: Schema[] }).prefixItems ||
    (typeof schema.items === 'object' && schema.items instanceof Array)
      ? (schema.items as unknown as Schema[])
      : [];

  if (prefixItems.length) {
    const types = (
      await Promise.all(
        prefixItems.map((schema) => schemaToTypes(context, schema)),
      )
    ).map((types) =>
      types.length > 1 ? ts.factory.createUnionTypeNode(types) : types[0],
    );

    if (additionalItems) {
      const additionalTypes = await schemaToTypes(context, additionalItems);

      types.push(
        ts.factory.createRestTypeNode(
          ts.factory.createArrayTypeNode(
            additionalTypes.length > 1
              ? ts.factory.createUnionTypeNode(additionalTypes)
              : additionalTypes[0],
          ),
        ),
      );
    }

    return ts.factory.createTupleTypeNode(types);
  } else {
    const types = additionalItems
      ? await schemaToTypes(context, additionalItems)
      : [ts.factory.createKeywordTypeNode(ts.SyntaxKind.UnknownKeyword)];

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
      return ts.factory.createTupleTypeNode(
        new Array(schema.minItems).fill(
          types.length > 1 ? ts.factory.createUnionTypeNode(types) : types[0],
        ),
      );
    }

    // Switch from arrays to tuples and spread for small min length arrays
    if (
      'minItems' in schema &&
      typeof schema.minItems === 'number' &&
      schema.minItems > 0 &&
      schema.minItems <
        context.jsonSchemaOptions.tuplesFromFixedArraysLengthLimit
    ) {
      return ts.factory.createTupleTypeNode(
        new Array(schema.minItems)
          .fill(
            types.length > 1 ? ts.factory.createUnionTypeNode(types) : types[0],
          )
          .concat(
            ts.factory.createRestTypeNode(
              ts.factory.createArrayTypeNode(
                types.length > 1
                  ? ts.factory.createUnionTypeNode(types)
                  : types[0],
              ),
            ),
          ),
      );
    }

    return ts.factory.createArrayTypeNode(
      types.length > 1 ? ts.factory.createUnionTypeNode(types) : types[0],
    );
  }
}

function buildLiteralType(value: number | string | boolean): ts.TypeNode {
  switch (typeof value) {
    case 'number':
      return ts.factory.createLiteralTypeNode(
        ts.factory.createNumericLiteral(value),
      );
    case 'string':
      return ts.factory.createLiteralTypeNode(
        ts.factory.createStringLiteral(value),
      );
    case 'boolean':
      return ts.factory.createLiteralTypeNode(
        value ? ts.factory.createTrue() : ts.factory.createFalse(),
      );
    case 'object':
      return ts.factory.createLiteralTypeNode(ts.factory.createNull());
  }
}

/**
 * Returns source from a list of TypeScript statements
 * @param {TypedPropertyDescriptor.NodeArray} nodes
 * @returns string
 */
export function toSource(nodes: ts.Node | NodeArray<ts.Node>): string {
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
      : ts.factory.createNodeArray([nodes as ts.Node]),
    resultFile,
  );
}

function buildModuleDeclarations(
  context: Context,
  currentTree: PackageTreeNode[],
  level = 0,
): Statement[] {
  return currentTree.map((treeNode) => {
    // TEMPFIX: Add a const to manage the esbuild-jest problems
    // https://github.com/aelbore/esbuild-jest/issues/54
    const createModuleBlck = ts.factory.createModuleBlock;
    return ts.factory.createModuleDeclaration(
      [
        level === 0 && !context.jsonSchemaOptions.exportNamespaces
          ? ts.factory.createModifier(ts.SyntaxKind.DeclareKeyword)
          : ts.factory.createModifier(ts.SyntaxKind.ExportKeyword),
      ],
      ts.factory.createIdentifier(context.buildIdentifier(treeNode.name)),
      createModuleBlck([
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

function buildTypeReference(
  context: Context,
  namespaceParts: string[],
  withTypeRefs: string[] = [],
) {
  return ts.factory.createTypeReferenceNode(
    namespaceParts.reduce<ts.EntityName>(
      (curNode: ts.EntityName | null, referencePart: string) => {
        const identifier = ts.factory.createIdentifier(
          context.buildIdentifier(referencePart),
        );

        return curNode
          ? ts.factory.createQualifiedName(curNode, identifier)
          : identifier;
      },
      null as unknown as ts.EntityName,
    ),
    withTypeRefs.map((typeRef) => ts.factory.createTypeReferenceNode(typeRef)),
  );
}

function pickOperationObject(
  maybeMethod: string,
  maybeOperationObject: OpenAPIV3_1.PathItemObject[keyof OpenAPIV3_1.PathItemObject],
): OpenAPIV3_1.OperationObject | OpenAPIV3_1.ReferenceObject | undefined {
  if (
    [
      'head',
      'options',
      'get',
      'put',
      'post',
      'delete',
      'patch',
      'trace',
    ].includes(maybeMethod)
  ) {
    return maybeOperationObject as
      | OpenAPIV3_1.OperationObject
      | OpenAPIV3_1.ReferenceObject;
  }
  return undefined;
}
