import { describe, expect, it } from 'vitest';
import { campusDetail, campusTracker, zoneOf } from './export/campus-summary';
import type { PlanCampus } from './campus-plan';
import { RUBRIC_VERSION } from './rubric/rubric-version';
import type { School } from './types';

/** W84 (2026-11-21): the exported workbook's Detail and Tracker sheets. */

const row = (o: Record<string, string>) => ({
  'Rubric Version': RUBRIC_VERSION,
  'Floor Level': 'Ground',
  'Location Type': 'Classroom',
  'Location Name': 'Class 1 A',
  'Survey Purpose': 'Actual assessment',
  ...o,
});

const ROWS = [
  // Campus 947: an older survey and a newer one (the newer counts), one location Unsafe on soundness.
  row({ 'Survey ID': 's-old', Timestamp: '2026-11-01T05:00:00.000Z', 'Campus Name': 'OGS Trust Campus', 'School ID': '947', Region: 'South West', Area: 'Gadap', 'Overall Score': '40', Paint: 'Poor' }),
  row({ 'Survey ID': 's-new', Timestamp: '2026-11-10T05:00:00.000Z', 'Campus Name': 'OGS Trust Campus', 'School ID': '947', Region: 'South West', Area: 'Gadap', 'Overall Score': '72', 'Functionality Score': '70', 'Safety Score': '80', 'Aesthetics Score': '68', 'Major Score': '71', 'Minor Score': '75', 'Submitted By': 'Surveyor A', Paint: 'Good', 'Concrete/Plaster Soundness': 'Unsafe' }),
  // A training survey never counts.
  row({ 'Survey ID': 's-train', Timestamp: '2026-11-12T05:00:00.000Z', 'Campus Name': 'Alfalah Campus', 'School ID': '499', Region: 'Lower Sindh', Area: 'Hyderabad', 'Overall Score': '90', 'Survey Purpose': 'Checking/Training' }),
];

const SCHOOLS: School[] = [
  { schoolId: '947', name: 'OGS Trust Campus', region: 'South West', area: 'Gadap', schoolIds: ['1001'], unitIds: ['5001'], eCompoundNo: 'S/1/10', cluster: 'Gadap', buildDonor: 'Donor A', establishedYear: '2001', schoolTypes: ['Primary'] },
  { schoolId: '107', name: 'Fazalillahi Campus-I', region: 'South West', area: 'Baldia', schoolIds: ['1006'] },
];

const PLAN: PlanCampus[] = [
  { ids: ['1001'], eCompoundNo: 'S/1/10', name: 'OGS Trust Campus', region: 'South West', category: 'Survey with App', assessment: '' },
  { ids: ['1006'], eCompoundNo: 'SW/6/99', name: 'Fazalillahi Campus-I', region: 'South West', category: 'Done without App', assessment: 'Unsafe' },
  { ids: ['1007'], eCompoundNo: '', name: 'Another', region: 'North', category: 'Survey with App', assessment: '' },
  { ids: ['1008'], eCompoundNo: '', name: 'Exempt', region: 'North', category: 'Last 5 Year Exemption', assessment: '' },
];

describe('W84 Detail and Tracker', () => {
  const detail = campusDetail(ROWS, PLAN, SCHOOLS);

  it('one row per campus: its latest real App survey, then campuses done without the App', () => {
    expect(detail.map((d) => `${d.source}:${d.campus}`)).toEqual(['MQI App:OGS Trust Campus', 'Done without App:Fazalillahi Campus-I']);
    expect(detail[0]).toMatchObject({
      campusId: '947',
      zone: 'Southern',
      unitIds: '5001',
      schoolIds: '1001',
      eCompoundNo: 'S/1/10',
      cluster: 'Gadap',
      buildDonor: 'Donor A',
      established: '2001',
      planCategory: 'Survey with App',
      surveyId: 's-new',
      overall: 72,
      band: 'Good',
      major: 71,
      minor: 75,
      safetyStatus: 'Critically Unsafe',
      surveyedBy: 'Surveyor A',
    });
    expect(detail[0]!.items['Paint']).toBe(100);
    expect(detail[1]).toMatchObject({ safetyStatus: 'Unsafe', campusId: '107', overall: null, zone: 'Southern' });
  });

  it('tracker: plan progress, safety and bands by zone and region', () => {
    const t = campusTracker(detail, PLAN);
    expect(t.totals).toMatchObject({ planned: 4, target: 2, surveyedApp: 1, pending: 1, withoutApp: 1, exempt: 1, critical: 1, unsafeWithoutApp: 1, percentDone: 50 });
    expect(t.regions.map((r) => `${r.zone}/${r.name}:${r.surveyedApp}/${r.target}`)).toEqual(['Northern/North:0/1', 'Southern/South West:1/1']);
    expect(t.zones.find((z) => z.name === 'Southern')).toMatchObject({ planned: 2, surveyedApp: 1, critical: 1 });
    expect(t.surveyors).toEqual([{ name: 'Surveyor A', surveys: 1, averageMqi: 72, critical: 1, partial: 0 }]);
    expect(zoneOf('GP Central Punjab')).toBe('');
  });
});
