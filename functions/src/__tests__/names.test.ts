import { describe, expect, it } from 'vitest';
import { studentNamesMatch } from '../names';

describe('student name comparison', () => {
  it('ignores case and extra whitespace', () => {
    expect(studentNamesMatch('  Leo   Teste ', 'leo teste')).toBe(true);
    expect(studentNamesMatch('LEO TESTE', 'Leo Teste')).toBe(true);
  });

  it('rejects genuinely different names', () => {
    expect(studentNamesMatch('Leo Teste', 'Leo Testa')).toBe(false);
    expect(studentNamesMatch('Leo Teste', 'Leo')).toBe(false);
  });
});
