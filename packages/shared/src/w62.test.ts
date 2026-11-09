import { describe, expect, test } from 'vitest';
import { RUBRIC_VERSION, buildDashboard, isTrainingPurposeText, surveyPurposeText } from './index';

/** W62 (2026-11-09): a survey done for checking or training is marked and kept off the dashboard. */
describe('W62 survey purpose', () => {
  test('sheet text: blank or Assessment is an actual assessment', () => {
    expect(surveyPurposeText(undefined)).toBe('Actual assessment');
    expect(surveyPurposeText('Assessment')).toBe('Actual assessment');
    expect(surveyPurposeText('Training')).toBe('Checking/Training');
    expect(isTrainingPurposeText('Checking/Training')).toBe(true);
    expect(isTrainingPurposeText('Actual assessment')).toBe(false);
    expect(isTrainingPurposeText('')).toBe(false);
  });

  test('the dashboard leaves training surveys out of its figures and list', () => {
    const row = (id: string, school: string, purpose: string) => ({
      'Survey ID': id,
      'School ID': school,
      'Campus Name': `Campus ${school}`,
      Timestamp: '2026-11-09T10:00:00Z',
      'Overall Score': '80',
      'Rubric Version': RUBRIC_VERSION,
      'Survey Purpose': purpose,
    });
    const d = buildDashboard(3, [row('a', '1', 'Actual assessment'), row('b', '2', 'Checking/Training'), row('c', '3', '')]);
    expect(d.schools.map((s) => s.surveyId).sort()).toEqual(['a', 'c']);
    expect(d.captured).toBe(2);
  });
});
