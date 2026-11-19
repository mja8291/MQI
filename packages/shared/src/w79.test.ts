import { describe, expect, it } from 'vitest';
import { campusMatchScore, campusMatches } from './campus-additions';

/** W79 (reported 2026-11-19): "Sardar Yasin Malik VI" didn't find "Sardar Yasin Malik Campus VI". */

const camp = (schoolId: string, name: string, eCompoundNo = '') => ({ schoolId, name, eCompoundNo });
const list = [
  camp('1056', 'Sardar Yasin Malik Campus VI', 'N/140/18'),
  camp('1057', 'Sardar Yasin Malik Campus VII', 'S/138/18'),
  camp('1188', 'Sardar Yasin Malik Campus VIII', 'S/129/17'),
  camp('973', 'Sardar Yasin Malik Campus- I', 'N/53/17'),
  camp('556', 'Nafees Yasin Malik Campus', 'S/101/14'),
];
const search = (q: string) =>
  list
    .map((s) => ({ s, score: campusMatchScore(s, q) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.s.name.localeCompare(b.s.name))
    .map((x) => x.s.schoolId);

describe('W79 Find school search', () => {
  it('matches the words in any order, with words left out', () => {
    expect(search('Sardar Yasin Malik VI')[0]).toBe('1056');
    expect(search('malik VI sardar')[0]).toBe('1056');
    expect(search('yasin malik campus vi')[0]).toBe('1056');
  });

  it('puts whole-word matches before partial ones (VI before VII and VIII)', () => {
    expect(search('Sardar Yasin Malik VI')).toEqual(['1056', '1057', '1188']);
  });

  it('still matches as typed, by e-compound and by full Campus ID only', () => {
    expect(search('Nafees Yasin')).toEqual(['556']);
    expect(search('N/140/18')).toEqual(['1056']);
    expect(search('1056')).toEqual(['1056']);
    expect(campusMatches(list[0]!, '105')).toBe(false);
    expect(search('Yasin Malik Lahore')).toEqual([]);
  });
});
