import { mapOpenApi3 as openapi } from '@aaronpowell/azure-functions-nodejs-openapi';
import type { AzureFunction, HttpRequest } from '@azure/functions';

import { JwtDecoder } from '@innovations/shared/decorators';
import { ResponseHelper } from '@innovations/shared/helpers';
import type { AuthorizationService } from '@innovations/shared/services';
import SHARED_SYMBOLS from '@innovations/shared/services/symbols';
import type { CustomContextType } from '@innovations/shared/types';
import { container } from '../_config';
import type { IRExportService } from '@innovations/shared/services/storage/ir-export.service';

class V1InnovationRecordTemplateXslxExport {
  @JwtDecoder()
  static async httpTrigger(context: CustomContextType, _request: HttpRequest): Promise<void> {
    const authorizationService = container.get<AuthorizationService>(SHARED_SYMBOLS.AuthorizationService);

    const irExportService = container.get<IRExportService>(SHARED_SYMBOLS.IRExportService);

    try {
      await authorizationService
        .validate(context)
        .checkAssessmentType()
        .checkAccessorType()
        .checkInnovatorType()
        .checkAdminType()
        .verify();

      const xlsxBuffer = await irExportService.exportQuestionsWorkbook();

      // Convert to Base64 to avoid binary corruption (ETF-8)
      const base64Content = xlsxBuffer.toString('base64');

      context.res = {
        status: 200,
        body: base64Content,
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Encoding': 'base64'
        }
      };

      return;
    } catch (error) {
      context.res = ResponseHelper.Error(context, error);
      return;
    }
  }
}

export default openapi(
  V1InnovationRecordTemplateXslxExport.httpTrigger as AzureFunction,
  '/v1/innovation-record/xlsx-template',
  {
    get: {
      description: 'Generate xlsx template for the innovation record',
      tags: ['[v1] Innovations'],
      operationId: 'v1-innovation-record-xlsx-template-export',
      responses: {
        200: {
          description: 'XLSX template file download',
          content: {
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': {
              schema: {
                type: 'string'
              }
            }
          }
        },
        400: { description: 'Bad request.' }
      }
    }
  }
);
