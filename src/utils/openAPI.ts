import {
  ALL_FORMATS,
  ALL_TYPES,
  schemaToTypeNode,
  type JSONSchemaContext,
} from './jsonSchema.js';
import { combineFragments, type Fragment } from './fragments.js';
import { buildIdentifier } from './typeDefinitions.js';
import { YError } from 'yerror';
import { factory, SyntaxKind, type TypeNode } from 'typescript';
import {
  type OpenAPI,
  type OpenAPICallback,
  type OpenAPIOperation,
  type OpenAPIPathItem,
  type OpenAPIReference,
  type OpenAPIExtension,
  type OpenAPIReferenceable,
  type OpenAPIHeader,
  type OpenAPIRequestBody,
  type OpenAPIResponse,
  type OpenAPIParameter,
  relativeReferenceToNamespace,
  resolveNamespace,
  ensureResolvedObject,
} from 'ya-open-api-types';
import { type JSONSchema } from 'ya-json-schema-types';

export const DEFAULT_OPEN_API_OPTIONS: OpenAPITypesGenerationOptions = {
  baseName: 'API',
  basePath: 'openapi.d.ts',
  filterStatuses: [],
  brandedTypes: [],
  brandedFormats: [],
  typedFormats: {},
  generateUnusedSchemas: false,
  generateUnusedComponents: false,
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
  generateUnusedComponents?: boolean;
  camelizeInputs?: boolean;
  brandedTypes: string[] | typeof ALL_TYPES | 'schemas';
  brandedFormats: string[] | typeof ALL_FORMATS;
  typedFormats: Record<
    string,
    {
      namespace: string[];
    }
  >;
  generateRealEnums: boolean;
  tuplesFromFixedArraysLengthLimit: number;
  exportNamespaces: boolean;
  requireCleanAPI?: boolean;
};

export type OpenAPIContext = JSONSchemaContext & {
  oasOptions: OpenAPITypesGenerationOptions;
};

export async function openAPIToFragments(
  context: OpenAPIContext,
  document: OpenAPI,
): Promise<Fragment[]> {
  let fragments: Fragment[] = [];

  if ('paths' in document && document.paths) {
    for (const [path, pathItem] of Object.entries(document.paths)) {
      if (path.startsWith('x-')) {
        continue;
      }
      if (pathItem) {
        fragments.push(
          ...(await pathItemToFragments(context, document, pathItem, [
            'paths',
            path,
          ])),
        );
      }
    }
  }

  if ('webhooks' in document && document.webhooks) {
    for (const [webhookName, pathItem] of Object.entries(document.webhooks)) {
      fragments.push(
        ...(await pathItemToFragments(context, document, pathItem, [
          'webhooks',
          webhookName,
        ])),
      );
    }
  }

  if (context.oasOptions.generateUnusedSchemas) {
    Object.keys(document.components?.schemas || {}).forEach((schemaName) => {
      fragments.push({
        type: 'assumed',
        ref: `#/components/schemas/${schemaName}`,
      });
    });
  }

  let hasFragmentsToBuild = true;

  while (hasFragmentsToBuild) {
    hasFragmentsToBuild = false;

    fragments = await fragments.reduce(
      async (fragmentsPromise, fragment) => {
        const fragments = await fragmentsPromise;

        if (fragment.type === 'assumed') {
          if (fragment.ref.startsWith('#/components/pathItems/')) {
            const namespace = relativeReferenceToNamespace(fragment.ref);
            const pathItem = await resolveNamespace(document, namespace);

            hasFragmentsToBuild = true;

            return combineFragments(fragments, [
              ...(await pathItemToFragments(
                context,
                document,
                pathItem as OpenAPIPathItem<JSONSchema, OpenAPIExtension>,
                namespace,
              )),
            ]);
          }
          if (fragment.ref.startsWith('#/components/requestBodies/')) {
            const namespace = relativeReferenceToNamespace(fragment.ref);
            const requestBody = await resolveNamespace(document, namespace);

            hasFragmentsToBuild = true;

            return combineFragments(fragments, [
              ...(await requestBodyToFragments(
                context,
                document,
                requestBody as OpenAPIRequestBody<JSONSchema, OpenAPIExtension>,
                namespace,
                false,
              )),
            ]);
          }
          if (fragment.ref.startsWith('#/components/responses/')) {
            const namespace = relativeReferenceToNamespace(fragment.ref);
            const response = (await resolveNamespace(
              document,
              namespace,
            )) as OpenAPIResponse<JSONSchema, OpenAPIExtension>;

            hasFragmentsToBuild = true;

            return combineFragments(fragments, [
              ...(await responseToFragments(
                context,
                document,
                response,
                namespace,
              )),
            ]);
          }
          if (fragment.ref.startsWith('#/components/parameters/')) {
            const namespace = relativeReferenceToNamespace(fragment.ref);
            const parameter = await resolveNamespace(document, namespace);

            hasFragmentsToBuild = true;

            return combineFragments(fragments, [
              ...(await parameterToFragments(
                context,
                document,
                parameter as OpenAPIParameter<JSONSchema, OpenAPIExtension>,
                namespace,
                false,
              )),
            ]);
          }
          if (fragment.ref.startsWith('#/components/headers/')) {
            const namespace = relativeReferenceToNamespace(fragment.ref);
            const header = (await resolveNamespace(
              document,
              namespace,
            )) as OpenAPIHeader<JSONSchema, OpenAPIExtension>;

            hasFragmentsToBuild = true;

            return combineFragments(fragments, [
              ...(await headerToFragments(
                context,
                document,
                header,
                namespace,
                false,
              )),
            ]);
          }
          if (fragment.ref.startsWith('#/components/callbacks/')) {
            const namespace = relativeReferenceToNamespace(fragment.ref);
            const callback = await resolveNamespace(document, namespace);

            hasFragmentsToBuild = true;

            return combineFragments(fragments, [
              ...(await callbackToFragments(
                context,
                document,
                callback as OpenAPICallback<JSONSchema, OpenAPIExtension>,
                namespace,
              )),
            ]);
          }
        }
        return [...fragments, fragment];
      },
      Promise.resolve([] as Fragment[]),
    );
  }

  return fragments;
}

export async function pathItemToFragments(
  context: OpenAPIContext,
  document: OpenAPI,
  pathItem: OpenAPIPathItem<JSONSchema, OpenAPIExtension>,
  namespace: string[],
): Promise<Fragment[]> {
  if (isAReference(pathItem)) {
    // Path items should be merged but we won't atm
    // since it may not be like this in the future
    // and embrace the ReferenceObject classic behavior.
    const subNamespace = [...namespace];

    return [
      {
        type: 'assumed',
        ref: pathItem.$ref,
      },
      {
        type: 'interfaceMember',
        ref: '#/' + subNamespace.join('/'),
        namespace: subNamespace,
        destination: pathItem.$ref,
      },
    ];
  }

  const fragments: Fragment[] = [];

  if (pathItem.parameters && pathItem.parameters.length) {
    for (const parameter of pathItem.parameters) {
      const resolvedParameter = (await ensureResolvedObject(
        document,
        parameter,
      )) as OpenAPIParameter<JSONSchema, OpenAPIExtension>;
      const subNamespace = [
        ...namespace,
        'parameters',
        resolvedParameter.in,
        resolvedParameter.name,
      ];

      fragments.push(
        ...(await parameterToFragments(
          context,
          document,
          parameter,
          subNamespace,
          !resolvedParameter.required,
        )),
      );
    }
  }

  for (const method of Object.keys(pathItem)) {
    const maybeOperationObject = pickOperationObject(method, pathItem[method]);

    if (!maybeOperationObject) {
      continue;
    }

    const operationId =
      (maybeOperationObject.operationId as string) ||
      (context.oasOptions.requireCleanAPI
        ? ''
        : namespace
            .filter((id) => id)
            .map(buildIdentifier)
            .join(''));
    const subNamespace = [...namespace, method];

    if (!operationId) {
      throw new YError('E_OPERATION_ID_REQUIRED', ...namespace);
    }

    fragments.push({
      type: 'interfaceMember',
      ref: '#/' + subNamespace.join('/'),
      namespace: subNamespace,
      destination: `#/operations/${operationId}`,
    });

    fragments.push(
      ...(await operationToFragments(context, document, maybeOperationObject, [
        'operations',
        operationId,
      ])),
    );
  }
  return fragments;
}

export async function operationToFragments(
  context: OpenAPIContext,
  document: OpenAPI,
  operation: OpenAPIOperation<JSONSchema, OpenAPIExtension>,
  namespace: string[],
): Promise<Fragment[]> {
  const fragments: Fragment[] = [
    {
      type: 'interfaceMember',
      ref: '#/' + namespace.join('/'),
      namespace: namespace,
      alias: true,
    },
  ];

  if ('callbacks' in operation && operation.callbacks) {
    for (const callbackName of Object.keys(operation.callbacks)) {
      fragments.push(
        ...(await callbackToFragments(
          context,
          document,
          operation.callbacks[callbackName],
          [...namespace, 'callbacks', callbackName],
        )),
      );
    }
  }

  if ('requestBody' in operation && operation.requestBody) {
    const subNamespace = [...namespace, 'requestBody'];
    const requestBody = (await ensureResolvedObject(
      document,
      operation.requestBody,
    )) as OpenAPIRequestBody<JSONSchema, OpenAPIExtension>;
    const hasNoSchemas = pickRequestBodySchemas(requestBody).length === 0;

    fragments.push(
      ...(await requestBodyToFragments(
        context,
        document,
        operation.requestBody,
        subNamespace,
        hasNoSchemas || !requestBody.required,
      )),
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
      const response = responses[code];
      const subNamespace = [...namespace, 'responses', code];

      fragments.push(
        ...(await responseToFragments(
          context,
          document,
          response,
          subNamespace,
        )),
      );
    }
  }

  if (operation.parameters && operation.parameters.length) {
    for (const parameter of operation.parameters) {
      const resolvedParameter = (await ensureResolvedObject(
        document,
        parameter,
      )) as OpenAPIParameter<JSONSchema, OpenAPIExtension>;
      const subNamespace = [
        ...namespace,
        'parameters',
        resolvedParameter.in === 'cookie'
          ? 'cookies'
          : resolvedParameter.in === 'header'
            ? 'headers'
            : resolvedParameter.in,
        resolvedParameter.name,
      ];

      fragments.push(
        ...(await parameterToFragments(
          context,
          document,
          parameter,
          subNamespace,
          !resolvedParameter.required,
        )),
      );
    }
  }

  return fragments;
}

export function isAReference<D, X extends OpenAPIExtension>(
  maybeReference:
    | OpenAPIReference<OpenAPIReferenceable<D, X>>
    | OpenAPIReferenceable<D, X>,
): maybeReference is OpenAPIReference<OpenAPIReferenceable<D, X>> {
  if (typeof maybeReference !== 'object' || maybeReference == null) {
    return false;
  }
  return !!('$ref' in maybeReference && maybeReference.$ref);
}

export async function callbackToFragments(
  context: OpenAPIContext,
  document: OpenAPI,
  callback:
    | OpenAPIReference<OpenAPICallback<JSONSchema, OpenAPIExtension>>
    | OpenAPICallback<JSONSchema, OpenAPIExtension>,
  namespace: string[],
): Promise<Fragment[]> {
  if (isAReference(callback)) {
    return [
      {
        type: 'assumed',
        ref: callback.$ref,
      },
      {
        type: 'interfaceMember',
        ref: '#/' + namespace.join('/'),
        namespace: [...namespace],
        destination: callback.$ref,
      },
    ];
  }

  const fragments: Fragment[] = [
    {
      type: 'interfaceMember',
      ref: '#/' + namespace.join('/'),
      namespace: namespace,
      alias: true,
    },
  ];

  for (const [callbackName, pathItem] of Object.entries(callback)) {
    if (callbackName.startsWith('x-')) {
      continue;
    }
    fragments.push(
      ...(await pathItemToFragments(
        context,
        document,
        pathItem as OpenAPIPathItem<JSONSchema, OpenAPIExtension>,
        [...namespace, callbackName],
      )),
    );
  }

  return fragments;
}

export async function headerToFragments(
  context: OpenAPIContext,
  document: OpenAPI,
  header:
    | OpenAPIReference<OpenAPIHeader<JSONSchema, OpenAPIExtension>>
    | OpenAPIHeader<JSONSchema, OpenAPIExtension>,
  namespace: string[],
  optional = true,
): Promise<Fragment[]> {
  if (isAReference(header)) {
    return [
      {
        type: 'assumed',
        ref: header.$ref,
      },
      {
        type: 'interfaceMember',
        ref: '#/' + namespace.join('/'),
        namespace: [...namespace],
        destination: header.$ref,
        optional,
      },
    ];
  } else if ('content' in header) {
    throw new YError('E_UNSUPPORTED_HEADER', header);
  } else {
    const { type, fragments: schemaFragments } = await schemaToTypeNode(
      context,
      header.schema,
    );

    return [
      ...(schemaFragments || []),
      {
        type: 'interfaceMember',
        ref: '#/' + namespace.join('/'),
        namespace: [...namespace],
        typeNode: type,
        optional,
      },
    ];
  }
}

export async function requestBodyToFragments(
  context: OpenAPIContext,
  document: OpenAPI,
  requestBody:
    | OpenAPIRequestBody<JSONSchema, OpenAPIExtension>
    | OpenAPIReference<OpenAPIRequestBody<JSONSchema, OpenAPIExtension>>,
  namespace: string[],
  optional = true,
): Promise<Fragment[]> {
  if (isAReference(requestBody)) {
    return [
      {
        type: 'assumed',
        ref: requestBody.$ref,
      },
      {
        type: 'interfaceMember',
        ref: '#/' + namespace.join('/'),
        namespace: [...namespace],
        destination: requestBody.$ref,
        optional,
      },
    ];
  }

  const requestBodySchemas = pickRequestBodySchemas(
    requestBody as OpenAPIRequestBody<JSONSchema, OpenAPIExtension>,
  );

  if (!requestBodySchemas.length) {
    return [
      {
        type: 'interfaceMember',
        ref: '#/' + namespace.join('/'),
        namespace: [...namespace],
        typeNode: factory.createKeywordTypeNode(SyntaxKind.UnknownKeyword),
        optional: true,
      },
    ];
  }

  const fragments: Fragment[] = [];
  const types: TypeNode[] = [];

  for (const schema of requestBodySchemas) {
    const { type, fragments: schemaFragments } = await schemaToTypeNode(
      context,
      schema as JSONSchema,
    );

    fragments.push(...(schemaFragments || []));
    types.push(type);
  }

  fragments.push({
    type: 'interfaceMember',
    ref: '#/' + namespace.join('/'),
    namespace: [...namespace],
    typeNode: types.length > 1 ? factory.createUnionTypeNode(types) : types[0],
    optional,
  });

  return fragments;
}

export async function responseToFragments(
  context: OpenAPIContext,
  document: OpenAPI,
  response:
    | OpenAPIResponse<JSONSchema, OpenAPIExtension>
    | OpenAPIReference<OpenAPIResponse<JSONSchema, OpenAPIExtension>>,
  namespace: string[],
): Promise<Fragment[]> {
  if (isAReference(response)) {
    return [
      {
        type: 'assumed',
        ref: response.$ref,
      },
      {
        type: 'interfaceMember',
        ref: '#/' + namespace.join('/'),
        namespace: [...namespace],
        destination: response.$ref,
      },
    ];
  }

  const fragments: Fragment[] = [
    {
      type: 'interfaceMember',
      ref: '#/' + namespace.join('/'),
      namespace: namespace,
      alias: true,
    },
  ];
  const responseSchemas =
    response && response.content
      ? Object.keys(response.content)
          .filter(
            (contentType) => 'schema' in (response.content || {})[contentType],
          )
          .map((contentType) => {
            return response.content?.[contentType].schema;
          })
      : [];
  const responseBodyNamespace = [...namespace, 'body'];
  const hasContent = 'content' in response;

  if (!responseSchemas.length) {
    if (hasContent) {
      fragments.push({
        type: 'interfaceMember',
        ref: '#/' + responseBodyNamespace.join('/'),
        namespace: responseBodyNamespace,
        typeNode: factory.createKeywordTypeNode(SyntaxKind.UnknownKeyword),
        optional: true,
      });
    }
  } else {
    const types: TypeNode[] = [];

    for (const schema of responseSchemas) {
      const { type, fragments: schemaFragments } = await schemaToTypeNode(
        context,
        schema as JSONSchema,
      );

      fragments.push(...(schemaFragments || []));
      types.push(type);
    }

    fragments.push({
      type: 'interfaceMember',
      ref: '#/' + responseBodyNamespace.join('/'),
      namespace: responseBodyNamespace,
      typeNode:
        types.length > 1 ? factory.createUnionTypeNode(types) : types[0],
    });
  }

  let hasHeaders = false;

  if (response.headers) {
    for (const [headerName, header] of Object.entries(response.headers)) {
      const resolvedHeader = (await ensureResolvedObject(
        document,
        header,
      )) as OpenAPIHeader<JSONSchema, OpenAPIExtension>;

      hasHeaders = true;

      fragments.push(
        ...(await headerToFragments(
          context,
          document,
          header,
          [...namespace, 'headers', headerName],
          !resolvedHeader.required,
        )),
      );
    }
  }

  if (!(hasContent || hasHeaders)) {
    fragments.push({
      ref: '#/' + namespace.join('/') + '/empty',
      type: 'interfaceMember',
      namespace: [...namespace],
      typeNode: factory.createKeywordTypeNode(SyntaxKind.ObjectKeyword),
    });
  }

  return fragments;
}

export async function parameterToFragments(
  context: OpenAPIContext,
  document: OpenAPI,
  parameter:
    | OpenAPIParameter<JSONSchema, OpenAPIExtension>
    | OpenAPIReference<OpenAPIParameter<JSONSchema, OpenAPIExtension>>,
  namespace: string[],
  optional = true,
): Promise<Fragment[]> {
  if (isAReference(parameter)) {
    return [
      {
        type: 'assumed',
        ref: parameter.$ref,
      },
      {
        type: 'interfaceMember',
        ref: '#/' + namespace.join('/'),
        namespace: [...namespace],
        destination: parameter.$ref,
        optional,
      },
    ];
  }

  if ('schema' in parameter && parameter.schema) {
    if (isAReference(parameter.schema)) {
      return [
        {
          type: 'assumed',
          ref: parameter.schema.$ref,
        },
        {
          type: 'interfaceMember',
          ref: '#/' + namespace.join('/'),
          namespace: [...namespace],
          destination: parameter.schema.$ref,
          optional,
        },
      ];
    }

    const { type, fragments } = await schemaToTypeNode(
      context,
      parameter.schema as JSONSchema,
    );

    return [
      ...(fragments || []),
      {
        type: 'interfaceMember',
        ref: '#/' + namespace.join('/'),
        namespace: [...namespace],
        typeNode: type,
        optional,
      },
    ];
  }

  return [
    {
      type: 'interfaceMember',
      ref: '#/' + namespace.join('/'),
      namespace: [...namespace],
      typeNode: factory.createKeywordTypeNode(SyntaxKind.UnknownKeyword),
    },
  ];
}

export function pickOperationObject<D, X extends OpenAPIExtension>(
  maybeMethod: string,
  maybeOperationObject: OpenAPIOperation<D, X>,
): OpenAPIOperation<D, X> | undefined {
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
    return maybeOperationObject;
  }
  return undefined;
}

function pickRequestBodySchemas<
  D,
  T extends OpenAPIRequestBody<D, OpenAPIExtension>,
>(requestBody: T) {
  return (
    requestBody
      ? Object.keys(requestBody.content)
          .filter((contentType) => 'schema' in requestBody.content[contentType])
          .map((contentType) => {
            return requestBody.content[contentType].schema;
          })
      : []
  ) as D[];
}
