import 'reflect-metadata';
import * as dotenv from 'dotenv';
import { join } from 'path';
dotenv.config({ path: join(__dirname, '.env') });

import { container } from './apps/innovations/_config';
import SYMBOLS from './apps/innovations/_services/symbols';
import type { ExcelInnovationService } from './apps/innovations/_services/excel-innovation.service';
import type { SQLConnectionService } from './libs/shared/services/storage/sql-connection.service';
import SHARED_SYMBOLS from './libs/shared/services/symbols';
import { ServiceRoleEnum } from './libs/shared/enums';
import type { DomainContextType } from './libs/shared/types';

async function run() {
    console.log('--- STARTING JSON IMPORT TEST ---');
    
    try {
        const sqlConnectionService = container.get<SQLConnectionService>(SHARED_SYMBOLS.SQLConnectionService);
        let retries = 0;
        while (!sqlConnectionService.isInitialized() && retries < 10) {
            console.log('Waiting for SQL connection...');
            await new Promise(resolve => setTimeout(resolve, 1000));
            retries++;
        }
        
        if (!sqlConnectionService.isInitialized()) {
            throw new Error('Failed to initialize SQL connection after 10 seconds');
        }

        const excelInnovationService = container.get<ExcelInnovationService>(SYMBOLS.ExcelInnovationService);
        
        const mockDomainContext: DomainContextType = {
            id: '9a41dd8c-056f-47ce-a5c3-c894779fffc2', // Valid UUID from previous logs
            identityId: 'TEST_IDENTITY_ID',
            organisation: { id: 'TEST_ORG', name: 'Test Org', acronym: null },
            currentRole: { id: 'c64dc0f3-15a6-ed11-ba77-281878fb9cd2', role: ServiceRoleEnum.INNOVATOR }
        } as any;

        const testPayload = {
            "INNOVATION_DESCRIPTION": {
                "name": "JSON API Test Innovation Final",
                "description": "Short description to trigger warnings",
                "categories": ["INVALID"] // Trigger warning
            },
            "UNDERSTANDING_OF_NEEDS": {
                "problemsTackled": "Some problem description"
            }
            // All other sections are empty, should be in skippedSections
        };

        console.log('Calling importInnovationFromJson...');
        const result = await excelInnovationService.importInnovationFromJson(mockDomainContext, testPayload);
        
        console.log(`✅ Success! Innovation created with ID: ${result.id}`);
        console.log('Validation Issues:', JSON.stringify(result.validationIssues, null, 2));
        console.log('Skipped Sections:', JSON.stringify(result.skippedSections, null, 2));
        process.exit(0);
    } catch (error) {
        console.error('❌ Error testing JSON import:', error);
        process.exit(1);
    }
}

run();
