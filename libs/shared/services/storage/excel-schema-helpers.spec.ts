import { getSmartMockPayload } from './excel-schema-helpers';

describe('excel-schema-helpers', () => {
  describe('getSmartMockPayload', () => {
    const mockSubSection = {
      id: 'TEST_SUBSECTION',
      steps: [
        {
          id: 'STEP_1',
          questions: [
            { id: 'Q1', type: 'text' },
            { id: 'Q1b', type: 'text' }
          ]
        },
        {
          id: 'STEP_2',
          condition: {
            id: 'Q1',
            options: ['show-step-2']
          },
          questions: [{ id: 'Q2', type: 'text' }]
        },
        {
          id: 'STEP_3',
          condition: {
            id: 'Q2',
            options: ['show-step-3']
          },
          questions: [{ id: 'Q3', type: 'text' }]
        }
      ]
    };

    it('should only include top-level questions when data is empty', () => {
      const currentData = {};
      const result = getSmartMockPayload(mockSubSection, currentData);

      expect(result).toEqual({
        Q1: null,
        Q1b: null
      });
    });

    it('should include conditional questions when condition is met', () => {
      const currentData = { Q1: 'show-step-2' };
      const result = getSmartMockPayload(mockSubSection, currentData);

      expect(result).toEqual({
        Q1: null,
        Q1b: null,
        Q2: null
      });
    });

    it('should include nested conditional questions when all conditions are met', () => {
      const currentData = {
        Q1: 'show-step-2',
        Q2: 'show-step-3'
      };
      const result = getSmartMockPayload(mockSubSection, currentData);

      expect(result).toEqual({
        Q1: null,
        Q1b: null,
        Q2: null,
        Q3: null
      });
    });

    it('should NOT include conditional questions when condition is NOT met', () => {
      const currentData = { Q1: 'something-else' };
      const result = getSmartMockPayload(mockSubSection, currentData);

      expect(result).toEqual({
        Q1: null,
        Q1b: null
      });
    });

    it('should handle missing steps or null subsection gracefully', () => {
      expect(getSmartMockPayload(null, {})).toEqual({});
      expect(getSmartMockPayload({}, {})).toEqual({});
      expect(getSmartMockPayload({ steps: [] }, {})).toEqual({});
    });

    it('should handle steps with multiple options in condition', () => {
      const multiOptionSubSection = {
        steps: [
          {
            condition: {
              id: 'PARENT',
              options: ['A', 'B']
            },
            questions: [{ id: 'CHILD' }]
          }
        ]
      };

      expect(getSmartMockPayload(multiOptionSubSection, { PARENT: 'A' })).toEqual({ CHILD: null });
      expect(getSmartMockPayload(multiOptionSubSection, { PARENT: 'B' })).toEqual({ CHILD: null });
      expect(getSmartMockPayload(multiOptionSubSection, { PARENT: 'C' })).toEqual({});
    });
  });
});
