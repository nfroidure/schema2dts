import camelCase from 'camelcase';
import initDebug from 'debug';
import {
  type JSONSchema4,
  type JSONSchema6Definition,
  type JSONSchema6TypeName,
  type JSONSchema7,
  type JSONSchema7Definition,
} from 'json-schema';
import { type OpenAPIV3_1 } from 'openapi-types';
import {
  SyntaxKind,
  NodeFlags,
  ListFormat,
  NewLineKind,
  ScriptTarget,
  ScriptKind,
  factory,
  isPropertySignature,
  isTypeLiteralNode,
  isModuleDeclaration,
  createPrinter,
  createSourceFile,
  type InterfaceDeclaration,
  type PropertySignature,
  type TypeElement,
  type Statement,
  type NodeArray,
  type Identifier,
  type ModuleDeclaration,
  type ModuleBlock,
  type TypeNode,
  type Node,
  type ModuleReference,
} from 'typescript';
import { YError } from 'yerror';
import {
  buildLiteralType,
  buildTypeReference,
  buildIdentifier,
  buildInterfaceReference,
} from './utils/typeDefinitions.js';
import {
  ensureResolved,
  eventuallyIdentifySchema,
  resolve,
  splitRef,
  type JSONSchema,
} from './utils/schema.js';
import initTypeDefinitionBuilder, {
  type TypeDefinitionBuilderService,
} from './services/typeDefinitionBuilder.js';
import {
  buildAliasFragment,
  buildLinkFragment,
  buildTypeFragment,
  type ComponentFragment,
  type FragmentLocation,
  type StatementFragment,
} from './utils/fragments.js';

export type JSONSchemaContext = {
  baseLocation: Pick<FragmentLocation, 'path' | 'kind' | 'type'>;
  rootSchema?: IngestedDocument | JSONSchema;
  jsonSchemaOptions: JSONSchemaOptions;
  typeDefinitionBuilder: TypeDefinitionBuilderService;
};
export type OASContext = JSONSchemaContext & {
  oasOptions: OpenAPITypesGenerationOptions;
};
type SchemaDefinition =
  | JSONSchema4
  | JSONSchema6Definition
  | JSONSchema7Definition;

const debug = initDebug('schema2dts');

export const ALL_TYPES = 'all' as const;
export const DEFAULT_JSON_SCHEMA_OPTIONS: Required<JSONSchemaOptions> = {
  baseName: 'Main',
  basePath: 'schema.d.ts',
  brandedTypes: [],
  generateRealEnums: false,
  tuplesFromFixedArraysLengthLimit: 5,
  exportNamespaces: false,
};
export const DEFAULT_OPEN_API_OPTIONS: OpenAPITypesGenerationOptions = {
  baseName: 'API',
  basePath: 'openapi.d.ts',
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
  basePath: string;
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
  rootOpenAPI: OpenAPIV3_1.Document,
  {
    baseName = DEFAULT_OPEN_API_OPTIONS.baseName,
    basePath = DEFAULT_OPEN_API_OPTIONS.basePath,
    filterStatuses = DEFAULT_OPEN_API_OPTIONS.filterStatuses,
    generateUnusedSchemas = DEFAULT_OPEN_API_OPTIONS.generateUnusedSchemas,
    camelizeInputs = DEFAULT_OPEN_API_OPTIONS.camelizeInputs,
    brandedTypes = DEFAULT_OPEN_API_OPTIONS.brandedTypes,
    generateRealEnums = DEFAULT_OPEN_API_OPTIONS.generateRealEnums,
    tuplesFromFixedArraysLengthLimit = DEFAULT_OPEN_API_OPTIONS.tuplesFromFixedArraysLengthLimit,
    exportNamespaces = DEFAULT_OPEN_API_OPTIONS.exportNamespaces,
    requireCleanAPI = DEFAULT_OPEN_API_OPTIONS.requireCleanAPI,
  }: Omit<
    OpenAPITypesGenerationOptions,
    'baseName' | 'basePath' | 'brandedTypes'
  > &
    Partial<
      Pick<
        OpenAPITypesGenerationOptions,
        'baseName' | 'basePath' | 'brandedTypes'
      >
    > = DEFAULT_OPEN_API_OPTIONS,
): Promise<NodeArray<Statement>> {
  const root: IngestedDocument = {
    components: {
      schemas: rootOpenAPI.components?.schemas || {},
      requestBodies: rootOpenAPI.components?.requestBodies || {},
      parameters: rootOpenAPI.components?.parameters || {},
      responses: rootOpenAPI.components?.responses || {},
      headers: rootOpenAPI.components?.headers || {},
      callbacks: rootOpenAPI.components?.callbacks || {},
      pathItems: rootOpenAPI.components?.pathItems || {},
      operations: {},
    },
    webhooks: rootOpenAPI.webhooks || {},
    paths: rootOpenAPI.paths || {},
  };
  const typeDefinitionBuilder = await initTypeDefinitionBuilder({
    log: debug,
  });
  const context: OASContext = {
    baseLocation: {
      path: basePath,
      type: exportNamespaces ? 'exported' : 'declared',
      kind: 'type',
    },
    typeDefinitionBuilder,
    rootSchema: root,
    jsonSchemaOptions: {
      baseName,
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
      basePath,
      filterStatuses,
      generateUnusedSchemas,
      camelizeInputs,
      brandedTypes,
      generateRealEnums,
      tuplesFromFixedArraysLengthLimit,
      exportNamespaces,
      requireCleanAPI,
    },
  };

  if (generateUnusedSchemas) {
    Object.keys(root.components?.schemas || {}).forEach((schemaName) => {
      const schema = root.components?.schemas?.[
        schemaName
      ] as OpenAPIV3_1.ReferenceObject;

      if ('$ref' in schema) {
        context.typeDefinitionBuilder.assume(schema.$ref);
      }
      context.typeDefinitionBuilder.assume(
        `#/components/schemas/${schemaName}`,
      );
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
        .map(buildIdentifier)
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
          .map(buildIdentifier)
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

      const identifier = buildIdentifier(camelCase(path));

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

          const parameterIdentifier = pathId + buildIdentifier(name);

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

        const finalOperationObject = await ensureResolved<
          IngestedDocument,
          OpenAPIV3_1.OperationObject
        >(root, maybeOperationObject);

        const operationId =
          (finalOperationObject.operationId as string) ||
          (context.oasOptions.requireCleanAPI
            ? ''
            : [method, pathId]
                .filter((id) => id)
                .map(buildIdentifier)
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
            .map(buildIdentifier)
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

    context.typeDefinitionBuilder.register(
      buildAliasFragment(
        {
          ...context.baseLocation,
          namespace: ['Components', 'Operations', buildIdentifier(operationId)],
        },
        `#/components/operations/${operationId}`,
      ),
    );

    if ('callbacks' in operation && operation.callbacks) {
      for (const callbackName of Object.keys(operation.callbacks)) {
        const callbackRef = operation.callbacks[
          callbackName
        ] as OpenAPIV3_1.ReferenceObject;
        const identifier = buildIdentifier(camelCase(callbackName));

        context.typeDefinitionBuilder.register(
          buildLinkFragment(
            {
              ...context.baseLocation,
              namespace: [
                'Components',
                'Operations',
                buildIdentifier(operationId),
                'Callbacks',
                identifier,
              ],
            },
            callbackRef.$ref,
          ),
        );
      }
    }

    if ('requestBody' in operation && operation.requestBody) {
      const requestBodyRef =
        operation.requestBody as OpenAPIV3_1.ReferenceObject;
      const requestBody = await ensureResolved<
        IngestedDocument,
        OpenAPIV3_1.RequestBodyObject
      >(root, requestBodyRef);

      allInputs.push({
        name: 'body',
        path: ['Body'],
        required: !!requestBody.required,
      });

      context.typeDefinitionBuilder.register(
        buildLinkFragment(
          {
            ...context.baseLocation,
            namespace: [
              'Components',
              'Operations',
              buildIdentifier(operationId),
              'Body',
            ],
          },
          requestBodyRef.$ref,
        ),
      );
    }

    if ('responses' in operation && operation.responses) {
      const responses = operation.responses;
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
        if (!('$ref' in responses[code])) {
          const uniqueKey = `${operationId}${code}`;

          root.components.responses[uniqueKey] = responses[code];
          responses[code] = {
            $ref: `#/components/responses/${uniqueKey}`,
          };
        }

        const ref = (responses[code] as OpenAPIV3_1.ReferenceObject).$ref;

        context.typeDefinitionBuilder.register(
          buildLinkFragment(
            {
              ...context.baseLocation,
              namespace: [
                'Components',
                'Operations',
                buildIdentifier(operationId),
                'Responses',
                `$${code}`,
              ],
            },
            ref,
            [code],
          ),
        );
        context.typeDefinitionBuilder.register(
          buildAliasFragment(
            {
              ...context.baseLocation,
              namespace: [
                'Components',
                'Responses',
                buildIdentifier(splitRef(ref).pop() as string),
              ],
            },
            ref,
            ['S'],
          ),
        );
      }

      context.typeDefinitionBuilder.register(
        buildTypeFragment(
          {
            ...context.baseLocation,
            namespace: [
              'Components',
              'Operations',
              buildIdentifier(operationId),
              'Output',
            ],
          },
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
            : factory.createKeywordTypeNode(SyntaxKind.UnknownKeyword),
        ),
      );
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

          const parameterKey = buildIdentifier(
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
          const resolvedParameter = await ensureResolved<
            IngestedDocument,
            OpenAPIV3_1.ParameterObject
          >(root, parameter);

          allInputs.push({
            name: resolvedParameter.name,
            path: ['Parameters', resolvedParameter.name],
            required: !!resolvedParameter.required,
          });

          context.typeDefinitionBuilder.register(
            buildAliasFragment(
              {
                ...context.baseLocation,
                namespace: ['Components', 'Parameters', parameterKey],
              },
              `#/components/parameters/${uniqueKey}`,
            ),
          );
          context.typeDefinitionBuilder.register(
            buildLinkFragment(
              {
                ...context.baseLocation,
                namespace: [
                  'Components',
                  'Operations',
                  buildIdentifier(operationId),
                  'Parameters',
                  buildIdentifier(resolvedParameter.name),
                ],
              },
              `#/components/parameters/${uniqueKey}`,
            ),
          );
        }),
      );
    }

    context.typeDefinitionBuilder.register(
      buildTypeFragment(
        {
          ...context.baseLocation,
          namespace: [
            'Components',
            'Operations',
            buildIdentifier(operationId),
            'Input',
          ],
        },
        factory.createTypeLiteralNode(
          allInputs.map(({ name, path, required }) => {
            return factory.createPropertySignature(
              [factory.createModifier(SyntaxKind.ReadonlyKeyword)],
              context.oasOptions.camelizeInputs ? camelCase(name) : name,
              required
                ? undefined
                : factory.createToken(SyntaxKind.QuestionToken),
              buildTypeReference(path.map(buildIdentifier)),
            );
          }),
        ),
      ),
    );
  }

  for (const [pathId, pathItem] of Object.entries(root.components.pathItems)) {
    if ('$ref' in pathItem) {
      context.typeDefinitionBuilder.register(
        buildLinkFragment(
          {
            ...context.baseLocation,
            namespace: ['Components', 'PathItems', pathId],
            type: 'imported',
          },
          (pathItem as OpenAPIV3_1.ReferenceObject).$ref,
        ),
      );
      continue;
    }

    context.typeDefinitionBuilder.register(
      buildAliasFragment(
        {
          ...context.baseLocation,
          namespace: ['Components', 'PathItems', pathId],
          type: 'imported',
        },
        `#/components/pathItems/${pathId}`,
      ),
    );

    const finalPathItem = await ensureResolved<
      IngestedDocument,
      OpenAPIV3_1.PathItemObject
    >(root, pathItem);

    for (const [method, pathItemProperty] of Object.entries(finalPathItem)) {
      const maybeOperationObject = pickOperationObject(
        method,
        pathItemProperty,
      );

      if (!maybeOperationObject) {
        continue;
      }

      context.typeDefinitionBuilder.register(
        buildLinkFragment(
          {
            ...context.baseLocation,
            namespace: [
              'Components',
              'PathItems',
              pathId,
              buildIdentifier(method),
            ],
            type: 'imported',
          },
          (maybeOperationObject as OpenAPIV3_1.ReferenceObject).$ref,
        ),
      );
    }
  }

  for (const path of Object.keys(root.paths)) {
    const pathItemRef = root.paths[path] as OpenAPIV3_1.ReferenceObject;
    const pathItem = await ensureResolved<
      IngestedDocument,
      OpenAPIV3_1.RequestBodyObject
    >(root, pathItemRef);

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

      const identifier = buildIdentifier(
        splitRef(operationObjectRef.$ref).pop() as string,
      );

      context.typeDefinitionBuilder.register(
        buildLinkFragment(
          {
            ...context.baseLocation,
            namespace: [context.oasOptions.baseName, identifier],
            type: 'imported',
          },
          operationObjectRef.$ref,
        ),
      );
    }
  }

  for (const callbackId of Object.keys(root.components.callbacks)) {
    const callback = root.components.callbacks[callbackId];

    if ('$ref' in callback) {
      context.typeDefinitionBuilder.register(
        buildLinkFragment(
          {
            ...context.baseLocation,
            namespace: ['Components', 'Callbacks', callbackId],
          },
          (callback as OpenAPIV3_1.ReferenceObject).$ref,
        ),
      );
    } else {
      context.typeDefinitionBuilder.register(
        buildAliasFragment(
          {
            ...context.baseLocation,
            namespace: ['Components', 'Callbacks', callbackId],
          },
          `#/components/callbacks/${callbackId}`,
        ),
      );

      for (const expression of Object.keys(
        callback as OpenAPIV3_1.CallbackObject,
      )) {
        const pathItem = callback[expression] as OpenAPIV3_1.ReferenceObject;

        context.typeDefinitionBuilder.register(
          buildLinkFragment(
            {
              ...context.baseLocation,
              namespace: [
                'Components',
                'Callbacks',
                callbackId,
                buildIdentifier(camelCase(expression)),
              ],
            },
            (pathItem as OpenAPIV3_1.ReferenceObject).$ref,
          ),
        );
      }
    }
  }

  for (const webhookName of Object.keys(root.webhooks)) {
    const webhook = root.webhooks[webhookName];

    if ('$ref' in webhook) {
      context.typeDefinitionBuilder.register(
        buildLinkFragment(
          {
            ...context.baseLocation,
            namespace: ['WebHooks', buildIdentifier(webhookName)],
          },
          (webhook as OpenAPIV3_1.ReferenceObject).$ref,
        ),
      );
    }
  }

  for (const requestBodyId of Object.keys(root.components.requestBodies)) {
    const requestBody = root.components.requestBodies[requestBodyId];

    if ('$ref' in requestBody) {
      context.typeDefinitionBuilder.register(
        buildLinkFragment(
          {
            ...context.baseLocation,
            namespace: [
              'Components',
              'RequestBodies',
              buildIdentifier(requestBodyId),
            ],
          },
          requestBody.$ref,
        ),
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
        context.typeDefinitionBuilder.register(
          buildTypeFragment(
            {
              ...context.baseLocation,
              namespace: [
                'Components',
                'RequestBodies',
                buildIdentifier(requestBodyId),
              ],
            },
            await schemaToTypeNode(context, { type: 'any' }),
          ),
        );
      } else {
        const requestBodySchemasReferences: OpenAPIV3_1.ReferenceObject[] = (
          requestBodySchemas as (
            | OpenAPIV3_1.ReferenceObject
            | OpenAPIV3_1.ArraySchemaObject
            | OpenAPIV3_1.NonArraySchemaObject
          )[]
        ).map((schema, index) => {
          let ref: string;

          if ('$ref' in schema) {
            ref = schema.$ref;
          } else {
            const uniqueKey = `RequestBodies${buildIdentifier(requestBodyId)}Body${index}`;

            ref = `#/components/schemas/${uniqueKey}`;
            root.components.schemas[uniqueKey] = schema;
          }

          context.typeDefinitionBuilder.assume(ref);

          return { $ref: ref };
        });

        context.typeDefinitionBuilder.register(
          buildTypeFragment(
            {
              ...context.baseLocation,
              namespace: [
                'Components',
                'RequestBodies',
                buildIdentifier(requestBodyId),
              ],
            },
            await schemaToTypeNode(context, {
              oneOf: requestBodySchemasReferences,
            }),
            [],
            `#/components/requestBodies/${requestBodyId}`,
          ),
        );
      }
    }
  }

  for (const parameterId of Object.keys(root.components.parameters)) {
    const parameter = root.components.parameters[parameterId];

    if ('$ref' in parameter) {
      context.typeDefinitionBuilder.register(
        buildLinkFragment(
          {
            ...context.baseLocation,
            namespace: [
              'Components',
              'Parameters',
              buildIdentifier(parameterId),
            ],
          },
          parameter.$ref,
        ),
      );
    } else {
      const identifier = buildIdentifier(parameterId);

      context.typeDefinitionBuilder.register(
        buildTypeFragment(
          {
            ...context.baseLocation,
            namespace: ['Components', 'Parameters', identifier],
          },
          await schemaToTypeNode(
            context,
            eventuallyIdentifySchema(
              parameter.schema || { type: 'any' },
              identifier,
            ),
          ),
          [],
          `#/components/parameters/${parameterId}`,
        ),
      );
    }
  }

  for (const responseId of Object.keys(root.components.responses)) {
    const response = root.components.responses[responseId];
    let schemasType: TypeNode;

    if ('$ref' in response) {
      context.typeDefinitionBuilder.register(
        buildLinkFragment(
          {
            ...context.baseLocation,
            namespace: ['Components', 'Responses', buildIdentifier(responseId)],
            parameters: [
              factory.createTypeParameterDeclaration(
                [],
                'S',
                factory.createKeywordTypeNode(SyntaxKind.NumberKeyword),
              ),
            ],
          },
          response.$ref,
          ['S'],
        ),
      );
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

          context.typeDefinitionBuilder.assume(ref);

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
          const uniqueKey = `${responseId}Headers${buildIdentifier(
            headerName,
          )}`;
          const resolvedHeader = await ensureResolved<
            IngestedDocument,
            OpenAPIV3_1.HeaderObject
          >(root, header);

          hasRequiredHeaders = hasRequiredHeaders || !!resolvedHeader.required;

          if (!('$ref' in header)) {
            root.components.headers[uniqueKey] = header;
            (response.headers || {})[headerName] = {
              $ref: `#/components/headers/${uniqueKey}`,
            };
          }

          return factory.createPropertySignature(
            [factory.createModifier(SyntaxKind.ReadonlyKeyword)],
            factory.createStringLiteral(headerName.toLowerCase()),
            resolvedHeader.required
              ? undefined
              : factory.createToken(SyntaxKind.QuestionToken),
            buildTypeReference([
              'Components',
              'Headers',
              buildIdentifier(
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

      context.typeDefinitionBuilder.register(
        buildTypeFragment(
          {
            ...context.baseLocation,
            namespace: ['Components', 'Responses', buildIdentifier(responseId)],
            kind: 'type',
            type: 'exported',
            parameters: [
              factory.createTypeParameterDeclaration(
                [],
                'S',
                factory.createKeywordTypeNode(SyntaxKind.NumberKeyword),
              ),
            ],
          },
          factory.createTypeLiteralNode([
            factory.createPropertySignature(
              [factory.createModifier(SyntaxKind.ReadonlyKeyword)],
              'status',
              undefined,
              factory.createTypeReferenceNode('S'),
            ),
            factory.createPropertySignature(
              [factory.createModifier(SyntaxKind.ReadonlyKeyword)],
              'headers',
              hasRequiredHeaders
                ? undefined
                : factory.createToken(SyntaxKind.QuestionToken),
              factory.createTypeLiteralNode([
                ...headersTypes,
                factory.createIndexSignature(
                  [factory.createModifier(SyntaxKind.ReadonlyKeyword)],
                  [
                    factory.createParameterDeclaration(
                      [],
                      undefined,
                      factory.createIdentifier('name'),
                      undefined,
                      factory.createKeywordTypeNode(SyntaxKind.StringKeyword),
                      undefined,
                    ),
                  ],
                  factory.createKeywordTypeNode(SyntaxKind.UnknownKeyword),
                ),
              ]),
            ),
            factory.createPropertySignature(
              [factory.createModifier(SyntaxKind.ReadonlyKeyword)],
              'body',
              !responseSchemas.length
                ? factory.createToken(SyntaxKind.QuestionToken)
                : undefined,
              schemasType,
            ),
          ]),
        ),
      );
    }
  }

  for (const headerId of Object.keys(root.components.headers)) {
    const header = root.components.headers[headerId];

    if ('$ref' in header) {
      context.typeDefinitionBuilder.register(
        buildLinkFragment(
          {
            ...context.baseLocation,
            namespace: ['Components', 'Headers', buildIdentifier(headerId)],
          },
          header.$ref,
          [],
          `#/components/headers/${headerId}`,
        ),
      );
    } else {
      const identifier = buildIdentifier(headerId);

      context.typeDefinitionBuilder.register(
        buildTypeFragment(
          {
            ...context.baseLocation,
            namespace: ['Components', 'Headers', identifier],
          },
          await schemaToTypeNode(
            context,
            eventuallyIdentifySchema(
              header.schema || { type: 'any' },
              buildIdentifier(headerId),
            ),
          ),
          [],
          `#/components/headers/${headerId}`,
        ),
      );
    }
  }

  return gatherStatements(context);
}

type JSONSchemaOptions = {
  baseName?: string;
  basePath?: string;
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
  rootSchema: JSONSchema,
  {
    baseName = DEFAULT_JSON_SCHEMA_OPTIONS.baseName,
    basePath = DEFAULT_JSON_SCHEMA_OPTIONS.basePath,
    brandedTypes = DEFAULT_JSON_SCHEMA_OPTIONS.brandedTypes,
    generateRealEnums = DEFAULT_JSON_SCHEMA_OPTIONS.generateRealEnums,
    tuplesFromFixedArraysLengthLimit = DEFAULT_JSON_SCHEMA_OPTIONS.tuplesFromFixedArraysLengthLimit,
    exportNamespaces = DEFAULT_JSON_SCHEMA_OPTIONS.exportNamespaces,
  }: JSONSchemaOptions = DEFAULT_JSON_SCHEMA_OPTIONS,
): Promise<NodeArray<Statement>> {
  debug('generateJSONSchemaTypes: start');
  const typeDefinitionBuilder = await initTypeDefinitionBuilder({
    log: debug,
  });
  const context: JSONSchemaContext = {
    baseLocation: {
      path: basePath,
      type: exportNamespaces ? 'exported' : 'declared',
      kind: 'type',
    },
    typeDefinitionBuilder,
    rootSchema,
    jsonSchemaOptions: {
      baseName,
      brandedTypes,
      generateRealEnums,
      tuplesFromFixedArraysLengthLimit,
      exportNamespaces,
    },
  };

  const typeNode = await schemaToTypeNode(context, rootSchema);
  const identifier = buildIdentifier(
    baseName || rootSchema?.title || 'Unknown',
  );
  const finalSchema = eventuallyIdentifySchema(rootSchema, identifier);
  const finalType = await eventuallyBrandType(context, finalSchema, typeNode);

  context.typeDefinitionBuilder.register({
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
  });

  return gatherStatements(context);
}

export async function gatherStatements(
  context: JSONSchemaContext,
): Promise<NodeArray<Statement>> {
  const statements: Statement[] = [];
  let assumedFragmentsToBuild = context.typeDefinitionBuilder.list('assumed');

  debug('gatherStatements: start');

  while (assumedFragmentsToBuild.length) {
    for (const assumedFragmentToBuild of assumedFragmentsToBuild) {
      const namespaceParts = splitRef(assumedFragmentToBuild.ref);
      const subSchema = await resolve<JSONSchema, JSONSchema>(
        context.rootSchema as JSONSchema,
        namespaceParts,
      );

      debug(
        'assumed: ' + assumedFragmentToBuild.ref,
        subSchema,
        assumedFragmentToBuild,
      );

      if (subSchema.$ref) {
        context.typeDefinitionBuilder.register(
          buildLinkFragment(
            {
              ...context.baseLocation,
              namespace: namespaceParts.map((part) => buildIdentifier(part)),
            },
            subSchema.$ref,
            [],
            assumedFragmentToBuild.ref,
          ),
        );
        continue;
      }

      const identifier = buildIdentifier(
        namespaceParts[namespaceParts.length - 1],
      );
      const finalSchema = eventuallyIdentifySchema(
        namespaceParts[0] === 'components' && namespaceParts[1] !== 'schemas'
          ? (subSchema as { schema: JSONSchema }).schema
          : subSchema,
        identifier,
      );

      context.typeDefinitionBuilder.register({
        ref: assumedFragmentToBuild.ref,
        location: {
          ...context.baseLocation,
          namespace: namespaceParts.map((part) => buildIdentifier(part)),
        },
        type:
          namespaceParts[0] === 'components' && namespaceParts[1] !== 'schemas'
            ? 'component'
            : 'schema',
        componentType: namespaceParts[1] as ComponentFragment['componentType'],
        typeNode: await eventuallyBrandType(
          context,
          finalSchema,
          await schemaToTypeNode(context, finalSchema),
        ),
      });
    }

    assumedFragmentsToBuild = context.typeDefinitionBuilder.list('assumed');
  }

  const fragments = context.typeDefinitionBuilder.list();

  const interfaceStatements = fragments.reduce((statements, fragment) => {
    if (!('location' in fragment) || fragment.location.kind !== 'interface') {
      return statements;
    }
    const namespace = fragment.location.namespace;

    let interfaceDeclaration = statements.find(
      (d) => d.name.text === namespace[0],
    );
    let curTypeElements: TypeElement[] =
      (interfaceDeclaration?.members as unknown as TypeElement[]) ||
      ([] as TypeElement[]);

    if (!interfaceDeclaration) {
      interfaceDeclaration = factory.createInterfaceDeclaration(
        [
          context.jsonSchemaOptions.exportNamespaces
            ? factory.createModifier(SyntaxKind.ExportKeyword)
            : factory.createModifier(SyntaxKind.DeclareKeyword),
        ],
        factory.createIdentifier(namespace[0]),
        undefined,
        undefined,
        curTypeElements,
      );

      statements.push(interfaceDeclaration);
    }

    for (let i = 1; i < namespace.length - 1; i++) {
      let propertySignature: PropertySignature | undefined =
        curTypeElements.find(
          (e) =>
            e &&
            isPropertySignature(e) &&
            (e.name as Identifier).text === namespace[i],
        ) as PropertySignature;
      const typeNode = propertySignature?.type;
      const typeElements =
        (typeNode && isTypeLiteralNode(typeNode) && typeNode.members) ||
        ([] as TypeElement[]);

      if (!propertySignature) {
        propertySignature = factory.createPropertySignature(
          undefined,
          factory.createIdentifier(namespace[i]),
          undefined,
          factory.createTypeLiteralNode(typeElements),
        );
        curTypeElements.push(propertySignature);
      }
      curTypeElements = typeElements as TypeElement[];
    }

    if (fragment.type === 'link') {
      const linkedFragment = context.typeDefinitionBuilder.find(
        fragment.destination,
      );

      if (!linkedFragment) {
        debug(`could not find ${fragment.destination}`);
        return statements;
      }
      if (!('location' in linkedFragment)) {
        debug(`could not locate ${fragment.destination}`);
        return statements;
      }

      curTypeElements.push(
        factory.createPropertySignature(
          undefined,
          factory.createIdentifier(namespace[namespace.length - 1]),
          undefined,
          linkedFragment.location.kind === 'interface'
            ? buildInterfaceReference(linkedFragment.location.namespace)
            : buildTypeReference(
                linkedFragment.location.namespace,
                fragment.parameters,
              ),
        ),
      );
    } else if ('typeNode' in fragment && fragment.type !== 'typeDeclaration') {
      curTypeElements.push(
        factory.createPropertySignature(
          undefined,
          factory.createIdentifier(namespace[namespace.length - 1]),
          undefined,
          fragment.typeNode,
        ),
      );
    } else {
      debug('bad fragment', fragment);
    }

    return statements;
  }, [] as InterfaceDeclaration[]);

  const typeStatements = fragments.reduce((statements, fragment) => {
    if (!('location' in fragment) || fragment.location.kind !== 'type') {
      return statements;
    }

    const namespace = fragment.location.namespace;
    // TEMPFIX: Add a const to manage the esbuild-jest problems
    // https://github.com/aelbore/esbuild-jest/issues/54
    const createModuleBlck = factory.createModuleBlock;
    let moduleDeclaration = statements.find(
      (d) => d.name.text === namespace[0],
    );
    let curTypeModuleDeclarations =
      ((moduleDeclaration?.body as ModuleBlock)?.statements as unknown as (
        | ModuleDeclaration
        | Statement
      )[]) || ([] as (ModuleDeclaration | Statement)[]);

    if (!moduleDeclaration) {
      moduleDeclaration = factory.createModuleDeclaration(
        [
          context.jsonSchemaOptions.exportNamespaces
            ? factory.createModifier(SyntaxKind.ExportKeyword)
            : factory.createModifier(SyntaxKind.DeclareKeyword),
        ],
        factory.createIdentifier(buildIdentifier(namespace[0])),
        createModuleBlck(curTypeModuleDeclarations),
        NodeFlags.Namespace | NodeFlags.ExportContext | NodeFlags.ContextFlags,
      );

      statements.push(moduleDeclaration);
    }

    for (let i = 1; i < namespace.length - 1; i++) {
      let moduleDeclaration: ModuleDeclaration | undefined =
        curTypeModuleDeclarations.find(
          (e) =>
            e &&
            isModuleDeclaration(e) &&
            (e.name as Identifier).text === namespace[i],
        ) as ModuleDeclaration;
      const typeElements =
        ((moduleDeclaration?.body as ModuleBlock)?.statements as unknown as (
          | ModuleDeclaration
          | Statement
        )[]) || ([] as (ModuleDeclaration | Statement)[]);

      if (!moduleDeclaration) {
        moduleDeclaration = factory.createModuleDeclaration(
          [factory.createModifier(SyntaxKind.ExportKeyword)],
          factory.createIdentifier(namespace[i]),
          createModuleBlck(typeElements),
          NodeFlags.Namespace |
            NodeFlags.ExportContext |
            NodeFlags.ContextFlags,
        );
        curTypeModuleDeclarations.push(moduleDeclaration);
      }
      curTypeModuleDeclarations = typeElements;
    }

    if (fragment.type === 'link') {
      const linkedFragment = context.typeDefinitionBuilder.find(
        fragment.destination,
      );

      if (!linkedFragment) {
        debug(`could not find ${fragment.destination}`);
        return statements;
      }
      if (!('location' in linkedFragment)) {
        debug(`could not locate ${fragment.destination}`);
        return statements;
      }

      if (
        fragment.parameters?.length &&
        fragment.parameters?.length !==
          linkedFragment.location?.parameters?.length
      ) {
        debug('bad parameters:', fragment, linkedFragment);
      }

      curTypeModuleDeclarations.push(
        linkedFragment.type === 'alias' &&
          !linkedFragment.parameters?.length &&
          fragment.location.type === 'imported'
          ? factory.createImportEqualsDeclaration(
              [factory.createModifier(SyntaxKind.ExportKeyword)],
              false,
              factory.createIdentifier(namespace[namespace.length - 1]),
              (linkedFragment.location.kind === 'interface'
                ? buildInterfaceReference(linkedFragment.location.namespace)
                : buildTypeReference(
                    linkedFragment.location.namespace,
                    fragment.parameters,
                  )) as unknown as ModuleReference,
            )
          : factory.createTypeAliasDeclaration(
              [factory.createModifier(SyntaxKind.ExportKeyword)],
              factory.createIdentifier(namespace[namespace.length - 1]),
              fragment.location.parameters || undefined,
              linkedFragment.location.kind === 'interface'
                ? buildInterfaceReference(linkedFragment.location.namespace)
                : buildTypeReference(
                    linkedFragment.location.namespace,
                    fragment.parameters,
                  ),
            ),
      );
    } else if (fragment.type === 'typeDeclaration') {
      curTypeModuleDeclarations.push(fragment.typeNode);
    } else if (fragment.type !== 'alias' && 'typeNode' in fragment) {
      curTypeModuleDeclarations.push(
        factory.createTypeAliasDeclaration(
          [factory.createModifier(SyntaxKind.ExportKeyword)],
          factory.createIdentifier(namespace[namespace.length - 1]),
          fragment.location.parameters || undefined,
          fragment.typeNode,
        ),
      );
    } else {
      debug('bad fragment', fragment);
    }

    return statements;
  }, [] as ModuleDeclaration[]);

  const statementsFragments = fragments.filter(
    (fragment): fragment is StatementFragment =>
      fragment.type === 'statement' && 'statement' in fragment,
  ) as StatementFragment[];

  return factory.createNodeArray([
    ...statements,
    ...statementsFragments.map((fragment) => fragment.statement),
    ...interfaceStatements,
    ...typeStatements,
  ]);
}

export async function eventuallyBrandType(
  context: JSONSchemaContext,
  schema: SchemaDefinition,
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
      ...(await schemaToTypes(context, {
        type: 'object',
        properties: {
          _type: { enum: [name as string] },
        },
      })),
    ]);
  }

  return typeNode;
}

async function schemaToTypeNode(
  context: JSONSchemaContext,
  schema: SchemaDefinition,
): Promise<TypeNode> {
  const types = await schemaToTypes(context, schema);

  return types.length > 1 ? factory.createUnionTypeNode(types) : types[0];
}

async function schemaToTypes(
  context: JSONSchemaContext,
  schema: SchemaDefinition,
  parentType?: JSONSchema6TypeName | JSONSchema6TypeName[],
): Promise<TypeNode[]> {
  if (typeof schema === 'boolean') {
    if (schema) {
      return [factory.createKeywordTypeNode(SyntaxKind.UnknownKeyword)];
    } else {
      return [factory.createKeywordTypeNode(SyntaxKind.NeverKeyword)];
    }
  }
  if (schema.type === 'null') {
    return [
      factory.createLiteralTypeNode(
        factory.createToken(SyntaxKind.NullKeyword),
      ),
    ];
  }
  if (typeof schema.type === 'undefined') {
    if ('properties' in schema) {
      schema.type = 'object';
    }
  }

  if (schema.$ref) {
    context.typeDefinitionBuilder?.assume(schema.$ref);

    const referenceParts = splitRef(schema.$ref);

    return [buildTypeReference(referenceParts.map(buildIdentifier))];
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
    const name = schema.title;

    if (
      enumValuesCanBeEnumType &&
      name &&
      context.jsonSchemaOptions.generateRealEnums
    ) {
      const identifier = buildIdentifier(name);

      context.typeDefinitionBuilder.register({
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
      });
      return [buildTypeReference(['Enums', identifier])];
    }

    if (allEnumValuesAreLiteral) {
      return (schema.enum as Parameters<typeof buildLiteralType>[0][]).map(
        buildLiteralType,
      );
    }

    throw new YError('E_UNSUPPORTED_ENUM', schema.enum);
  } else if (schema.type) {
    return await handleTypedSchema(context, schema);
  } else if (schema.anyOf || schema.allOf || schema.oneOf) {
    return handleComposedSchemas(context, schema);
  } else if (parentType) {
    // Inject type from parent
    schema.type = parentType;
    return await handleTypedSchema(context, schema);
  }

  throw new YError('E_UNSUPPORTED_SCHEMA', schema);
}

// Handle schema where type is defined
async function handleTypedSchema(
  context: JSONSchemaContext,
  schema: JSONSchema,
): Promise<TypeNode[]> {
  const types = schema.type instanceof Array ? schema.type : [schema.type];
  const baseTypes: TypeNode[] = await Promise.all(
    types.map(async (type) => {
      switch (type) {
        case 'null':
          return factory.createLiteralTypeNode(factory.createNull());
        case 'any':
          return factory.createKeywordTypeNode(SyntaxKind.UnknownKeyword);
        case 'boolean':
          return factory.createKeywordTypeNode(SyntaxKind.BooleanKeyword);
        case 'integer':
          return factory.createKeywordTypeNode(SyntaxKind.NumberKeyword);
        case 'number':
          return factory.createKeywordTypeNode(SyntaxKind.NumberKeyword);
        case 'string':
          return factory.createKeywordTypeNode(SyntaxKind.StringKeyword);
        case 'object':
          return await buildObjectTypeNode(context, schema);
        case 'array':
          return await buildArrayTypeNode(context, schema);
        default:
          throw new YError('E_BAD_TYPE', type);
      }
    }),
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
  context: JSONSchemaContext,
  schema: JSONSchema,
): Promise<TypeNode[]> {
  const types = (
    await Promise.all(
      ((schema.anyOf || schema.allOf || schema.oneOf) as JSONSchema[]).map(
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
  context: JSONSchemaContext,
  schema: JSONSchema,
): Promise<TypeNode> {
  const requiredProperties =
    schema.required && schema.required instanceof Array ? schema.required : [];
  let elements: TypeElement[] = [];

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
            context,
            eventuallyIdentifySchema(property as JSONSchema, propertyName),
          );
          const isSuitableAsIdentifierName = /^[a-z_$][a-z0-9_$]*$/i.test(
            propertyName,
          );

          return factory.createPropertySignature(
            readOnly
              ? [factory.createModifier(SyntaxKind.ReadonlyKeyword)]
              : [],
            isSuitableAsIdentifierName
              ? propertyName
              : factory.createStringLiteral(propertyName),
            required
              ? undefined
              : factory.createToken(SyntaxKind.QuestionToken),
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
              factory.createKeywordTypeNode(SyntaxKind.UnknownKeyword),
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
            const types = await schemaToTypes(context, property as JSONSchema);

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
                type: factory.createKeywordTypeNode(SyntaxKind.UnknownKeyword),
                required: false,
                readOnly: false,
              },
            ]
          : [],
      )
      .reduce<{ readOnly: boolean; required: boolean; types: TypeNode[] }>(
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

  return factory.createTypeLiteralNode(elements);
}

async function buildArrayTypeNode(
  context: JSONSchemaContext,
  schema: JSONSchema,
): Promise<TypeNode> {
  if (typeof schema.maxItems === 'number' && schema.maxItems <= 0) {
    return factory.createArrayTypeNode(
      factory.createKeywordTypeNode(SyntaxKind.NeverKeyword),
    );
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
    const types = (
      await Promise.all(
        prefixItems.map((schema) => schemaToTypes(context, schema)),
      )
    ).map((types) =>
      types.length > 1 ? factory.createUnionTypeNode(types) : types[0],
    );

    if (additionalItems) {
      const additionalTypes = await schemaToTypes(context, additionalItems);

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

    return factory.createTupleTypeNode(types);
  } else {
    const types = additionalItems
      ? await schemaToTypes(context, additionalItems)
      : [factory.createKeywordTypeNode(SyntaxKind.UnknownKeyword)];

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
      return factory.createTupleTypeNode(
        new Array(schema.minItems).fill(
          types.length > 1 ? factory.createUnionTypeNode(types) : types[0],
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
      return factory.createTupleTypeNode(
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
      );
    }

    return factory.createArrayTypeNode(
      types.length > 1 ? factory.createUnionTypeNode(types) : types[0],
    );
  }
}

/**
 * Returns source from a list of TypeScript statements
 * @param {TypedPropertyDescriptor.NodeArray} nodes
 * @returns string
 */
export function toSource(nodes: Node | NodeArray<Node>): string {
  const resultFile = createSourceFile(
    'someFileName.ts',
    '',
    ScriptTarget.Latest,
    /*setParentNodes*/ false,
    ScriptKind.TS,
  );
  const printer = createPrinter({
    newLine: NewLineKind.LineFeed,
  });
  return printer.printList(
    ListFormat.SourceFileStatements,
    nodes instanceof Array ? nodes : factory.createNodeArray([nodes]),
    resultFile,
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
