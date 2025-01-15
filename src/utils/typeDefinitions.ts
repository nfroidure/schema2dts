import {
  factory,
  type IndexedAccessTypeNode,
  type TypeReferenceNode,
  type EntityName,
  type TypeNode,
} from 'typescript';
import { type JSONSchema7Type } from 'json-schema';

export function buildLiteralType(value: JSONSchema7Type): TypeNode {
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
      if (value instanceof Array) {
        return factory.createTupleTypeNode(value.map(buildLiteralType));
      } else if (value == null) {
        return factory.createLiteralTypeNode(factory.createNull());
      } else {
        return factory.createTypeLiteralNode(
          Object.keys(value).map((key) =>
            factory.createPropertySignature(
              undefined,
              factory.createIdentifier(key),
              undefined,
              buildLiteralType(value[key]),
            ),
          ),
        );
      }
  }
}

export function buildTypeReference(
  namespaceParts: string[],
  parameters: string[] = [],
) {
  return factory.createTypeReferenceNode(
    namespaceParts.reduce<EntityName>(
      (curNode: EntityName | null, referencePart: string) => {
        const identifier = factory.createIdentifier(referencePart);

        return curNode
          ? factory.createQualifiedName(curNode, identifier)
          : identifier;
      },
      null as unknown as EntityName,
    ),
    parameters.map((parameter) => factory.createTypeReferenceNode(parameter)),
  );
}

export function buildInterfaceReference(namespaceParts: string[]) {
  let curNode: IndexedAccessTypeNode | TypeReferenceNode =
    factory.createTypeReferenceNode(
      factory.createIdentifier(namespaceParts[0]),
      undefined,
    );

  for (let i = 1; i < namespaceParts.length; i++) {
    curNode = factory.createIndexedAccessTypeNode(
      curNode,
      factory.createLiteralTypeNode(
        factory.createStringLiteral(namespaceParts[i]),
      ),
    );
  }
  return curNode;
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
