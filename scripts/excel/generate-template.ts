/**
 * generate-template.ts — CLI thin wrapper for exporting empty Excel templates.
 * 
 * Usage:
 *   ts-node generate-template.ts
 */

import { initEnvironment } from './excel-cli-boot';
import { ExcelExportService } from '../../libs/shared/services/storage/excel-export.service';
import { join } from 'path';
import SHARED_SYMBOLS from '../../libs/shared/services/symbols';
import type { IRSchemaService } from '../../libs/shared/services/storage/ir-schema.service';
import { IR_SCHEMA } from '../../libs/shared/schemas/innovation-record/schema';

async function run(pullSchemaFromDB: boolean = false) {
    try {
        console.log('--- STARTING CLINICAL EXCEL TEMPLATE GENERATOR ---');
        console.log(`Config: Pulling schema from ${pullSchemaFromDB ? 'Database' : 'Local schema.ts file'}`);
        
        const container = await initEnvironment();
        const irSchemaService = container.get<IRSchemaService>(SHARED_SYMBOLS.IRSchemaService);
        
        let schema: any;
        if (pullSchemaFromDB) {
            const { model } = await irSchemaService.getSchema();
            schema = model.schema;
        } else {
            schema = IR_SCHEMA;
        }

        // --- Execute through the pure export service ---
        const exporter = new ExcelExportService();
        const workbook = exporter.generateTemplateWorkbook(schema);

        // --- Save via CLI disk IO ---
        const outputPath = join(__dirname, '../../Innovation-Record-Template.xlsx');
        await workbook.xlsx.writeFile(outputPath);
        
        console.log(`\n🚀 SUCCESS: Excel Template generated safely at: ${outputPath}`);
        process.exit(0);
    } catch (error) {
        console.error('\n❌ Error:', error);
        process.exit(1);
    }
}

// Ensure execution
run(false);
