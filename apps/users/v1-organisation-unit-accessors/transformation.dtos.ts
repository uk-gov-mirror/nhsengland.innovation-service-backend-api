import { ServiceRoleEnum } from '@users/shared/enums';
import Joi from 'joi';

export type ResponseDTO = {
  count: number;
  data: {
    accessor: { name: string; role: ServiceRoleEnum; jobTitle?: string | null };
    innovations: { id: string; name: string }[];
  }[];
};

export const ResponseBodySchema = Joi.object<ResponseDTO>({
  count: Joi.number().integer().required(),
  data: Joi.array().items(
    Joi.object({
      accessor: Joi.object({
        name: Joi.string().required(),
        role: Joi.string().valid(...Object.values(ServiceRoleEnum)),
        jobTitle: Joi.string().allow(null, '').optional()
      }),
      innovations: Joi.array().items(
        Joi.object({
          id: Joi.string().uuid().required(),
          name: Joi.string().required()
        })
      )
    })
  )
});
