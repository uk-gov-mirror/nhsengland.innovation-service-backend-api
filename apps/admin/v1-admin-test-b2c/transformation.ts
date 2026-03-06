import Joi from 'joi';

export type BodyType = {
  userIds: string[];
  useOld: boolean;
};

export type ResponseDTO = {
  count: number;
  timeTakenMs: number;
  status: string;
};

export const BodySchema = Joi.object<BodyType>({
  userIds: Joi.array().items(Joi.string().uuid()).required(),
  useOld: Joi.boolean().required()
});

export const ResponseBodySchema = Joi.object<ResponseDTO>({
  count: Joi.number().required(),
  timeTakenMs: Joi.number().required(),
  status: Joi.string().required()
});
