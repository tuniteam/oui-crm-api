// ============================================
// OUI-CRM - Common API Response Decorators
// Décorateurs réutilisables pour Swagger
// ============================================

import { applyDecorators, Type } from '@nestjs/common';
import { ApiResponse, ApiParam } from '@nestjs/swagger';

/**
 * Décorateur pour les réponses standards GET (200 + 404)
 */
export function ApiGetResponse<T>(type: Type<T>, description = 'Success') {
  return applyDecorators(
    ApiResponse({
      status: 200,
      description,
      type,
    }),
    ApiResponse({
      status: 404,
      description: 'Resource not found',
    }),
  );
}

/**
 * Décorateur pour les réponses standards POST (201 + 400 + 409)
 */
export function ApiPostResponse<T>(type: Type<T>, description = 'Created successfully') {
  return applyDecorators(
    ApiResponse({
      status: 201,
      description,
      type,
    }),
    ApiResponse({
      status: 400,
      description: 'Invalid request data',
    }),
    ApiResponse({
      status: 409,
      description: 'Resource already exists',
    }),
  );
}

/**
 * Décorateur pour les réponses standards PUT (200 + 400 + 404)
 */
export function ApiPutResponse<T>(type: Type<T>, description = 'Success') {
  return applyDecorators(
    ApiResponse({
      status: 200,
      description,
      type,
    }),
    ApiResponse({
      status: 400,
      description: 'Invalid request data',
    }),
    ApiResponse({
      status: 404,
      description: 'Resource not found',
    }),
  );
}

/**
 * Décorateur pour les réponses standards PATCH (200 + 400 + 404)
 */
export function ApiPatchResponse<T>(type?: Type<T>, description = 'Success') {
  const decorators: Array<ClassDecorator | MethodDecorator | PropertyDecorator> = [
    ApiResponse({
      status: 200,
      description,
      ...(type && { type }),
    }),
    ApiResponse({
      status: 400,
      description: 'Invalid request data',
    }),
    ApiResponse({
      status: 404,
      description: 'Resource not found',
    }),
  ];

  return applyDecorators(...decorators);
}

/**
 * Décorateur pour les réponses standards DELETE (204 + 404)
 */
export function ApiDeleteResponse(description = 'Deleted') {
  return applyDecorators(
    ApiResponse({
      status: 204,
      description,
    }),
    ApiResponse({
      status: 404,
      description: 'Resource not found',
    }),
  );
}

/**
 * Décorateur pour les réponses de liste paginée (200)
 */
export function ApiListResponse<T>(type: Type<T>, description = 'Success') {
  return applyDecorators(
    ApiResponse({
      status: 200,
      description,
      type,
    }),
  );
}

/**
 * Décorateur combiné pour paramètre CUID standard
 */
export function ApiCuidParam(name: string, description: string) {
  return ApiParam({
    name,
    description,
    type: 'string',
    example: 'cjld2cjxh0000qzrmn831i7rn',
  });
}

/**
 * Décorateur combiné pour endpoint GET standard avec CUID
 */
export function ApiGetById<T>(
  paramName: string,
  paramDescription: string,
  responseType: Type<T>,
  responseDescription = 'Success',
) {
  return applyDecorators(
    ApiCuidParam(paramName, paramDescription),
    ApiGetResponse(responseType, responseDescription),
  );
}

/**
 * Décorateur combiné pour endpoint PUT standard avec CUID
 */
export function ApiPutById<T>(
  paramName: string,
  paramDescription: string,
  responseType: Type<T>,
  responseDescription = 'Success',
) {
  return applyDecorators(
    ApiCuidParam(paramName, paramDescription),
    ApiPutResponse(responseType, responseDescription),
  );
}

/**
 * Décorateur combiné pour endpoint DELETE standard avec CUID
 */
export function ApiDeleteById(
  paramName: string,
  paramDescription: string,
  responseDescription = 'Deleted',
) {
  return applyDecorators(
    ApiCuidParam(paramName, paramDescription),
    ApiDeleteResponse(responseDescription),
  );
}
