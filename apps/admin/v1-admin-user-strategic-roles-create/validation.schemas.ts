import { StrategicRoleEnum } from '@admin/shared/enums';
import Joi from 'joi';

export type BodyType = {
  strategicRoles: StrategicRoleEnum[];
};

export const BodySchema = Joi.object<BodyType>({
  strategicRoles: Joi.array()
    .items(Joi.string().valid(...Object.values(StrategicRoleEnum)))
    .min(1)
    .required()
    .description('The strategic roles to be assigned to the user.')
});
