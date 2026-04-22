import Joi from 'joi';
import { JoiHelper } from '../../helpers';
import { TEXTAREA_LENGTH_LIMIT } from '../../constants';
import type {
  AutocompleteArray,
  CheckboxArray,
  FieldsGroup,
  Question,
  RadioGroup,
  Textarea,
  Text,
  InputArray
} from './question.types';
import { cloneDeep } from 'lodash';

interface QuestionTypeValidator<T extends Question> {
  validate: (question: T) => Joi.Schema;
}

export class TextValidator implements QuestionTypeValidator<Text> {
  // Not validating postcode or url.
  validate(question: Text): Joi.Schema {
    let validation = JoiHelper.AppCustomJoi().string();
    if (question.validations?.maxLength) {
      validation = validation.max(question.validations.maxLength);
    }
    if (question.validations?.isRequired) {
      validation = validation.required();
    }
    return validation;
  }
}

export class TextareaValidator implements QuestionTypeValidator<Textarea> {
  validate(question: Textarea): Joi.Schema {
    let validation = JoiHelper.AppCustomJoi().string();
    if (question.lengthLimit) {
      validation = validation.max(TEXTAREA_LENGTH_LIMIT[question.lengthLimit]);
    }
    if (question.validations?.isRequired) {
      validation = validation.required();
    }
    return validation;
  }
}

export class RadioGroupValidator implements QuestionTypeValidator<RadioGroup> {
  validate(question: RadioGroup): Joi.Schema {
    let validation = JoiHelper.AppCustomJoi().string();
    const validItems = [];
    for (const item of question.items) {
      if ('id' in item) {
        validItems.push(item.id);
      }
    }
    if (validItems.length) {
      validation = validation.valid(...validItems);
    }
    if (question.validations?.isRequired) {
      validation = validation.required();
    }
    return validation;
  }
}

export class RadioGroupMultipleAnswersValidator implements QuestionTypeValidator<RadioGroup> {
  validate(question: RadioGroup): Joi.Schema {
    let validation = JoiHelper.AppCustomJoi().stringArray();
    const validItems = [];
    for (const item of question.items) {
      if ('id' in item) {
        validItems.push(item.id);
      }
    }
    if (validItems.length) {
      validation = validation.items(
        JoiHelper.AppCustomJoi()
          .string()
          .valid(...validItems)
      );
    }
    if (question.validations?.isRequired) {
      validation = validation.required();
    }
    return validation;
  }
}

export class AutocompleteArrayValidator implements QuestionTypeValidator<AutocompleteArray> {
  validate(question: AutocompleteArray): Joi.Schema {
    let validation = JoiHelper.AppCustomJoi().stringArray();
    const validItems = question.items.map(i => i.id);
    if (validItems.length) {
      validation = validation.items(
        JoiHelper.AppCustomJoi()
          .string()
          .valid(...validItems)
      );
    }
    if (question.validations?.max) {
      if (question.validations.max.length === 1) {
        return JoiHelper.AppCustomJoi()
          .string()
          .valid(...validItems)
          .required();
      }
      validation = validation.max(question.validations.max.length);
    }
    if (question.validations?.min) {
      validation = validation.min(question.validations.min.length);
    }
    if (question.validations?.isRequired) {
      validation = validation.required();
    }
    return validation;
  }
}

export class CheckboxArrayValidator implements QuestionTypeValidator<CheckboxArray> {
  validate(question: CheckboxArray): Joi.Schema {
    const validItems = [];
    for (const item of question.items) {
      if ('id' in item) {
        validItems.push(item.id);
      }
    }

    // This means it's an array of objects (e.g. standards)
    if (question.addQuestions?.length) {
      const objectSchemaDefinition: Record<string, Joi.Schema> = {
        [question.checkboxAnswerId ?? question.id]: JoiHelper.AppCustomJoi()
          .string()
          .valid(...validItems)
      };

      question.addQuestions.forEach(aq => {
        objectSchemaDefinition[aq.id] = QuestionValidatorFactory.validate(aq).optional();
      });

      return Joi.array().items(Joi.object(objectSchemaDefinition)).min(1);
    }

    let checkboxValidation = JoiHelper.AppCustomJoi().stringArray();
    if (validItems.length) {
      checkboxValidation = checkboxValidation.items(
        JoiHelper.AppCustomJoi()
          .string()
          .valid(...validItems)
      );
    }
    if (question.validations?.max) {
      checkboxValidation = checkboxValidation.max(question.validations.max.length);
    }
    if (question.validations?.min) {
      checkboxValidation = checkboxValidation.min(question.validations.min.length);
    }
    if (question.validations?.isRequired) {
      checkboxValidation = checkboxValidation.required();
    }

    return checkboxValidation;
  }
}

export class InputArrayValidator implements QuestionTypeValidator<InputArray> {
  validate(question: InputArray): Joi.Schema {
    const objectSchemaDefinition: Record<string, Joi.Schema> = {};

    for (const item of question.items ?? []) {
      if (!item.id) continue;

      let itemValidation = JoiHelper.AppCustomJoi().string().allow(null);

      if (item.validations?.maxLength) {
        itemValidation = itemValidation.max(item.validations.maxLength);
      }

      if (item.validations?.minLength) {
        itemValidation = itemValidation.min(item.validations.minLength);
      }

      if (item.validations?.isRequired) {
        itemValidation = itemValidation.required();
        // itemValidation = itemValidation.optional();
      } else {
        itemValidation = itemValidation.allow('', null).optional();
      }

      objectSchemaDefinition[item.id] = itemValidation;
    }

    let inputArrayValidation = Joi.object(objectSchemaDefinition);

    return inputArrayValidation;
  }
}

export class FieldGroupValidator implements QuestionTypeValidator<FieldsGroup> {
  validate(question: FieldsGroup): Joi.Schema {
    // When addQuestion is not defined the payload is a string array.
    if (!question.addQuestions) {
      return JoiHelper.AppCustomJoi().stringArray().items(JoiHelper.AppCustomJoi().string()).required();
    }

    let validation = Joi.array();
    const obj: { [key: string]: any } = {};
    if (question.field) {
      obj[question.field.id] = QuestionValidatorFactory.validate(question.field);
    }
    if (question.addQuestions) {
      // Since we have step by step, the first time the question is answered it doesn't have "yet" the answer for this
      // question. To prevent the validator to fail we make it optional.
      question.addQuestions.forEach(aq => {
        obj[aq.id] = QuestionValidatorFactory.validate(aq).optional().allow(null);
      });
    }
    if (Object.keys(obj).length) {
      validation = validation.items(Joi.object(obj));
    }
    // Add min validation
    if (question.validations?.isRequired) {
      validation = validation.required();
    }
    return validation;
  }
}

export class QuestionValidatorFactory {
  static validate(question: Question, multipleAnswers = false): Joi.Schema {
    switch (question.dataType) {
      case 'text':
        return new TextValidator().validate(question);
      case 'textarea':
        return new TextareaValidator().validate(question);
      case 'radio-group':
        if (multipleAnswers) {
          return new RadioGroupMultipleAnswersValidator().validate(question);
        }
        return new RadioGroupValidator().validate(question);
      case 'checkbox-array':
        // If it's true we just care about the answer so we remove the addQuestion from here
        if (multipleAnswers && question.addQuestions) {
          const clonedQuestion = cloneDeep(question);
          delete clonedQuestion.addQuestions;
          return new CheckboxArrayValidator().validate(clonedQuestion);
        }
        return new CheckboxArrayValidator().validate(question);
      case 'autocomplete-array':
        return new AutocompleteArrayValidator().validate(question);
      case 'fields-group':
        return new FieldGroupValidator().validate(question);
      case 'input-array':
        return new InputArrayValidator().validate(question);
      default:
        throw new Error('QuestionValidator is not defined');
    }
  }
}
