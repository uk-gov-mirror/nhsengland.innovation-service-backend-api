import Joi from 'joi';

export type ResponseDTO = {
  id: string;
}[];

export const ResponseBodySchema = Joi.array().items(
  Joi.object({
    id: Joi.string().guid().required()
  })
);
