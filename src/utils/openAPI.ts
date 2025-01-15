import { type OpenAPIV3_1 } from 'openapi-types';

export function pickOperationObject(
  maybeMethod: string,
  maybeOperationObject: OpenAPIV3_1.PathItemObject[keyof OpenAPIV3_1.PathItemObject],
): OpenAPIV3_1.OperationObject | OpenAPIV3_1.ReferenceObject | undefined {
  if (
    [
      'head',
      'options',
      'get',
      'put',
      'post',
      'delete',
      'patch',
      'trace',
    ].includes(maybeMethod)
  ) {
    return maybeOperationObject as
      | OpenAPIV3_1.OperationObject
      | OpenAPIV3_1.ReferenceObject;
  }
  return undefined;
}
