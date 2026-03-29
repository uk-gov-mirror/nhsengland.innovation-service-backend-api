/**
 * ExcelImportService — Pure Excel → JSON parser for Innovation Record templates.
 *
 * This service contains ZERO database logic, ZERO Node.js process dependencies.
 * It takes an ExcelJS Workbook + the IR Schema and returns structured section payloads
 * ready to be saved by any caller (CLI script, API controller, test harness).
 *
 * Architecture (Path C):
 *   ┌───────────────┐       ┌─────────────────────┐       ┌────────────────┐
 *   │  Excel file   │ ────▶ │  ExcelImportService  │ ────▶ │ Section JSON   │
 *   │  (.xlsx)      │       │  (this file)         │       │ payloads       │
 *   └───────────────┘       └─────────────────────┘       └────────────────┘
 *                                                                 │
 *                                         ┌───────────────────────┼─────────────────────┐
 *                                         ▼                       ▼                     ▼
 *                                  CLI Script              API Controller          Test Harness
 *                              (import-data.ts)       (future endpoint)         (unit tests)
 */

import type * as ExcelJS from 'exceljs';
import type { Question, RadioGroup, CheckboxArray, FieldsGroup } from '../../libs/shared/models/schema-engine/question.types';
import type { SchemaModel } from '../../libs/shared/models/schema-engine/schema.model';
import { buildQuestionMap, resolveQuestionItems } from './excel-schema-helpers';

// ──────────────────────────────────────────────────────────────
// COLUMN LAYOUT  (must match generate-template.ts exactly)
// ──────────────────────────────────────────────────────────────
const COL_ANSWER  = 3; // C — user-visible answer
const COL_SUB     = 4; // D — sub-answer for addQuestion
const COL_ID      = 6; // F — question / option ID anchor
const COL_HELPER  = 7; // G — backend-resolved value (VLOOKUP / IF formula result)
const COL_SUB_H   = 8; // H — sub-answer backend helper
const COL_H2      = 9; // I — second answer backend helper for fields-group

// ──────────────────────────────────────────────────────────────
// PUBLIC TYPES
// ──────────────────────────────────────────────────────────────

/** Result for a single parsed section. */
export interface ParsedSection {
    sectionKey: string;
    /** Raw extracted payload from Excel (question IDs → values). */
    rawPayload: Record<string, any>;
    /** Calculated fields derived by SchemaModel. */
    calculatedFields: Record<string, string>;
    /** Final merged payload (raw + calculated), ready for DB save. */
    finalPayload: Record<string, any>;
    /** Joi validation issues (non-blocking). Empty array if valid. */
    validationIssues: string[];
}

/** Full result returned by parseWorkbook(). */
export interface ExcelImportResult {
    /** Total unique question/option IDs found in the spreadsheet. */
    indexedIds: number;
    /** Parsed sections with data. */
    sections: ParsedSection[];
    /** Section keys that were skipped because they had no data. */
    skippedSections: string[];
}

// ──────────────────────────────────────────────────────────────
// MAIN PUBLIC API
// ──────────────────────────────────────────────────────────────

/**
 * Parse a filled-in Excel workbook and extract section payloads.
 *
 * This is the single entry point for all callers. It:
 *   1. Builds a row index from Column F (question IDs)
 *   2. Walks the schema section by section
 *   3. Extracts answers by dataType (text, radio, checkbox, fields-group)
 *   4. Validates each section against SchemaModel
 *   5. Merges calculated fields
 *   6. Returns structured results — NO side effects, NO database writes
 *
 * @param workbook   An already-loaded ExcelJS workbook
 * @param schema     The raw IR schema (IR_SCHEMA or from DB)
 * @param schemaModel  A SchemaModel instance for validation & calculated fields
 * @returns ExcelImportResult with all parsed sections
 */
export function parseWorkbook(
    workbook: ExcelJS.Workbook,
    schema: any,
    schemaModel: SchemaModel
): ExcelImportResult {
    // Ensure question map is populated
    buildQuestionMap(schema.sections);

    // Find the "Innovation Record" worksheet
    const sheet = workbook.getWorksheet('Innovation Record');
    if (!sheet) {
        throw new Error('Worksheet "Innovation Record" not found in the workbook.');
    }

    // Build the row index from Column F
    const rowIndex = buildRowIndex(sheet);

    const sections: ParsedSection[] = [];
    const skippedSections: string[] = [];

    for (const section of schema.sections) {
        for (const subSection of section.subSections) {
            const sectionKey = subSection.id as string;
            const rawPayload: Record<string, any> = {};

            // Flatten all questions across all steps in this subsection
            const allQuestions: Question[] = subSection.steps.flatMap((step: any) => step.questions);
            extractQuestions(sheet, rowIndex, allQuestions, rawPayload);

            if (Object.keys(rawPayload).length === 0) {
                skippedSections.push(sectionKey);
                continue;
            }

            // Validate
            const validationIssues: string[] = [];
            try {
                const joiSchema = schemaModel.getSubSectionPayloadValidation(sectionKey, rawPayload);
                const { error } = joiSchema.validate(rawPayload, { abortEarly: false, allowUnknown: true });
                if (error) {
                    error.details.forEach(d => validationIssues.push(d.message));
                }
            } catch (err: any) {
                validationIssues.push(`Schema validation error: ${err?.message}`);
            }

            // Calculated fields
            const calculatedFields = schemaModel.getCalculatedFields(sectionKey, rawPayload);
            const finalPayload = { ...rawPayload, ...calculatedFields };

            sections.push({ sectionKey, rawPayload, calculatedFields, finalPayload, validationIssues });
        }
    }

    return {
        indexedIds: rowIndex.size,
        sections,
        skippedSections
    };
}

/**
 * Convenience method: extract only the INNOVATION_DESCRIPTION section from a workbook.
 * Used for CREATE mode where we need the registration payload before creating the innovation.
 */
export function parseRegistrationPayload(
    workbook: ExcelJS.Workbook,
    schema: any,
    schemaModel: SchemaModel
): { payload: Record<string, any>; validationIssues: string[] } {
    buildQuestionMap(schema.sections);

    const sheet = workbook.getWorksheet('Innovation Record');
    if (!sheet) throw new Error('Worksheet "Innovation Record" not found.');

    const rowIndex = buildRowIndex(sheet);

    // Find INNOVATION_DESCRIPTION subsection
    const descSection = schema.sections
        .flatMap((s: any) => s.subSections)
        .find((ss: any) => ss.id === 'INNOVATION_DESCRIPTION');

    if (!descSection) throw new Error('INNOVATION_DESCRIPTION section not found in schema.');

    const rawPayload: Record<string, any> = {};
    const descQuestions: Question[] = descSection.steps.flatMap((step: any) => step.questions);
    extractQuestions(sheet, rowIndex, descQuestions, rawPayload);

    const calculatedFields = schemaModel.getCalculatedFields('INNOVATION_DESCRIPTION', rawPayload);
    const payload = { ...rawPayload, ...calculatedFields };

    const validationIssues: string[] = [];
    try {
        const joiSchema = schemaModel.getSubSectionPayloadValidation('INNOVATION_DESCRIPTION', rawPayload);
        const { error } = joiSchema.validate(rawPayload, { abortEarly: false, allowUnknown: true });
        if (error) error.details.forEach(d => validationIssues.push(d.message));
    } catch (err: any) {
        validationIssues.push(`Validation error: ${err?.message}`);
    }

    return { payload, validationIssues };
}

// ──────────────────────────────────────────────────────────────
// INTERNAL: ROW SCANNER
// ──────────────────────────────────────────────────────────────

/**
 * Build an index of row numbers keyed by question ID from Column F.
 * This is the core of our "Machine-Readable" strategy: we don't guess row numbers,
 * we look for the unique question IDs hidden in Column F.
 */
function buildRowIndex(sheet: ExcelJS.Worksheet): Map<string, number[]> {
    const index = new Map<string, number[]>();
    sheet.eachRow((row, rowNumber) => {
        const id = cellStr(row.getCell(COL_ID));
        if (id) {
            if (!index.has(id)) index.set(id, []);
            index.get(id)!.push(rowNumber);
        }
    });
    return index;
}

/**
 * Read the string value from an ExcelJS cell, handling formula results.
 * For cells like the Radio Group (which uses VLOOKUP), we must read the calculated
 * result (.result) instead of the formula string (.formula).
 */
function cellStr(cell: ExcelJS.Cell): string {
    if (!cell || cell.value === null || cell.value === undefined) return '';
    if (typeof cell.value === 'object' && 'result' in (cell.value as any)) {
        return String((cell.value as any).result ?? '').trim();
    }
    return String(cell.value).trim();
}

// ──────────────────────────────────────────────────────────────
// INTERNAL: QUESTION READERS — one per dataType
// ──────────────────────────────────────────────────────────────

/** text / textarea — single row, read Col G. */
function readTextQuestion(sheet: ExcelJS.Worksheet, rowIndex: Map<string, number[]>, question: Question): string | undefined {
    const rows = rowIndex.get(question.id);
    if (!rows || rows.length === 0) return undefined;
    const val = cellStr(sheet.getRow(rows[0] as number).getCell(COL_HELPER));
    return val || undefined;
}

/** radio-group / autocomplete-array (single) — single row, Col G = VLOOKUP result. */
function readRadioQuestion(sheet: ExcelJS.Worksheet, rowIndex: Map<string, number[]>, question: Question): string | undefined {
    const rows = rowIndex.get(question.id);
    if (!rows || rows.length === 0) return undefined;
    const val = cellStr(sheet.getRow(rows[0] as number).getCell(COL_HELPER));
    return val || undefined;
}

/**
 * checkbox-array — reads each option row's Col C for "Selected",
 * collects IDs from Col F, and optionally collects sub-answers from Col H.
 */
function readCheckboxQuestion(
    sheet: ExcelJS.Worksheet,
    rowIndex: Map<string, number[]>,
    question: CheckboxArray
): { answers: string[]; subAnswers: Record<string, string> } {
    const answers: string[] = [];
    const subAnswers: Record<string, string> = {};

    const resolvedItems = resolveQuestionItems(question as any).filter(
        (i: any) => i.id && !i.type // skip separators
    );

    for (const item of resolvedItems) {
        const rows = rowIndex.get(item.id);
        if (!rows || rows.length === 0) continue;
        const row = sheet.getRow(rows[0] as number);

        if (cellStr(row.getCell(COL_ANSWER)) === 'Selected') {
            const optionId = cellStr(row.getCell(COL_ID));
            if (optionId) answers.push(optionId);

            if (question.addQuestion) {
                const subVal = cellStr(row.getCell(COL_SUB_H)) || cellStr(row.getCell(COL_SUB));
                if (subVal) subAnswers[optionId] = subVal;
            }
        }
    }

    return { answers, subAnswers };
}

/**
 * fields-group — Dynamic vertical reader.
 * Uses the list of row numbers found for this question ID.
 * If the question has a secondary field (addQuestion), it reads rows in pairs.
 * 
 * Supports:
 * - 1 row per entry (e.g. Organization only)
 * - 2 rows per entry (e.g. Text + Textarea feedback)
 */
function readFieldsGroupQuestion(
    sheet: ExcelJS.Worksheet,
    rowIndex: Map<string, number[]>,
    question: FieldsGroup
): Record<string, string>[] {
    const allRows = rowIndex.get(question.id);
    if (!allRows || allRows.length < 2) return [];

    const entryRows = allRows.slice(1); // Exclude the header row
    const results: Record<string, string>[] = [];
    const hasF2 = !!question.addQuestion;

    // Use step increment based on whether we have 1 or 2 rows per entry
    const step = hasF2 ? 2 : 1;

    for (let i = 0; i < entryRows.length; i += step) {
        const row1 = sheet.getRow(entryRows[i] as number);
        // Fallback: Check helper column (H) first, then answer column (C)
        const val1 = cellStr(row1.getCell(COL_SUB_H)) || cellStr(row1.getCell(COL_ANSWER));
        
        let val2 = '';
        if (hasF2 && (i + 1) < entryRows.length) {
            const row2 = sheet.getRow(entryRows[i + 1] as number);
            val2 = cellStr(row2.getCell(COL_H2)) || cellStr(row2.getCell(COL_ANSWER));
        }

        if (val1 || val2) {
            const entry: Record<string, string> = { [question.field.id]: val1 };
            if (hasF2 && val2) entry[question.addQuestion!.id] = val2;
            results.push(entry);
        }
    }

    return results;
}

// ──────────────────────────────────────────────────────────────
// INTERNAL: SECTION BUILDER
// ──────────────────────────────────────────────────────────────

/**
 * Walk a list of questions from the schema, extract answers from Excel,
 * and accumulate them into the payload object.
 * Handles sub-questions (conditionals) recursively.
 */
function extractQuestions(
    sheet: ExcelJS.Worksheet,
    rowIndex: Map<string, number[]>,
    questions: Question[],
    payload: Record<string, any>
): void {
    for (const question of questions) {
        const dt = question.dataType;
        const anyQ = question as any;

        if (dt === 'text' || dt === 'textarea') {
            const val = readTextQuestion(sheet, rowIndex, question);
            if (val !== undefined) payload[question.id] = val;

        } else if (dt === 'radio-group') {
            const val = readRadioQuestion(sheet, rowIndex, question);
            if (val !== undefined) {
                payload[question.id] = val;
                const rg = question as RadioGroup;
                const resolvedItems = resolveQuestionItems(rg as any);
                for (const item of resolvedItems) {
                    if (item.conditional && val === (item.id || item.label)) {
                        extractQuestions(sheet, rowIndex, [item.conditional], payload);
                    }
                }
            }

        } else if (dt === 'autocomplete-array') {
            const isSingle = anyQ.validations?.max?.length === 1;
            if (isSingle) {
                const val = readRadioQuestion(sheet, rowIndex, question);
                if (val !== undefined) payload[question.id] = val;
            } else {
                const cb = { ...question, dataType: 'checkbox-array' } as unknown as CheckboxArray;
                const { answers } = readCheckboxQuestion(sheet, rowIndex, cb);
                if (answers.length > 0) payload[question.id] = answers;
            }

        } else if (dt === 'checkbox-array') {
            const { answers, subAnswers } = readCheckboxQuestion(sheet, rowIndex, question as CheckboxArray);
            if (answers.length > 0) {
                payload[question.id] = answers;
                const cbQ = question as CheckboxArray;
                if (cbQ.addQuestion && Object.keys(subAnswers).length > 0) {
                    payload[cbQ.addQuestion.id] = subAnswers;
                }
            }

        } else if (dt === 'fields-group') {
            const entries = readFieldsGroupQuestion(sheet, rowIndex, question as FieldsGroup);
            if (entries.length > 0) payload[question.id] = entries;
        }
    }
}
