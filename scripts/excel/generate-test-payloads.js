const fs = require('fs');
const path = require('path');

const outDir = path.join(__dirname, 'test-payloads');

if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
}

const payloads = {
    '1-empty.json': {},

    '2-innovation-description-only.json': {
        INNOVATION_DESCRIPTION: {
            name: 'Basic Innovation',
            description: 'Testing only the very first section.',
            officeLocation: 'England'
        }
    },

    '3-checkbox-array.json': {
        INNOVATION_DESCRIPTION: {
            name: 'Checkbox Tester',
            categories: ['AI', 'DIGITAL', 'MEDICAL_DEVICE'], // Digital, AI, Medical Device
            mainCategory: 'AI'
        }
    },

    '4-fields-group-user-tests-1.json': {
        TESTING_WITH_USERS: {
            userTests: [
                { kind: 'Alpha testing with nurses', feedback: 'Very positive response so far.' }
            ]
        }
    },

    '5-fields-group-user-tests-5.json': {
        TESTING_WITH_USERS: {
            userTests: [
                { kind: 'Test 1', feedback: 'Feedback 1' },
                { kind: 'Test 2', feedback: 'Feedback 2' },
                { kind: 'Test 3', feedback: 'Feedback 3' },
                { kind: 'Test 4', feedback: 'Feedback 4' },
                { kind: 'Test 5', feedback: 'Feedback 5' }
            ]
        }
    },

    '6-fields-group-user-tests-6-overflow.json': {
        TESTING_WITH_USERS: {
            userTests: [
                { kind: 'Test 1', feedback: 'Feedback 1' },
                { kind: 'Test 2', feedback: 'Feedback 2' },
                { kind: 'Test 3', feedback: 'Feedback 3' },
                { kind: 'Test 4', feedback: 'Feedback 4' },
                { kind: 'Test 5', feedback: 'Feedback 5' },
                { kind: 'Test 6 - OVERFLOW', feedback: 'This should not appear in the template' }
            ]
        }
    },

    '7-fields-group-no-f2.json': {
        DEPLOYMENT: {
            isDeployed: 'YES', // Triggers the deploymentPlans conditional
            deploymentPlans: [
                { organizationDepartment: 'NHS Trust A - Cardiology' },
                { organizationDepartment: 'NHS Trust B - Neurology' }
            ]
        }
    },

    '8-conditional-triggered.json': {
        UNDERSTANDING_OF_NEEDS: {
            impactDiseaseCondition: 'YES',
            diseasesConditionsImpact: ['DIABETES_AND_OTHER_ENDOCRINAL_NUTRITIONAL_AND_METABOLIC_CONDITIONS_DIABETES', 'CANCER']
        }
    },

    '9-conditional-not-triggered.json': {
        UNDERSTANDING_OF_NEEDS: {
            impactDiseaseCondition: 'NO',
            diseasesConditionsImpact: ['DIABETES_AND_OTHER_ENDOCRINAL_NUTRITIONAL_AND_METABOLIC_CONDITIONS_DIABETES', 'CANCER']
        }
    },

    '10-invalid-id.json': {
        INNOVATION_DESCRIPTION: {
            name: 'Invalid ID Tester',
            hasWebsite: 'MAYBE' // MAYBE is not a valid catalog option
        }
    },

    '11-nulls-and-missing.json': {
        INNOVATION_DESCRIPTION: {
            name: null,
            description: '',
            categories: null
        }
    }
};

for (const [filename, data] of Object.entries(payloads)) {
    fs.writeFileSync(path.join(outDir, filename), JSON.stringify(data, null, 2));
    console.log(`Created ${filename}`);
}

console.log(`\n✅ Generated ${Object.keys(payloads).length} test payloads in ./test-payloads/`);
