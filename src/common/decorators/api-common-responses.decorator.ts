// ============================================
// OUI-CRM - Common Swagger response decorators
// ============================================

import { applyDecorators, Type } from '@nestjs/common';
import { ApiParam, ApiResponse } from '@nestjs/swagger';
import { ApiMessages } from '../messages';

const responses = ApiMessages.swagger.responses;

const notFound = () => ApiResponse({ status: 404, description: responses.notFound });
const invalidData = () => ApiResponse({ status: 400, description: responses.invalidData });
const conflict = () => ApiResponse({ status: 409, description: responses.conflict });
const unauthorized = () => ApiResponse({ status: 401, description: responses.unauthorized });
const forbidden = () => ApiResponse({ status: 403, description: responses.forbidden });
const ok = <T>(type: Type<T> | undefined, description: string) =>
  ApiResponse({ status: 200, description, ...(type && { type }) });

/** Guarded route: 401 + 403. Applied once on the controller class, never per route. */
export function ApiAuthResponses() {
  return applyDecorators(unauthorized(), forbidden());
}

/** Action on an existing resource (status change, duplicate, resend, upload): 400 + 404 + 409 */
export function ApiActionResponses() {
  return applyDecorators(invalidData(), notFound(), conflict());
}

/** 404 alone, for routes the CRUD helpers do not cover (downloads, exports) */
export function ApiResourceNotFound() {
  return notFound();
}

/** 400 alone, for routes declaring their success response by hand */
export function ApiInvalidData() {
  return invalidData();
}

/** GET by id: 200 + 404 */
export function ApiGetResponse<T>(type: Type<T>, description = responses.success) {
  return applyDecorators(ok(type, description), notFound());
}

/** POST: 201 + 400 + 409 */
export function ApiPostResponse<T>(type: Type<T>, description = responses.created) {
  return applyDecorators(
    ApiResponse({ status: 201, description, type }),
    invalidData(),
    conflict(),
  );
}

/** PATCH: 200 + 400 + 404 */
export function ApiPatchResponse<T>(type?: Type<T>, description = responses.success) {
  return applyDecorators(ok(type, description), invalidData(), notFound());
}

/** DELETE: 204 + 404 */
export function ApiDeleteResponse(description = responses.deleted) {
  return applyDecorators(ApiResponse({ status: 204, description }), notFound());
}

/** Paginated list: 200 */
export function ApiListResponse<T>(type: Type<T>, description = responses.success) {
  return ok(type, description);
}

export function ApiCuidParam(name: string, description: string) {
  return ApiParam({ name, description, type: 'string', example: 'cjld2cjxh0000qzrmn831i7rn' });
}

/** GET by id with its CUID parameter documented */
export function ApiGetById<T>(
  paramName: string,
  paramDescription: string,
  responseType: Type<T>,
  responseDescription = responses.success,
) {
  return applyDecorators(
    ApiCuidParam(paramName, paramDescription),
    ApiGetResponse(responseType, responseDescription),
  );
}
