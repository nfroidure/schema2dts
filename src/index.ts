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
  type Node,
} from 'typescript';
import {
  buildTypeReference,
  buildIdentifier,
  buildInterfaceReference,
  canBeIdentifier,
} from './utils/typeDefinitions.js';
import {
  DEFAULT_JSON_SCHEMA_OPTIONS,
  eventuallyBrandType,
  eventuallyIdentifySchema,
  jsonSchemaToFragments,
  resolve,
  schemaToTypeNode,
  splitRef,
  type JSONSchemaContext,
  type JSONSchemaOptions,
  type JSONSchema,
} from './utils/jsonSchema.js';
import initTypeDefinitionBuilder, {
  type TypeDefinitionBuilderService,
} from './services/typeDefinitionBuilder.js';
import {
  DEFAULT_OPEN_API_OPTIONS,
  openAPIToFragments,
  type OpenAPIContext,
  type OpenAPITypesGenerationOptions,
} from './utils/openAPI.js';
import { YError } from 'yerror';

const debug = initDebug('schema2dts');

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
  const context: OpenAPIContext = {
    jsonSchemaOptions: {
      baseName,
      brandedTypes:
        brandedTypes !== 'schemas'
          ? brandedTypes
          : Object.keys(rootOpenAPI?.components?.schemas || {}),
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

  const fragments = await openAPIToFragments(context, rootOpenAPI);

  const typeDefinitionBuilder = await initTypeDefinitionBuilder({
    log: debug,
  });

  fragments.map(typeDefinitionBuilder.register);

  return gatherFragments(context, typeDefinitionBuilder, rootOpenAPI);
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

  return gatherFragments(context, typeDefinitionBuilder, rootSchema);
}

export async function gatherFragments(
  context: JSONSchemaContext | OpenAPIContext,
  typeDefinitionBuilder: TypeDefinitionBuilderService,
  document: JSONSchema | OpenAPIV3_1.Document,
): Promise<NodeArray<Statement>> {
  const statements: Statement[] = [];
  let assumedFragmentsToBuild = typeDefinitionBuilder.list('assumed');

  debug('gatherFragments: start');

  while (assumedFragmentsToBuild.length) {
    for (const assumedFragmentToBuild of assumedFragmentsToBuild) {
      const namespace = splitRef(assumedFragmentToBuild.ref);
      const subSchema = await resolve<JSONSchema, JSONSchema>(
        document as JSONSchema,
        namespace,
      );

      if (subSchema.$ref) {
        typeDefinitionBuilder.register({
          ref: assumedFragmentToBuild.ref,
          type: 'interfaceMember',
          namespace,
          destination: subSchema.$ref,
        });
        typeDefinitionBuilder.register({
          type: 'assumed',
          ref: subSchema.$ref,
        });
        continue;
      }

      const identifier = buildIdentifier(namespace[namespace.length - 1]);
      const finalSchema = eventuallyIdentifySchema(subSchema, identifier);
      const { type, fragments } = await schemaToTypeNode(context, finalSchema);

      (fragments || []).map(typeDefinitionBuilder.register);

      typeDefinitionBuilder.register({
        ref: assumedFragmentToBuild.ref,
        type: 'interfaceMember',
        namespace,
        typeNode: await eventuallyBrandType(context, finalSchema, type),
      });
    }

    assumedFragmentsToBuild = typeDefinitionBuilder.list('assumed');
  }

  const interfaceStatements = typeDefinitionBuilder
    .list('interfaceMember')
    .reduce((statements, fragment) => {
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
            canBeIdentifier(fragment.namespace[i])
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
        const linkedFragment = typeDefinitionBuilder.find(fragment.destination);

        if (!linkedFragment) {
          throw new YError('E_BAD_DESTINATION', fragment.destination, fragment);
        }

        if (linkedFragment.type === 'interfaceMember') {
          curTypeElements.push(
            factory.createPropertySignature(
              undefined,
              canBeIdentifier(propertyName)
                ? factory.createIdentifier(propertyName)
                : factory.createStringLiteral(propertyName),
              fragment.optional
                ? factory.createToken(SyntaxKind.QuestionToken)
                : undefined,
              buildInterfaceReference(splitRef(linkedFragment.ref)),
            ),
          );
          return statements;
        }

        if (linkedFragment.type === 'declarationMember') {
          curTypeElements.push(
            factory.createPropertySignature(
              undefined,
              canBeIdentifier(propertyName)
                ? factory.createIdentifier(propertyName)
                : factory.createStringLiteral(propertyName),
              fragment.optional
                ? factory.createToken(SyntaxKind.QuestionToken)
                : undefined,
              buildTypeReference(splitRef(linkedFragment.ref)),
            ),
          );
          return statements;
        }
      }
      if ('typeNode' in fragment) {
        curTypeElements.push(
          factory.createPropertySignature(
            undefined,
            canBeIdentifier(propertyName)
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

      throw new YError('E_BAD_FRAGMENT', fragment);
    }, [] as InterfaceDeclaration[]);

  const typeStatements = typeDefinitionBuilder
    .list('declarationMember')
    .reduce((statements, fragment) => {
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
          NodeFlags.Namespace |
            NodeFlags.ExportContext |
            NodeFlags.ContextFlags,
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
        const linkedFragment = typeDefinitionBuilder.find(fragment.destination);

        if (!linkedFragment) {
          throw new YError('E_BAD_DESTINATION', fragment.destination, fragment);
        }
        if (
          linkedFragment.type !== 'interfaceMember' &&
          linkedFragment.type !== 'declarationMember'
        ) {
          throw new YError('E_BAD_FRAGMENT', fragment);
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
        throw new YError('E_BAD_FRAGMENT', fragment);
      }

      return statements;
    }, [] as ModuleDeclaration[]);

  return factory.createNodeArray([
    ...statements,
    ...typeDefinitionBuilder
      .list('statement')
      .map((fragment) => fragment.statement),
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
