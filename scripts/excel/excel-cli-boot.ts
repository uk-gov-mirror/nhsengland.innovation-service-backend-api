import 'reflect-metadata';
import * as dotenv from 'dotenv';
import { join } from 'path';

// Load environment variables BEFORE importing anything else
dotenv.config({ path: join(__dirname, '../../.env') });

import { container } from '../../libs/shared/config/inversify.config';
import SHARED_SYMBOLS from '../../libs/shared/services/symbols';
import type { SQLConnectionService } from '../../libs/shared/services/storage/sql-connection.service';
import type { Container } from 'inversify';

export async function initEnvironment(): Promise<Container> {
  console.log('Initializing environment...');
  
  const sqlConnectionService = container.get<SQLConnectionService>(SHARED_SYMBOLS.SQLConnectionService);
  
  // Wait for SQL connection to be initialized
  let retries = 0;
  while (!sqlConnectionService.isInitialized() && retries < 10) {
    console.log('Waiting for SQL connection...');
    await new Promise(resolve => setTimeout(resolve, 1000));
    retries++;
  }
  
  if (!sqlConnectionService.isInitialized()) {
    throw new Error('Failed to initialize SQL connection after 10 seconds');
  }
  
  console.log('Environment initialized successfully.');
  return container;
}
