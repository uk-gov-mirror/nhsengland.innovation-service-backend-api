import azureFunction from '.';

import { AzureHttpTriggerBuilder, TestsHelper } from '@admin/shared/tests';
import { randUuid } from '@ngneat/falso';
import { UsersService } from '../_services/users.service';

jest.mock('@admin/shared/decorators', () => ({
  JwtDecoder: jest.fn().mockImplementation(() => (_: any, __: string, descriptor: PropertyDescriptor) => {
    return descriptor;
  }),
  Audit: jest.fn().mockImplementation(() => (_: any, __: string, descriptor: PropertyDescriptor) => {
    return descriptor;
  })
}));

const testsHelper = new TestsHelper();
const scenario = testsHelper.getCompleteScenario();

beforeAll(async () => {
  await testsHelper.init();
});

const mock = jest.spyOn(UsersService.prototype, 'deleteStrategicRole').mockResolvedValue(undefined);

afterEach(() => {
  jest.clearAllMocks();
});

describe('v1-admin-user-strategic-role-update Suite', () => {
  describe('204', () => {
    it('should delete a strategic role', async () => {
      const userId = randUuid();
      const strategicRoleId = randUuid();
      const result = await new AzureHttpTriggerBuilder()
        .setAuth(scenario.users.allMighty)
        .setParams({ userId, strategicRoleId })
        .call<never>(azureFunction);

      expect(result.status).toBe(204);
      expect(mock).toHaveBeenCalledWith(expect.anything(), userId, strategicRoleId);
    });
  });
});
