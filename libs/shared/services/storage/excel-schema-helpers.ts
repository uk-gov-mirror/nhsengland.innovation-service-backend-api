import type { Question } from '../../models/schema-engine/question.types';

// ─────────────────────────────────────────────────────────────────────────────
// SHARED SCHEMA HELPERS
// Used by Excel generator and parsing services.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A flat lookup map of every question in the schema, indexed by its ID.
 * Populated once by buildQuestionMap() and then reused throughout the script.
 */
export const questionMap: Map<string, Question> = new Map();

/**
 * Walk every section/subSection/step/question in the schema tree and register
 * each question (and all its nested sub-questions) into the shared questionMap.
 *
 * Call this once at startup, before any question lookups are needed.
 */
export function buildQuestionMap(sections: any[]): void {
    questionMap.clear();
    sections.forEach(s =>
        s.subSections.forEach((ss: any) =>
            ss.steps.forEach((step: any) =>
                step.questions.forEach((q: any) => indexQuestion(q)))));
}

/**
 * Register a single question (and all its children) into the questionMap.
 * Recursively handles: items[].conditional, addQuestion, and field.
 */
export function indexQuestion(q: any): void {
    questionMap.set(q.id, q);
    if (q.items) q.items.forEach((i: any) => { if (i.conditional) indexQuestion(i.conditional); });
    if (q.addQuestion) indexQuestion(q.addQuestion);
    if (q.field) indexQuestion(q.field);
}

/**
 * Resolve the option items for a question.
 *
 * Handles the special 'itemsFromAnswer' pattern where a question's options
 * are dynamically derived from the answers of a previously-asked question.
 * In that case, we look up the source question in questionMap and return its items.
 */
export function resolveQuestionItems(q: Question): any[] {
    const anyQ = q as any;
    if (anyQ.items && Array.isArray(anyQ.items)) {
        if (
            anyQ.items.length > 0 &&
            anyQ.items[0] &&
            typeof anyQ.items[0] === 'object' &&
            'itemsFromAnswer' in anyQ.items[0]
        ) {
            const refQ = questionMap.get(anyQ.items[0].itemsFromAnswer);
            if (refQ && (refQ as any).items) return (refQ as any).items as any[];
        }
        return anyQ.items;
    }
    return [];
}
