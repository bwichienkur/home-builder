import { describe, expect, it } from 'vitest';
import { isFirstPerson, walkPerfActive, isWalkLike } from './cameraModes';

describe('cameraModes walk perf', () => {
  it('treats firstPerson as the walk performance profile', () => {
    expect(isFirstPerson('firstPerson')).toBe(true);
    expect(walkPerfActive('firstPerson')).toBe(true);
    expect(walkPerfActive('orbit')).toBe(false);
    expect(walkPerfActive('top')).toBe(false);
    expect(isWalkLike('firstPerson')).toBe(true);
    expect(isWalkLike('walk')).toBe(true);
  });
});
