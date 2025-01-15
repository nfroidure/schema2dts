import { type LogService } from 'common-services';
import { autoService, location } from 'knifecycle';
import { type Fragment } from '../utils/fragments.js';

export type TypeDefinitionBuilderService = {
  register: (fragment: Fragment) => void;
  find: (ref: string) => Fragment | undefined;
  list<T extends Fragment['type'] | undefined>(
    searchedType?: T,
  ): T extends undefined ? Fragment[] : Extract<Fragment, { type: T }>[];
  assume: (ref: string) => void;
};

async function initTypeDefinitionBuilder({
  log,
}: {
  log: LogService;
}): Promise<TypeDefinitionBuilderService> {
  let store: Fragment[] = [];

  log('info', '💱 - Initializing the type definition builder service.');

  const typeDefinition = {
    register: (fragment: Fragment) => {
      if (
        fragment.type === 'assumed' &&
        store.find((aFragment) => fragment.ref === aFragment.ref)
      ) {
        return;
      }

      store = store
        .filter((aFragment) => aFragment.ref !== fragment.ref)
        .concat(fragment);
    },
    find: (ref: string) => {
      return store.find((fragment) => fragment.ref === ref);
    },
    list: (searchedType?: Fragment['type'] | undefined) => {
      if (searchedType) {
        return store.filter(
          ({ type }) => !searchedType || type === searchedType,
        );
      }
      return store;
    },
    assume: (ref: string) => {
      if (store.find((fragment) => fragment.ref === ref)) {
        return;
      }

      store.push({
        type: 'assumed',
        ref,
      });
    },
  } as TypeDefinitionBuilderService;
  return typeDefinition;
}

export default location(
  autoService(initTypeDefinitionBuilder),
  import.meta.url,
);
