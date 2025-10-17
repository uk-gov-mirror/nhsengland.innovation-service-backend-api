import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class AddTaskAssignedToUserRole1751368531495 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE innovation_task
      ADD assigned_to_user_role_id uniqueidentifier NULL;
    `);

    await queryRunner.query(`
      ALTER TABLE innovation_task
      ADD CONSTRAINT FK_innovation_task_assigned_to_user_role
      FOREIGN KEY (assigned_to_user_role_id)
      REFERENCES user_role(id);
    `);

    await queryRunner.query(`
        UPDATE innovation_task
        SET assigned_to_user_role_id = created_by_user_role_id;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE innovation_task
      DROP CONSTRAINT FK_innovation_task_assigned_to_user_role;
    `);

    await queryRunner.query(`
      ALTER TABLE innovation_task
      DROP COLUMN assigned_to_user_role_id;
    `);
  }
}
