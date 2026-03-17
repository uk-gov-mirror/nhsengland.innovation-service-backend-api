import { inject, injectable } from 'inversify';

import SHARED_SYMBOLS from '../symbols';
import { IRSchemaService } from './ir-schema.service';
import { addFormElements, generateWordDocument } from '../../helpers/docx.helper';

// ir-export.service.ts
import * as ExcelJS from 'exceljs';
import { IRSchemaType } from '@notifications/shared/models';
import { TEXTAREA_LENGTH_LIMIT } from '@innovations/shared/constants';
// import { SchemaModel } from '@innovations/shared/models';

type ValidationValue = string | number | boolean | Record<string, unknown> | undefined;

type RowType = 'section' | 'subSection' | 'question';

interface ExportRow {
  sectionID: string;
  subsectionID: string;
  questionID: string;
  sectionTitle?: ExcelJS.CellValue;
  subsectionTitle?: string;
  questionLabel: ExcelJS.CellValue;
  questionDescription: string;
  validation: ExcelJS.CellValue;
  answer: string;
  options?: string[];
  rowType: RowType;
  answerType?: 'radio-group' | 'checkbox-group' | 'text' | 'textarea';
  maxLength?: number;
  lengthLimit?: number;
}

const EXCEL_TEMPLATE_COLUMN_NUMBERS = {
  subsection: 5,
  question: 6,
  description: 7,
  validation: 8,
  answer: 9
};

@injectable()
export class IRExportService {
  constructor(@inject(SHARED_SYMBOLS.IRSchemaService) private readonly irSchemaService: IRSchemaService) {}

  /**
   * Generates a docx file for the innovation record.
   * This will retrieve the schema from the IRSchemaService
   * and use it to create the docx file.
   */
  async generateDocx(): Promise<Buffer> {
    // 1. Retrieve JSON schema from database
    const schema = await this.irSchemaService.getSchema();

    // 2. Generate Word document
    const documentBuffer = await generateWordDocument(schema.model.schema);

    // 3. Process document to add checkboxes and other form elements
    const finalBuffer = await addFormElements(documentBuffer);

    return finalBuffer;
  }

  /**
   * Generates a xlsx template for innovators to be able
   * to fill and import during the innovation creation flow.
   */

  async exportQuestionsWorkbook(): Promise<Buffer> {
    // 1. Retrieve JSON schema from database
    const schema = await this.irSchemaService.getSchema();

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'NHS Innovation Service';
    workbook.created = new Date();

    // main sheet
    const worksheet = workbook.addWorksheet('Questions', {
      views: [{ state: 'frozen', ySplit: 1 }],
      properties: { defaultRowHeight: 22 }
    });

    // hidden sheet for dropdown options
    const optionsSheet = workbook.addWorksheet('_options');
    optionsSheet.state = 'veryHidden';

    worksheet.columns = [
      { header: 'sectionID', key: 'sectionID', width: 2, hidden: true },
      { header: 'subsectionID', key: 'subsectionID', width: 28, hidden: true },
      { header: 'questionID', key: 'questionID', width: 24, hidden: true },
      { header: 'Section', key: 'sectionTitle', width: 28, hidden: true },
      { header: 'Section', key: 'subsectionTitle', width: 32 },
      { header: 'Question', key: 'questionLabel', width: 70 },
      { header: 'Description', key: 'questionDescription', width: 80, hidden: true },
      { header: 'Validation', key: 'validation', width: 50 },
      { header: 'Answer', key: 'answer', width: 60 }
    ];


    // populate hidden 'options' sheet and validations
    const rows = this.createQuestions(schema.model.schema);
    worksheet.addRows(rows);

    let optionsColumn = 1;
    rows.forEach((row, index) => {
      const excelRow = worksheet.getRow(index + 2);
      const answerCell = excelRow.getCell(9);

      this.stylizeRow(worksheet, row.rowType, excelRow);

      const column = optionsColumn++;

      if (row.options?.length) {
        // write options into hidden sheet
        row.options.forEach((option, optionIndex) => {
          optionsSheet.getCell(optionIndex + 1, column).value = option;
        });
      }

      // apply answer validation
      switch (row.answerType) {
        case 'radio-group':
          if (row.options?.length) {
            this.applyListValidation(
              answerCell,
              optionsSheet,
              row.options,
              optionsColumn++,
              'Please select a value from the dropdown list.'
            );
          }
          break;
        case 'textarea':
          console.log('questionID', row.questionID);
          console.log('lengthLimit', row.lengthLimit);
          if (typeof row.lengthLimit === 'number') {
            this.applyTextLengthValidation(answerCell, row.lengthLimit);
          }
          break;
        case 'text':
          if (typeof row.maxLength === 'number') {
            this.applyTextLengthValidation(answerCell, row.maxLength);
          }
          break;
        case 'checkbox-group':
          this.applyListValidation(
            answerCell,
            optionsSheet,
            ['Yes', 'No'],
            optionsColumn++,
            'Select \"Yes\" if applies'
          );
          break;
      }
    });


    // Stylize header row
    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF005EB8' } };
    headerRow.height = 50;
    headerRow.alignment = {
      vertical: 'middle',
      horizontal: 'center',
      wrapText: true
    };

    worksheet.autoFilter = {
      from: 'A1',
      to: 'I1'
    };

    // protect cells from changes from user
    await worksheet.protect('innovation-record-template', {
      selectLockedCells: true,
      selectUnlockedCells: true,
      formatCells: true,
      formatColumns: true,
      formatRows: true,
      insertColumns: false,
      insertRows: false,
      insertHyperlinks: false,
      deleteColumns: false,
      deleteRows: false,
      sort: false,
      autoFilter: true,
      pivotTables: false
    });

    // return buffer
    const arrayBuffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(arrayBuffer);
  }

  private createQuestions(schema: IRSchemaType): ExportRow[] {
    const rows: ExportRow[] = [];

    for (const [sectionIndex, section] of (schema.sections ?? []).entries()) {
      // push section row
      rows.push({
        sectionID: '',
        subsectionID: '',
        questionID: '',
        sectionTitle: '',
        subsectionTitle: `${sectionIndex + 1}. ${section.title}`,
        questionLabel: '',
        questionDescription: '',
        validation: '',
        answer: '',
        rowType: 'section'
      });

      for (const [subSectionIndex, subSection] of (section.subSections ?? []).entries()) {
        // push section row
        rows.push({
          sectionID: '',
          subsectionID: '',
          questionID: '',
          sectionTitle: '',
          subsectionTitle: `${sectionIndex + 1}.${subSectionIndex + 1}. ${section.title}`,
          questionLabel: '',
          questionDescription: '',
          validation: '',
          answer: '',
          rowType: 'subSection'
        });

        for (const step of subSection.steps ?? []) {
          for (const question of step.questions ?? []) {
            let label = this.buildQuestionLabel(question.label, '', question.description);

            // If this depends on a previous answer, append text to label
            if (step.condition) {
              const triggerText = this.formatOptionList(
                (step.condition.options ?? []).map(option => this.stripHtml(option ?? ''))
              );
              const prefix = `(* If you selected ${triggerText} on the previous question)`;
              const conditionalLabel = this.buildQuestionLabel(question.label, prefix, question.description);

              label = conditionalLabel;
            }

            const validationRules = this.serializeValidations(question.validations);

            const maxLength = question.validations?.maxLength;

            // ADD CHECKBOX-GROUP ROW + VALIDATION
            if (question.dataType === 'checkbox-array') {
              const checkboxOptions = (question.items ?? [])
                .map(i => ('label' in i ? this.stripHtml(i.label ?? '') : ''))
                .filter(Boolean);

              // push question with no id to be 'ignored' by parser later
              rows.push({
                sectionID: '',
                subsectionID: '',
                questionID: '',
                questionLabel: label,
                questionDescription: this.buildTopLevelDescription(question.description),
                validation: this.buildValidationRichText(validationRules),
                answer: '',
                rowType: 'question'
              });

              // push 1 row per option item
              checkboxOptions.forEach(item => {
                rows.push({
                  sectionID: section.id ?? '',
                  subsectionID: subSection.id ?? '',
                  questionID: question.id ?? '',
                  questionLabel: '',
                  questionDescription: '',
                  validation: item,
                  answer: '',
                  rowType: 'question',
                  answerType: 'checkbox-group'
                });
              });
            } else {
              // define radio option items, will be undefined for any others
              const radioOptions =
                question.dataType === 'radio-group'
                  ? (question.items ?? []).map(i => ('label' in i ? this.stripHtml(i.label ?? '') : '')).filter(Boolean)
                  : undefined;

              const lengthLimit =
                question.dataType === 'textarea' && question.lengthLimit
                  ? TEXTAREA_LENGTH_LIMIT[question.lengthLimit]
                  : undefined;

              // console.log('questionID', question.id);
              // console.log('lengthLimit', lengthLimit);
              rows.push({
                sectionID: section.id ?? '',
                subsectionID: subSection.id ?? '',
                questionID: question.id ?? '',
                questionLabel: label,
                questionDescription: this.buildTopLevelDescription(question.description),
                validation: this.buildValidationRichText(validationRules),
                answer: '',
                options: radioOptions,
                rowType: 'question',
                answerType:
                  question.dataType === 'radio-group'
                    ? 'radio-group'
                    : question.dataType === 'text'
                      ? 'text'
                      : question.dataType === 'textarea'
                        ? 'textarea'
                        : undefined,
                maxLength: maxLength,
                lengthLimit: lengthLimit
              });
            }

            // Add conditional reveal questions (ie 'Other')
            if (
              question.dataType === 'autocomplete-array' ||
              question.dataType === 'checkbox-array' ||
              question.dataType === 'radio-group'
            ) {
              for (const item of question.items) {
                if ('conditional' in item && item.conditional && typeof item.conditional === 'object') {
                  const conditionalRevealQuestion = item.conditional;
                  const safeItemLabel = this.stripHtml(item.label ?? '');
                  const prefix = `(* If you selected "${safeItemLabel}" on the previous question)`;
                  const conditionalLabel = this.buildQuestionLabel(item.conditional.label ?? '', prefix);

                  const conditionalValidationRules = this.serializeValidations(conditionalRevealQuestion.validations);

                  rows.push({
                    sectionID: section.id ?? '',
                    subsectionID: subSection.id ?? '',
                    questionID: conditionalRevealQuestion.id ?? '',
                    questionLabel: conditionalLabel,
                    questionDescription: this.buildTopLevelDescription(conditionalRevealQuestion.description),
                    validation: this.buildValidationRichText(conditionalValidationRules),
                    answer: '',
                    rowType: 'question',
                    answerType: 'text',
                    maxLength: item.conditional.validations?.maxLength
                  });
                }
              }
            }
          }
        }
      }
    }

    return rows;
  }

  private buildTopLevelDescription(description?: string): string {
    return this.stripHtml(description ?? '');
  }

  private serializeValidations(validations?: Record<string, ValidationValue>): string[] {
    if (!validations) return [];

    const entries: string[] = [];

    for (const [key, value] of Object.entries(validations)) {
      if (key === 'isRequired' && typeof value === 'string') {
        entries.push(`• ${value}`);
      }

      if (key === 'maxLength' && typeof value === 'number') {
        entries.push(`• Answer must be less than ${value} characters long`);
      }

      if (key === 'urlFormat' && typeof value === 'object') {
        entries.push(`• URL must be less than ${value['maxLength']} characters long`);
      }
    }

    return entries;
  }

  private stripHtml(value: string): string {
    return value
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private formatOptionList(options: string[]): string {
    const cleanOptions = options.map(option => option?.trim()).filter((option): option is string => Boolean(option));

    if (cleanOptions.length === 0) return 'the required option';
    if (cleanOptions.length === 1) return `"${cleanOptions[0]}"`;
    if (cleanOptions.length === 2) return `"${cleanOptions[0]}" or "${cleanOptions[1]}"`;

    return `${cleanOptions.slice(0, -1).join(', ')} or "${cleanOptions[cleanOptions.length - 1]}"`;
  }

  private getCellText(cell: ExcelJS.Cell): string {
    const value = cell.value;

    if (!value) return '';

    if (typeof value === 'string') return value;

    if (typeof value === 'object' && 'richText' in value) {
      return value.richText.map(part => part.text).join('');
    }

    return String(value);
  }

  private estimateLines(text: string, approxCharsPerLine: number): number {
    const lines = text.split('\n');
    let total = 0;

    for (const line of lines) {
      total += Math.max(1, Math.ceil(line.length / approxCharsPerLine));
    }

    return total;
  }

  private buildQuestionLabel(label: string, prefix: string, description?: string): ExcelJS.CellRichTextValue {
    const richText: ExcelJS.RichText[] = [];

    if (prefix) {
      richText.push({
        text: `\r\n${prefix}`,
        font: {
          color: { argb: 'FFFF0000' },
          size: 10,
          italic: true
        }
      });
    }

    richText.push({
      text: `\r\n${label}`,
      font: {
        bold: true,
        size: 12
      }
    });

    if (description) {
      richText.push({
        text: `\r\n${this.stripHtml(description)}`
      });
    }

    richText.push({
      text: '\r\n'
    });

    return { richText };
  }

  private buildValidationRichText(validations: string[]): ExcelJS.CellRichTextValue {
    const richText: ExcelJS.RichText[] = [];

    validations.forEach((rule, i) => {
      richText.push({
        text: `${rule}`,
        font: { size: 11 }
      });

      if (i < validations.length - 1) richText.push({ text: '\r\n' });
    });

    return { richText };
  }

  private stylizeRow(worksheet: ExcelJS.Worksheet, rowType: RowType, excelRow: ExcelJS.Row): void {
    if (rowType === 'section') {
      excelRow.font = {
        bold: true,
        size: 16,
        color: { argb: '00000000' }
      };

      excelRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE6E6E6' }
      };

      excelRow.alignment = {
        vertical: 'middle',
        horizontal: 'left'
      };

      excelRow.height = 35;

      this.stylizeRowBorders(excelRow, 'thin');

      worksheet.mergeCells(`E${excelRow.number}:I${excelRow.number}`);
    }
    if (rowType === 'subSection') {
      excelRow.font = {
        bold: true,
        size: 14,
        color: { argb: 'FF005EB8' }
      };

      excelRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE6E6E6' }
      };

      excelRow.alignment = {
        vertical: 'middle',
        horizontal: 'left',
        wrapText: true
      };

      excelRow.height = 25;

      this.stylizeRowBorders(excelRow, 'thin');

      worksheet.mergeCells(`E${excelRow.number}:I${excelRow.number}`);
    }

    if (rowType === 'question') {
      excelRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF0F4F5' }
      };

      excelRow.alignment = { vertical: 'middle', wrapText: true };

      const subsectionCell = excelRow.getCell(EXCEL_TEMPLATE_COLUMN_NUMBERS.subsection);

      subsectionCell.font = {
        bold: true,
        size: 12
      };

      // check and set row height
      excelRow.getCell(EXCEL_TEMPLATE_COLUMN_NUMBERS.answer).protection = { locked: false };

      // check and set row height
      const questionText = this.getCellText(excelRow.getCell(EXCEL_TEMPLATE_COLUMN_NUMBERS.question));

      const questionLines = this.estimateLines(questionText, 70); // description column width

      const maxLines = questionLines;

      excelRow.height = Math.max(15, maxLines * 15);

      this.stylizeRowBorders(excelRow, 'thin');
    }
  }

  private stylizeRowBorders(row: ExcelJS.Row, borderStyle: ExcelJS.BorderStyle) {
    row.eachCell({ includeEmpty: true }, cell => {
      cell.border = {
        top: { style: borderStyle, color: { argb: 'FFCCCCCC' } },
        left: { style: borderStyle, color: { argb: 'FFCCCCCC' } },
        bottom: { style: borderStyle, color: { argb: 'FFCCCCCC' } },
        right: { style: borderStyle, color: { argb: 'FFCCCCCC' } }
      };
    });
  }

  private applyListValidation(
    cell: ExcelJS.Cell,
    optionsSheet: ExcelJS.Worksheet,
    options: string[],
    columnIndex: number,
    errorMessage: string
  ): void {
    options.forEach((option, optionIndex) => {
      optionsSheet.getCell(optionIndex + 1, columnIndex).value = option;
    });

    const colLetter = optionsSheet.getColumn(columnIndex).letter;

    cell.dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: [`'_options'!$${colLetter}$1:$${colLetter}$${options.length}`],
      showErrorMessage: true,
      errorStyle: 'error',
      errorTitle: 'Invalid answer',
      error: errorMessage
    };
  }

  private applyTextLengthValidation(cell: ExcelJS.Cell, maxLength: number): void {
    cell.dataValidation = {
      type: 'textLength',
      operator: 'lessThanOrEqual',
      allowBlank: true,
      formulae: [maxLength],
      showErrorMessage: true,
      errorStyle: 'error',
      errorTitle: 'Answer too long',
      error: `Please enter no more than ${maxLength} characters.`
    };
  }
}
