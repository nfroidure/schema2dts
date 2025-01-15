import camelCase from 'camelcase';
import initDebug from 'debug';
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
  buildTypeReference,
  buildIdentifier,
  buildInterfaceReference,
} from './utils/typeDefinitions.js';
import {
  ALL_TYPES,
  DEFAULT_JSON_SCHEMA_OPTIONS,
  ensureResolved,
  eventuallyBrandType,
  eventuallyIdentifySchema,
  JSONSchemaContext,
  JSONSchemaOptions,
  jsonSchemaToFragments,
  resolve,
  schemaToTypeNode,
  splitRef,
  type JSONSchema,
} from './utils/jsonSchema.js';
import initTypeDefinitionBuilder, {
  type TypeDefinitionBuilderService,
} from './services/typeDefinitionBuilder.js';
import {
  buildAliasFragment,
  buildLinkFragment,
  buildTypeFragment,
  type StatementFragment,
} from './utils/fragments.js';
import { pickOperationObject } from './utils/openAPI.js';

export type OASContext = JSONSchemaContext & {
  typeDefinitionBuilder: TypeDefinitionBuilderService;
  oasOptions: OpenAPITypesGenerationOptions;
};

const debug = initDebug('schema2dts');

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

export type IngestedDocument = {
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
            factory.createKeywordTypeNode(SyntaxKind.UnknownKeyword),
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
        const { type, fragments } = await schemaToTypeNode(context, {
          oneOf: requestBodySchemasReferences,
        });
        (fragments || []).map(typeDefinitionBuilder.register);

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
            type,
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
      let finalType;

      if (!('schema' in parameter) || typeof parameter.schema === 'undefined') {
        finalType = factory.createKeywordTypeNode(SyntaxKind.UnknownKeyword);
      } else {
        const { type, fragments } = await schemaToTypeNode(
          context,
          eventuallyIdentifySchema(parameter.schema as JSONSchema, identifier),
        );

        finalType = type;
        (fragments || []).map(typeDefinitionBuilder.register);
      }

      context.typeDefinitionBuilder.register(
        buildTypeFragment(
          {
            ...context.baseLocation,
            namespace: ['Components', 'Parameters', identifier],
          },
          finalType,
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
        schemasType = factory.createKeywordTypeNode(SyntaxKind.UnknownKeyword);
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
        const { type, fragments } = await schemaToTypeNode(context, {
          oneOf: responseSchemasReferences,
        });

        schemasType = type;
        (fragments || []).map(typeDefinitionBuilder.register);
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
      let finalType;

      if (!('schema' in header) || typeof header.schema === 'undefined') {
        finalType = factory.createKeywordTypeNode(SyntaxKind.UnknownKeyword);
      } else {
        const { type, fragments } = await schemaToTypeNode(
          context,
          eventuallyIdentifySchema(
            header.schema as JSONSchema,
            buildIdentifier(headerId),
          ),
        );

        finalType = type;
        (fragments || []).map(typeDefinitionBuilder.register);
      }

      context.typeDefinitionBuilder.register(
        buildTypeFragment(
          {
            ...context.baseLocation,
            namespace: ['Components', 'Headers', identifier],
          },
          finalType,
          [],
          `#/components/headers/${headerId}`,
        ),
      );
    }
  }

  return gatherFragments(context);
}

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
    // typeDefinitionBuilder,
    rootSchema,
    jsonSchemaOptions: {
      baseName,
      brandedTypes,
      generateRealEnums,
      tuplesFromFixedArraysLengthLimit,
      exportNamespaces,
    },
  };

  const fragments = await jsonSchemaToFragments(context, rootSchema);

  (fragments || []).map(typeDefinitionBuilder.register);

  return gatherFragments({ typeDefinitionBuilder, ...context });
}

export async function gatherFragments(
  context: JSONSchemaContext & {
    typeDefinitionBuilder: TypeDefinitionBuilderService;
  },
): Promise<NodeArray<Statement>> {
  const statements: Statement[] = [];
  let assumedFragmentsToBuild = context.typeDefinitionBuilder.list('assumed');

  debug('gatherFragments: start');

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
      const { type, fragments } = await schemaToTypeNode(context, finalSchema);

      (fragments || []).map(context.typeDefinitionBuilder.register);

      context.typeDefinitionBuilder.register({
        ref: assumedFragmentToBuild.ref,
        location: {
          ...context.baseLocation,
          namespace: namespaceParts.map((part) => buildIdentifier(part)),
        },
        type: 'type',
        typeNode: await eventuallyBrandType(context, finalSchema, type),
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
