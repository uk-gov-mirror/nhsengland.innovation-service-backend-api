import { initEnvironment } from './excel-cli-boot';
import { ExcelImportService } from '../../libs/shared/services/storage/excel-import.service';
import * as ExcelJS from 'exceljs';
import { join } from 'path';
import { ServiceRoleEnum } from '../../libs/shared/enums';
import type { DomainContextType } from '../../libs/shared/types';
import { IR_SCHEMA } from '../../libs/shared/schemas/innovation-record/schema';
import { SchemaModel } from '../../libs/shared/models/schema-engine/schema.model';
import SHARED_SYMBOLS from '../../libs/shared/services/symbols';
import type { IRSchemaService } from '../../libs/shared/services/storage/ir-schema.service';
import type { InnovationSectionsService } from '../../apps/innovations/_services/innovation-sections.service';
import type { InnovationsService } from '../../apps/innovations/_services/innovations.service';
import INNOVATIONS_SYMBOLS from '../../apps/innovations/_services/symbols';
import type { CurrentCatalogTypes } from '../../libs/shared/schemas/innovation-record';

// CLI ARGUMENT PARSING
function parseArgs(): { filePath: string; innovationId?: string; mode: 'create' | 'update'; userId: string; roleId: string; dryRun: boolean } {
    const args = process.argv.slice(2);
    const get = (flag: string, required = true): string => {
        const idx = args.indexOf(flag);
        if (idx === -1 || !args[idx + 1]) {
            if (required) {
                console.error(`❌ Missing required argument: ${flag}`);
                process.exit(1);
            }
            return '';
        }
        return (args[idx + 1] || '') as string;
    };

    const hasFlag = (flag: string) => args.includes(flag);
    const mode = (get('--mode', false) || 'update') as 'create' | 'update';
    const innovationId = get('--innovationId', mode === 'update' && !hasFlag('--dry-run'));

    return {
        filePath:      get('--file'),
        mode,
        innovationId:  innovationId || undefined,
        userId:        get('--userId'),
        roleId:        get('--roleId'),
        dryRun:        hasFlag('--dry-run')
    };
}

async function run() {
    try {
        const { filePath, innovationId: inputInnovationId, mode, userId, roleId, dryRun } = parseArgs();
        const resolvedPath = filePath.startsWith('/') ? filePath : join(process.cwd(), filePath);

        console.log(`--- STARTING EXCEL IMPORT ${dryRun ? '[DRY RUN]' : ''} ---`);
        
        const container = await initEnvironment();
        const irSchemaService = container.get<IRSchemaService>(SHARED_SYMBOLS.IRSchemaService);
        const sectionsService = container.get<InnovationSectionsService>(INNOVATIONS_SYMBOLS.InnovationSectionsService);
        const innovationsService = container.get<InnovationsService>(INNOVATIONS_SYMBOLS.InnovationsService);
        const importService = new ExcelImportService();

        let schema: any;
        let schemaModel: SchemaModel;
        try {
            const schemaResult = await irSchemaService.getSchema();
            schema = schemaResult.model.schema;
            schemaModel = schemaResult.model;
            console.log('✅ Schema loaded from database.');
        } catch {
            schema = IR_SCHEMA;
            schemaModel = new SchemaModel(schema);
            console.warn('⚠️  Could not reach DB schema, falling back to local schema.ts');
        }

        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(resolvedPath);

        const domainContext: DomainContextType = {
            id: userId,
            identityId: userId,
            organisation: { id: 'IMPORT_SCRIPT', name: 'Import Script', acronym: null },
            currentRole: { id: roleId, role: ServiceRoleEnum.INNOVATOR }
        } as any;

        let innovationId = inputInnovationId;

        if (mode === 'create') {
            const { payload, validationIssues } = importService.parseRegistrationPayload(workbook, schema, schemaModel);

            if (!payload['name'] || !payload['description']) {
                console.error('❌ CREATE mode requires name and description.');
                process.exit(1);
            }

            if (dryRun) {
                innovationId = '00000000-0000-0000-0000-000000000000';
            } else {
                const result = await innovationsService.createInnovation(domainContext, payload as any);
                innovationId = result.id;
            }
        }

        const importResult = importService.parseWorkbook(workbook, schema, schemaModel);
        
        for (const section of importResult.sections) {
            const criticalErrors = section.validationIssues.filter(msg => !msg.includes('is required'));
            if (criticalErrors.length > 0) {
                console.error(`❌ Skipped: ${section.sectionKey}`);
                continue;
            }

            if (!dryRun) {
                try {
                    await sectionsService.updateInnovationSectionInfo(
                        domainContext,
                        innovationId!,
                        section.sectionKey as any,
                        section.finalPayload
                    );
                } catch (err: any) {
                    console.error(`❌ Failed: ${section.sectionKey}`, err?.message ?? err);
                }
            }
        }

        console.log(`\n🚀 IMPORT COMPLETE. Innovation ID: ${innovationId}`);
        process.exit(0);
    } catch (err) {
        console.error('\n❌ Fatal error:', err);
        process.exit(1);
    }
}

run();
