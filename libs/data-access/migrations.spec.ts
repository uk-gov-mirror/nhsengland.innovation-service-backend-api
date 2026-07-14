import type { QueryRunner } from 'typeorm';
import { migratePrototypeNoToConceptStage1784031519584 } from './migrations/1784031519584-migrate-prototype-no-to-concept-stage';

describe('migratePrototypeNoToConceptStage1784031519584', () => {
  it('updates NO values in submitted and draft documents', async () => {
    const query = jest.fn().mockResolvedValue(undefined);
    const queryRunner = { query } as unknown as QueryRunner;

    await new migratePrototypeNoToConceptStage1784031519584().up(queryRunner);

    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[0][0]).toContain('UPDATE innovation_document');
    expect(query.mock.calls[1][0]).toContain('UPDATE innovation_document_draft');
    query.mock.calls.forEach(([sql]) => {
      expect(sql).toContain("'$.UNDERSTANDING_OF_NEEDS.hasProductServiceOrPrototype'");
      expect(sql).toContain("= 'NO'");
      expect(sql).toContain("'CONCEPT_STAGE'");
    });
  });

  it('prevents unsafe rollback', async () => {
    await expect(new migratePrototypeNoToConceptStage1784031519584().down()).rejects.toThrow('irreversible');
  });
});
