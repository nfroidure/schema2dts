import { type JsonArray, type JsonObject } from 'type-fest';

export type JSONSchemaPrimitive =
  | 'null'
  | 'boolean'
  | 'object'
  | 'array'
  | 'number'
  | 'integer'
  | 'string';

export type JSONSchemaFormat =
  | 'date'
  | 'time'
  | 'date-time'
  | 'duration'
  | 'email'
  | 'idn-email'
  | 'hostname'
  | 'idn-hostname'
  | 'ipv4'
  | 'ipv6'
  | 'uri'
  | 'uri-reference'
  | 'iri'
  | 'iri-reference'
  | 'uuid'
  | 'uri-template'
  | 'json-pointer'
  | 'relative-json-pointer'
  | 'regex';

export type JSONSchemaPrimitiveTypes = {
  null: null;
  boolean: boolean;
  number: number;
  integer: number;
  string: string;
  array: JsonArray;
  object: JsonObject;
};

export type JSONSchemaValue =
  JSONSchemaPrimitiveTypes[keyof JSONSchemaPrimitiveTypes];

export type JSONSchemaTypedProperties =
  | 'type'
  | 'enum'
  | 'const'
  | 'default'
  | 'examples';

export type BaseJSONSchema<
  T extends JSONSchemaPrimitive = JSONSchemaPrimitive,
  F extends JSONSchemaFormat = JSONSchemaFormat,
  O extends Record<string, unknown> = Record<string, unknown>,
> = {
  $id?: string;
  $comment?: string;
  $schema?: string;
  $vocabulary?: Record<string, boolean>;
  $anchor?: string;
  $dynamicAnchor?: string;
  $defs?: Record<string, JSONSchema<T, F, O>>;
  title?: string;
  description?: string;
  deprecated?: boolean;
  readOnly?: boolean;
  writeOnly?: boolean;
} & O;

export type FalseJSONSchema = false;
export type TrueJSONSchema = true;
export type ValueOnlyJSONSchema<T extends JSONSchemaPrimitive> = {
  enum?: JSONSchemaPrimitiveTypes[T][];
  const?: JSONSchemaPrimitiveTypes[T];
};

export type NullJSONSchema = {
  type: 'null';
  enum?: [null];
  const?: null;
  default?: null;
  examples?: [null];
};

export type BooleanJSONSchema = {
  type: 'boolean';
  enum?: boolean[];
  const?: boolean;
  default?: boolean;
  examples?: boolean[];
};

export type NumericJSONSchema = {
  type: 'number' | 'integer';
  enum?: number[];
  const?: number;
  default?: number;
  examples?: number[];
  multipleOf?: number;
  maximum?: number;
  exclusiveMaximum?: number;
  minimum?: number;
  exclusiveMinimum?: number;
};

export type TextJSONSchema<
  F extends JSONSchemaFormat = JSONSchemaFormat,
  O extends Record<string, unknown> = Record<string, unknown>,
> = {
  type: 'string';
  enum?: string[];
  const?: string;
  default?: string;
  examples?: string[];
  format?: F;
  maxLength?: number;
  minLength?: number;
  pattern?: string;
  contentEncoding?: string;
  contentMediaType?: string;
  contentSchema?: JSONSchema<JSONSchemaPrimitive, F, O>;
};

export type ArrayJSONSchema<
  T extends JSONSchemaPrimitive = JSONSchemaPrimitive,
  F extends JSONSchemaFormat = JSONSchemaFormat,
  O extends Record<string, unknown> = Record<string, unknown>,
> = {
  type: 'array';
  enum?: JsonArray[];
  const?: JsonArray;
  default?: JsonArray;
  examples?: JsonArray[];
  items?: JSONSchema<T, F, O>;
  contains?: JSONSchema<T, F, O>;
  prefixItems?: [JSONSchema<T, F, O>, ...JSONSchema<T, F, O>[]];
  maxItems?: number;
  minItems?: number;
  uniqueItems?: boolean;
  maxContains?: number;
  minContains?: number;
  unevaluatedItems?: JSONSchema<T, F, O>;
};

export type ObjectJSONSchema<
  T extends JSONSchemaPrimitive = JSONSchemaPrimitive,
  F extends JSONSchemaFormat = JSONSchemaFormat,
  O extends Record<string, unknown> = Record<string, unknown>,
> = {
  type: 'object';
  enum?: JsonObject[];
  const?: JsonObject;
  default?: JsonObject;
  examples?: JsonObject[];
  properties?: Record<string, JSONSchema<T, F, O>>;
  additionalProperties?: JSONSchema<T, F, O>;
  patternProperties?: Record<string, JSONSchema<T, F, O>>;
  propertyNames?: TextJSONSchema<F, O> | ComposedJSONSchema<T, F, O>;
  maxProperties?: number;
  minProperties?: number;
  required?: string[];
  dependentRequired?: Record<string, string[]>;
  unevaluatedProperties?: JSONSchema<T, F, O>;
};

export type TypedJSONSchema<
  T extends JSONSchemaPrimitive = JSONSchemaPrimitive,
  F extends JSONSchemaFormat = JSONSchemaFormat,
  O extends Record<string, unknown> = Record<string, unknown>,
> = NumericJSONSchema &
  NullJSONSchema &
  BooleanJSONSchema &
  TextJSONSchema<F, O> &
  ArrayJSONSchema<T, F, O> &
  ObjectJSONSchema<T, F, O> &
  NestedJSONSchema<T, F, O>;

export type NestedJSONSchema<
  T extends JSONSchemaPrimitive = JSONSchemaPrimitive,
  F extends JSONSchemaFormat = JSONSchemaFormat,
  O extends Record<string, unknown> = Record<string, unknown>,
> = {
  type?: T[];
  enum?: JSONSchemaPrimitiveTypes[T][];
  const?: JSONSchemaPrimitiveTypes[T];
  default?: JSONSchemaPrimitiveTypes[T];
  examples?: JSONSchemaPrimitiveTypes[T][];
} & (T extends 'number'
  ? Omit<NumericJSONSchema, JSONSchemaTypedProperties>
  : never) &
  (T extends 'string'
    ? Omit<TextJSONSchema<F, O>, JSONSchemaTypedProperties>
    : never) &
  (T extends 'array'
    ? Omit<ArrayJSONSchema<T, F, O>, JSONSchemaTypedProperties>
    : never) &
  (T extends 'object'
    ? Omit<ObjectJSONSchema<T, F, O>, JSONSchemaTypedProperties>
    : never);

export type ComposedJSONSchema<
  T extends JSONSchemaPrimitive = JSONSchemaPrimitive,
  F extends JSONSchemaFormat = JSONSchemaFormat,
  O extends Record<string, unknown> = Record<string, unknown>,
> = {
  type?: T | T[];
  enum?: JSONSchemaPrimitiveTypes[T][];
  const?: JSONSchemaPrimitiveTypes[T];
  default?: JSONSchemaPrimitiveTypes[T];
  examples?: JSONSchemaPrimitiveTypes[T][];
  $ref?: string;
  $dynamicRef?: string;
  not?: JSONSchema<T, F, O>;
  anyOf?: [JSONSchema<T, F, O>, ...JSONSchema<T, F, O>[]];
  allOf?: [JSONSchema<T, F, O>, ...JSONSchema<T, F, O>[]];
  oneOf?: [JSONSchema<T, F, O>, ...JSONSchema<T, F, O>[]];
  if?: JSONSchema<T, F, O>;
  then?: JSONSchema<T, F, O>;
  else?: JSONSchema<T, F, O>;
  dependentSchemas?: Record<string, JSONSchema<T, F, O>>;
} & Omit<NumericJSONSchema, JSONSchemaTypedProperties> &
  Omit<TextJSONSchema<F, O>, JSONSchemaTypedProperties> &
  Omit<ArrayJSONSchema<T, F, O>, JSONSchemaTypedProperties> &
  Omit<ObjectJSONSchema<T, F, O>, JSONSchemaTypedProperties>;

/** JSON Schema types for the 2020-12 draft using
 * Typescript to check constraints that can be
 * validated statically. */
export type JSONSchema<
  T extends JSONSchemaPrimitive = JSONSchemaPrimitive,
  F extends JSONSchemaFormat = JSONSchemaFormat,
  O extends Record<string, unknown> = Record<string, unknown>,
> =
  | FalseJSONSchema
  | TrueJSONSchema
  | (BaseJSONSchema<T, F, O> &
      (
        | NullJSONSchema
        | ValueOnlyJSONSchema<T>
        | BooleanJSONSchema
        | NumericJSONSchema
        | TextJSONSchema<F, O>
        | ArrayJSONSchema<T, F, O>
        | ObjectJSONSchema<T, F, O>
        | NestedJSONSchema<T, F, O>
      ))
  | (BaseJSONSchema<T, F, O> & ComposedJSONSchema<T, F, O>);
