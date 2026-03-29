/**
 * ExcelExportService — Pure JSON Schema → Excel writer.
 *
 * This service contains ZERO database logic and ZERO Node.js process dependencies.
 * It takes the Innovation Record (IR) schema and an optional payload to generate
 * a fully styled ExcelJS Workbook.
 *
 * STRATEGY (Hidden metadata):
 * - Column F (ID): Stores the question or option ID for the parser.
 * - Column G-I (Helpers): Store formula results (VLOOKUPs, booleans) for the parser to read.
 * - ReferenceData Sheet: Contains dropdown options and UUID mapping.
 */

import * as ExcelJS from 'exceljs';
import type { Question, RadioGroup, CheckboxArray, FieldsGroup } from '../../libs/shared/models/schema-engine/question.types';
import { buildQuestionMap, resolveQuestionItems, questionMap } from './excel-schema-helpers';

// --- CONSTANTS ---
const NHS_BLUE = 'FF005EB8';
const SUBSECTION_GRAY = 'FFE0E0E0';
const WHITE = 'FFFFFFFF';
const BLACK = 'FF000000';
const RED = 'FFFFCCCC';

const TEXTAREA_LENGTH_LIMIT: Record<string, number> = {
  xs: 200, s: 500, m: 1000, l: 1500, xl: 2000, xxl: 4000
};

export class ExcelExportService {
    // State encapsulated per instance
    private redPriority = 5000;
    private cellRegistry: Record<string, string> = {};
    private refDataColIdx = 1;
    private previousRequiredCellAddr: string | null = null;
    /**
     * Generates a complete ExcelJS Workbook strictly from the provided schema.
     * If a payload is provided, it pre-fills the answers.
     */
    public generateTemplateWorkbook(schema: any, payload?: Record<string, any>): ExcelJS.Workbook {
        // Reset state for safety if instance is reused
        this.redPriority = 5000;
        this.cellRegistry = {};
        this.refDataColIdx = 1;
        this.previousRequiredCellAddr = null;

        buildQuestionMap(schema.sections);

        const workbook = new ExcelJS.Workbook();
        const formSheet = workbook.addWorksheet('Innovation Record');
        const refSheet = workbook.addWorksheet('ReferenceData');
        refSheet.state = 'hidden';

        this.setupColumns(formSheet);

        for (const [sIdx, section] of schema.sections.entries()) {
            this.renderSectionHeader(formSheet, `${sIdx + 1}. ${section.title}`);
            for (const [ssIdx, subSection] of section.subSections.entries()) {
                const subSectionId = subSection.id;
                const subSectionPayload = payload ? payload[subSectionId] : null;

                this.renderSubSectionHeader(formSheet, `${sIdx + 1}.${ssIdx + 1}. ${subSection.title}`);
                for (const step of subSection.steps) {
                    let isStepConditionMet = true;
                    if (step.condition && step.condition.id) {
                        const parentValue = subSectionPayload ? subSectionPayload[step.condition.id] : null;
                        isStepConditionMet = Array.isArray(step.condition.options) && step.condition.options.includes(parentValue);

                        const parentQ = questionMap.get(step.condition.id);
                        if (parentQ) {
                            const parentLabel = (parentQ as any).label || parentQ.id;
                            const resolvedItems = resolveQuestionItems(parentQ);
                            const displayLabels = step.condition.options.map((optId: string) => {
                                const foundItem = resolvedItems.find((i: any) => i.id === optId);
                                return foundItem ? (foundItem.label || foundItem.id) : optId;
                            });
                            const requiredVals = displayLabels.join("' or '");
                            const alertMsg = `   ⚠️ CONDITIONAL SECTION: Only answer the question below if you answered '${requiredVals}' for '${parentLabel}'`;
                            const alertRow = formSheet.addRow(['', alertMsg, '', '', '', '', '']);
                            alertRow.getCell(2).font = { bold: true, color: { argb: 'FFD9534F' }, italic: true };
                        }
                    }

                    for (const question of step.questions) {
                        this.renderQuestionDispatcher(formSheet, refSheet, question, false, isStepConditionMet ? subSectionPayload : null);
                    }
                }
            }
        }

        formSheet.getColumn(6).hidden = true; 
        formSheet.getColumn(7).hidden = true; 
        formSheet.getColumn(8).hidden = true; 
        formSheet.getColumn(9).hidden = true;

        return workbook;
    }

    /**
     * Initializes the worksheet columns, widths, and header styles.
     * Column C is the primary answer field for users.
     * Column F-I are hidden and used for machine-readability.
     */
    private setupColumns(sheet: ExcelJS.Worksheet) {
        sheet.columns = [
            { header: '', key: 'margin', width: 5 },
            { header: 'Field (Question)', key: 'label', width: 45 },
            { header: 'Your Answer', key: 'answer', width: 45 },
            { header: 'Sub-Answer (If applicable)', key: 'subAnswer', width: 45 },
            { header: 'Guidance', key: 'guidance', width: 45 },
            { header: 'ID (Hidden)', key: 'id', width: 0 },
            { header: 'Helper (Hidden)', key: 'helper', width: 0 },
            { header: 'Sub Helper 1 (Hidden)', key: 'helper1', width: 0 },
            { header: 'Sub Helper 2 (Hidden)', key: 'helper2', width: 0 }
        ];
        
        for (let i = 2; i <= 5; i++) {
            sheet.getColumn(i).alignment = { vertical: 'top', wrapText: true };
        }

        sheet.getRow(1).eachCell((cell, colNumber) => {
            if (colNumber > 1) { 
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NHS_BLUE } };
                cell.font = { bold: true, color: { argb: WHITE }, size: 12 };
                cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
            }
        });
    }

    private renderSectionHeader(sheet: ExcelJS.Worksheet, title: string) {
        const row = sheet.addRow([title, '', '', '', '', '', '']);
        sheet.mergeCells(`A${row.number}:E${row.number}`);
        row.height = 48;
        row.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BLACK } };
        row.getCell(1).font = { bold: true, color: { argb: WHITE }, size: 14 };
        row.getCell(1).alignment = { vertical: 'middle' };
    }

    private renderSubSectionHeader(sheet: ExcelJS.Worksheet, title: string) {
        const row = sheet.addRow([title, '', '', '', '', '', '']);
        sheet.mergeCells(`A${row.number}:E${row.number}`);
        row.height = 32;
        row.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SUBSECTION_GRAY } };
        row.getCell(1).font = { bold: true, color: { argb: BLACK }, size: 11 };
        row.getCell(1).alignment = { vertical: 'middle' };
    }

    private toAbsolute(addr: string): string {
        return '$' + addr.replace(/(\d+)/, '$$$1');
    }

    /**
     * Selects the correct rendering method based on the question's dataType.
     * @returns The Excel cell address of the primary answer (for registry/mapping).
     */
    private renderQuestionDispatcher(sheet: ExcelJS.Worksheet, refSheet: ExcelJS.Worksheet, qObj: Question, isIndented: boolean, ssPayload?: any, condition?: { requiredValue: string }): string | null {
        let mainCellAddr: string | null = null;
        const question = { ...qObj } as any;

        if (condition) {
            question.label = (question.label || question.id) + `\n(⚠️ Only answer if you selected '${condition.requiredValue}' above)`;
        }

        switch (question.dataType) {
            case 'text':
            case 'textarea':
                mainCellAddr = this.renderTextQuestion(sheet, question, isIndented, ssPayload);
                break;
            case 'radio-group':
                mainCellAddr = this.renderRadioGroupQuestion(sheet, refSheet, question as RadioGroup, isIndented, ssPayload);
                break;
            case 'autocomplete-array':
                if (question.validations?.max?.length === 1) {
                    mainCellAddr = this.renderRadioGroupQuestion(sheet, refSheet, question as any, isIndented, ssPayload);
                } else {
                    mainCellAddr = this.renderCheckboxArrayQuestion(sheet, refSheet, question as any, isIndented, ssPayload);
                }
                break;
            case 'checkbox-array':
                mainCellAddr = this.renderCheckboxArrayQuestion(sheet, refSheet, question as CheckboxArray, isIndented, ssPayload);
                break;
            case 'fields-group':
                mainCellAddr = this.renderFieldsGroupQuestion(sheet, refSheet, question as FieldsGroup, isIndented, ssPayload);
                break;
            default:
                mainCellAddr = this.renderTextQuestion(sheet, question, isIndented, ssPayload);
                sheet.getCell(mainCellAddr!).note = `Warning: Unknown data type '${(question as any).dataType}' - Rendered as text.`;
                break;
        }

        if (mainCellAddr) this.cellRegistry[question.id] = this.toAbsolute(mainCellAddr);
        return mainCellAddr;
    }

    private renderTextQuestion(sheet: ExcelJS.Worksheet, question: Question, isIndented: boolean, ssPayload?: any): string {
        const isRequired = !!question.validations?.isRequired;
        const maxLength = this.getMaxLength(question);
        const row = sheet.addRow(['', this.getLabel(question, isIndented), '', '', this.getGuidance(question, isRequired, maxLength), question.id]);
        const cell = row.getCell(3);
        
        const value = ssPayload ? ssPayload[question.id] : null;
        if (value !== undefined && value !== null) {
            cell.value = value.toString();
        }

        this.applyInputStyle(cell);
        this.applyCascadingRed(sheet, cell.address, isRequired);
        if (maxLength) cell.dataValidation = { type: 'textLength', operator: 'lessThanOrEqual', formulae: [maxLength.toString()], showErrorMessage: true, errorTitle: 'Too Long', error: `Limit: ${maxLength} chars.` };
        return cell.address;
    }

    private renderRadioGroupQuestion(sheet: ExcelJS.Worksheet, refSheet: ExcelJS.Worksheet, question: RadioGroup, isIndented: boolean, ssPayload?: any): string {
        const isRequired = !!question.validations?.isRequired;
        const row = sheet.addRow(['', this.getLabel(question, isIndented), '', '', this.getGuidance(question, isRequired), question.id]);
        const cell = row.getCell(3);
        const helperCell = row.getCell(7);
        
        this.applyInputStyle(cell);
        this.applyCascadingRed(sheet, cell.address, isRequired);

        const resolvedItems = resolveQuestionItems(question as any);
        const validItems = resolvedItems.filter((i: any) => 'label' in i && i.label);
        const options = validItems ? validItems.map((i: any) => ({ label: i.label, id: i.id || i.label })) : [];

        // Pre-fill value
        const valId = ssPayload ? ssPayload[question.id] : null;
        if (valId && options.length > 0) {
            const found = options.find(o => o.id === valId);
            if (found) cell.value = found.label;
        }

        if (resolvedItems.length > 0) {
            if (options.length > 0) this.applyRobustDropdown(cell, refSheet, options, helperCell);

            resolvedItems.forEach((item: any) => {
                const itemLabel = item.label || item.id;
                if (item.conditional) {
                    const isItemConditionMet = (valId === item.id);
                    this.renderQuestionDispatcher(sheet, refSheet, item.conditional, true, isItemConditionMet ? ssPayload : null, { requiredValue: itemLabel });
                }
            });
        } else {
            helperCell.value = { formula: `IF(ISBLANK(${cell.address}), "", ${cell.address})` };
        }
        return helperCell.address;
    }

    private renderCheckboxArrayQuestion(sheet: ExcelJS.Worksheet, refSheet: ExcelJS.Worksheet, question: CheckboxArray, isIndented: boolean, ssPayload?: any): string | null {
        sheet.addRow(['']); 
        const groupLabelRow = sheet.addRow(['', this.getLabel(question, isIndented), '', '', this.getGuidance(question), question.id]);
        groupLabelRow.font = { italic: true };
        const startRow = sheet.lastRow!.number + 1;
        let optionCount = 0;
        let exclusiveRowAddr: string | null = null;
        const resolvedItems = resolveQuestionItems(question as any);

        const selectedIds: string[] = ssPayload && Array.isArray(ssPayload[question.id]) ? ssPayload[question.id] : [];
        const addQuestionData = question.addQuestion && ssPayload ? ssPayload[question.addQuestion.id] : null;

        resolvedItems.forEach((item: any) => {
            const itemId = item.id || item.label;
            if (item.label || item.id) {
                let subLabel = '';
                if (question.addQuestion && question.addQuestion.label) {
                    subLabel = question.addQuestion.label.replace(/\{\{item.*?\}\}/g, item.label || item.id) + '\n(⚠️ Answer only if Selected)';
                }
                
                const row = sheet.addRow(['', `     ◽ ${item.label || item.id}`, '', subLabel ? `      ${subLabel}:` : '', '', itemId, '']);
                const answerCell = row.getCell(3);
                answerCell.dataValidation = { type: 'list', allowBlank: false, formulae: ['"Selected,Not Selected"'] };
                answerCell.alignment = { horizontal: 'center' };
                
                // Pre-fill Selected state
                if (selectedIds.includes(itemId)) {
                    answerCell.value = 'Selected';
                }

                const absAnswerAddr = this.toAbsolute(answerCell.address); 
                if (item.exclusive) exclusiveRowAddr = absAnswerAddr;
                
                if (question.addQuestion) {
                    const subCell = row.getCell(4);
                    const subHelper = row.getCell(8);
                    this.applyInputStyle(subCell);
                    this.applyValidationToCell(subCell, refSheet, question.addQuestion, subHelper);

                    // Pre-fill sub-answer (for addQuestion)
                    if (addQuestionData && addQuestionData[itemId]) {
                        subCell.value = addQuestionData[itemId].toString();
                    }
                }
                row.getCell(7).value = { formula: `IF(${answerCell.address}="Selected", F${row.number}, "")` };
                optionCount++;
            }
        });

        if (exclusiveRowAddr && optionCount > 1) {
            const range = `C${startRow}:C${sheet.lastRow!.number}`;
            sheet.addConditionalFormatting({ ref: range, rules: [{ priority: this.redPriority++, type: 'expression', formulae: [`AND(${exclusiveRowAddr}="Selected", COUNTIF(${range}, "Selected")>1)`], style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: RED } } } }] });
        }

        if (optionCount > 0) {
            const resultCell = sheet.getCell(`F${groupLabelRow.number}`);
            resultCell.value = { formula: `TEXTJOIN("; ", TRUE, G${startRow}:G${startRow + optionCount - 1})` };
            sheet.addRow(['']);
            return resultCell.address;
        }
        sheet.addRow(['']);
        return null;
    }

    /**
     * Renders a FieldsGroup (repeating set of questions) in a vertical layout.
     * Each entry uses 1 or 2 rows depending on whether a sub-question exists.
     * Uses Excel Formula interpolation for the second label if applicable.
     */
    private renderFieldsGroupQuestion(sheet: ExcelJS.Worksheet, refSheet: ExcelJS.Worksheet, question: FieldsGroup, isIndented: boolean, ssPayload?: any): string | null {
        sheet.addRow(['']);
        // Header
        sheet.addRow(['', this.getLabel(question, isIndented), '', '', this.getGuidance(question), question.id]).font = { italic: true, bold: true };
        
        const f1 = question.field;
        const f2 = question.addQuestion;
        const entries: any[] = ssPayload && Array.isArray(ssPayload[question.id]) ? ssPayload[question.id] : [];

        for (let i = 1; i <= 5; i++) {
            const entry = (entries && entries[i - 1]) || {};
            
            // --- ROW 1: Field 1 (The main entry label) ---
            const r1 = sheet.addRow(['', `   ${i}. ${f1.label || 'Entry'}:`, '', '', this.getGuidance(f1), question.id]);
            const c1 = r1.getCell(3); // Answer Col C
            const h1 = r1.getCell(8); // Helper Col H (Backend value)
            this.applyInputStyle(c1);
            this.applyValidationToCell(c1, refSheet, f1, h1);

            if (entry[f1.id] !== undefined && entry[f1.id] !== null) {
                c1.value = entry[f1.id].toString();
            }

            // --- ROW 2: Field 2 (Optional follow-up) ---
            if (f2) {
                const r2 = sheet.addRow(['', '', '', '', this.getGuidance(f2), question.id]);
                const c2 = r2.getCell(3); // Answer Col C (Vertically stacked)
                const h2 = r2.getCell(9); // Helper Col I (Backend value)
                const labelCell = r2.getCell(2);

                this.applyInputStyle(c2);
                this.applyValidationToCell(c2, refSheet, f2, h2);

                if (entry[f2.id] !== undefined && entry[f2.id] !== null) {
                    c2.value = entry[f2.id].toString();
                }

                /**
                 * LIVE EXCEL INTERPOLATION:
                 * We inject a formula so that while the user types in the main field (c1),
                 * the label for this field (labelCell) updates in real-time.
                 */
                if (f2.label && f2.label.includes('{{')) {
                    const prefix = f2.label.split('{{')[0] || '';
                    const suffix = f2.label.split('}}')[1] || '';
                    const f1Addr = c1.address;
                    labelCell.value = {
                        formula: `"${prefix}" & IF(ISBLANK(${f1Addr}), "Entry ${i}", ${f1Addr}) & "${suffix}:"`
                    };
                } else {
                    labelCell.value = `      ${f2.label || 'Details'}:`;
                }
                labelCell.font = { italic: true, color: { argb: 'FF555555' } };
            }
        }
        sheet.addRow(['']);
        return null;
    }

    private applyInputStyle(cell: ExcelJS.Cell) {
        cell.font = { color: { argb: BLACK } };
        cell.border = {
            top: { style: 'thin', color: { argb: NHS_BLUE } },
            left: { style: 'thin', color: { argb: NHS_BLUE } },
            bottom: { style: 'thin', color: { argb: NHS_BLUE } },
            right: { style: 'thin', color: { argb: NHS_BLUE } }
        };
    }

    /**
     * Creates a dropdown in Excel (Column C) using data from the ReferenceData sheet.
     * Also sets up a hidden VLOOKUP in Column G to map labels back to UUIDs.
     */
    private applyRobustDropdown(cell: ExcelJS.Cell, refSheet: ExcelJS.Worksheet, options: {label: string, id: string}[], helperCell?: ExcelJS.Cell) {
        const colIdx = this.refDataColIdx;
        options.forEach((opt, idx) => { 
            refSheet.getRow(idx + 1).getCell(colIdx).value = opt.label; 
            refSheet.getRow(idx + 1).getCell(colIdx + 1).value = opt.id; 
        });
        const colName = this.getExcelColumnName(colIdx);
        const idColName = this.getExcelColumnName(colIdx + 1);
        
        cell.dataValidation = { type: 'list', allowBlank: true, formulae: [`'ReferenceData'!$${colName}$1:$${colName}$${options.length}`], showErrorMessage: true, errorTitle: 'Invalid Selection', error: 'Select from list.' };
        
        if (helperCell) {
            const vlookupFormula = `IFERROR(VLOOKUP(${cell.address}, 'ReferenceData'!$${colName}$1:$${idColName}$${options.length}, 2, 0), "")`;
            helperCell.value = { formula: vlookupFormula };
        }
        
        this.refDataColIdx += 2;
    }

    private applyValidationToCell(cell: ExcelJS.Cell, refSheet: ExcelJS.Worksheet, q: Question, helperCell?: ExcelJS.Cell) {
        const maxLength = this.getMaxLength(q);
        if (maxLength) cell.dataValidation = { type: 'textLength', operator: 'lessThanOrEqual', formulae: [maxLength.toString()], showErrorMessage: true, errorTitle: 'Too Long', error: `Limit: ${maxLength}` };
        
        if ((q.dataType === 'radio-group' || q.dataType === 'autocomplete-array') && 'items' in q) {
            const resolvedItems = resolveQuestionItems(q as any);
            const validItems = resolvedItems.filter((i: any) => 'label' in i && i.label);
            const options = validItems.map((i: any) => ({ label: i.label, id: i.id || i.label }));
            
            if (options.length > 0) this.applyRobustDropdown(cell, refSheet, options, helperCell);
        } else if (helperCell) {
            helperCell.value = { formula: `IF(ISBLANK(${cell.address}), "", ${cell.address})` };
        }
    }

    private getExcelColumnName(col: number): string {
        let name = "";
        while (col > 0) {
            let mod = (col - 1) % 26;
            name = String.fromCharCode(65 + mod) + name;
            col = Math.floor((col - mod) / 26);
        }
        return name;
    }

    private cleanHtmlText(html: string): string {
        if (!html) return '';
        let text = html.replace(/<\/p>|<br\s*\/?>/gi, '\n\n');
        text = text.replace(/<a href="\{\{urls\.[^}]+\}\}"[^>]*>(.*?)<\/a>/gi, '$1');
        text = text.replace(/<[^>]*>?/gm, '');
        text = text.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'");
        return text.trim();
    }

    private getLabel(q: Question, isIndented: boolean): string { 
        return (isIndented ? '   └─ ' : '') + ((q as any).label || q.id); 
    }

    private getGuidance(q: Question, isRequired = false, maxLength?: number): string { 
        let g = this.cleanHtmlText(q.description || ''); 
        if (isRequired) g += (g ? '\n\n' : '') + '(Required)'; 
        if (maxLength) g += (g ? ' ' : '') + `(Max ${maxLength} chars)`; 
        return g.trim(); 
    }

    private getMaxLength(q: Question): number | undefined { 
        if (q.validations?.maxLength) return q.validations.maxLength; 
        if ((q as any).lengthLimit) return TEXTAREA_LENGTH_LIMIT[(q as any).lengthLimit as string]; 
        return undefined; 
    }

    /**
     * Applies conditional formatting to highlight required cells in Red.
     * Uses a cascading logic: only highlights the NEXT required field if the
     * previous one was filled, to guide the user naturally through the form.
     */
    private applyCascadingRed(sheet: ExcelJS.Worksheet, currentAddr: string, isRequired: boolean) {
        if (!isRequired) return;
        const formulae = this.previousRequiredCellAddr ? [`AND(ISBLANK(${currentAddr}), NOT(ISBLANK(${this.previousRequiredCellAddr})))`] : [`ISBLANK(${currentAddr})`];
        sheet.addConditionalFormatting({ 
            ref: currentAddr, 
            rules: [{ 
                priority: this.redPriority++, 
                type: 'expression', 
                formulae, 
                style: { 
                    font: { color: { argb: BLACK } },
                    fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: RED } } 
                } 
            }] 
        });
        this.previousRequiredCellAddr = currentAddr;
    }
}
