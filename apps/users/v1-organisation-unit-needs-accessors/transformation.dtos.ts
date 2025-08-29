import Joi from 'joi';
import { NeedsAssement } from '../_types/users.types';

export type ResponseDTO = {
  count: number;
  data: NeedsAssement[];
};

export const ResponseBodySchema = Joi.object<ResponseDTO>({
  count: Joi.number().integer().required(),
  data: Joi.array().items(
    Joi.object({
      needsAssessorUserId: Joi.string().required(),
      assignedInnovation: Joi.string().required(),
      needsAssessmentVersion: Joi.string().required(),
      innovationId: Joi.string().required(),
      assessmentId: Joi.string().required(),
      needsAssessorUserName: Joi.string().required()
    })
  )
});
