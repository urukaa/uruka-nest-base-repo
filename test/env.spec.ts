import { envList, envNumber, envToggle } from '../src/common/env';

describe('envNumber', () => {
  afterEach(() => {
    delete process.env.__TEST_NUM__;
  });

  it('falls back when unset or blank', () => {
    expect(envNumber('__TEST_NUM__', 60)).toBe(60);

    process.env.__TEST_NUM__ = '   ';
    expect(envNumber('__TEST_NUM__', 60)).toBe(60);
  });

  it('reads a positive number', () => {
    process.env.__TEST_NUM__ = '120';
    expect(envNumber('__TEST_NUM__', 60)).toBe(120);
  });

  it.each(['abc', '0', '-5'])(
    'throws on %p rather than yielding NaN',
    (bad) => {
      process.env.__TEST_NUM__ = bad;
      expect(() => envNumber('__TEST_NUM__', 60)).toThrow(/positive number/);
    },
  );
});

describe('envToggle', () => {
  afterEach(() => {
    delete process.env.__TEST_TOGGLE__;
  });

  it('maps the Javanese yes/no pair', () => {
    process.env.__TEST_TOGGLE__ = 'nggih';
    expect(envToggle('__TEST_TOGGLE__')).toBe(true);

    process.env.__TEST_TOGGLE__ = 'MBOTEN';
    expect(envToggle('__TEST_TOGGLE__')).toBe(false);
  });

  it('throws on anything else instead of silently reading as "no"', () => {
    process.env.__TEST_TOGGLE__ = 'true';
    expect(() => envToggle('__TEST_TOGGLE__')).toThrow(/must be/);
  });
});

describe('envList', () => {
  afterEach(() => {
    delete process.env.__TEST_LIST__;
  });

  it('trims entries and drops blanks', () => {
    process.env.__TEST_LIST__ = ' 127.0.0.1 , ::1 ,, ';
    expect(envList('__TEST_LIST__')).toEqual(['127.0.0.1', '::1']);
  });

  it('falls back when blank', () => {
    expect(envList('__TEST_LIST__', ['default'])).toEqual(['default']);
  });
});
