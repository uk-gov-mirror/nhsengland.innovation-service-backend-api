import { mapOpenApi3 as openApi } from '@aaronpowell/azure-functions-nodejs-openapi';
import type { AzureFunction, HttpRequest } from '@azure/functions';

import { JwtDecoder } from '@users/shared/decorators';
import { JoiHelper, ResponseHelper, SwaggerHelper } from '@users/shared/helpers';
import type { AuthorizationService } from '@users/shared/services';
import SHARED_SYMBOLS from '@users/shared/services/symbols';
import type { CustomContextType } from '@users/shared/types';

import { container } from '../_config';

import type { OrganisationsService } from '../_services/organisations.service';
import SYMBOLS from '../_services/symbols';
import { ResponseBodySchema, type ResponseDTO } from './transformation.dtos';
import { ParamsSchema, ParamsType } from './validation.schemas';
import { ServiceRoleEnum } from '@users/shared/enums';

class V1OrganisationUnitNeedAccessors {
  @JwtDecoder()
  static async httpTrigger(context: CustomContextType, request: HttpRequest): Promise<void> {
    const authorizationService = container.get<AuthorizationService>(SHARED_SYMBOLS.AuthorizationService);
    const organisationsService = container.get<OrganisationsService>(SYMBOLS.OrganisationsService);

    try {
      const params = JoiHelper.Validate<ParamsType>(ParamsSchema, request.params);

      const auth = await authorizationService
        .validate(context)
        .checkAccessorType({ organisationRole: [ServiceRoleEnum.QUALIFYING_ACCESSOR] })
        .verify();

      const result = await organisationsService.getNeedsAccessorAndInnovations(
        auth.getContext(),
        params.organisationUnitId
      );

      context.res = ResponseHelper.Ok<ResponseDTO>(result);
      return;
    } catch (error) {
      context.res = ResponseHelper.Error(context, error);
      return;
    }
  }
}

export default openApi(
  V1OrganisationUnitNeedAccessors.httpTrigger as AzureFunction,
  '/v1/organisations/{organisationId}/units/{organisationUnitId}/needs-accessors',
  {
    get: {
      description: 'Get an unit needs accessors and their associated innovations',
      operationId: 'v1-organisation-unit-needs-accessors',
      parameters: SwaggerHelper.paramJ2S({ path: ParamsSchema }),
      responses: {
        200: SwaggerHelper.responseJ2S(ResponseBodySchema, {
          description: 'Success'
        }),
        400: { description: 'Bad Request' },
        401: { description: 'Unauthorized' },
        403: { description: 'Forbidden' },
        404: { description: 'Not Found' },
        500: { description: 'Internal Server Error' }
      }
    }
  }
);
