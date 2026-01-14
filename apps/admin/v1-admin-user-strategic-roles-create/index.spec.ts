import azureFunction from '.';

import { StrategicRoleEnum } from '@admin/shared/enums';
import { AzureHttpTriggerBuilder, TestsHelper } from '@admin/shared/tests';
import { randUuid } from '@ngneat/falso';
import { UsersService } from '../_services/users.service';
import type { BodyType } from './validation.schemas';

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

const expected = [{ id: randUuid() }];
const mock = jest.spyOn(UsersService.prototype, 'createStrategicRoles').mockResolvedValue(expected);

afterEach(() => {
  jest.clearAllMocks();
});

describe('v1-admin-user-strategic-roles-create Suite', () => {
  describe('201', () => {
    it('should create strategic roles for a user', async () => {
      const userId = randUuid();
      const result = await new AzureHttpTriggerBuilder()
        .setAuth(scenario.users.allMighty)
        .setParams({ userId })
        .setBody<BodyType>({
          strategicRoles: [StrategicRoleEnum.CHAMPION]
        })
        .call<never>(azureFunction);

      expect(result.body).toStrictEqual(expected);
      expect(result.status).toBe(201);
      expect(mock).toHaveBeenCalledWith(expect.anything(), userId, { strategicRoles: [StrategicRoleEnum.CHAMPION] });
    });
  });

  describe('400', () => {
    it('should fail if strategicRoles is empty', async () => {
      const result = await new AzureHttpTriggerBuilder()
        .setAuth(scenario.users.allMighty)
        .setParams({ userId: randUuid() })
        .setBody<BodyType>({
          strategicRoles: []
        } as any)
        .call<never>(azureFunction);

      expect(result.status).toBe(400);
    });

    it('should fail if strategicRoles has invalid value', async () => {
      const result = await new AzureHttpTriggerBuilder()
        .setAuth(scenario.users.allMighty)
        .setParams({ userId: randUuid() })
        .setBody<BodyType>({
          strategicRoles: ['INVALID' as any]
        })
        .call<never>(azureFunction);

      expect(result.status).toBe(400);
    });
  });
});
