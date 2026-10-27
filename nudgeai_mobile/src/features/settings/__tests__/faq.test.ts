import { FAQS, searchFaqs } from '../faq';

describe('searchFaqs', () => {
  it('returns everything for an empty query', () => {
    expect(searchFaqs('')).toHaveLength(FAQS.length);
    expect(searchFaqs('   ')).toHaveLength(FAQS.length);
  });

  it('matches question and answer text, ignoring case', () => {
    expect(searchFaqs('STREAK').map((f) => f.id)).toContain('streak');
    expect(searchFaqs('quiet hours').map((f) => f.id)).toContain('how-nudges');
  });

  it('returns nothing when there is no match', () => {
    expect(searchFaqs('zzzz-no-match')).toEqual([]);
  });

  it('has unique ids', () => {
    expect(new Set(FAQS.map((f) => f.id)).size).toBe(FAQS.length);
  });
});
