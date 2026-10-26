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
  type Node,
} from 'typescript';
import {
  buildTypeReference,
  buildIdentifier,
  buildInterfaceReference,
  canBePropertySignature,
} from './utils/typeDefinitions.js';
import {
  DEFAULT_JSON_SCHEMA_OPTIONS,
  eventuallyBrandType,
  eventuallyIdentifySchema,
  jsonSchemaToFragments,
  schemaToTypeNode,
  type JSONSchemaContext,
  type JSONSchemaOptions,
} from './utils/jsonSchema.js';
import { type JSONSchema } from 'ya-json-schema-types';
import {
  DEFAULT_OPEN_API_OPTIONS,
  openAPIToFragments,
  type OpenAPIContext,
  type OpenAPITypesGenerationOptions,
} from './utils/openAPI.js';
import { YError } from 'yerror';
import {
  relativeReferenceToNamespace,
  resolveNamespace,
  type OpenAPI,
} from 'ya-open-api-types';
import {
  combineFragments,
  findFragments,
  type Fragment,
} from './utils/fragments.js';

export {
  DEFAULT_JSON_SCHEMA_OPTIONS,
  DEFAULT_OPEN_API_OPTIONS,
  type OpenAPITypesGenerationOptions,
  type JSONSchemaOptions,
};

type OpenAPITypesOptions = Omit<
  OpenAPITypesGenerationOptions,
  'baseName' | 'basePath' | 'brandedTypes' | 'brandedFormats' | 'typedFormats'
> &
  Partial<
    Pick<
      OpenAPITypesGenerationOptions,
      | 'baseName'
      | 'basePath'
      | 'brandedTypes'
      | 'brandedFormats'
      | 'patternTypes'
      | 'typedFormats'
    >
  >;

/**
 * Create the TypeScript types declarations from an Open API document
 * @param {OpenAPI} schema
 * @param {Object} options
 * @param {string} options.baseName
 * @param {string} options.basePath
 * @param {Array<number | "default">} options.filterStatuses
 * Filter generated types per HTTP status
 * @param {Array<string>} options.filterOperations
 * Filter generated types per operation id
 * @param {boolean} options.generateUnusedSchemas
 * Generate schemas even if the API doesn't use it
 * @param {boolean} options.camelizeInputs
 * Use camel case for API inputs
 * @param {Array<string>} options.brandedTypes
 * Brand types by names
 * @param {Array<string>} options.brandedFormats
 * Brand formats by names
 * @param {Array<string> | "all"} options.patternTypes
 * Try to generate types from patterns
 * @param {boolean} options.expandPatternChars
 * Expand some character classes into literal unions when generating pattern-based types
 * @param {Object} options.typedFormats
 * Substitute string format by a type
 * @param {boolean} options.generateRealEnums
 * Generate TypeScript enums
 * @param {number} options.tuplesFromFixedArraysLengthLimit
 * Fix the maximum tuple size
 * @param {boolean} options.exportNamespaces
 * Decide if the export must be made through namespaces
 * @param {boolean} options.requireCleanAPI
 * Stricter API required (enable if you can improve the API)
 * @returns {TypeScript.NodeArray}
 */
export async function generateOpenAPITypes(
  rootOpenAPI: OpenAPI,
  {
    baseName = DEFAULT_OPEN_API_OPTIONS.baseName,
    basePath = DEFAULT_OPEN_API_OPTIONS.basePath,
    filterStatuses = DEFAULT_OPEN_API_OPTIONS.filterStatuses,
    filterOperations = DEFAULT_OPEN_API_OPTIONS.filterOperations,
    generateUnusedSchemas = DEFAULT_OPEN_API_OPTIONS.generateUnusedSchemas,
    generateUnusedComponents = DEFAULT_OPEN_API_OPTIONS.generateUnusedComponents,
    camelizeInputs = DEFAULT_OPEN_API_OPTIONS.camelizeInputs,
    brandedTypes = DEFAULT_OPEN_API_OPTIONS.brandedTypes,
    patternTypes = DEFAULT_OPEN_API_OPTIONS.patternTypes,
    expandPatternChars = DEFAULT_OPEN_API_OPTIONS.expandPatternChars,
    brandedFormats = DEFAULT_OPEN_API_OPTIONS.brandedFormats,
    typedFormats = DEFAULT_OPEN_API_OPTIONS.typedFormats,
    generateRealEnums = DEFAULT_OPEN_API_OPTIONS.generateRealEnums,
    tuplesFromFixedArraysLengthLimit = DEFAULT_OPEN_API_OPTIONS.tuplesFromFixedArraysLengthLimit,
    exportNamespaces = DEFAULT_OPEN_API_OPTIONS.exportNamespaces,
    requireCleanAPI = DEFAULT_OPEN_API_OPTIONS.requireCleanAPI,
  }: OpenAPITypesOptions = DEFAULT_OPEN_API_OPTIONS,
): Promise<NodeArray<Statement>> {
  const oasOptions: OpenAPITypesGenerationOptions = {
    baseName,
    basePath,
    filterStatuses,
    filterOperations,
    generateUnusedSchemas,
    generateUnusedComponents,
    camelizeInputs,
    brandedTypes,
    brandedFormats,
    patternTypes,
    expandPatternChars,
    typedFormats,
    generateRealEnums,
    tuplesFromFixedArraysLengthLimit,
    exportNamespaces,
    requireCleanAPI,
  };
  const context = buildOpenAPIContext(rootOpenAPI, oasOptions);

  const fragments = await openAPIToFragments(context, rootOpenAPI);

  return gatherFragments(context, fragments, rootOpenAPI);
}

// Could use https://apitools.dev/json-schema-ref-parser/
/**
 * Create the TypeScript types declarations from a JSONSchema document
 * @param {JSONSchema.Document} schema
 * @param {Object} options
 * @param {string} options.baseName
 * @param {Array<string>} options.brandedTypes
 * Brand types by names
 * @param {Array<string>} options.brandedFormats
 * Brand formats by names
 * @param {Array<string> | "all"} options.patternTypes
 * Try to generate types from patterns
 * @param {boolean} options.expandPatternChars
 * Expand some character classes into literal unions when generating pattern-based types
 * @param {Object} options.typedFormats
 * Substitute string format by a type
 * @param {boolean} options.generateRealEnums
 * Generate TypeScript enums
 * @param {number} options.tuplesFromFixedArraysLengthLimit
 * Fix the maximum tuple size
 * @param {boolean} options.exportNamespaces
 * Decide if the export must be made through namespaces
 * @returns {TypeScript.NodeArray}
 */
export async function generateJSONSchemaTypes(
  rootSchema: JSONSchema,
  {
    baseName = DEFAULT_JSON_SCHEMA_OPTIONS.baseName,
    brandedTypes = DEFAULT_JSON_SCHEMA_OPTIONS.brandedTypes,
    brandedFormats = DEFAULT_JSON_SCHEMA_OPTIONS.brandedFormats,
    patternTypes = DEFAULT_JSON_SCHEMA_OPTIONS.patternTypes,
    expandPatternChars = DEFAULT_JSON_SCHEMA_OPTIONS.expandPatternChars,
    typedFormats = DEFAULT_JSON_SCHEMA_OPTIONS.typedFormats,
    generateRealEnums = DEFAULT_JSON_SCHEMA_OPTIONS.generateRealEnums,
    tuplesFromFixedArraysLengthLimit = DEFAULT_JSON_SCHEMA_OPTIONS.tuplesFromFixedArraysLengthLimit,
    exportNamespaces = DEFAULT_JSON_SCHEMA_OPTIONS.exportNamespaces,
  }: JSONSchemaOptions = DEFAULT_JSON_SCHEMA_OPTIONS,
): Promise<NodeArray<Statement>> {
  const context: JSONSchemaContext = {
    jsonSchemaOptions: {
      baseName,
      brandedTypes,
      brandedFormats,
      patternTypes,
      expandPatternChars,
      typedFormats,
      generateRealEnums,
      tuplesFromFixedArraysLengthLimit,
      exportNamespaces,
    },
  };

  const fragments = await jsonSchemaToFragments(context, rootSchema);

  return gatherFragments(context, fragments, rootSchema);
}

function buildOpenAPIContext(
  rootOpenAPI: OpenAPI,
  oasOptions: OpenAPITypesGenerationOptions,
): OpenAPIContext {
  return {
    jsonSchemaOptions: {
      baseName: oasOptions.baseName,
      brandedTypes:
        oasOptions.brandedTypes !== 'schemas'
          ? oasOptions.brandedTypes
          : Object.keys(rootOpenAPI?.components?.schemas || {}),
      brandedFormats: oasOptions.brandedFormats,
      patternTypes: oasOptions.patternTypes,
      expandPatternChars: oasOptions.expandPatternChars,
      typedFormats: oasOptions.typedFormats,
      generateRealEnums: oasOptions.generateRealEnums,
      tuplesFromFixedArraysLengthLimit:
        oasOptions.tuplesFromFixedArraysLengthLimit,
      exportNamespaces: oasOptions.exportNamespaces,
    },
    oasOptions,
  };
}

export async function gatherFragments(
  context: JSONSchemaContext | OpenAPIContext,
  allFragments: Fragment[],
  document: JSONSchema | OpenAPI,
): Promise<NodeArray<Statement>> {
  const statements: Statement[] = [];
  let assumedFragmentsToBuild = findFragments('assumed', allFragments);

  while (assumedFragmentsToBuild.length) {
    for (const assumedFragmentToBuild of assumedFragmentsToBuild) {
      if (assumedFragmentToBuild.ref.startsWith('virtual://formats/')) {
        allFragments = combineFragments(allFragments, [
          {
            ref: assumedFragmentToBuild.ref,
            type: 'statement',
            statement: factory.createImportDeclaration(
              undefined,
              factory.createImportClause(
                false,
                undefined,
                factory.createNamedImports([
                  factory.createImportSpecifier(
                    false,
                    undefined,
                    factory.createIdentifier('DateTime'),
                  ),
                ]),
              ),
              factory.createStringLiteral('luxxon'),
              undefined,
            ),
          },
        ]);
        continue;
      }

      const namespace = relativeReferenceToNamespace(
        assumedFragmentToBuild.ref,
      );
      const subSchema = await resolveNamespace(
        document as JSONSchema,
        namespace,
      );

      if (
        typeof subSchema === 'object' &&
        '$ref' in subSchema &&
        subSchema.$ref
      ) {
        allFragments = combineFragments(allFragments, [
          {
            ref: assumedFragmentToBuild.ref,
            type: 'interfaceMember',
            namespace,
            destination: subSchema.$ref as string,
          },
          {
            type: 'assumed',
            ref: subSchema.$ref as string,
          },
        ]);
        continue;
      }

      const identifier = buildIdentifier(namespace[namespace.length - 1]);
      const finalSchema = eventuallyIdentifySchema(subSchema, identifier);
      const { type, fragments } = await schemaToTypeNode(context, finalSchema);

      allFragments = combineFragments(allFragments, [
        ...(fragments || []),
        {
          ref: assumedFragmentToBuild.ref,
          type: 'interfaceMember',
          namespace,
          typeNode: await eventuallyBrandType(context, finalSchema, type),
        },
      ]);
    }

    assumedFragmentsToBuild = findFragments('assumed', allFragments);
  }

  const interfaceStatements = findFragments(
    'interfaceMember',
    allFragments,
  ).reduce((statements, fragment) => {
    let interfaceDeclaration = statements.find(
      (d) => d.name.text === fragment.namespace[0],
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
        factory.createIdentifier(fragment.namespace[0]),
        undefined,
        undefined,
        curTypeElements,
      );

      statements.push(interfaceDeclaration);
    }

    for (let i = 1; i < fragment.namespace.length - 1; i++) {
      let propertySignature: PropertySignature | undefined =
        curTypeElements.find(
          (e) =>
            e &&
            isPropertySignature(e) &&
            (e.name as Identifier).text === fragment.namespace[i],
        ) as PropertySignature;
      const typeNode = propertySignature?.type;
      const typeElements =
        (typeNode && isTypeLiteralNode(typeNode) && typeNode.members) ||
        ([] as TypeElement[]);

      if (!propertySignature) {
        propertySignature = factory.createPropertySignature(
          undefined,
          canBePropertySignature(fragment.namespace[i])
            ? factory.createIdentifier(fragment.namespace[i])
            : factory.createStringLiteral(fragment.namespace[i]),
          undefined,
          factory.createTypeLiteralNode(typeElements),
        );
        curTypeElements.push(propertySignature);
      }
      curTypeElements = typeElements as TypeElement[];
    }

    if ('alias' in fragment && fragment.alias) {
      return statements;
    }

    const propertyName = fragment.namespace[fragment.namespace.length - 1];

    if ('destination' in fragment) {
      const linkedFragment = allFragments.find(
        ({ ref }) => ref === fragment.destination,
      );

      if (!linkedFragment) {
        throw new YError('E_BAD_DESTINATION', [fragment.destination, fragment]);
      }

      if (linkedFragment.type === 'interfaceMember') {
        curTypeElements.push(
          factory.createPropertySignature(
            undefined,
            canBePropertySignature(propertyName)
              ? factory.createIdentifier(propertyName)
              : factory.createStringLiteral(propertyName),
            fragment.optional
              ? factory.createToken(SyntaxKind.QuestionToken)
              : undefined,
            buildInterfaceReference(
              relativeReferenceToNamespace(linkedFragment.ref),
            ),
          ),
        );
        return statements;
      }

      if (linkedFragment.type === 'declarationMember') {
        curTypeElements.push(
          factory.createPropertySignature(
            undefined,
            canBePropertySignature(propertyName)
              ? factory.createIdentifier(propertyName)
              : factory.createStringLiteral(propertyName),
            fragment.optional
              ? factory.createToken(SyntaxKind.QuestionToken)
              : undefined,
            buildTypeReference(
              relativeReferenceToNamespace(linkedFragment.ref),
            ),
          ),
        );
        return statements;
      }
    }
    if ('typeNode' in fragment) {
      curTypeElements.push(
        factory.createPropertySignature(
          undefined,
          canBePropertySignature(propertyName)
            ? factory.createIdentifier(propertyName)
            : factory.createStringLiteral(propertyName),
          fragment.optional
            ? factory.createToken(SyntaxKind.QuestionToken)
            : undefined,
          fragment.typeNode,
        ),
      );
      return statements;
    }

    throw new YError('E_BAD_FRAGMENT', [fragment]);
  }, [] as InterfaceDeclaration[]);

  const typeStatements = findFragments(
    'declarationMember',
    allFragments,
  ).reduce((statements, fragment) => {
    // TEMPFIX: Add a const to manage the esbuild-jest problems
    // https://github.com/aelbore/esbuild-jest/issues/54
    const createModuleBlck = factory.createModuleBlock;
    let moduleDeclaration = statements.find(
      (d) => d.name.text === fragment.namespace[0],
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
        factory.createIdentifier(buildIdentifier(fragment.namespace[0])),
        createModuleBlck(curTypeModuleDeclarations),
        NodeFlags.Namespace | NodeFlags.ExportContext | NodeFlags.ContextFlags,
      );

      statements.push(moduleDeclaration);
    }

    for (let i = 1; i < fragment.namespace.length - 1; i++) {
      let moduleDeclaration: ModuleDeclaration | undefined =
        curTypeModuleDeclarations.find(
          (e) =>
            e &&
            isModuleDeclaration(e) &&
            (e.name as Identifier).text === fragment.namespace[i],
        ) as ModuleDeclaration;
      const typeElements =
        ((moduleDeclaration?.body as ModuleBlock)?.statements as unknown as (
          | ModuleDeclaration
          | Statement
        )[]) || ([] as (ModuleDeclaration | Statement)[]);

      if (!moduleDeclaration) {
        moduleDeclaration = factory.createModuleDeclaration(
          [factory.createModifier(SyntaxKind.ExportKeyword)],
          factory.createIdentifier(fragment.namespace[i]),
          createModuleBlck(typeElements),
          NodeFlags.Namespace |
            NodeFlags.ExportContext |
            NodeFlags.ContextFlags,
        );
        curTypeModuleDeclarations.push(moduleDeclaration);
      }
      curTypeModuleDeclarations = typeElements;
    }

    if ('destination' in fragment) {
      const linkedFragment = allFragments.find(
        ({ ref }) => ref === fragment.destination,
      );

      if (!linkedFragment) {
        throw new YError('E_BAD_DESTINATION', [fragment.destination, fragment]);
      }
      if (
        linkedFragment.type !== 'interfaceMember' &&
        linkedFragment.type !== 'declarationMember'
      ) {
        throw new YError('E_BAD_FRAGMENT', [fragment]);
      }

      curTypeModuleDeclarations.push(
        factory.createTypeAliasDeclaration(
          [factory.createModifier(SyntaxKind.ExportKeyword)],
          factory.createIdentifier(
            fragment.namespace[fragment.namespace.length - 1],
          ),
          undefined,
          linkedFragment.type === 'interfaceMember'
            ? buildInterfaceReference(linkedFragment.namespace)
            : buildTypeReference(linkedFragment.namespace, []),
        ),
      );
    } else if ('typeNode' in fragment) {
      curTypeModuleDeclarations.push(fragment.typeNode);
    } else {
      throw new YError('E_BAD_FRAGMENT', [fragment]);
    }

    return statements;
  }, [] as ModuleDeclaration[]);

  return factory.createNodeArray([
    ...statements,
    ...findFragments('statement', allFragments).map(
      (fragment) => fragment.statement,
    ),
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

export interface GeneratedSchema {
  path: string;
  contents: string;
}

export interface TypeGeneratorService {
  generateSchemas: (names: string[]) => Promise<GeneratedSchema[]>;
  generateOpenAPISchema: (content: string) => Promise<GeneratedSchema[]>;
}

export interface TypeGeneratorServiceOptions {
  openAPITypesOptions?: Partial<OpenAPITypesGenerationOptions>;
  resolveSchemaPath?: (
    name: string,
    kind: 'operation' | 'schema',
    reference: string,
  ) => string;
}

export function createTypeGeneratorService({
  openAPITypesOptions = {},
  resolveSchemaPath = defaultResolveSchemaPath,
}: TypeGeneratorServiceOptions = {}): TypeGeneratorService {
  let rootOpenAPI: OpenAPI | undefined;
  const normalizedOpenAPITypesOptions: OpenAPITypesGenerationOptions = {
    ...DEFAULT_OPEN_API_OPTIONS,
    ...openAPITypesOptions,
  };

  return {
    async generateSchemas(names: string[]) {
      if (!rootOpenAPI) {
        throw new YError('E_OPEN_API_SCHEMA_NOT_GENERATED');
      }
      const loadedOpenAPI = rootOpenAPI;

      return Promise.all(
        names.map(async (name) => {
          const operationId = name.startsWith('#/operations/')
            ? name.slice('#/operations/'.length)
            : name;
          const operationNodes = await generateOpenAPITypes(loadedOpenAPI, {
            ...normalizedOpenAPITypesOptions,
            filterOperations: [operationId],
          });

          if (operationNodes.length) {
            return {
              path: resolveSchemaPath(
                name,
                'operation',
                `#/operations/${operationId}`,
              ),
              contents: toSource(operationNodes),
            };
          }

          if (name.startsWith('#/operations/')) {
            throw new YError('E_SCHEMA_NOT_FOUND', [name]);
          }

          const schemaReference = name.startsWith('#/')
            ? name
            : `#/components/schemas/${name}`;

          try {
            await resolveNamespace(
              loadedOpenAPI as unknown as JSONSchema,
              relativeReferenceToNamespace(schemaReference),
            );
          } catch (err) {
            throw new YError('E_SCHEMA_NOT_FOUND', [name], {
              cause: err as Error,
            });
          }

          return {
            path: resolveSchemaPath(name, 'schema', schemaReference),
            contents: toSource(
              await gatherFragments(
                buildOpenAPIContext(
                  loadedOpenAPI,
                  normalizedOpenAPITypesOptions,
                ),
                [{ type: 'assumed', ref: schemaReference }],
                loadedOpenAPI,
              ),
            ),
          };
        }),
      );
    },
    async generateOpenAPISchema(content: string) {
      rootOpenAPI = JSON.parse(content) as OpenAPI;

      return [
        {
          path: normalizedOpenAPITypesOptions.basePath,
          contents: toSource(
            await generateOpenAPITypes(
              rootOpenAPI,
              normalizedOpenAPITypesOptions,
            ),
          ),
        },
      ];
    },
  };
}

function defaultResolveSchemaPath(name: string): string {
  const safeName = buildIdentifier(
    name.split('/').slice(-1)[0].replace('#', '') || 'schema',
  );

  return `${safeName}.d.ts`;
}
