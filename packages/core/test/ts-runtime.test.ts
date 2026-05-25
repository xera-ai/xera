import { describe, expect, test } from 'vitest';
import { needsTsReexec } from '../src/ts-runtime';

describe('needsTsReexec', () => {
  test('no re-exec when Node strips types natively', () => {
    expect(needsTsReexec({ nativeTs: true, alreadyReexeced: false })).toBe(false);
  });

  test('re-exec when Node lacks native TS and we have not yet re-exec-ed', () => {
    expect(needsTsReexec({ nativeTs: false, alreadyReexeced: false })).toBe(true);
  });

  test('no re-exec loop once the child has been launched with the loader', () => {
    expect(needsTsReexec({ nativeTs: false, alreadyReexeced: true })).toBe(false);
  });
});
