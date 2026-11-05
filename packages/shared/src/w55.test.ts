import { describe, expect, test } from 'vitest';
import {
  RISK_FACTOR_OPTIONS,
  SCREED_UNSAFE_MM,
  columnCheckLine,
  drillingCheckSchema,
  emptyDrillingCheck,
  emptySiteChecks,
  fromMmText,
  hasBuildingLevel,
  toMmText,
} from './index';
import { siteChecksSchema } from './survey';

/** W55 (2026-11-05): soffit risk factor, mm/inch depths, Schmidt unit, a building level required. */
describe('W55', () => {
  test('Unplastered Ceiling (Soffit) is a risk factor the schema accepts, before "Any other"', () => {
    const i = RISK_FACTOR_OPTIONS.indexOf('Unplastered Ceiling (Soffit)');
    expect(i).toBeGreaterThan(-1);
    expect(i).toBe(RISK_FACTOR_OPTIONS.length - 2);
    expect(siteChecksSchema.safeParse({ ...emptySiteChecks(), riskFactors: ['Unplastered Ceiling (Soffit)'] }).success).toBe(true);
  });

  test('inches are stored as mm (one decimal) and shown back in inches', () => {
    expect(toMmText('10', 'in')).toBe('254');
    expect(toMmText('4.33', 'in')).toBe('110');
    expect(toMmText('1.5', 'in')).toBe('38.1');
    expect(toMmText('', 'in')).toBe('');
    expect(toMmText('120', 'mm')).toBe('120');
    expect(fromMmText('254', 'in')).toBe('10');
    expect(fromMmText('38.1', 'in')).toBe('1.5');
    expect(fromMmText('120', 'mm')).toBe('120');
    // A screed typed as 4.33 in is the 110 mm that marks it Unsafe.
    expect(Number(toMmText('4.33', 'in')) >= SCREED_UNSAFE_MM).toBe(true);
  });

  test('the unit is kept on the drilling check, mm or in only', () => {
    expect(drillingCheckSchema.safeParse({ ...emptyDrillingCheck(), unit: 'in' }).success).toBe(true);
    expect(drillingCheckSchema.safeParse({ ...emptyDrillingCheck(), unit: 'cm' }).success).toBe(false);
    expect(drillingCheckSchema.safeParse(emptyDrillingCheck()).success).toBe(true);
  });

  test('the Schmidt Hammer reading carries N/mm²', () => {
    expect(columnCheckLine('KG A', 'YES', 'YES', '32')).toBe('KG A: crack > 3 mm, Schmidt Hammer 32 N/mm²');
  });

  test('External and Roof alone are not enough levels', () => {
    expect(hasBuildingLevel(['External', 'Roof'])).toBe(false);
    expect(hasBuildingLevel(['External'])).toBe(false);
    expect(hasBuildingLevel(['External', 'Ground'])).toBe(true);
    expect(hasBuildingLevel(['External', 'Third', 'Roof'])).toBe(true);
  });
});
