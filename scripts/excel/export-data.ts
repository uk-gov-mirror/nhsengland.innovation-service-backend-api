/**
 * export-data.ts — CLI script to pre-fill an Excel template with a JSON payload.
 * 
 * This tool takes a JSON file (standard IR payload) and generates a 
 * "Filled" Excel Innovation Record.
 *
 * Usage:
 *   ts-node export-data.ts --payload=my-payload.json --output=Filled-Record.xlsx
 */

import { initEnvironment } from './excel-cli-boot';
import { ExcelExportService } from '../../libs/shared/services/storage/excel-export.service';
import { join, isAbsolute } from 'path';
import { readFileSync } from 'fs';
import SHARED_SYMBOLS from '../../libs/shared/services/symbols';
import type { IRSchemaService } from '../../libs/shared/services/storage/ir-schema.service';
import { IR_SCHEMA } from '../../libs/shared/schemas/innovation-record/schema';

// Helper to parse CLI arguments
function getArg(name: string): string | undefined {
    const prefix = `--${name}=`;
    return process.argv.find(a => a.startsWith(prefix))?.split('=')[1];
}

async function run() {
    try {
        console.log('--- STARTING CLINICAL EXCEL DATA EXPORTER ---');
        
        const payloadPath = getArg('payload');
        const outputFilename = getArg('output') || 'Filled-Innovation-Record.xlsx';

        if (!payloadPath) {
            console.error('❌ ERROR: Missing --payload argument.');
            console.log('Usage: ts-node export-data.ts --payload=path/to/data.json [--output=filename.xlsx]');
            process.exit(1);
        }

        // 1. Load Payload
        console.log(`Loading payload from: ${payloadPath}`);
        const absolutePayloadPath = isAbsolute(payloadPath) ? payloadPath : join(process.cwd(), payloadPath);
        const payloadRaw = readFileSync(absolutePayloadPath, 'utf8');
        const payload = JSON.parse(payloadRaw);

        // 2. Initialize Environment (to get Schema Service if needed, or just use config)
        const container = await initEnvironment();
        const irSchemaService = container.get<IRSchemaService>(SHARED_SYMBOLS.IRSchemaService);
        
        // 3. Load Schema (Prefer DB if possible, fallback to local)
        let schema: any;
        try {
            console.log('Fetching latest schema from Database...');
            const { model } = await irSchemaService.getSchema();
            schema = model.schema;
        } catch (err) {
            console.warn('⚠️  Could not fetch schema from DB, using local schema.ts fallback.');
            schema = IR_SCHEMA;
        }

        // 4. Generate Workbook with Payload injection
        console.log(`Generating Workbook and injecting ${Object.keys(payload).length} sections...`);
        const exporter = new ExcelExportService();
        const workbook = exporter.generateTemplateWorkbook(schema, payload);

        // 5. Save output
        const outputPath = isAbsolute(outputFilename) ? outputFilename : join(process.cwd(), outputFilename);
        await workbook.xlsx.writeFile(outputPath);
        
        console.log(`\n🚀 SUCCESS: Export complete!`);
        console.log(`Location: ${outputPath}`);
        process.exit(0);
    } catch (error) {
        console.error('\n❌ CRITICAL FAILURE:', error);
        process.exit(1);
    }
}

run();
