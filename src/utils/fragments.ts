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

export function cleanAssumedFragments(fragments: Fragment[]) {
  process.stdout.write(`\n\n\n\nASSUMED CLEANUP: \n\n`);
  for (let i = 0; i < fragments.length; i++) {
    const fragmentsWithSameRef = fragments.filter(
      (aFragment) => aFragment.ref === fragments[i].ref,
    );

    if (fragmentsWithSameRef.length > 1) {
      if (fragments[i].type === 'assumed') {
        process.stdout.write(`- ${fragments[i].ref} \n`);
        fragments.splice(i, 1);
        i--;
      }
    }
  }
  return fragments;
}

export function combineFragments(
  fragments: Fragment[],
  addedFragments: Fragment[],
) {
  for (const fragment of addedFragments) {
    if (fragment.type !== 'assumed') {
      fragments = fragments.filter((aFragment) => aFragment.ref !== fragment.ref);
      fragments = fragments.concat([fragment]);
    } else if (!assumeRef(fragments, fragment.ref)) {
      fragments = fragments.concat([fragment]);
    }
  }

  return fragments;
}

export function assumeRef(fragments: Fragment[], ref: FragmentRef): boolean {
  return fragments.some((fragment) => fragment.ref === ref);
}

export function findFragments<T extends Fragment['type']>(
  searchedType: T,
  fragments: Fragment[],
): (T extends 'statement'
  ? StatementFragment
  : T extends 'interfaceMember'
    ? InterfaceMemberFragment
    : T extends 'declarationMember'
      ? DeclarationMemberFragment
      : T extends 'assumed'
        ? AssumedFragment
        : never)[] {
  return fragments.filter(
    ({ type }) => type === searchedType,
  ) as (T extends 'statement'
    ? StatementFragment
    : T extends 'interfaceMember'
      ? InterfaceMemberFragment
      : T extends 'declarationMember'
        ? DeclarationMemberFragment
        : T extends 'assumed'
          ? AssumedFragment
          : never)[];
}
