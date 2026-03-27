import { name, autoService, location } from 'knifecycle';
import {
  createPrinter,
  createSourceFile,
  ListFormat,
  NewLineKind,
  ScriptKind,
  ScriptTarget,
  factory,
  type Statement,
} from 'typescript';
import { type Fragment } from '../utils/fragments.js';
import { YError } from 'yerror';
import { type LogService } from 'common-services';

export type Path = string & {
  _brand?: '_path';
};
export type Reference = string & {
  _brand?: '_reference';
};

async function initTSFileRegister({ log }: { log: LogService }) {
  log('debug', `🎫 - Initializing the TypeScript file register.`);

  const files: Record<
    string,
    {
      assumedReferences: Reference[];
      integratedReferences: Reference[];
      statements: Statement[];
    }
  > = {};
  const assumeFile = (path: Path) => {
    if (!files[path]) {
      log('debug', `🎫 - Registering a new file (${path}).`);
      files[path] = {
        assumedReferences: [],
        integratedReferences: [],
        statements: [],
      };
    }
  };
  const assume = (path: Path, ref: Reference) => {
    assumeFile(path);

    files[path].assumedReferences.push(ref);
  };
  const push = (path: Path, fragment: Fragment) => {
    assumeFile(path);

    if (fragment.type === 'statement') {
      files[path].statements.push(fragment.statement);
    }

    files[path].integratedReferences.push(fragment.ref);
  };
  const toSources = () => {
    return Object.keys(files).map((path) => {
      if (files[path].assumedReferences.length) {
        log(
          'error',
          `❌ - Could not build sources, some assumed references are lacking.`,
        );
        throw new YError('E_LACK_ASSUMED_REFS', [
          path,
          files[path].assumedReferences,
        ]);
      }

      const resultFile = createSourceFile(
        'someFileName.ts',
        '',
        ScriptTarget.Latest,
        false,
        ScriptKind.TS,
      );
      const printer = createPrinter({
        newLine: NewLineKind.LineFeed,
      });

      return {
        path,
        content: printer.printList(
          ListFormat.SourceFileStatements,
          factory.createNodeArray(files[path].statements),
          resultFile,
        ),
      };
    });
  };

  return {
    assume,
    push,
    toSources,
  };
}

export default location(
  name('tsFileRegister', autoService(initTSFileRegister)),
  import.meta.url,
);
