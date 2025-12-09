import * as Joi from 'joi';

export const BodySchema = Joi.object({
  ip: Joi.string().ip().required()
});
