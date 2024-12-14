import { YError } from 'yerror';
import {
  type JSONSchema4,
  type JSONSchema6,
  type JSONSchema7,
} from 'json-schema';

export type JSONSchema = JSONSchema4 | JSONSchema6 | JSONSchema7;
export type Reference = { $ref: string };

export function splitRef(ref: string): string[] {
  return ref
    .replace(/^#\//, '')
    .split('/')
    .filter((s) => s);
}

export async function resolve<T, U>(
  root: T,
  namespaceParts: string[],
): Promise<U> {
  if (typeof root === 'undefined') {
    throw new YError('E_RESOLVE', namespaceParts, '__root');
  }

  return namespaceParts.reduce(
    (curSchema, part) => {
      if (typeof curSchema[part] === 'undefined') {
        throw new YError('E_RESOLVE', namespaceParts, part);
      }
      return curSchema[part];
    },
    root as unknown as U,
  ) as U;
}

export async function ensureResolved<T, U>(
  root: T,
  object: U | Reference,
): Promise<U> {
  let resolvedObject = object;

  while ('$ref' in (resolvedObject as Reference)) {
    resolvedObject = await resolve<T, U>(
      root,
      splitRef((resolvedObject as Reference).$ref),
    );
  }

  return resolvedObject as U;
}

export function eventuallyIdentifySchema(schema: JSONSchema, title: string) {
  return typeof schema === 'object' && schema
    ? {
        title,
        ...schema,
      }
    : schema;
}
