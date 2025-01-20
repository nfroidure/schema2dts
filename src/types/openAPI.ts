import { type JsonValue } from 'type-fest';
import { type JSONSchema } from './jsonSchema.js';

/**
 * Default generic types matching specification extensions
 */
export type OpenAPIExtension = {
  [key: `x-${string}`]: JsonValue;
};
/** Branded type for strings that may contain common mark syntax */
export type OpenAPIDescription = string & {
  _type?: 'oas:description';
};
/** Branded type for media types */
export type OpenAPIMediaTypeValue = string & {
  _type?: 'oas:media-type';
};
/** Branded type for path templates */
export type OpenAPIPathTemplate = string & {
  _type?: 'oas:path-template';
};
/** Branded type for urls */
export type OpenAPIURL = string & {
  _type?: 'oas:url';
};
/** Branded type for expressions */
export type OpenAPIExpression = string & {
  _type?: 'oas:expression';
};
/** Branded type for email */
export type OpenAPIEmail = string & {
  _type?: 'oas:email';
};
/** Branded type for status codes */
export type OpenAPIStatusCode = number & {
  _type?: 'oas:status-code';
};
export type OpenAPIExample = {
  summary?: string;
  description?: OpenAPIDescription;
} & (
  | {
      value: JsonValue;
    }
  | {
      externalValue: string;
    }
);
export type OpenAPIExternalDocumentation<X extends OpenAPIExtension> = {
  url: OpenAPIURL;
  description?: OpenAPIDescription;
} & X;
export type OpenAPITag<X extends OpenAPIExtension> = {
  name: string;
  description?: OpenAPIDescription;
  externalDocs?: OpenAPIExternalDocumentation<X>;
} & X;
export type OpenAPIContact<X extends OpenAPIExtension> = {
  name?: string;
  url?: OpenAPIURL;
  email?: OpenAPIEmail;
} & X;
export type OpenAPILicense<X extends OpenAPIExtension> = {
  name?: string;
  identifier?: string;
  url?: OpenAPIURL;
} & X;
export type OpenAPIInfo<X extends OpenAPIExtension> = {
  title: string;
  summary?: string;
  description?: OpenAPIDescription;
  termsOfService?: string;
  contact?: OpenAPIContact<X>;
  license?: OpenAPILicense<X>;
  version: string;
} & X;
export type OpenAPIServerVariable<X extends OpenAPIExtension> = {
  enum?: string[];
  default: string;
  description?: OpenAPIDescription;
} & X;
export type OpenAPIServer<X extends OpenAPIExtension> = {
  url: OpenAPIURL;
  description?: OpenAPIDescription;
  variables?: Record<string, OpenAPIServerVariable<X>>;
} & X;
export type OpenAPIReferenceable<D, X extends OpenAPIExtension> =
  | OpenAPIHeader<D, X>
  | OpenAPIResponse<D, X>
  | OpenAPIParameter<D, X>
  | OpenAPIPathItem<D, X>
  | OpenAPICallback<D, X>
  | D;
export type OpenAPIReference<
  T extends OpenAPIReferenceable<unknown, OpenAPIExtension>,
> = {
  $ref: string;
  _targetType?: T;
};
export type OpenAPIEncoding<D, X extends OpenAPIExtension> = {
  contentType?: string;
  headers?: Record<
    string,
    OpenAPIReference<OpenAPIHeader<D, X>> | OpenAPIHeader<D, X>
  >;
  style?: string;
  explode?: boolean;
  allowReserved?: boolean;
} & X;
export type OpenAPIMediaType<D, X extends OpenAPIExtension> = {
  schema?: D;
  example?: JsonValue;
  examples?: JsonValue[];
  encoding?: Record<string, OpenAPIEncoding<D, X>>;
} & X;
export type OpenAPIResponses<D, X extends OpenAPIExtension> = Record<
  string,
  OpenAPIResponse<D, X> | OpenAPIReference<OpenAPIResponse<D, X>>
> &
  X;
export type OpenAPIResponse<D, X extends OpenAPIExtension> = {
  description?: OpenAPIDescription;
  headers?: Record<
    string,
    OpenAPIReference<OpenAPIHeader<D, X>> | OpenAPIHeader<D, X>
  >;
  links?: Record<string, OpenAPILink<X> | OpenAPIReference<OpenAPILink<X>>>;
  content?: Record<string, OpenAPIMediaType<D, X>>;
} & X;
export type OpenAPIParameter<D, X extends OpenAPIExtension> = {
  name: string;
  description?: OpenAPIDescription;
  deprecated?: boolean;
  allowEmptyValue?: boolean;
} & (
  | {
      in: 'path' | 'query' | 'header' | 'cookie';
      required?: boolean;
    }
  | {
      in: 'path';
      required: true;
    }
) &
  (
    | {
        schema: D;
        style?: (
          | 'matrix'
          | 'label'
          | 'simple'
          | 'form'
          | 'spaceDelimited'
          | 'pipeDelimited'
          | 'deepObject'
        )[];
        explode?: boolean;
        allowReserved?: boolean;
        example?: JsonValue;
        examples?: Record<
          string,
          OpenAPIExample | OpenAPIReference<OpenAPIExample>
        >;
      }
    | {
        content: Record<string, OpenAPIMediaType<D, X>>;
      }
  ) &
  X;
export type OpenAPIRequestBody<D, X extends OpenAPIExtension> = {
  description?: OpenAPIDescription;
  content: Record<string, OpenAPIMediaType<D, X>>;
  required?: boolean;
} & X;
export type OpenAPIHeader<D, X extends OpenAPIExtension> = {
  description?: OpenAPIDescription;
  required?: boolean;
  deprecated?: boolean;
} & (
  | {
      schema: D;
      style?: 'simple'[];
      explode?: boolean;
      allowReserved?: boolean;
      example?: JsonValue;
      examples?: Record<
        string,
        OpenAPIExample | OpenAPIReference<OpenAPIExample>
      >;
    }
  | {
      content: Record<string, OpenAPIMediaType<D, X>>;
    }
) &
  X;
export type OpenAPIOAuthFlow<X extends OpenAPIExtension, F extends string> = {
  refreshUrl?: OpenAPIURL;
  scope: string[];
} & (F extends 'implicit' | 'authorizationCode'
  ? {
      authorizationUrl: OpenAPIURL;
    }
  : {
      authorizationUrl?: OpenAPIURL;
    }) &
  (F extends 'password' | 'clientCredentials' | 'authorizationCode'
    ? {
        tokenUrl: OpenAPIURL;
      }
    : {
        tokenUrl?: OpenAPIURL;
      }) &
  X;
export type OpenAPIOAuthFlows<X extends OpenAPIExtension> = {
  implicit?: OpenAPIOAuthFlow<X, 'implicit'>;
  password?: OpenAPIOAuthFlow<X, 'password'>;
  clientCredentials?: OpenAPIOAuthFlow<X, 'clientCredentials'>;
  authorizationCode?: OpenAPIOAuthFlow<X, 'authorizationCode'>;
};
export type OpenAPISecurityRequirement = Record<string, string[]>;
export type OpenAPISecurityScheme<X extends OpenAPIExtension> = {
  description?: OpenAPIDescription;
  type: string;
} & (
  | {
      type: 'apiKey';
      name: string;
      in: ('query' | 'header' | 'cookie')[];
    }
  | ({
      type: 'http';
    } & (
      | {
          scheme: 'bearer';
          bearerFormat?: string;
        }
      | {
          scheme: string;
        }
    ))
  | {
      type: 'mutualTLS';
    }
  | {
      type: 'oauth2';
      flows: OpenAPIOAuthFlows<X>;
    }
  | {
      type: 'openIdConnect';
      openIdConnectUrl: string;
    }
) &
  X;
export type OpenAPILink<X extends OpenAPIExtension> = (
  | {
      operationRef?: string;
    }
  | {
      operationId?: string;
    }
) & {
  parameters?: Record<string, JsonValue | OpenAPIExpression>;
  requestBody?: JsonValue | OpenAPIExpression;
  description?: OpenAPIDescription;
  server?: OpenAPIServer<X>;
} & X;
export type OpenAPICallback<D, X extends OpenAPIExtension> = Record<
  OpenAPIExpression,
  OpenAPIPathItem<D, X>
> &
  X;
export type OpenAPIPathItem<D, X extends OpenAPIExtension> = {
  $ref?: string;
  summary?: string;
  description?: string;
  get?: OpenAPIOperation<D, X>;
  put?: OpenAPIOperation<D, X>;
  post?: OpenAPIOperation<D, X>;
  delete?: OpenAPIOperation<D, X>;
  options?: OpenAPIOperation<D, X>;
  head?: OpenAPIOperation<D, X>;
  patch?: OpenAPIOperation<D, X>;
  trace?: OpenAPIOperation<D, X>;
  servers?: OpenAPIServer<X>[];
  parameters?: (
    | OpenAPIParameter<D, X>
    | OpenAPIReference<OpenAPIParameter<D, X>>
  )[];
} & X;
export type OpenAPIOperation<D, X extends OpenAPIExtension> = {
  tags?: string[];
  summary?: string;
  description?: OpenAPIDescription;
  externalDocs?: OpenAPIExternalDocumentation<X>;
  operationId?: string;
  parameters?: (
    | OpenAPIParameter<D, X>
    | OpenAPIReference<OpenAPIParameter<D, X>>
  )[];
  requestBody?:
    | OpenAPIRequestBody<D, X>
    | OpenAPIReference<OpenAPIRequestBody<D, X>>;
  responses?: OpenAPIResponses<D, X>;
  callbacks?: Record<
    string,
    OpenAPICallback<D, X> | OpenAPIReference<OpenAPICallback<D, X>>
  >;
  deprecated?: boolean;
  security?: OpenAPISecurityRequirement[];
  servers?: OpenAPIServer<X>[];
} & X;
export type OpenAPIComponents<D, X extends OpenAPIExtension> = {
  schemas?: Record<string, D>;
  responses?: Record<
    string,
    OpenAPIResponse<D, X> | OpenAPIReference<OpenAPIResponse<D, X>>
  >;
  parameters?: Record<
    string,
    OpenAPIParameter<D, X> | OpenAPIReference<OpenAPIParameter<D, X>>
  >;
  examples?: Record<string, OpenAPIExample | OpenAPIReference<OpenAPIExample>>;
  requestBodies?: Record<
    string,
    OpenAPIRequestBody<D, X> | OpenAPIReference<OpenAPIRequestBody<D, X>>
  >;
  headers?: Record<
    string,
    OpenAPIHeader<D, X> | OpenAPIReference<OpenAPIHeader<D, X>>
  >;
  securitySchemes?: Record<
    string,
    OpenAPISecurityScheme<X> | OpenAPIReference<OpenAPISecurityScheme<X>>
  >;
  links?: Record<string, OpenAPILink<X> | OpenAPIReference<OpenAPILink<X>>>;
  callbacks?: Record<
    string,
    OpenAPICallback<D, X> | OpenAPIReference<OpenAPICallback<D, X>>
  >;
  pathItems?: Record<string, OpenAPIPathItem<D, X>>;
} & X;
export type OpenAPIPaths<D, X extends OpenAPIExtension> = {
  [key: `/${string}`]: OpenAPIPathItem<D, X>;
};

/** Open API types for the 3.1 specification */
export type OpenAPI<
  D = JSONSchema,
  X extends OpenAPIExtension = OpenAPIExtension,
> = {
  openapi: '3.1' | '3.1.0' | '3.1.1';
  info: OpenAPIInfo<X>;
  jsonSchemaDialect?: string;
  servers?: OpenAPIServer<X>[];
  paths?: OpenAPIPaths<D, X>;
  webhooks?: Record<string, OpenAPIPathItem<D, X>>;
  components?: OpenAPIComponents<D, X>;
  security?: OpenAPIComponents<D, X>;
  tags?: OpenAPITag<X>;
  externalDocs?: OpenAPIComponents<D, X>;
};
