import { mapOpenApi3 as openApi } from '@aaronpowell/azure-functions-nodejs-openapi';
import type { AzureFunction, HttpRequest } from '@azure/functions';

import { JwtDecoder } from '@admin/shared/decorators';
import { JoiHelper, ResponseHelper, SwaggerHelper } from '@admin/shared/helpers';
import type { AuthorizationService } from '@admin/shared/services';
import { IdentityProviderService } from '@admin/shared/services';
import type { CustomContextType } from '@admin/shared/types';

import { container } from '../_config';

import SHARED_SYMBOLS from '@admin/shared/services/symbols';
import { BodySchema, type BodyType, ResponseBodySchema, type ResponseDTO } from './transformation';

class V1TestB2C {
  @JwtDecoder()
  static async httpTrigger(context: CustomContextType, request: HttpRequest): Promise<void> {
    try {
      const authorizationService = container.get<AuthorizationService>(SHARED_SYMBOLS.AuthorizationService);
      await authorizationService.validate(context).checkAdminType().verify();

      const body = JoiHelper.Validate<BodyType>(BodySchema, request.body);

      const identityProviderService = container.get<IdentityProviderService>(SHARED_SYMBOLS.IdentityProviderService);

      const start = Date.now();
      const results = await identityProviderService.runVolumeTest(body.userIds, body.useOld);
      const timeTakenMs = Date.now() - start;

      context.res = ResponseHelper.Ok<ResponseDTO>({
        count: results.length,
        timeTakenMs,
        status: 'SUCCESS'
      });
    } catch (error) {
      context.res = ResponseHelper.Error(context, error);
    }
  }
}

export default openApi(V1TestB2C.httpTrigger as AzureFunction, '/v1/debug/test-b2c', {
  post: {
    summary: 'Test B2C rate limit handling',
    description: 'DEBUG endpoint to compare old vs new B2C fetching logic. Remove before merging to production.',
    operationId: 'v1-admin-test-b2c',
    tags: ['[v1] debug'],
    requestBody: SwaggerHelper.bodyJ2S(BodySchema),
    responses: {
      200: SwaggerHelper.responseJ2S(ResponseBodySchema, {
        description: 'Success'
      }),
      401: {
        description: 'Unauthorized'
      },
      403: {
        description: 'Forbidden'
      }
    }
  }
});
