import { inject, injectable } from 'inversify';
import * as ExcelJS from 'exceljs';

import SHARED_SYMBOLS from '@innovations/shared/services/symbols';
import type { DomainContextType } from '@innovations/shared/types';
import type { IRSchemaService } from '@innovations/shared/services';
import type { ExcelExportService } from '@innovations/shared/services/storage/excel-export.service';
import type { ExcelImportService } from '@innovations/shared/services/storage/excel-import.service';

import type { InnovationsService } from './innovations.service';
import type { InnovationSectionsService } from './innovation-sections.service';
import SYMBOLS from './symbols';

@injectable()
export class ExcelInnovationService {
  constructor(
    @inject(SHARED_SYMBOLS.IRSchemaService) private irSchemaService: IRSchemaService,
    @inject(SHARED_SYMBOLS.ExcelExportService) private excelExportService: ExcelExportService,
    @inject(SHARED_SYMBOLS.ExcelImportService) private excelImportService: ExcelImportService,
    @inject(SYMBOLS.InnovationsService) private innovationsService: InnovationsService,
    @inject(SYMBOLS.InnovationSectionsService) private sectionsService: InnovationSectionsService
  ) {}

  /**
   * Generates a Buffer for an empty Excel template based on the current schema.
   */
  async generateTemplate(): Promise<Buffer> {
    const schema = await this.irSchemaService.getSchema();
    const workbook = this.excelExportService.generateTemplateWorkbook(schema.model.schema);
    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer as ArrayBuffer);
  }

  /**
   * Generates a Buffer for a pre-filled Excel file based on a JSON payload.
   */
  async generateExport(payload: any): Promise<Buffer> {
    const schema = await this.irSchemaService.getSchema();
    const workbook = this.excelExportService.generateTemplateWorkbook(schema.model.schema, payload);
    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer as ArrayBuffer);
  }

  /**
   * Parses an uploaded Excel file (base64) and creates a new Innovation + its sections.
   */
  async importInnovation(domainContext: DomainContextType, base64Xlsx: string): Promise<{ id: string }> {
    const buffer = Buffer.from(base64Xlsx, 'base64');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as any);

    const schema = await this.irSchemaService.getSchema();
    console.log(`[ExcelImport] Starting import with schema version: ${schema.version}`);

    // 1. Extract Registration (INNOVATION_DESCRIPTION) first to create the record.
    const { payload: regPayload, validationIssues } = this.excelImportService.parseRegistrationPayload(
      workbook,
      schema.model.schema,
      schema.model
    );

    console.log('[ExcelImport] Registration Payload Extracted:', JSON.stringify(regPayload, null, 2));
    if (validationIssues.length > 0) {
      console.warn('[ExcelImport] Registration Validation Issues:', validationIssues);
    }

    if (!regPayload['name'] || !regPayload['description']) {
      console.error('[ExcelImport] Missing required fields. Name:', regPayload['name'], 'Description:', regPayload['description']);
      throw new Error('Incomplete Excel file: The "Innovation Name" and "Innovation Overview" are required to register.');
    }

    // 2. Create the Innovation (returns the new ID)
    const { id: innovationId } = await this.innovationsService.createInnovation(
      domainContext,
      regPayload as any
    );

    // 3. Extract all sections and perform updates for everything else
    const importResult = this.excelImportService.parseWorkbook(workbook, schema.model.schema, schema.model);
    
    // Process sections sequentially to maintain sanity (though parallel would likely work)
    for (const section of importResult.sections) {
      // Even though INNOVATION_DESCRIPTION was used for createInnovation, we MUST update it 
      // here as well because createInnovation only saves a tiny subset of its fields (name, desc, etc).
      // The rest of the fields (categories, areas, careSettings) need to be saved via updateInnovationSectionInfo.
      await this.sectionsService.updateInnovationSectionInfo(
        domainContext,
        innovationId,
        section.sectionKey as any,
        section.finalPayload
      );
    }

    return { id: innovationId };
  }
}
