import { describe, expect, it } from 'vitest';
import { applyCampusAdditions } from './campus-additions';
import { summarizeMaintenance } from './campus-maintenance';
import { parseSchools } from './read-models';
import { reportCampus } from './report/model';

/** W81 (2026-11-19): campus details at the top of the report. */

const GRID = [
  ['Region', 'Area', 'Town', 'City', 'Campus', 'Campus ID', 'School ID', 'Unit Type', 'Unit Status', 'Address', 'Build Donor', 'Program', 'Sub Program', 'Cluster', 'School Establishment Year', 'eCompound No'],
  ['North', 'Muzaffargarh', 'Kot Addu', 'Muzaffargarh', 'AES Lal Pir Campus', '10', '16', 'Primary', 'Active', 'Basti Budh Mehmood', 'Lalpir Power Limited', 'Flagship', 'Rural', 'Lal Pir', '2009', 'N/90/09'],
  ['North', 'Muzaffargarh', 'Kot Addu', 'Muzaffargarh', 'AES Lal Pir Campus', '10', '799', 'Secondary', 'Active', '', '', '', '', '', '', 'N/90/09'],
  ['North', 'Muzaffargarh', 'Kot Addu', 'Muzaffargarh', 'AES Lal Pir Campus', '10', '2391', 'Higher Secondary', 'Inactive', '', '', '', '', '', '', 'N/90/09'],
  ['North', 'Muzaffargarh', '', 'Multan', 'Sardar Yasin Malik Campus VI', '1056', '1445', 'Primary', 'Active', 'Mouza Hamidpur', 'Hilton Pharma', 'Flagship', '', 'Ali Wala', '2018', 'N/140/18'],
];

describe('W81 campus details for the report', () => {
  const schools = parseSchools(GRID);

  it('reads cluster, donor, programme, year and the active units\' types', () => {
    expect(schools.find((s) => s.schoolId === '10')).toMatchObject({
      cluster: 'Lal Pir',
      buildDonor: 'Lalpir Power Limited',
      program: 'Flagship',
      subProgram: 'Rural',
      establishedYear: '2009',
      schoolTypes: ['Primary', 'Secondary'],
      address: 'Basti Budh Mehmood',
    });
  });

  it('a campus added as part of another ("10-S") shares its details; siblings share the e-compound', () => {
    const all = applyCampusAdditions(schools, [
      { Action: 'Add', 'Campus ID': '10-S', Name: 'AES Lal Pir Campus (Secondary)', Region: 'North', Area: 'Muzaffargarh', 'E Compound No': 'N/90/09' },
    ]);
    const sec = reportCampus('10-S', all)!;
    expect(sec).toMatchObject({ cluster: 'Lal Pir', buildDonor: 'Lalpir Power Limited', established: '2009', eCompoundNo: 'N/90/09', siblings: 'AES Lal Pir Campus' });
    expect(reportCampus('10', all)!.siblings).toBe('AES Lal Pir Campus (Secondary)');
    expect(reportCampus('1056', all)).toMatchObject({ siblings: '', subProgram: 'Flagship', schoolType: 'Primary', location: 'Mouza Hamidpur' });
    expect(reportCampus('9999', all)).toBeNull();
  });

  it('last maintenance from the job sheet: latest fiscal year; jobs not yet started are ignored; an emergency also shows the last regular/special job', () => {
    const job = (id: string, fy: string, cat: string, status: string, con: string, eng: string) => ({ 'Campus ID': id, 'Fiscal Year': fy, 'Job Category': cat, Status: status, Contractor: con, 'Assigned Engineer': eng });
    const m = summarizeMaintenance([
      job('1056', '2022-23', 'Regular', 'Closed & Paid', 'A Builders', 'Engr. X'),
      job('1056', '2024-25', 'Special', 'Closed', 'S Builders', 'Engr. S'),
      job('1056', '2025-26', 'Emergency', 'Execution', 'B Builders', 'Engr. Y'),
      job('1056', '2026-27', 'Regular', 'In Que', 'Q Builders', 'Engr. Q'),
      job('10', '2023-24', 'Regular', 'Closed', 'C1', 'Engr. C'),
      job('10', '2023-24', 'Regular', 'Closed', 'C2', 'Engr. C'),
      job('11', '2024-25', 'Emergency', 'Closed', 'E', 'Engr. E'),
    ]);
    expect(reportCampus('1056', schools, m)).toMatchObject({
      lastMaintenance: '2025-26 Emergency (in execution) · B Builders · Engineer: Engr. Y',
      lastRegular: '2024-25 Special · S Builders · Engineer: Engr. S',
    });
    expect(reportCampus('10', schools, m)).toMatchObject({ lastMaintenance: '2023-24 Regular · C1; C2 · Engineer: Engr. C', lastRegular: '' });
    expect(m['11']).toMatchObject({ category: 'Emergency' });
    expect(m['11']!.regular).toBeUndefined();
  });
});
