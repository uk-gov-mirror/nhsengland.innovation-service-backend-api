import { JoiHelper } from '@admin/shared/helpers';
import { CreateRolesSchema, type CreateRolesType } from '@admin/shared/types';
import Joi from 'joi';
import { StrategicRoleEnum } from '@admin/shared/enums';

export type BodyType = {
  name: string;
  email: string;
  strategicRoles?: StrategicRoleEnum[];
} & CreateRolesType;

export const BodySchema = Joi.object<BodyType>({
  name: JoiHelper.AppCustomJoi().string().max(100).required().description('Name of the user.'),
  email: JoiHelper.AppCustomJoi().string().max(100).email().required().description('Email of the user.'),
  strategicRoles: Joi.array()
    .items(Joi.string().valid(...Object.values(StrategicRoleEnum)))
    .optional()
    .description('Strategic roles to be assigned to the user.')
}).concat(CreateRolesSchema as any);
