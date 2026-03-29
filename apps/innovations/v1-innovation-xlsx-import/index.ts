import { mapOpenApi3 as openapi } from '@aaronpowell/azure-functions-nodejs-openapi';
import type { AzureFunction, HttpRequest } from '@azure/functions';

import { Audit, ElasticSearchDocumentUpdate, JwtDecoder } from '@innovations/shared/decorators';
import { JoiHelper, ResponseHelper, SwaggerHelper } from '@innovations/shared/helpers';
import type { AuthorizationService } from '@innovations/shared/services';
import SHARED_SYMBOLS from '@innovations/shared/services/symbols';
import { ActionEnum, TargetEnum } from '@innovations/shared/services/integrations/audit.service';
import type { CustomContextType } from '@innovations/shared/types';
import { container } from '../_config';
import SYMBOLS from '../_services/symbols';
import type { ExcelInnovationService } from '../_services/excel-innovation.service';
import { BodySchema, type BodyType } from './validation.schemas';

class V1InnovationXlsxImport {
  @JwtDecoder()
  @Audit({
    action: ActionEnum.CREATE,
    identifierResponseField: 'id',
    target: TargetEnum.INNOVATION
  })
  @ElasticSearchDocumentUpdate({ identifierResponseField: 'id' })
  static async httpTrigger(context: CustomContextType, request: HttpRequest): Promise<void> {
    const authorizationService = container.get<AuthorizationService>(SHARED_SYMBOLS.AuthorizationService);
    const excelInnovationService = container.get<ExcelInnovationService>(SYMBOLS.ExcelInnovationService);

    try {
      const { file: base64Xlsx } = JoiHelper.Validate<BodyType>(BodySchema, request.body);

      const auth = await authorizationService
        .validate(context)
        .checkInnovatorType()
        .verify();

      const result = await excelInnovationService.importInnovation(auth.getContext(), base64Xlsx);
      
      context.res = ResponseHelper.Ok<{ id: string }>(result);
      return;
    } catch (error) {
      context.res = ResponseHelper.Error(context, error);
      return;
    }
  }
}

export default openapi(V1InnovationXlsxImport.httpTrigger as AzureFunction, '/v1/innovations/xlsx', {
  post: {
    description: 'Create a new innovation record as DRAFT by importing a filled-in Excel file.',
    tags: ['[v1] Innovations'],
    operationId: 'v1-innovation-xlsx-import',
    requestBody: SwaggerHelper.bodyJ2S(BodySchema, {
      description: 'The Excel file content (base64 string).'
    }),
    responses: {
      200: {
        description: 'New innovation record ID',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                id: { type: 'string', format: 'uuid' }
              }
            }
          }
        }
      },
      400: { description: 'Invalid payload' },
      422: { description: 'Unprocessable entity' }
    }
  }
});
