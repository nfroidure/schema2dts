import { type OpenAPIV3_1 } from 'openapi-types';
import {
  ALL_TYPES,
  ensureResolved,
  resolve,
  schemaToTypeNode,
  splitRef,
  type JSONSchema,
  type JSONSchemaContext,
} from './jsonSchema.js';
import { type Fragment } from './fragments.js';
import { buildIdentifier } from './typeDefinitions.js';
import { YError } from 'yerror';
import { factory, SyntaxKind, type TypeNode } from 'typescript';

export const DEFAULT_OPEN_API_OPTIONS: OpenAPITypesGenerationOptions = {
  baseName: 'API',
  basePath: 'openapi.d.ts',
  filterStatuses: [],
  brandedTypes: [],
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
  document: OpenAPIV3_1.Document,
): Promise<Fragment[]> {
  let fragments: Fragment[] = [];

  if ('paths' in document && document.paths) {
    for (const [path, pathItem] of Object.entries(document.paths)) {
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
            const namespace = splitRef(fragment.ref);

            hasFragmentsToBuild = true;

            return [
              ...fragments,
              ...(await pathItemToFragments(
                context,
                document,
                await resolve<OpenAPIV3_1.Document, OpenAPIV3_1.PathItemObject>(
                  document,
                  namespace,
                ),
                namespace,
              )),
            ];
          }
          if (fragment.ref.startsWith('#/components/requestBodies/')) {
            const namespace = splitRef(fragment.ref);

            hasFragmentsToBuild = true;

            return [
              ...fragments,
              ...(await requestBodyToFragments(
                context,
                document,
                await resolve<
                  OpenAPIV3_1.Document,
                  OpenAPIV3_1.RequestBodyObject
                >(document, namespace),
                namespace,
                false,
              )),
            ];
          }
          if (fragment.ref.startsWith('#/components/responses/')) {
            const namespace = splitRef(fragment.ref);

            hasFragmentsToBuild = true;

            return [
              ...fragments,
              ...(await responseToFragments(
                context,
                document,
                await resolve<OpenAPIV3_1.Document, OpenAPIV3_1.ResponseObject>(
                  document,
                  namespace,
                ),
                namespace,
              )),
            ];
          }
          if (fragment.ref.startsWith('#/components/parameters/')) {
            const namespace = splitRef(fragment.ref);

            hasFragmentsToBuild = true;

            return [
              ...fragments,
              ...(await parameterToFragments(
                context,
                document,
                await resolve<
                  OpenAPIV3_1.Document,
                  OpenAPIV3_1.ParameterObject
                >(document, namespace),
                namespace,
                false,
              )),
            ];
          }
          if (fragment.ref.startsWith('#/components/headers/')) {
            const namespace = splitRef(fragment.ref);

            hasFragmentsToBuild = true;

            return [
              ...fragments,
              ...(await headerToFragments(
                context,
                document,
                await resolve<OpenAPIV3_1.Document, OpenAPIV3_1.HeaderObject>(
                  document,
                  namespace,
                ),
                namespace,
                false,
              )),
            ];
          }
          if (fragment.ref.startsWith('#/components/callbacks/')) {
            const namespace = splitRef(fragment.ref);

            hasFragmentsToBuild = true;

            return [
              ...fragments,
              ...(await callbackToFragments(
                context,
                document,
                await resolve<OpenAPIV3_1.Document, OpenAPIV3_1.CallbackObject>(
                  document,
                  namespace,
                ),
                namespace,
              )),
            ];
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
  document: OpenAPIV3_1.Document,
  pathItem: OpenAPIV3_1.PathItemObject,
  namespace: string[],
): Promise<Fragment[]> {
  if ('$ref' in pathItem && pathItem.$ref) {
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

    // TODO: parameters

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
  document: OpenAPIV3_1.Document,
  operation: OpenAPIV3_1.OperationObject,
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
    const requestBody = await ensureResolved<
      OpenAPIV3_1.Document,
      OpenAPIV3_1.RequestBodyObject
    >(document, operation.requestBody);

    fragments.push(
      ...(await requestBodyToFragments(
        context,
        document,
        operation.requestBody,
        subNamespace,
        !requestBody.required,
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
      const resolvedParameter = await ensureResolved<
        OpenAPIV3_1.Document,
        OpenAPIV3_1.ParameterObject
      >(document, parameter);
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

  return fragments;
}

export async function callbackToFragments(
  context: OpenAPIContext,
  document: OpenAPIV3_1.Document,
  callback: OpenAPIV3_1.CallbackObject | OpenAPIV3_1.ReferenceObject,
  namespace: string[],
): Promise<Fragment[]> {
  if ('$ref' in callback && callback.$ref) {
    return [
      {
        type: 'assumed',
        ref: (callback as OpenAPIV3_1.ReferenceObject).$ref,
      },
      {
        type: 'interfaceMember',
        ref: '#/' + namespace.join('/'),
        namespace: [...namespace],
        destination: (callback as OpenAPIV3_1.ReferenceObject).$ref,
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
    fragments.push(
      ...(await pathItemToFragments(
        context,
        document,
        pathItem as OpenAPIV3_1.PathItemObject,
        [...namespace, callbackName],
      )),
    );
  }

  return fragments;
}

export async function headerToFragments(
  context: OpenAPIContext,
  document: OpenAPIV3_1.Document,
  header: OpenAPIV3_1.HeaderObject,
  namespace: string[],
  optional = true,
): Promise<Fragment[]> {
  if ('$ref' in header) {
    return [
      {
        type: 'assumed',
        ref: (header as OpenAPIV3_1.ReferenceObject).$ref,
      },
      {
        type: 'interfaceMember',
        ref: '#/' + namespace.join('/'),
        namespace: [...namespace],
        destination: (header as OpenAPIV3_1.ReferenceObject).$ref,
        optional,
      },
    ];
  } else {
    const { type, fragments: schemaFragments } = await schemaToTypeNode(
      context,
      header.schema as JSONSchema,
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
  document: OpenAPIV3_1.Document,
  requestBody: OpenAPIV3_1.RequestBodyObject | OpenAPIV3_1.ReferenceObject,
  namespace: string[],
  optional = true,
): Promise<Fragment[]> {
  if ('$ref' in requestBody) {
    return [
      {
        type: 'assumed',
        ref: (requestBody as OpenAPIV3_1.ReferenceObject).$ref,
      },
      {
        type: 'interfaceMember',
        ref: '#/' + namespace.join('/'),
        namespace: [...namespace],
        destination: (requestBody as OpenAPIV3_1.ReferenceObject).$ref,
        optional,
      },
    ];
  }

  const requestBodySchemas = (
    requestBody
      ? Object.keys(requestBody.content)
          .filter((contentType) => 'schema' in requestBody.content[contentType])
          .map((contentType) => {
            return requestBody.content[contentType].schema;
          })
      : []
  ) as (OpenAPIV3_1.ReferenceObject | OpenAPIV3_1.SchemaObject)[];

  if (!requestBodySchemas.length) {
    return [
      {
        type: 'interfaceMember',
        ref: '#/' + namespace.join('/'),
        namespace: [...namespace],
        typeNode: factory.createKeywordTypeNode(SyntaxKind.UnknownKeyword),
        optional,
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
  document: OpenAPIV3_1.Document,
  response: OpenAPIV3_1.ResponseObject | OpenAPIV3_1.ReferenceObject,
  namespace: string[],
): Promise<Fragment[]> {
  if ('$ref' in response) {
    return [
      {
        type: 'assumed',
        ref: (response as OpenAPIV3_1.ReferenceObject).$ref,
      },
      {
        type: 'interfaceMember',
        ref: '#/' + namespace.join('/'),
        namespace: [...namespace],
        destination: (response as OpenAPIV3_1.ReferenceObject).$ref,
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

  if (!responseSchemas.length) {
    fragments.push({
      type: 'interfaceMember',
      ref: '#/' + responseBodyNamespace.join('/'),
      namespace: responseBodyNamespace,
      typeNode: factory.createKeywordTypeNode(SyntaxKind.UnknownKeyword),
    });
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

  if (response.headers) {
    for (const [headerName, header] of Object.entries(response.headers)) {
      const resolvedHeader = await ensureResolved<
        OpenAPIV3_1.Document,
        OpenAPIV3_1.HeaderObject
      >(document, header);

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

  return fragments;
}

export async function parameterToFragments(
  context: OpenAPIContext,
  document: OpenAPIV3_1.Document,
  parameter: OpenAPIV3_1.ParameterObject | OpenAPIV3_1.ReferenceObject,
  namespace: string[],
  optional = true,
): Promise<Fragment[]> {
  if ('$ref' in parameter) {
    return [
      {
        type: 'assumed',
        ref: (parameter as OpenAPIV3_1.ReferenceObject).$ref,
      },
      {
        type: 'interfaceMember',
        ref: '#/' + namespace.join('/'),
        namespace: [...namespace],
        destination: (parameter as OpenAPIV3_1.ReferenceObject).$ref,
        optional,
      },
    ];
  }

  if ('schema' in parameter && parameter.schema) {
    if ('$ref' in parameter.schema) {
      return [
        {
          type: 'assumed',
          ref: (parameter.schema as OpenAPIV3_1.ReferenceObject).$ref,
        },
        {
          type: 'interfaceMember',
          ref: '#/' + namespace.join('/'),
          namespace: [...namespace],
          destination: (parameter.schema as OpenAPIV3_1.ReferenceObject).$ref,
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

export type CleanedOpenAPIDocument = Omit<
  OpenAPIV3_1.Document,
  'components'
> & {
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
  };
};

export function cleanOpenAPIDocument(
  document: OpenAPIV3_1.Document,
): CleanedOpenAPIDocument {
  return {
    ...document,
    components: {
      schemas: document.components?.schemas || {},
      requestBodies: document.components?.requestBodies || {},
      parameters: document.components?.parameters || {},
      responses: document.components?.responses || {},
      headers: document.components?.headers || {},
      callbacks: document.components?.callbacks || {},
      pathItems: document.components?.pathItems || {},
    },
  };
}

export function pickOperationObject(
  maybeMethod: string,
  maybeOperationObject: OpenAPIV3_1.PathItemObject[keyof OpenAPIV3_1.PathItemObject],
): OpenAPIV3_1.OperationObject | undefined {
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
    return maybeOperationObject as OpenAPIV3_1.OperationObject;
  }
  return undefined;
}
