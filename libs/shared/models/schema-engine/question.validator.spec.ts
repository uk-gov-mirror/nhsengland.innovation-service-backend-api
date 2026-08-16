import type Joi from 'joi';
import { QuestionValidatorFactory } from './question.validator';

const standardsQuestion: any = {
  id: 'standards',
  dataType: 'checkbox-array',
  label: 'Standards',
  checkboxAnswerId: 'type',
  items: [{ id: 'UK_MDR_CLASS_I', label: 'UK MDR Class I' }],
  addQuestions: [
    {
      id: 'hasMet',
      dataType: 'radio-group',
      label: 'Has certification',
      items: [
        { id: 'YES', label: 'Yes' },
        { id: 'IN_PROGRESS', label: 'In progress' },
        { id: 'NOT_YET', label: 'Not yet' }
      ]
    },
    {
      id: 'certifications',
      dataType: 'input-array',
      label: 'Certifications',
      items: [
        {
          id: 'GMDN',
          label: 'GMDN',
          validations: { equalToLength: { length: 5, errorMessage: 'Must be 5 characters long' } },
          itemConditionOptions: {
            mandatoryIf: {
              groupLogic: 'AND',
              conditions: [
                { id: 'hasMet', list: ['YES'], relation: 'sibling' },
                { id: 'standards', list: ['UK_MDR_CLASS_I'], relation: 'parent' }
              ]
            }
          }
        }
      ]
    }
  ]
};

const validate = (data: unknown): Joi.ValidationResult<unknown> =>
  QuestionValidatorFactory.validate(standardsQuestion).validate(data);

describe('QuestionValidatorFactory input-array rules', () => {
  it('requires a certification when hasMet is YES', () => {
    expect(validate([{ type: 'UK_MDR_CLASS_I', hasMet: 'YES', certifications: {} }])).toMatchObject({
      error: expect.anything()
    });
  });

  it('enforces equalToLength', () => {
    expect(
      validate([{ type: 'UK_MDR_CLASS_I', hasMet: 'YES', certifications: { GMDN: '1234' } }])
    ).toMatchObject({ error: expect.anything() });
  });

  it('allows a missing certification when hasMet is IN_PROGRESS', () => {
    expect(validate([{ type: 'UK_MDR_CLASS_I', hasMet: 'IN_PROGRESS', certifications: {} }])).toEqual({
      value: [{ type: 'UK_MDR_CLASS_I', hasMet: 'IN_PROGRESS', certifications: {} }]
    });
  });
});
