import {
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
export type BaseFragment = {
  ref: FragmentRef;
};
export type StatementFragment = BaseFragment & {
  type: 'statement';
  statement: Statement;
};
export type DeclarationMemberFragment = BaseFragment & {
  type: 'declarationMember';
  namespace: NamespacePart[];
} & (
    | {
        typeNode: EnumDeclaration;
      }
    | {
        destination: FragmentRef;
      }
    | {
        alias: true;
      }
  );
export type InterfaceMemberFragment = BaseFragment & {
  type: 'interfaceMember';
  namespace: NamespacePart[];
  optional?: boolean;
} & (
    | {
        typeNode: TypeNode;
      }
    | {
        destination: FragmentRef;
      }
    | {
        alias: true;
      }
  );
export type AssumedFragment = BaseFragment & {
  type: 'assumed';
};

export type Fragment =
  | StatementFragment
  | InterfaceMemberFragment
  | DeclarationMemberFragment
  | AssumedFragment;
