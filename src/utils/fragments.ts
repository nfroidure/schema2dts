import {
  type TypeParameterDeclaration,
  type Statement,
  type TypeNode,
  type EnumDeclaration,
} from 'typescript';

export type FragmentPath = string & {
  _ref?: '_path';
};
export type FragmentRef = string & {
  _ref?: '_ref';
};
export type NamespacePart = string & {
  _ref?: '_nsPart';
};
export type FragmentLocation = {
  path: FragmentPath;
  type: 'exported' | 'declared' | 'imported';
  namespace: NamespacePart[];
  kind: 'interface' | 'type' | 'statement';
  parameters?: TypeParameterDeclaration[];
};
export type BaseFragment = {
  ref: FragmentRef;
};
export type StatementFragment = BaseFragment & {
  location: FragmentLocation;
  type: 'statement';
  statement: Statement;
};
export type TypeDeclarationFragment = BaseFragment & {
  location: FragmentLocation;
  type: 'typeDeclaration';
  typeNode: EnumDeclaration;
  parameters?: TypeNode[];
};
export type TypeFragment = BaseFragment & {
  location: FragmentLocation;
  type: 'type';
  typeNode: TypeNode;
  parameters?: TypeNode[];
};
export type LinkFragment = BaseFragment & {
  location: FragmentLocation;
  type: 'link';
  destination: FragmentRef;
  parameters?: string[];
};
export type AliasFragment = BaseFragment & {
  location: FragmentLocation;
  type: 'alias';
  parameters?: string[];
};
export type AssumedFragment = BaseFragment & {
  type: 'assumed';
};

export type Fragment =
  | StatementFragment
  | TypeFragment
  | TypeDeclarationFragment
  | LinkFragment
  | AliasFragment
  | AssumedFragment;

export function buildLinkFragment(
  location: FragmentLocation,
  destination: FragmentRef,
  parameters?: string[],
  ref?: string,
): LinkFragment {
  return {
    type: 'link',
    ref: ref || 'link://' + location.namespace.join('/') + destination,
    location,
    destination,
    parameters,
  };
}

export function buildTypeFragment(
  location: FragmentLocation,
  typeNode: TypeNode,
  parameters?: TypeNode[],
  ref?: string,
): TypeFragment {
  return {
    ref: ref || 'defs://' + location.namespace.join('/'),
    location,
    type: 'type',
    typeNode,
    parameters,
  };
}
export function buildAliasFragment(
  location: FragmentLocation,
  ref: string,
  parameters?: string[],
): AliasFragment {
  return {
    ref,
    location,
    type: 'alias',
    parameters,
  };
}
