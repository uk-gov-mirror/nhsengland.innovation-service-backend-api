import Joi from 'joi';

export type BodyType = {
  file: string; // Base64 Excel
};

export const BodySchema = Joi.object<BodyType>({
  file: Joi.string().required()
}).required();
